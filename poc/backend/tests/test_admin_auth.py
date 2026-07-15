"""운영 API 토큰 보호 — 토큰 설정 시 X-Admin-Token 없는 호출을 거부한다."""
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.seed.run import seed

client = TestClient(app)


def test_admin_requires_token_when_configured(monkeypatch):
    seed()  # 테이블 준비 (TestClient는 lifespan을 태우지 않는다)
    monkeypatch.setattr(settings, "admin_token", "expo-secret")
    assert client.post("/api/admin/reset").status_code == 401
    assert client.post(
        "/api/admin/reset", headers={"X-Admin-Token": "wrong"}
    ).status_code == 401
    assert client.get(
        "/api/admin/export.csv", headers={"X-Admin-Token": "wrong"}
    ).status_code == 401
    assert client.post(
        "/api/admin/reset", headers={"X-Admin-Token": "expo-secret"}
    ).status_code == 200


def test_admin_open_when_token_unset(monkeypatch):
    """토큰 미설정 시 루프백(같은 PC) 요청은 허용 — TestClient 기본 호스트는 루프백으로 간주."""
    seed()
    monkeypatch.setattr(settings, "admin_token", "")
    assert client.post("/api/admin/reset").status_code == 200


def test_admin_denied_from_non_loopback_when_token_unset(monkeypatch):
    """토큰 미설정이어도 부스 LAN(비루프백)에서는 운영 API 접근을 거부한다."""
    seed()
    monkeypatch.setattr(settings, "admin_token", "")
    lan = TestClient(app, client=("192.168.0.42", 40000))
    assert lan.post("/api/admin/reset").status_code == 403
