"""B2B 보안 회귀 (S-B2B-SEC) — JWT 서명·운영 가드·클레임 토큰 비노출·기관 스코프.

G-26 수용 기준: JWT 시크릿은 환경변수로 주입되고(config.py), 위조 토큰은 거부되며,
기관 데이터는 스코프 밖에서 절대 열람되지 않는다.
"""
import uuid

import jwt as pyjwt
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.seed.run import seed

pytestmark = pytest.mark.usefixtures("ready_ollama")

client = TestClient(app)

CONSENT = {"agreed": True, "storage_policy": "none"}


def _signup(email: str, invite_code: str = "") -> dict:
    resp = client.post("/api/auth/signup", json={
        "email": email, "password": "pass1234!", "invite_code": invite_code,
    })
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_forged_jwt_rejected():
    """다른 시크릿으로 서명한 토큰은 어떤 사용자 id를 담아도 401."""
    seed()
    headers = _signup(f"jwt-{uuid.uuid4().hex[:8]}@test.kr")
    me = client.get("/api/auth/me", headers=headers).json()
    forged = pyjwt.encode(
        {"sub": str(me["id"]), "exp": 9999999999}, "wrong-secret", algorithm="HS256",
    )
    assert client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {forged}"}
    ).status_code == 401
    # 서명 없는(alg=none 류) 토큰·쓰레기 문자열도 401
    assert client.get(
        "/api/auth/me", headers={"Authorization": "Bearer not-a-token"}
    ).status_code == 401


def test_claim_token_not_leaked_in_responses():
    """claim_token(계정 귀속 능력)은 세션 생성·복구·기관 목록 응답에 노출되지 않는다.

    유일한 노출 경로는 리포트의 claim_url(체험자 본인 화면의 QR)이다.
    """
    seed()
    created = client.post("/api/sessions", json={"mode": 5, "consent": CONSENT})
    body = created.json()
    assert "claim_token" not in body
    resumed = client.get(
        f"/api/sessions/{body['id']}", headers={"X-Session-Token": body["access_token"]}
    ).json()
    assert "claim_token" not in resumed


def test_admin_guard_covers_nfc_and_org_creation(monkeypatch):
    """운영 토큰이 설정되면 NFC 발급·기관 생성도 토큰 없이는 거부된다."""
    seed()
    monkeypatch.setattr(settings, "admin_token", "ops-secret")
    assert client.post("/api/nfc/issue", json={
        "uid": "0AA0B0C0", "job_role": "office_admin",
    }).status_code == 401
    assert client.post("/api/orgs", json={
        "name": "무단 기관", "code": f"x-{uuid.uuid4().hex[:6]}",
    }).status_code == 401
    # 올바른 토큰이면 통과
    assert client.post(
        "/api/nfc/issue", json={"uid": "0AA0B0C0", "job_role": "office_admin"},
        headers={"X-Admin-Token": "ops-secret"},
    ).status_code == 200
    # 폐기·시뮬레이터도 같은 가드 뒤에 있다
    assert client.post("/api/nfc/revoke", json={"uid": "0AA0B0C0"}).status_code == 401
    assert client.post("/api/nfc/simulate-tap", json={
        "uid": "0AA0B0C0", "reader": "mirror",
    }).status_code == 401


def test_trainee_cannot_rotate_or_read_invites():
    """수강생은 초대 코드 회전·기관 상세(코드 포함)에 접근할 수 없다 (404)."""
    seed()
    suffix = uuid.uuid4().hex[:8]
    org = client.post("/api/orgs", json={"name": "기관", "code": f"sec-{suffix}"}).json()
    trainee_code = next(i["code"] for i in org["invites"] if i["org_role"] == "trainee")
    trainee = _signup(f"sec-{suffix}@test.kr", trainee_code)
    assert client.get(f"/api/orgs/{org['id']}", headers=trainee).status_code == 404
    assert client.post(
        f"/api/orgs/{org['id']}/invites/rotate", headers=trainee
    ).status_code == 404
    # /orgs/me(코드 미포함 요약)는 수강생도 가능
    assert client.get("/api/orgs/me", headers=trainee).status_code == 200
    assert "invites" not in client.get("/api/orgs/me", headers=trainee).json()
