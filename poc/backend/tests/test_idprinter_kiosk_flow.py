"""Current-main kiosk session contracts, with no devices or paid calls."""

from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.api import nfc, sessions
from app.core.config import settings
from app.core.database import SessionLocal
from app.main import app
from app.models import RoleplaySession
from app.seed.run import seed
from app.services import nfc_bridge
from app.services.idprinter_bridge import BridgeError, CardSnapshot


CARD_UID = "04AABBCC"
KIOSK_ID = "MW2610030001"
CONSENT = {"agreed": True, "storage_policy": "none"}


class FakeBridge:
    session_id = KIOSK_ID
    fail_link = False
    links = []

    def __init__(self, _url, _token):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        pass

    def resolve(self, uid):
        assert uid == CARD_UID
        return CardSnapshot(uid=CARD_UID, kiosk_session_id=self.session_id)

    def link(self, snapshot, mirror_session_id, access_token):
        if self.fail_link:
            raise BridgeError("KIOSK_BRIDGE_UNAVAILABLE", retryable=True)
        self.links.append((snapshot, mirror_session_id, access_token))
        return {"ok": True, "status": "linked", "sessionId": snapshot.kiosk_session_id,
                "mirrorSessionId": mirror_session_id}


def _configured(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", SecretStr(""))
    monkeypatch.setattr(settings, "gemini_api_key", SecretStr(""))
    seed()
    FakeBridge.session_id = KIOSK_ID
    FakeBridge.fail_link = False
    FakeBridge.links = []
    monkeypatch.setattr(settings, "idprinter_base_url", "http://127.0.0.1:8002")
    monkeypatch.setattr(settings, "idprinter_bridge_token", SecretStr("server-only-secret-123456789012345"))
    monkeypatch.setattr(nfc, "IDPrinterBridge", FakeBridge)
    monkeypatch.setattr(sessions, "IDPrinterBridge", FakeBridge)
    monkeypatch.setattr(nfc_bridge, "recent_tap_matches", lambda *_args, **_kwargs: True)
    return TestClient(app)


def _body(kiosk_id=KIOSK_ID):
    return {"mode": 5, "service_mode": "workplace", "job_role": "office_admin",
            "scenario_slug": "workplace-conversation", "nfc_uid": CARD_UID,
            "kiosk_session_id": kiosk_id, "consent": CONSENT}


def test_kiosk_card_without_local_mirror_card_keeps_uid_and_chosen_role(monkeypatch):
    client = _configured(monkeypatch)
    verified = client.post("/api/nfc/resolve", json={"uid": CARD_UID})
    assert verified.status_code == 200
    assert verified.json()["requires_role_selection"] is True
    assert verified.json()["kiosk_session_id"] == KIOSK_ID
    assert verified.json()["job_role"] == ""

    created = client.post("/api/sessions", json=_body())
    assert created.status_code == 200, created.text
    payload = created.json()
    assert payload["kiosk_link_status"] == "linked"
    assert FakeBridge.links == [(CardSnapshot(CARD_UID, KIOSK_ID), payload["id"], payload["access_token"])]
    with SessionLocal() as db:
        session = db.get(RoleplaySession, payload["id"])
        assert session.job_role == "office_admin"
        assert session.kiosk_session_id == KIOSK_ID
        assert session.kiosk_card_uid == CARD_UID


def test_kiosk_create_requires_recent_tag_and_original_visit(monkeypatch):
    client = _configured(monkeypatch)
    monkeypatch.setattr(nfc_bridge, "recent_tap_matches", lambda *_a, **_k: False)
    assert client.post("/api/sessions", json=_body()).status_code == 409
    body = _body()
    body.pop("kiosk_session_id")
    assert client.post("/api/sessions", json=body).status_code == 422
    assert FakeBridge.links == []


def test_retry_requires_session_capability(monkeypatch):
    client = _configured(monkeypatch)
    payload = client.post("/api/sessions", json=_body()).json()
    path = f"/api/sessions/{payload['id']}/kiosk-link"
    assert client.post(path).status_code == 403
    assert client.post(path, headers={"X-Session-Token": "wrong"}).status_code == 403
    assert len(FakeBridge.links) == 1


def test_legacy_sqlite_adds_snapshot_columns_without_losing_visitor(monkeypatch, tmp_path):
    from sqlalchemy import create_engine, text
    import app.seed.run as migration
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE roleplay_sessions (id INTEGER PRIMARY KEY, client_key VARCHAR(100))"))
        conn.execute(text("INSERT INTO roleplay_sessions VALUES (1, 'existing-visitor')"))
    monkeypatch.setattr(migration, "engine", engine)
    try:
        migration._migrate_columns()
        migration._migrate_columns()
        with engine.connect() as conn:
            row = conn.execute(text("SELECT id, client_key, kiosk_session_id, kiosk_card_uid, kiosk_link_status FROM roleplay_sessions")).one()
        assert tuple(row) == (1, "existing-visitor", None, None, "not_requested")
    finally:
        engine.dispose()


def test_reissued_card_snapshot_is_rejected_before_session_creation(monkeypatch):
    client = _configured(monkeypatch)
    FakeBridge.session_id = "MW2610030002"
    with SessionLocal() as db:
        before = db.query(RoleplaySession).count()
    response = client.post("/api/sessions", json=_body())
    assert response.status_code == 409
    with SessionLocal() as db:
        assert db.query(RoleplaySession).count() == before
    assert FakeBridge.links == []


def test_bridge_outage_retries_original_session_without_creating_another(monkeypatch):
    client = _configured(monkeypatch)
    FakeBridge.fail_link = True
    created = client.post("/api/sessions", json=_body())
    assert created.status_code == 200, created.text
    payload = created.json()
    assert payload["kiosk_link_status"] == "pending"
    FakeBridge.fail_link = False
    retried = client.post(f"/api/sessions/{payload['id']}/kiosk-link",
                          headers={"X-Session-Token": payload["access_token"]})
    assert retried.status_code == 200
    assert retried.json()["status"] == "linked"
    assert FakeBridge.links == [(CardSnapshot(CARD_UID, KIOSK_ID), payload["id"], payload["access_token"])]


def test_external_card_requires_new_explicit_consent(monkeypatch):
    client = _configured(monkeypatch)
    body = _body()
    body["consent"] = {"agreed": False, "storage_policy": "none"}
    assert client.post("/api/sessions", json=body).status_code == 400
    assert FakeBridge.links == []


def test_external_snapshot_cannot_use_an_unverified_local_issuance(monkeypatch):
    client = _configured(monkeypatch)
    body = _body()
    body["nfc_issued_count"] = 3
    assert client.post("/api/sessions", json=body).status_code == 422
    body.pop("nfc_issued_count")
    body.pop("nfc_uid")
    assert client.post("/api/sessions", json=body).status_code == 400
    assert FakeBridge.links == []
