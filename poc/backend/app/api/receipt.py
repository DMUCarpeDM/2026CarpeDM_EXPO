"""퇴근 카드(감열 영수증) API — 미리보기 PNG와 실물 출력.

세션 토큰(require_session)으로 보호한다 — 리포트와 동일한 IDOR 방어.
프린터가 없어도 미리보기(GET .png)와 file 드라이버로 전 과정을 검증할 수 있다.
"""
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import require_session
from app.api.reports import visitor_percentile_top
from app.core.config import settings
from app.models import RoleplaySession
from app.core.database import get_db
from app.services.receipt import ReceiptData, print_receipt, receipt_png_bytes

router = APIRouter(prefix="/sessions", tags=["receipt"])


class ReceiptPrintIn(BaseModel):
    code: str = ""  # 체험 코드 — 있으면 카드에 코드+QR을 함께 찍는다


def _receipt_data(db: Session, session: RoleplaySession, code: str) -> ReceiptData:
    report = session.report
    if report is None:
        raise HTTPException(status_code=404, detail="리포트가 아직 생성되지 않았습니다")
    scenario = session.scenario
    characters = (scenario.characters or []) if scenario else []
    character_name = characters[0].get("name", "") if characters else ""
    qr_payload = ""
    if code:
        base = settings.receipt_qr_base_url.rstrip("/")
        qr_payload = f"{base}?code={code}" if base else code
    return ReceiptData(
        total_score=report.total_score,
        fit_scores=report.fit_scores or {},
        headline_sentence=(report.headline or {}).get("sentence", ""),
        scenario_title=scenario.title if scenario else "",
        character_name=character_name,
        difficulty=session.difficulty,
        mode=session.mode,
        finished_label=report.created_at.strftime("%Y.%m.%d %H:%M") if report.created_at else "",
        percentile_top=visitor_percentile_top(db, session, report),
        code=code,
        qr_payload=qr_payload,
    )


@router.get("/{session_id}/receipt.png")
def receipt_preview(
    code: str = "",
    session: RoleplaySession = Depends(require_session),
    db: Session = Depends(get_db),
):
    """인쇄될 카드와 동일한 비트맵의 PNG 미리보기 — 하드웨어 없이 디자인 확인."""
    return Response(receipt_png_bytes(_receipt_data(db, session, code)), media_type="image/png")


@router.post("/{session_id}/receipt/print")
def receipt_print(
    body: ReceiptPrintIn | None = None,
    session: RoleplaySession = Depends(require_session),
    db: Session = Depends(get_db),
):
    """설정된 드라이버(file|serial)로 퇴근 카드를 출력한다."""
    data = _receipt_data(db, session, (body.code if body else "") or "")
    result = print_receipt(data)
    if not result.ok:
        # 프린터 미연결/포트 오류 — 부스 운영자가 원인을 바로 알 수 있는 메시지로
        raise HTTPException(status_code=503, detail=result.detail)
    return {"ok": True, "driver": result.driver, "detail": result.detail, "files": result.files}
