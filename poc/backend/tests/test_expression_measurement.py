from types import SimpleNamespace as NS
import pytest
from pydantic import ValidationError
from app.schemas import NonverbalIn
from app.services.expression_measurement import LABELS, summarize, summary_text
from app.services import judgments, interaction_scoring


def payload(samples=3, value=.5):
    return {"version":"expression-resnet18-v1", "status":"unvalidated",
            "preprocessing":"imagenet-face-square-provisional-v1", "samples":samples,
            "mean_outputs":dict.fromkeys(LABELS,value)}


def test_schema_retains_outputs_and_rejects_bad_samples():
    assert NonverbalIn(expression_model=payload()).model_dump()["expression_model"] == payload()
    for bad in [payload(0), payload(value=float('nan')), payload(value=2), {**payload(),"mean_outputs":{"unknown":.5}}]:
        with pytest.raises(ValidationError): NonverbalIn(expression_model=bad)


def test_report_weights_valid_samples_and_does_not_claim_emotions():
    session=NS(turns=[NS(id=1,order=1,nonverbal_metrics={"expression_model":payload(1,.2)}),
                     NS(id=2,order=2,nonverbal_metrics={"expression_model":payload(3,.6)}),
                     NS(id=3,order=3,nonverbal_metrics={"expression_model":{"bad":1}})])
    data=summarize(session)
    assert data["samples"] == 4
    assert data["mean_outputs"]["smile"] == pytest.approx(.5)
    assert data["scoring_enabled"] is False
    assert "검증 전 참고값" in summary_text(session)


def test_expression_never_changes_score_and_missing_face_is_not_neutral():
    result=judgments.evaluate(1, nonverbal=NonverbalIn(expression_model=payload()).model_dump(),duration_ms=10000)
    scores=interaction_scoring.calculate([result])
    assert scores["scores"]["expression"] is None
    assert scores["total"] is None
    empty=summarize(NS(turns=[NS(id=1,order=1,nonverbal_metrics={})]))
    assert empty["status"] == "unmeasured"
    assert empty["mean_outputs"] == {}


def test_api_persists_expression_outputs_and_returns_them_in_report(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.seed.run import seed
    from app.core.database import SessionLocal
    from app.models import RoleplaySession

    seed()
    monkeypatch.setattr("app.services.cafe.analyze", lambda *_: {
        "observations": [], "requested": [], "final_readback": False})
    client = TestClient(app)
    created = client.post('/api/sessions', json={"service_mode": "training", "mode": 5,
        "consent": {"agreed": True, "storage_policy": "none"}}).json()
    sid, turn = created['id'], created['current_turn']['id']
    auth = {"X-Session-Token": created['access_token']}
    response = client.post(f'/api/sessions/{sid}/turns/{turn}/response', headers=auth, json={
        "text": "먼저 주문 내용을 확인하겠습니다.", "stt_source": "text", "duration_ms": 4000,
        "nonverbal": {"expression_model": payload()}})
    assert response.status_code == 200, response.text
    with SessionLocal() as db:
        session = db.get(RoleplaySession, sid)
        assert session.turns[0].nonverbal_metrics['expression_model'] == payload()
    assert client.post(f'/api/sessions/{sid}/finish', headers=auth).status_code in (200, 202)
    response = client.get(f'/api/sessions/{sid}/report', headers=auth)
    assert response.status_code == 200, response.text
    report = response.json()
    assert report['speech_stats']['expression_analysis']['samples'] == 3
    assert report['speech_stats']['expression_analysis']['mean_outputs']['smile'] == .5
    assert report['fit_scores']['expression']['score'] is None
    assert '검증 전 참고값' in report['fit_scores']['expression']['summary']
