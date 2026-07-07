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
    seed()
    monkeypatch.setattr(settings, "admin_token", "")
    assert client.post("/api/admin/reset").status_code == 200
