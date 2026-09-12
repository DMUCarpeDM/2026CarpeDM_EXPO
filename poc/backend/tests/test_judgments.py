from types import SimpleNamespace as NS
from app.services.judgments import evaluate, persist, results


def test_missing_and_invalid_measurements_abstain():
    for nv in ({}, {"frames": 100, "sample_ms": 200},
               {"calibrated": True, "frames": 100, "sample_ms": 200, "head_down_ratio": float("nan")}):
        assert evaluate(1, nonverbal=nv, duration_ms=5000)["measured"] == []


def test_posture_uses_sample_gate_and_one_event_per_rule():
    nv = {"calibrated": True, "frames": 20, "sample_ms": 200, "head_down_ratio": .6}
    assert not evaluate(1, nonverbal=nv, duration_ms=2000)["events"]
    result = evaluate(1, nonverbal=nv, duration_ms=4000)
    assert result["events"][0]["rule"] == "head_down"
    session = NS(rapport={"other": 1})
    persist(session, result)
    persist(session, result)
    assert len(results(session)) == 1 and session.rapport["other"] == 1
    assert all(e["area"] != "expression" for e in result["events"])


def test_goal_and_quote_share_the_same_judgment():
    result = evaluate(1, text="내일 하겠습니다", goals=[{"id": "a", "label": "일정", "keywords": ["내일"]}])
    assert result["met_goals"] == ["a"]
    assert result["events"][0]["evidence"]["quote"] == "내일 하겠습니다"
