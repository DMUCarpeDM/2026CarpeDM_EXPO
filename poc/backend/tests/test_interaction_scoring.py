from types import SimpleNamespace as NS
from app.services.judgments import event
from app.services.interaction_scoring import calculate, audio_events
from app.services.response_judgment import validate, analyze


def result(events=(), measured=("response",)):
    return {"measured": measured, "events": list(events)}


def test_unmeasured_is_not_zero_and_axes_average():
    assert calculate([])["total"] is None
    out = calculate([result([event(1, "response", "goal_met", "positive", {"goal_id": "x"}, "")], ["response", "posture"])])
    assert out["scores"] == {"response": 78, "voice": None, "expression": None, "posture": 75}
    assert out["total"] == 76.5


def test_repeats_caps_and_duplicate_ids():
    events = [event(i, "posture", "sway", "negative", {}, "") for i in range(20)]
    out = calculate([result(events + events, ["posture"])])
    assert out["scores"]["posture"] == 63
    assert len(out["changes"]["posture"]) == 3


def test_contradictions_deduplicate_and_cap():
    events = [event(i, "response", "contradiction", "negative", {"fact_key": "일정"}, "") for i in range(5)]
    assert calculate([result(events)])["contradiction_deduction"] == 4
    events += [event(10+i, "response", "contradiction", "negative", {"fact_key": f"사실{i}"}, "") for i in range(5)]
    assert calculate([result(events)])["contradiction_deduction"] == 12


def test_audio_excludes_estimates_intonation_and_missing_data():
    assert not audio_events(1, {"estimated": True, "duration_sec": 10, "speech_rate_sps": 9}, "interview")
    assert not audio_events(1, {"duration_sec": 10, "speech_rate_sps": 0}, "interview")
    events = audio_events(1, {"duration_sec": 10, "speech_rate_sps": 4, "f0_cv": 8}, "interview")
    assert [e["rule"] for e in events] == ["clear_pace"]


def test_only_grounded_unexplained_conflicts_survive():
    prior = NS(id=1, order=1, response_text="제가 담당자입니다")
    current = NS(id=2, order=2, response_text="저는 담당자가 아닙니다", question_text="담당자입니까?")
    conflict = {"previous_turn_id": 1, "previous_quote": "제가 담당자입니다", "current_quote": "저는 담당자가 아닙니다", "fact_key": "담당자", "confidence": .95, "explained_change": False}
    assert len(validate({"conflicts": [conflict]}, current, [prior], [], [])[0]) == 1
    for change in ({"previous_quote": "없는 말입니다"}, {"confidence": .7}, {"explained_change": True}, {"previous_turn_id": 99}):
        assert not validate({"conflicts": [{**conflict, **change}]}, current, [prior], [], [])[0]


def test_semantic_goals_require_real_quotes_and_ids():
    current = NS(id=2, order=2, response_text="다음 날 맡겠습니다", question_text="일정은?")
    goals = [{"id": "a", "label": "일정"}]
    events, met = validate({"met_goals": [{"goal_id": "a", "quote": "다음 날"}, {"goal_id": "b", "quote": "맡겠습니다"}], "missing_goal_ids": ["a"]}, current, [], goals, ["a"])
    assert met == ["a"] and [e["rule"] for e in events] == ["goal_met"]


def test_judge_failure_abstains(monkeypatch):
    from app.core.config import settings
    from pydantic import SecretStr
    import httpx
    monkeypatch.setattr(settings, "openai_api_key", SecretStr("test"))
    def fail(*a, **kw):
        raise httpx.ReadTimeout("timeout")
    monkeypatch.setattr("app.services.response_judgment.httpx.post", fail)
    assert analyze(NS(question_text="질문", response_text="답변"), [], [], []) == ([], [], "unavailable")


def test_training_report_uses_shared_score_and_purges_internal_quotes(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.seed.run import seed
    from app.core.database import SessionLocal
    from app.models import RoleplaySession
    from app.services.judgments import event
    seed()
    def judge(current, history, goals, requested):
        return [event(current.id, "response", "goal_met", "positive", {"goal_id": g["id"], "quote": current.response_text}, "목표 확인", key=g["id"]) for g in goals], [g["id"] for g in goals], "completed"
    monkeypatch.setattr("app.services.response_judgment.analyze", judge)
    client = TestClient(app)
    created = client.post('/api/sessions', json={"service_mode": "training", "mode": 5, "consent": {"agreed": True, "storage_policy": "none"}}).json()
    sid = created["id"]
    auth = {"X-Session-Token": created["access_token"]}
    result = client.post(f'/api/sessions/{sid}/turns/{created["current_turn"]["id"]}/response', headers=auth, json={"text": "검증용 답변", "stt_source": "text", "duration_ms": 4000})
    assert result.status_code == 200 and result.json()["finished"] is True
    assert result.json()["interaction"]["reason"] == "goals_met"
    client.post(f'/api/sessions/{sid}/finish', headers=auth)
    report = client.get(f'/api/sessions/{sid}/report', headers=auth).json()
    assert report["total_score"] == 90  # 목표 가점은 15점 상한
    assert report["fit_scores"]["voice"]["score"] is None
    assert report["deep_analysis"]["interaction"]["version"] == "interaction-score-v1"
    with SessionLocal() as db:
        session = db.get(RoleplaySession, sid)
        assert "judgments" not in session.rapport
        assert all(not t.response_text for t in session.turns)
