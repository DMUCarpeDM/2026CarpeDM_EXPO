"""기관(B2B) 모듈 관통 테스트 (S-B2B-ORG / S-B2B-SESSION / S-B2B-CLAIM / S-B2B-NFC).

시나리오: 기관 생성 → 초대 코드 가입(수강생/매니저) → NFC 발급·해석 →
세션 생성(기관 스탬프) → 기관 대시보드 조회 → 영수증 QR 클레임 → 스코프 격리.
"""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.seed.run import seed

pytestmark = pytest.mark.usefixtures("ready_ollama")

client = TestClient(app)

CONSENT = {"agreed": True, "storage_policy": "none"}


def _signup(email: str, invite_code: str = "") -> dict:
    resp = client.post("/api/auth/signup", json={
        "email": email, "password": "pass1234!", "name": email.split("@")[0],
        "invite_code": invite_code,
    })
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _create_org(code_suffix: str) -> dict:
    resp = client.post("/api/orgs", json={"name": f"기관-{code_suffix}", "code": f"org-{code_suffix}"})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _invite_of(org: dict, role: str) -> str:
    return next(i["code"] for i in org["invites"] if i["org_role"] == role)


def test_org_end_to_end():
    """관통: 생성→초대 가입→NFC→세션→대시보드→클레임까지 한 흐름."""
    seed()
    suffix = uuid.uuid4().hex[:8]
    org = _create_org(suffix)
    assert org["member_count"] == 0
    assert {i["org_role"] for i in org["invites"]} == {"trainee", "manager"}

    # 초대 코드 가입 — 수강생은 직무 지정, 매니저는 코드로 역할 결정
    trainee = _signup(f"trainee-{suffix}@test.kr", _invite_of(org, "trainee"))
    manager = _signup(f"manager-{suffix}@test.kr", _invite_of(org, "manager"))
    me = client.get("/api/auth/me", headers=trainee).json()
    assert me["institution_id"] == org["id"]
    assert me["org_role"] == "trainee"
    me2 = client.get("/api/auth/me", headers=manager).json()
    assert me2["org_role"] == "manager"

    # 직무 선택 (가입 후 /orgs/join 재호출로 직무 부여 — 같은 기관이라 idempotent)
    resp = client.post("/api/orgs/join", headers=trainee, json={
        "invite_code": _invite_of(org, "trainee"), "job_role": "office_admin",
    })
    assert resp.status_code == 200, resp.text

    # NFC 발급 (키오스크: 로컬 요청 → require_admin 통과) → 해석
    uid = "04A1B2C3"
    resp = client.post("/api/nfc/issue", json={
        "uid": uid, "job_role": "office_admin", "institution_id": org["id"],
    })
    assert resp.status_code == 200, resp.text
    resolved = client.post("/api/nfc/resolve", json={"uid": uid}).json()
    assert resolved["job_role"] == "office_admin"
    assert resolved["scenario_slug"] == "release-schedule-alignment"
    assert resolved["job_role_label"] == "개발자"

    # 수강생 로그인 상태로 세션 생성 → 기관·직무 스탬프
    resp = client.post("/api/sessions", headers=trainee, json={
        "mode": 5, "difficulty": "basic", "consent": CONSENT, "nfc_uid": uid,
    })
    assert resp.status_code == 200, resp.text
    session = resp.json()

    # 기관 대시보드 (매니저) — 방금 세션이 보인다
    listing = client.get(f"/api/orgs/{org['id']}/sessions", headers=manager)
    assert listing.status_code == 200, listing.text
    rows = listing.json()
    assert rows["total"] == 1
    assert rows["items"][0]["id"] == session["id"]
    assert rows["items"][0]["job_role"] == "office_admin"
    assert rows["items"][0]["user_email"] == f"trainee-{suffix}@test.kr"

    # 직무 필터
    assert client.get(
        f"/api/orgs/{org['id']}/sessions?job_role=cafe_crew", headers=manager
    ).json()["total"] == 0

    # 멤버 목록 — 세션 수 요약 포함
    members = client.get(f"/api/orgs/{org['id']}/members", headers=manager).json()
    by_email = {m["email"]: m for m in members}
    assert by_email[f"trainee-{suffix}@test.kr"]["session_count"] == 1


def test_org_scope_isolation():
    """스코프 격리 — 다른 기관 매니저·수강생은 우리 기관 데이터를 볼 수 없다 (404)."""
    seed()
    suffix = uuid.uuid4().hex[:8]
    org_a = _create_org(f"a{suffix}")
    org_b = _create_org(f"b{suffix}")
    manager_b = _signup(f"mb-{suffix}@test.kr", _invite_of(org_b, "manager"))
    trainee_a = _signup(f"ta-{suffix}@test.kr", _invite_of(org_a, "trainee"))

    # 타 기관 매니저 → 404 (존재 여부도 흘리지 않는다)
    for path in (f"/api/orgs/{org_a['id']}", f"/api/orgs/{org_a['id']}/sessions",
                 f"/api/orgs/{org_a['id']}/members"):
        assert client.get(path, headers=manager_b).status_code == 404
    # 자기 기관 수강생도 관리자 화면은 불가 (읽기 전용 대시보드는 매니저 전용)
    assert client.get(f"/api/orgs/{org_a['id']}/sessions", headers=trainee_a).status_code == 404
    # 무인증 → 401
    assert client.get(f"/api/orgs/{org_a['id']}/sessions").status_code == 401


def test_invalid_invite_code_rejects_signup():
    """초대 코드가 틀리면 계정도 만들지 않는다 — 화면에서 고쳐 재시도."""
    seed()
    email = f"bad-{uuid.uuid4().hex[:8]}@test.kr"
    resp = client.post("/api/auth/signup", json={
        "email": email, "password": "pass1234!", "invite_code": "NOPE1234",
    })
    assert resp.status_code == 404
    # 계정 미생성 확인 — 같은 이메일로 코드 없이 가입하면 성공해야 한다
    assert client.post("/api/auth/signup", json={
        "email": email, "password": "pass1234!",
    }).status_code == 200


def test_invite_rotation_invalidates_old_code():
    seed()
    suffix = uuid.uuid4().hex[:8]
    org = _create_org(suffix)
    old_code = _invite_of(org, "trainee")
    manager = _signup(f"rot-{suffix}@test.kr", _invite_of(org, "manager"))
    rotated = client.post(f"/api/orgs/{org['id']}/invites/rotate", headers=manager).json()
    new_code = _invite_of(rotated, "trainee")
    assert new_code != old_code
    # 옛 코드는 더 이상 유효하지 않다
    assert client.post("/api/auth/signup", json={
        "email": f"late-{suffix}@test.kr", "password": "pass1234!", "invite_code": old_code,
    }).status_code == 404


def test_nfc_unknown_card_and_revoke():
    """미인식 카드 404(→ 프론트 수동 폴백), 폐기 카드도 404."""
    seed()
    assert client.post("/api/nfc/resolve", json={"uid": "DEADBEEF"}).status_code == 404
    client.post("/api/nfc/issue", json={"uid": "0011AABB", "job_role": "office_admin"})
    assert client.post("/api/nfc/resolve", json={"uid": "0011AABB"}).status_code == 200
    client.post("/api/nfc/revoke", json={"uid": "0011AABB"})
    assert client.post("/api/nfc/resolve", json={"uid": "0011AABB"}).status_code == 404
    # 세션 생성도 미인식 카드는 404 — 수동 카드 선택 폴백으로 유도
    assert client.post("/api/sessions", json={
        "mode": 5, "consent": CONSENT, "nfc_uid": "DEADBEEF",
    }).status_code == 404


def test_nfc_uid_normalization_and_reissue():
    """콜론/하이픈 표기 차이를 흡수하고, 재발급은 직무를 덮어쓴다."""
    seed()
    client.post("/api/nfc/issue", json={"uid": "04:aa:bb:cc", "job_role": "office_admin"})
    resolved = client.post("/api/nfc/resolve", json={"uid": "04-AA-BB-CC"})
    assert resolved.status_code == 200
    assert resolved.json()["uid"] == "04AABBCC"
    # 재발급 → issued_count 증가·직무 변경 (알 수 없는 직무는 422)
    assert client.post("/api/nfc/issue", json={"uid": "04AABBCC", "job_role": "warehouse"}).status_code == 422
    again = client.post("/api/nfc/issue", json={"uid": "04AABBCC", "job_role": "office_admin"}).json()
    assert again["issued_count"] == 2


def test_nfc_tap_polling_and_simulator():
    """태그 이벤트 폴링 계약 — since 커서로 새 이벤트만 받는다."""
    seed()
    empty = client.get("/api/nfc/tap?reader=mirror&since=999999").json()
    assert empty["uid"] == ""
    tap = client.post("/api/nfc/simulate-tap", json={"uid": "0455AA11", "reader": "mirror"}).json()
    assert tap["seq"] > 0
    seen = client.get(f"/api/nfc/tap?reader=mirror&since={tap['seq'] - 1}").json()
    assert seen["uid"] == "0455AA11"
    # 같은 seq 이후로는 새 이벤트 없음
    assert client.get(f"/api/nfc/tap?reader=mirror&since={tap['seq']}").json()["uid"] == ""
    # kiosk 리더와 분리
    assert client.get(f"/api/nfc/tap?reader=kiosk&since=0").json()["uid"] == ""


def test_job_role_selection_without_nfc():
    """웹앱 직무 선택 계약 (NFC 없음) — 가입 시 직무, 본인 직무 변경, 시나리오 직무 태그."""
    seed()
    suffix = uuid.uuid4().hex[:8]

    # 시나리오 목록에 직무 태그가 실린다 — 웹앱이 직무로 시나리오를 고르는 축
    by_slug = {s["slug"]: s for s in client.get("/api/scenarios").json()}
    assert by_slug["ondo-cafe-crew"]["job_role"] == "cafe_crew"
    assert by_slug["ondo-cafe-crew"]["domain"] == "service"
    assert by_slug["release-schedule-alignment"]["job_role"] == "office_admin"

    # 초대 코드 없이도 가입 시 직무 지정 (개인 연습 사용자)
    resp = client.post("/api/auth/signup", json={
        "email": f"solo-{suffix}@test.kr", "password": "pass1234!", "job_role": "cs_agent",
    })
    assert resp.status_code == 200, resp.text
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    assert client.get("/api/auth/me", headers=headers).json()["job_role"] == "cs_agent"

    # 알 수 없는 직무는 가입 자체를 거부 (계정 미생성)
    assert client.post("/api/auth/signup", json={
        "email": f"bad-role-{suffix}@test.kr", "password": "pass1234!", "job_role": "pilot",
    }).status_code == 422

    # 본인 직무 변경 — 무인증 401, 잘못된 직무 422, 정상 200
    assert client.patch("/api/auth/me", json={"job_role": "cafe_crew"}).status_code == 401
    assert client.patch(
        "/api/auth/me", headers=headers, json={"job_role": "pilot"}
    ).status_code == 422
    changed = client.patch("/api/auth/me", headers=headers, json={"job_role": "cafe_crew"})
    assert changed.status_code == 200 and changed.json()["job_role"] == "cafe_crew"

    # 세션 생성의 직무도 같은 화이트리스트 — 오타 직무가 대시보드 집계에서
    # 조용히 빠지는 대신 422로 즉시 거부된다
    assert client.post("/api/sessions", json={
        "mode": 5, "consent": CONSENT, "job_role": "CS_AGENT",
    }).status_code == 422
    assert client.post("/api/sessions", json={
        "mode": 5, "consent": CONSENT, "job_role": "cs_agent",
    }).status_code == 200

    # 초대 코드 + 직무 동시 가입
    org = _create_org(suffix)
    resp = client.post("/api/auth/signup", json={
        "email": f"both-{suffix}@test.kr", "password": "pass1234!",
        "invite_code": _invite_of(org, "trainee"), "job_role": "office_admin",
    })
    me = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {resp.json()['access_token']}"}
    ).json()
    assert me["institution_id"] == org["id"] and me["job_role"] == "office_admin"


def test_my_sessions_listing():
    """수강생 본인 이력 — 본인 세션만, 등급 표기(S-B2B-SCORE) 포함."""
    seed()
    suffix = uuid.uuid4().hex[:8]
    org = _create_org(suffix)
    trainee = _signup(f"mine-{suffix}@test.kr", _invite_of(org, "trainee"))
    other = _signup(f"other-{suffix}@test.kr")
    assert client.get("/api/sessions/mine").status_code == 401
    client.post("/api/sessions", headers=trainee, json={"mode": 5, "consent": CONSENT})
    client.post("/api/sessions", headers=other, json={"mode": 5, "consent": CONSENT})
    mine = client.get("/api/sessions/mine", headers=trainee).json()
    assert len(mine) == 1
    assert mine[0]["grade"] is None  # 리포트 전 — 등급 없음(없는 걸 있는 척 안 함)


def test_nfc_org_stamp_requires_physical_tap_evidence():
    """카드 UID 지식만으로는 기관 스탬프 불가 — UID는 비밀이 아니다 (휴대폰으로 읽힘).

    최근 실물 태그(운영 가드 뒤 시뮬레이터 포함) 증거가 있을 때만 카드의 기관이
    세션에 스탬프된다. 증거가 없어도 체험 자체(직무·시나리오)는 그대로 진행된다.
    """
    seed()
    suffix = uuid.uuid4().hex[:8]
    org = _create_org(suffix)
    manager = _signup(f"ev-{suffix}@test.kr", _invite_of(org, "manager"))
    uid = "04E51D05"
    client.post("/api/nfc/issue", json={
        "uid": uid, "job_role": "office_admin", "institution_id": org["id"],
    })

    # 태그 증거 없이 UID만 아는 공격자 — 세션은 생기지만 기관 귀속은 안 된다
    before = client.get(f"/api/orgs/{org['id']}/sessions", headers=manager).json()["total"]
    resp = client.post("/api/sessions", json={"mode": 5, "consent": CONSENT, "nfc_uid": uid})
    assert resp.status_code == 200
    after = client.get(f"/api/orgs/{org['id']}/sessions", headers=manager).json()["total"]
    assert after == before, "태그 증거 없는 세션이 기관 대시보드에 주입되면 안 된다"

    # 실물 태그(시뮬레이터 = 운영 가드 뒤) 직후에는 정상 스탬프
    client.post("/api/nfc/simulate-tap", json={"uid": uid, "reader": "mirror"})
    resp = client.post("/api/sessions", json={"mode": 5, "consent": CONSENT, "nfc_uid": uid})
    assert resp.status_code == 200
    final = client.get(f"/api/orgs/{org['id']}/sessions", headers=manager).json()["total"]
    assert final == before + 1


def test_cross_org_claim_restamps_to_claimer_org():
    """교차 기관 클레임 — 카드 기관(A)에 클레이머(B) 개인정보가 넘어가면 안 된다.

    클레임은 개인 귀속이 본질: 첫 클레임에서 세션의 기관 스탬프는 클레이머의
    소속으로 재기록된다 (카드 기관은 키오스크 포인터일 뿐).
    """
    seed()
    suffix = uuid.uuid4().hex[:8]
    org_a = _create_org(f"ca{suffix}")
    org_b = _create_org(f"cb{suffix}")
    manager_a = _signup(f"cma-{suffix}@test.kr", _invite_of(org_a, "manager"))
    manager_b = _signup(f"cmb-{suffix}@test.kr", _invite_of(org_b, "manager"))
    trainee_b = _signup(f"ctb-{suffix}@test.kr", _invite_of(org_b, "trainee"))

    # A기관 카드로 태그 증거와 함께 익명 세션 시작 → institution=A
    uid = "04C1A1B1"
    client.post("/api/nfc/issue", json={
        "uid": uid, "job_role": "office_admin", "institution_id": org_a["id"],
    })
    client.post("/api/nfc/simulate-tap", json={"uid": uid, "reader": "mirror"})
    anon = client.post("/api/sessions", json={"mode": 5, "consent": CONSENT, "nfc_uid": uid}).json()

    from app.core.database import SessionLocal
    from app.models import RoleplaySession

    db = SessionLocal()
    try:
        session_row = db.get(RoleplaySession, anon["id"])
        assert session_row.institution_id == org_a["id"]
        claim_token = session_row.claim_token
    finally:
        db.close()

    # B기관 수강생이 클레임 → 세션은 B로 재스탬프
    assert client.post(
        "/api/sessions/claim", headers=trainee_b, json={"claim_token": claim_token}
    ).status_code == 200
    rows_a = client.get(f"/api/orgs/{org_a['id']}/sessions", headers=manager_a).json()
    assert all(item["id"] != anon["id"] for item in rows_a["items"]), \
        "A기관 대시보드에 B기관 사용자의 이름·이메일이 노출되면 안 된다"
    rows_b = client.get(f"/api/orgs/{org_b['id']}/sessions", headers=manager_b).json()
    assert any(item["id"] == anon["id"] for item in rows_b["items"])


def test_nfc_tap_requires_operator_guard(monkeypatch):
    """운영 토큰이 설정되면 태그 이벤트 읽기도 토큰 없이는 거부 — UID 스트림 보호."""
    from app.core.config import settings

    seed()
    monkeypatch.setattr(settings, "admin_token", "ops-secret")
    assert client.get("/api/nfc/tap?reader=mirror").status_code == 401
    assert client.get(
        "/api/nfc/tap?reader=mirror", headers={"X-Admin-Token": "ops-secret"}
    ).status_code == 200


def test_nfc_reissue_preserves_institution_when_omitted():
    """재발급에서 institution_id 미전달이면 기존 기관 귀속을 보존한다."""
    seed()
    suffix = uuid.uuid4().hex[:8]
    org = _create_org(f"ri{suffix}")
    uid = "04AC11DD"
    client.post("/api/nfc/issue", json={
        "uid": uid, "job_role": "cafe_crew", "institution_id": org["id"],
    })
    client.post("/api/nfc/issue", json={"uid": uid, "job_role": "cs_agent"})  # 직무만 변경
    from app.core.database import SessionLocal
    from app.models import NfcCard

    db = SessionLocal()
    try:
        card = db.query(NfcCard).filter_by(uid=uid).first()
        assert card.job_role == "cs_agent"
        assert card.institution_id == org["id"], "미전달 재발급이 기관 귀속을 지우면 안 된다"
    finally:
        db.close()


def test_tap_cursor_survives_backend_restart():
    """백엔드 재시작 후 커서가 스테일이어도 새 태그가 도달한다 (조용한 먹통 방지)."""
    from app.services import nfc_bridge

    seed()
    tap = client.post("/api/nfc/simulate-tap", json={"uid": "04AA00EE", "reader": "kiosk"}).json()
    # 이전 프로세스의 큰 커서(미래 seq) — 스테일로 감지되어 현재 태그를 돌려준다
    stale = client.get(f"/api/nfc/tap?reader=kiosk&since={tap['seq'] + 100000}").json()
    assert stale["uid"] == "04AA00EE"
    # 정상 커서 동작은 그대로: 같은 seq 이후는 빈 응답
    assert client.get(f"/api/nfc/tap?reader=kiosk&since={tap['seq']}").json()["uid"] == ""
    # seq는 기동 시각 기반이라 0에서 다시 세지 않는다
    assert tap["seq"] > 1_000_000


def test_session_claim_flow():
    """영수증 QR 클레임 — 익명 세션이 계정·기관으로 귀속된다."""
    seed()
    suffix = uuid.uuid4().hex[:8]
    org = _create_org(suffix)
    trainee = _signup(f"claim-{suffix}@test.kr", _invite_of(org, "trainee"))
    manager = _signup(f"cm-{suffix}@test.kr", _invite_of(org, "manager"))

    # 익명(전시) 세션 생성 — 응답에는 claim_token이 없다 (리포트 API가 QR 링크 제공)
    anon = client.post("/api/sessions", json={"mode": 5, "consent": CONSENT}).json()
    from app.core.database import SessionLocal
    from app.models import RoleplaySession

    db = SessionLocal()
    try:
        claim_token = db.get(RoleplaySession, anon["id"]).claim_token
    finally:
        db.close()
    assert claim_token

    # 미리보기 (무인증) — 요약만
    preview = client.get(f"/api/sessions/claim/{claim_token}")
    assert preview.status_code == 200
    assert preview.json()["already_claimed"] is False

    # 클레임 (인증 필요)
    assert client.post("/api/sessions/claim", json={"claim_token": claim_token}).status_code == 401
    claimed = client.post("/api/sessions/claim", headers=trainee, json={"claim_token": claim_token})
    assert claimed.status_code == 200, claimed.text
    assert claimed.json()["already_claimed"] is False

    # 멱등 (같은 사용자) / 충돌 (다른 사용자)
    assert client.post(
        "/api/sessions/claim", headers=trainee, json={"claim_token": claim_token}
    ).json()["already_claimed"] is True
    assert client.post(
        "/api/sessions/claim", headers=manager, json={"claim_token": claim_token}
    ).status_code == 409

    # 귀속된 세션이 기관 대시보드에 나타난다
    rows = client.get(f"/api/orgs/{org['id']}/sessions", headers=manager).json()
    assert any(item["id"] == anon["id"] for item in rows["items"])

    # 위조 토큰
    assert client.post(
        "/api/sessions/claim", headers=trainee, json={"claim_token": "forged-token-123"}
    ).status_code == 404
