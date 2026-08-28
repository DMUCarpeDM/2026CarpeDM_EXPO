"""NFC 카드 발급·해석 API (S-B2B-NFC) — 발급 키오스크와 미러의 계약.

흐름:
1. 발급 키오스크: 직무 선택 → 카드 태그 → POST /nfc/issue (uid×직무 귀속)
2. 미러: 카드 태그 → POST /nfc/resolve → 직무 팩으로 즉시 롤플레이 시작
3. 미인식 폴백: 프론트의 수동 카드(직무) 선택 버튼 — resolve 없이 세션 생성

발급·폐기·태그 이벤트 읽기는 운영 행위라 require_admin(전시 모드에선 로컬
요청 허용 — 미러/키오스크는 Vite 프록시를 거쳐 루프백으로 도달) 뒤에 둔다.
resolve는 미러 화면(무인)이 쓰므로 무인증이되, uid는 '세션 시작 능력값'이므로
개인정보(계정)와 연결하지 않고, 기관 귀속 스탬프는 uid 지식만으로는 인정하지
않는다(sessions.py — 최근 실물 태그 증거 요구).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.database import get_db
from app.models import NfcCard, Scenario, User, utcnow
from app.schemas import (
    NfcCardOut,
    NfcIssueIn,
    NfcResolveIn,
    NfcResolveOut,
    NfcSimulateTapIn,
    NfcTapOut,
)
from app.services import nfc_bridge

router = APIRouter(prefix="/nfc", tags=["nfc"])

# 직무 기본 시나리오 팩 (S-B2B-PACK) — 발급 시 시나리오를 지정하지 않은 카드의 기본값.
# office_admin은 기존 전시 시나리오(클라우드밋)를 재사용한다 (도메인 결정 근거 (c)).
DEFAULT_PACK_BY_ROLE = {
    "cafe_crew": "ondo-cafe-crew",
    "cs_agent": "ondo-cs-agent",
    "office_admin": "release-schedule-alignment",
}
JOB_ROLE_LABELS = {
    "cafe_crew": "카페 파트너",
    "cs_agent": "상담사",
    "office_admin": "개발자",
}


def _normalize_uid(uid: str) -> str:
    return uid.replace(":", "").replace("-", "").upper()


@router.post("/issue", response_model=NfcCardOut)
def issue_card(
    body: NfcIssueIn,
    db: Session = Depends(get_db),
    _admin: User | None = Depends(require_admin),
):
    """카드 발급/재발급 — 같은 uid는 직무를 덮어쓴다 (카드는 회전 소모품)."""
    if body.job_role not in DEFAULT_PACK_BY_ROLE:
        raise HTTPException(status_code=422, detail="알 수 없는 직무입니다")
    if body.scenario_slug and not db.query(Scenario).filter_by(slug=body.scenario_slug).first():
        raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다")
    uid = _normalize_uid(body.uid)
    card = db.query(NfcCard).filter_by(uid=uid).first()
    if card is None:
        card = NfcCard(uid=uid)
        db.add(card)
    card.job_role = body.job_role
    # 시나리오는 재발급 시 항상 새 값(비면 직무 기본 팩) — 직무 변경 후 옛
    # 시나리오가 남아 다른 직무 팩을 가리키는 사고를 막는다.
    card.scenario_slug = body.scenario_slug
    # 기관은 미지정(None)이면 기존 귀속을 보존한다 — 키오스크 재발급이 기관
    # 바인딩을 조용히 지우지 않게 (해제는 명시적으로 institution_id를 보내는 경로)
    if body.institution_id is not None:
        card.institution_id = body.institution_id
    card.status = "active"
    card.issued_count = (card.issued_count or 0) + 1
    card.issued_at = utcnow()
    db.commit()
    return card


@router.post("/revoke", response_model=NfcCardOut)
def revoke_card(
    body: NfcResolveIn,
    db: Session = Depends(get_db),
    _admin: User | None = Depends(require_admin),
):
    """카드 폐기 — 분실·회수 카드가 미러에서 동작하지 않게 한다."""
    card = db.query(NfcCard).filter_by(uid=_normalize_uid(body.uid)).first()
    if card is None:
        raise HTTPException(status_code=404, detail="등록되지 않은 카드입니다")
    card.status = "revoked"
    db.commit()
    return card


@router.post("/resolve", response_model=NfcResolveOut)
def resolve_card(body: NfcResolveIn, db: Session = Depends(get_db)):
    """미러 시작 계약 — 태그된 카드의 직무·시나리오를 돌려준다.

    404면 프론트는 수동 카드 선택 폴백 UI를 띄운다 (전시 원칙: 미인식이
    체험 중단이 되어선 안 된다).
    """
    card = db.query(NfcCard).filter_by(uid=_normalize_uid(body.uid)).first()
    if card is None or card.status != "active":
        raise HTTPException(status_code=404, detail="등록되지 않았거나 폐기된 카드입니다")
    card.last_seen_at = utcnow()
    db.commit()
    slug = card.scenario_slug or DEFAULT_PACK_BY_ROLE.get(card.job_role, "")
    return NfcResolveOut(
        uid=card.uid,
        job_role=card.job_role,
        scenario_slug=slug,
        job_role_label=JOB_ROLE_LABELS.get(card.job_role, card.job_role),
    )


@router.get("/tap", response_model=NfcTapOut)
def get_tap(
    reader: str = Query(default="mirror", pattern="^(kiosk|mirror)$"),
    since: int = Query(default=0, ge=0),
    _admin: User | None = Depends(require_admin),
):
    """리더 브리지 폴링 — since(이전 seq) 이후의 새 태그가 없으면 빈 응답.

    운영 가드 뒤에 두는 이유: 실물 리더가 읽은 카드 UID 스트림은 세션 시작
    능력값이라 익명 LAN 단말에 개방하면 안 된다. 미러/키오스크 화면은 Vite
    프록시(루프백)로 도달하므로 전시 기본 구성에서 그대로 동작한다.
    """
    tap = nfc_bridge.latest_tap(reader, since)
    if tap is None:
        return NfcTapOut()
    return NfcTapOut(seq=tap["seq"], uid=tap["uid"], reader=tap["reader"], at=tap["at"])


@router.post("/simulate-tap", response_model=NfcTapOut)
def simulate_tap(
    body: NfcSimulateTapIn,
    _admin: User | None = Depends(require_admin),
):
    """태그 시뮬레이터 — 리더 없는 개발·리허설과 수동 UID 입력 폴백용 (운영 가드 뒤)."""
    tap = nfc_bridge.record_tap(body.uid, body.reader)
    return NfcTapOut(seq=tap["seq"], uid=tap["uid"], reader=tap["reader"], at=tap["at"])
