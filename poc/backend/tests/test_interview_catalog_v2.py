from types import SimpleNamespace as NS
import pytest
from app.seed.interview_catalog import rubric, packs
from app.services import interaction, interview, interaction_scoring, cafe

# 읽기 5/5: 작은 입력을 넣고 예상 결과와 같은지 확인하는 자동 시험입니다.
# 현재 시험은 질문 진행과 점수 연결 중심이며 실제 LLM 판단 정확도를 입증하지 않습니다.
# 예정 시험: 약점만 말하면 보완 방법은 누락, 호출 실패는 미측정, 초안 예시는 검색 제외.
# 기존 시험을 지우지 말고 새 형식에 맞게 연결한 뒤 이 세 종류의 시험을 추가합니다.


def session(role="fullstack"):
    data = next(p for p in packs() if p["job_role"] == role)
    s = NS(rapport={})
    interaction.initialize(s, NS(world_setting=data["world_setting"]), [NS(id=1)], "interview")
    return s


def answer(s, tid, status="insufficient", bonus_ids=()):
    turn = NS(id=tid, order=tid, response_text="응답", question_type="main")
    judgment = {"interview_assessment": {"status": status, "bonus_ids": list(bonus_ids), "explanation": "시험 판정"}, "events": [], "measured": []}
    flow = interaction.advance(s, turn, [turn], judgment)
    return flow, judgment


def test_fixed_counts_and_roles():
    assert [len(rubric(r)["questions"]) for r in ("fullstack", "marketing", "sales")] == [6, 8, 8]
    assert [q["id"] for q in rubric("fullstack")["questions"]] == ["intro", "motivation", "teamwork", "plans", "fs-roles", "fs-login"]
    assert all(q["examples"] for p in packs() for q in p["world_setting"]["interaction"]["interview_rubric"]["questions"])


def test_followups_final_replacement_and_no_duplicate_points():
    s = session()
    first, j1 = answer(s, 1)
    assert first["index"] == 0
    assert interaction_scoring.calculate([j1])["scores"]["response"] is None
    second, j2 = answer(s, 2, "fulfilled")
    assert second["index"] == 1
    assert interaction_scoring.calculate([j1, j2, j2])["scores"]["response"] == 78


def test_common_two_followups_job_one():
    s = session()
    for tid in range(1, 4):
        flow, _ = answer(s, tid)
    assert flow["index"] == 1
    for tid in range(4, 7):
        flow, _ = answer(s, tid, "skipped")
    assert flow["index"] == 4
    assert answer(s, 7)[0]["index"] == 4
    assert answer(s, 8)[0]["index"] == 5


def test_eight_skips_finish_and_no_old_penalty_cap():
    s = session("marketing")
    judgments = []
    for tid in range(1, 9):
        flow, j = answer(s, tid, "skipped")
        judgments.append(j)
    assert flow["finished"] and len(flow["unmet"]) == 8
    assert interaction_scoring.calculate(judgments)["scores"]["response"] == 43


def test_uncertainty_and_manual_unasked_are_not_failures():
    s = session()
    judgments = [answer(s, tid, "uncertain")[1] for tid in range(1, 4)]
    interaction.finish_manually(s)
    assert interaction.state(s)["unmet"] == []
    assert len(interaction.state(s)["unverified"]) == 6
    assert interaction_scoring.calculate(judgments)["scores"]["response"] is None


def test_no_teamwork_experience_uses_alternative_without_penalty():
    s = session()
    answer(s, 1, "fulfilled"); answer(s, 2, "fulfilled")
    flow, _ = answer(s, 3, "no_experience")
    assert flow["index"] == 2 and flow["followup_text"] == interview.ALTERNATIVE
    assert answer(s, 4, "fulfilled")[0]["index"] == 3


def test_evidence_validation_rejects_invented_bonus_and_quotes():
    q = rubric("fullstack")["questions"][-1]
    answers = [{"turn_id": 1, "answer": "서버에서 확인합니다."}]
    data = {"status": "fulfilled", "evidence": [{"turn_id": 1, "quote": "서버에서 확인"}], "explanation": "설명함"}
    assert interview.validate(data, q, answers)["bonus_ids"] == []
    with pytest.raises(ValueError):
        interview.validate({**data, "bonuses": [{"turn_id": 1, "quote": "해시", "concept_id": q["bonuses"][0]["id"]}]}, q, answers)
    with pytest.raises(ValueError):
        interview.validate({**data, "evidence": [{"turn_id": 2, "quote": "서버에서 확인"}]}, q, answers)


def test_skip_is_explicit_not_mention_inside_answer():
    assert interview.SKIP.fullmatch("모르겠어요")
    assert not interview.SKIP.fullmatch("모르겠어요라고 하기보다 서버에서 확인하겠습니다")


def cafe_flow(difficulty="basic"):
    return cafe.initialize({}, difficulty)


def observed(flow, tid, keys=None, final=False):
    state = flow["cafe"]
    keys = keys or list(state["expected"])
    return cafe.advance(flow, NS(id=tid), {"observations": [{"field": k, "value": state["expected"][k], "quote": "확인 발언"} for k in keys], "requested": [], "final_readback": final})


def test_cafe_final_excluded_from_repeats_and_score_cap():
    f = cafe_flow()
    observed(f, 1, final=True)
    observed(f, 2, final=True)
    observed(f, 3, final=True)
    r = cafe.result(f, 3)
    assert r["goal_met"] and f["cafe"]["repeat_penalties"] == []
    assert interaction_scoring.calculate([{"cafe_result": r}])["scores"]["response"] == 81


def test_cafe_third_repeat_once_and_missing_cap():
    f = cafe_flow()
    for tid in range(1, 5): observed(f, tid, ["drink-1:drink"])
    r = cafe.result(f, 4)
    assert len([e for e in r["events"] if e["rule"] == "cafe_repeat"]) == 1
    assert interaction_scoring.calculate([{"cafe_result": r}])["scores"]["response"] == 63
    hard = cafe_flow("ultra_pressure")
    observed(hard, 1, ["drink-1:drink"])
    assert interaction_scoring.calculate([{"cafe_result": cafe.result(hard, 1)}])["scores"]["response"] == 60


def test_cafe_change_resets_only_changed_field_and_final_satisfies_change():
    f = cafe_flow("ultra_pressure")
    observed(f, 1); observed(f, 2)
    assert f["cafe"]["expected"]["drink-2:temperature"] == "아이스"
    assert f["cafe"]["repeats"]["drink-2:temperature"] == 0
    assert f["cafe"]["repeats"]["drink-1:drink"] == 2
    observed(f, 3, final=True)
    assert cafe.result(f, 3)["goal_met"] and f["cafe"]["change_confirmed"]


def test_cafe_failed_analysis_not_missing_penalties():
    f = cafe_flow()
    cafe.advance(f, NS(id=1), None)
    assert not cafe.result(f, 1)["measured"]


def test_api_interview_skips_end_at_six_and_report_no_double_score(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.seed.run import seed
    from app.core.database import SessionLocal
    from app.models import RoleplaySession
    seed()
    client = TestClient(app)
    created = client.post("/api/sessions", json={"service_mode": "interview", "scenario_slug": "interview-fullstack", "consent": {"agreed": True}})
    assert created.status_code == 200, created.text
    s = created.json()
    auth = {"X-Session-Token": s["access_token"]}
    assert s["interaction"]["total"] == 6
    current = s["current_turn"]
    for i in range(6):
        response = client.post(f"/api/sessions/{s['id']}/turns/{current['id']}/response", headers=auth,
                               json={"text": "모르겠어요", "stt_source": "text", "duration_ms": 4000})
        assert response.status_code == 200, response.text
        out = response.json()
        assert out["finished"] == (i == 5)
        current = out.get("next_turn")
    assert client.post(f"/api/sessions/{s['id']}/finish", headers=auth).status_code == 202
    report = client.get(f"/api/sessions/{s['id']}/report", headers=auth).json()
    assert report["fit_scores"]["response"]["score"] == 51
    with SessionLocal() as db:
        saved = db.get(RoleplaySession, s["id"])
        assert "question_results" not in saved.rapport["interaction"]


def test_api_rejects_pressure_and_other_training_scenarios():
    from fastapi.testclient import TestClient
    from app.main import app
    from app.seed.run import seed
    seed()
    c = TestClient(app)
    consent = {"agreed": True}
    assert c.post("/api/sessions", json={"service_mode": "interview", "difficulty": "pressure", "consent": consent}).status_code == 422
    assert c.post("/api/sessions", json={"service_mode": "training", "scenario_slug": "release-schedule-alignment", "consent": consent}).status_code == 422
    assert c.post("/api/sessions", json={"service_mode": "training", "scenario_slug": "ondo-cs-agent", "consent": consent}).status_code == 404
    catalog = c.get("/api/scenarios").json()
    assert [s["slug"] for s in catalog if s["world_setting"].get("service_modes") == ["training"]] == ["cafe-order-taking"]


def test_live_analyzer_uses_saved_examples_and_only_current_question_answers(monkeypatch):
    from app.core.config import settings
    from pydantic import SecretStr
    monkeypatch.setattr(settings, "openai_api_key", SecretStr("test-not-a-real-key"))
    s = session()
    flow = interaction.state(s)
    def post(url, **kwargs):
        import json
        payload = json.loads(kwargs["json"]["messages"][1]["content"])
        assert len(payload["examples"]) == 3
        assert payload["answers"] == [{"turn_id": 2, "answer": "저는 정리를 좋아합니다."}]
        return NS(raise_for_status=lambda: None, json=lambda: {"choices": [{"message": {"content": json.dumps({
                "status": "fulfilled", "evidence": [{"turn_id": 2, "quote": "정리를 좋아합니다"}], "explanation": "관심을 설명함",
                "items": [{"item_id": "self_introduction_focus", "status": "fulfilled", "quote": "정리를 좋아합니다", "reason": "관심을 설명함"}]
            })}}]})
    monkeypatch.setattr(interview.httpx, "post", post)
    t = NS(id=2, order=2, response_text="저는 정리를 좋아합니다.")
    assessment = interview.analyze(t, [NS(id=1, order=1, response_text="다른 질문 답변"), t], flow)
    assert assessment["status"] == "fulfilled"


def test_job_bonus_is_final_only_and_cap_two():
    s = session()
    for tid in range(1, 5): answer(s, tid, "fulfilled")
    _, pending = answer(s, 5, "insufficient", ["fs-roles-bonus-1"])
    _, final = answer(s, 6, "fulfilled", ["fs-roles-bonus-1", "fs-roles-bonus-2"])
    score = interaction_scoring.calculate([pending, final])
    assert score["scores"]["response"] == 80
    assert [e["points"] for e in score["changes"]["response"]] == [3, 1, 1]

def test_interview_unmeasured_on_http_error(monkeypatch):
    """API 통신 실패 시 unmeasured 상태와 http_error 코드가 반환되는지 검증"""
    from app.core.config import settings
    from pydantic import SecretStr
    import httpx
    
    monkeypatch.setattr(settings, "openai_api_key", SecretStr("test-key"))
    s = session()
    flow = interaction.state(s)
    
    def post_error(url, **kwargs):
        raise httpx.HTTPError("Connection failed")
        
    monkeypatch.setattr(interview.httpx, "post", post_error)
    t = NS(id=2, order=2, response_text="테스트 답변입니다.")
    res = interview.analyze(t, [t], flow)
    
    assert res["analysis_status"] == "unmeasured"
    assert res["error_code"] == "http_error"
