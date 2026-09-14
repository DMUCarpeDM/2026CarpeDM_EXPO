from types import SimpleNamespace as NS
from app.services.judgments import evaluate, persist, results


def test_missing_and_invalid_measurements_abstain():
    for nv in ({}, {"frames": 100, "sample_ms": 200},
               {"calibrated": True, "frames": 100, "sample_ms": 200, "head_down_ratio": float("nan")}):
        assert evaluate(1, nonverbal=nv, duration_ms=5000)["measured"] == []


def test_posture_uses_sample_gate_and_one_event_per_rule():
    nv = {"calibrated": True, "frames": 20, "sample_ms": 200, "head_down_ratio": .6, "posture_samples": {"head_down_ratio": 20}}
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


def test_face_only_and_sparse_posture_do_not_receive_baseline_score():
    from app.services.interaction_scoring import calculate
    from app.schemas.schemas import NonverbalIn
    nv = {"frames": 50, "sample_ms": 80, "calibrated": True,
          "head_down_ratio": 0, "avg_shoulder_tilt_deg": 0,
          "hunched_ratio": 0, "posture_sway": 0, "hand_face_sec": 0}
    for samples in ({}, {key: 0 for key in nv}, {"head_down_ratio": 20}, {"head_down_ratio": 51}):
        payload = NonverbalIn(**nv, posture_samples=samples).model_dump(exclude_unset=True)
        result = evaluate(1, nonverbal=payload, duration_ms=4000)
        assert result["measured"] == []
        assert calculate([result])["total"] is None
    payload = {**nv, "posture_samples": {"head_down_ratio": 40}}
    assert calculate([evaluate(1, nonverbal=payload, duration_ms=4000)])["scores"]["posture"] == 75
