from fastapi.testclient import TestClient
from app.main import app
from app.seed.run import seed

client = TestClient(app)

def test_reissue_clears_consent_and_stale_issue_cannot_start(ready_ollama):
    seed()
    body = {"uid": "F0F0AABB", "job_role": "office_admin", "scenario_slug": "workplace-conversation", "consent_agreed": True}
    issued = client.post("/api/nfc/issue", json=body)
    assert issued.status_code == 200, issued.text
    card = client.post("/api/nfc/resolve", json={"uid": body["uid"]}).json()
    assert card["consent_agreed"] and card["consent_agreed_at"]
    start = {"mode": 5, "service_mode": "workplace", "nfc_uid": body["uid"], "nfc_issued_count": card["issued_count"], "consent": {"agreed": True}}
    result = client.post("/api/sessions", json=start)
    assert result.status_code == 200, result.text
    assert result.json()["scenario"]["slug"] == "workplace-conversation"
    again = client.post("/api/nfc/issue", json={**body, "consent_agreed": False}).json()
    assert again["issued_count"] == card["issued_count"] + 1
    assert again["consent_agreed"] is False and again["consent_agreed_at"] is None
    assert client.post("/api/sessions", json=start).status_code == 409
    start["nfc_issued_count"] = again["issued_count"]
    assert client.post("/api/sessions", json=start).status_code == 400
    client.post("/api/nfc/issue", json=body)
    # Legacy issuance without consent must clear the new participant's consent too.
    legacy = client.post("/api/nfc/issue", json={"uid": body["uid"], "job_role": "office_admin"}).json()
    assert legacy["consent_agreed"] is False and legacy["consent_agreed_at"] is None

def test_issuance_check_requires_a_card():
    seed()
    result = client.post("/api/sessions", json={"nfc_issued_count": 1, "consent": {"agreed": True}})
    assert result.status_code == 400

def test_existing_card_migration_does_not_inherit_consent(monkeypatch):
    from sqlalchemy import create_engine, text
    import app.seed.run as migration
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE nfc_cards (id INTEGER PRIMARY KEY, uid VARCHAR(32), institution_id INTEGER, job_role VARCHAR(30), scenario_slug VARCHAR(50), status VARCHAR(10), issued_count INTEGER, issued_at DATETIME, last_seen_at DATETIME)"))
        conn.execute(text("INSERT INTO nfc_cards (id,uid,issued_count,status) VALUES (1,'ABCD',4,'active')"))
    monkeypatch.setattr(migration, "engine", engine)
    migration._migrate_columns()
    migration._migrate_columns()  # Restart is idempotent.
    with engine.connect() as conn:
        row = conn.execute(text("SELECT uid, issued_count, consent_agreed, consent_agreed_at FROM nfc_cards")).one()
        assert tuple(row) == ("ABCD", 4, 0, None)
    engine.dispose()
