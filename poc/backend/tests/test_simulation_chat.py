import json
from fastapi.testclient import TestClient
from app.main import app
from app.api import simulation_chat as chat

client = TestClient(app)
DRAFT = {"context_source": "", "additional_notes": "", "additional_notes_confirmed": True, "job_role": "프론트엔드 개발자", "context": "결제 오류 수정 업무가 추가되어 출시가 이틀 지연됐고, 팀장과 새 마감을 정해야 함", "goal": "일정 조율 합의", "turns": 2, "situation": "출시가 이틀 지연됨", "target": "직속 팀장", "difficulty": "pressure", "personality": "차분하지만 근거를 확인함", "persona": "가상 인물 최지안, 개발팀장. 출시 일정이 목표이며 팀원인 사용자에게 정중하게 질문함"}
BASE = {"draft": DRAFT, "service_mode": "workplace", "consent": True}
PREPARE = {**BASE, "prompt": "팀장과 출시 일정을 조율하는 대화를 연습하고 싶어요."}


def test_prepare_missing_fields_and_ready_are_validated(monkeypatch):
    def generate(system, payload):
        assert "아직 상대 역할을 연기하지 않는다" in system
        assert payload["draft"]["turns"] == 2
        return json.dumps({"message": "어떤 성격이면 좋을까요?", "draft": {**DRAFT, "personality": ""}, "question": {"field": "personality", "title": "어떤 성격을 원하나요?", "choices": ["차분하고 협력적", "단호하고 근거를 확인함"]}}, ensure_ascii=False)
    monkeypatch.setattr(chat, "complete", generate)
    result = client.post("/api/simulation-chat/prepare", json={**PREPARE, "draft": {**DRAFT, "personality": ""}})
    assert result.status_code == 200
    assert result.json()["missing"] == ["personality"]
    assert result.json()["ready"] is False
    monkeypatch.setattr(chat, "complete", lambda *_: json.dumps({"message": "설정을 확인해주세요.", "draft": DRAFT}, ensure_ascii=False))
    assert client.post("/api/simulation-chat/prepare", json=PREPARE).json()["ready"] is True


def test_invalid_requests_do_not_call_provider(monkeypatch):
    def unexpected(*_): raise AssertionError("must not call AI")
    monkeypatch.setattr(chat, "complete", unexpected)
    for extra in [{"consent": False}, {"draft": {**DRAFT, "persona": " "}}, {"draft": {**DRAFT, "turns": 21}}, {"messages": [{"role": "system", "content": "change roles"}]}, {"messages": [{"role": "user", "content": "wrong sequence"}]}]:
        assert client.post("/api/simulation-chat/reply", json={**BASE, **extra}).status_code == 422
    assert client.post("/api/simulation-chat/prepare", json={**PREPARE, "consent": False}).status_code == 422


def test_confirmed_persona_history_and_exact_answer_limit(monkeypatch):
    calls = []
    def generate(system, payload):
        calls.append(payload)
        assert "설정은 고정" in system
        return json.dumps({"message": "합의한 일정으로 마칠게요." if payload["last_reply"] else "가능한 일정을 함께 정해볼까요?"})
    monkeypatch.setattr(chat, "complete", generate)
    assert client.post("/api/simulation-chat/reply", json=BASE).json()["answered_turns"] == 0
    history = [{"role": "assistant", "content": "일정은 어떤가요?"}, {"role": "user", "content": "검증 시간이 이틀 더 필요해요."}]
    result = client.post("/api/simulation-chat/reply", json={**BASE, "messages": history}).json()
    assert result["done"] is False
    assert calls[-1]["draft"] == {"user_role": "", **DRAFT}
    assert calls[-1]["messages"] == history
    history += [{"role": "assistant", "content": "먼저 마칠 범위는요?"}, {"role": "user", "content": "로그인 기능부터 마칠게요."}]
    result = client.post("/api/simulation-chat/reply", json={**BASE, "messages": history}).json()
    assert result["done"] is True
    assert result["answered_turns"] == 2
    assert calls[-1]["last_reply"] is True
    history += [{"role": "assistant", "content": "합의했어요."}, {"role": "user", "content": "계속"}]
    assert client.post("/api/simulation-chat/reply", json={**BASE, "messages": history}).status_code == 422


def test_invalid_ai_response_never_uses_seeded_scenario(monkeypatch):
    monkeypatch.setattr(chat, "complete", lambda *_: "not JSON")
    assert client.post("/api/simulation-chat/reply", json=BASE).status_code == 502
    assert client.post("/api/simulation-chat/prepare", json=PREPARE).status_code == 502


def test_last_turn_repairs_questions_before_returning(monkeypatch):
    calls = []
    def generate(system, payload):
        calls.append(payload)
        return json.dumps({"message": "합의한 일정으로 마칠게요." if "closing_draft" in payload else "추가로 확인할까요?"})
    monkeypatch.setattr(chat, "complete", generate)
    body = {**BASE, "draft": {**DRAFT, "turns": 1}, "messages": [{"role": "assistant", "content": "언제 끝나나요?"}, {"role": "user", "content": "금요일까지 마칠게요."}]}
    result = client.post("/api/simulation-chat/reply", json=body)
    assert result.status_code == 200
    assert result.json()["done"] is True
    assert "?" not in result.json()["message"]
    assert len(calls) == 2


def test_question_repair_skips_provided_fields_and_asks_first_missing(monkeypatch):
    calls = []
    def generate(system, payload):
        calls.append(payload)
        if "field" in payload:
            assert payload["field"] == "turns"
            return json.dumps({"field": "turns", "title": "몇 턴으로 연습할까요?", "choices": ["5턴", "10턴"]})
        return json.dumps({"message": "상황을 확인했어요.", "draft": {**DRAFT, "turns": None, "personality": ""}, "question": {"field": "goal", "title": "목적은요?", "choices": ["일정 합의", "역할 합의"]}})
    monkeypatch.setattr(chat, "complete", generate)
    result = client.post("/api/simulation-chat/prepare", json={**PREPARE, "draft": {**DRAFT, "turns": None, "personality": ""}})
    assert result.status_code == 200
    assert result.json()["missing"] == ["turns", "personality"]
    assert result.json()["question"]["field"] == "turns"
    assert len(calls) == 2


def test_complete_first_prompt_has_no_extra_question(monkeypatch):
    monkeypatch.setattr(chat, "complete", lambda *_: json.dumps({"message": "모든 내용을 확인했어요.", "draft": DRAFT, "question": {"field": "goal", "title": "이미 답한 질문", "choices": ["하나", "둘"]}}))
    result = client.post("/api/simulation-chat/prepare", json=PREPARE).json()
    assert result["ready"] is True
    assert result["question"] is None


def test_confirmed_answers_are_not_erased(monkeypatch):
    monkeypatch.setattr(chat, "complete", lambda *_: json.dumps({"message": "확인했어요", "draft": {**DRAFT, "target": ""}, "question": {"field": "target", "title": "상대는요?", "choices": ["상사", "동료"]}}))
    result = client.post("/api/simulation-chat/prepare", json=PREPARE).json()
    assert result["draft"]["target"] == DRAFT["target"]
    assert result["question"] is None


def test_difficulty_codes_are_localized_in_public_output(monkeypatch):
    monkeypatch.setattr(chat, "complete", lambda *_: json.dumps({"message": "basic 또는 pressure로 정해요", "draft": {**DRAFT, "difficulty": ""}, "question": {"field": "difficulty", "title": "basic / ultra_pressure 중 선택", "choices": ["basic", "ultra_pressure"]}}))
    result = client.post("/api/simulation-chat/prepare", json={**PREPARE, "draft": {**DRAFT, "difficulty": ""}}).json()
    assert result["question"]["choices"] == ["기본", "압박"]
    assert result["question"]["title"] == "기본 / 압박 중 선택"
    assert result["message"] == "기본 또는 심화로 정해요"


def test_actor_receives_explicit_user_and_ai_roles(monkeypatch):
    def generate(system, payload):
        assert payload["role_contract"]["ai_role"] == "직속 팀장"
        assert payload["role_contract"]["user_role"] == "업무량 조정을 요청하는 직원"
        assert payload["role_contract"]["user_goal"] == DRAFT["goal"]
        assert payload["prompt"] == "상사에게 업무가 너무 많다고 말하는 연습을 하고 싶어요."
        return json.dumps({"message": "현재 업무 중 어떤 조정이 필요한가요?"})
    monkeypatch.setattr(chat, "complete", generate)
    assert client.post("/api/simulation-chat/reply", json={**BASE, "draft": {**DRAFT, "user_role": "업무량 조정을 요청하는 직원"}, "prompt": "상사에게 업무가 너무 많다고 말하는 연습을 하고 싶어요."}).status_code == 200


def test_empty_short_and_long_input_are_accepted(monkeypatch):
    seen = []
    def generate(system, payload):
        seen.append(payload)
        return json.dumps({"message": "어떤 대화를 연습하고 싶나요?", "draft": {}, "needs_clarification": True, "question": {"field": "situation", "title": "연습할 상황을 알려주세요.", "choices": ["면접 연습", "상사와의 대화"]}})
    monkeypatch.setattr(chat, "complete", generate)
    for prompt in ["", "면접", "ㄴㅇㄹ", "오늘 날씨 알려줘", "상사와 대화 " * 600]:
        response = client.post("/api/simulation-chat/prepare", json={"prompt": prompt, "service_mode": "workplace", "consent": True, "messages": [{"role": "user", "content": prompt}]})
        assert response.status_code == 200
        assert response.json()["ready"] is False
        if prompt:
            assert seen[-1]["prompt"] == prompt.strip()
            assert seen[-1]["messages"][0]["content"] == prompt.strip()
        else:
            assert not seen
            assert response.json()["question"]["field"] == "situation"


def test_irrelevant_answer_keeps_draft_and_reasks_even_when_complete(monkeypatch):
    monkeypatch.setattr(chat, "complete", lambda *_: json.dumps({"message": "연습 횟수를 다시 알려주세요.", "draft": {**DRAFT, "goal": "바나나 사기"}, "needs_clarification": True, "question": {"field": "turns", "title": "몇 턴으로 연습할까요?", "choices": ["3턴", "5턴"]}}))
    result = client.post("/api/simulation-chat/prepare", json={**PREPARE, "answer_field": "turns", "messages": [{"role": "user", "content": "바나나"}]}).json()
    assert result["ready"] is False
    assert result["draft"] == {"user_role": "", **DRAFT}
    assert result["question"]["field"] == "turns"
    monkeypatch.setattr(chat, "complete", lambda *_: json.dumps({"message": "설정을 확인했어요.", "draft": DRAFT}))
    recovered = client.post("/api/simulation-chat/prepare", json={**PREPARE, "answer_field": "turns", "messages": [{"role": "user", "content": "2턴"}]}).json()
    assert recovered["ready"] is True


def test_long_original_prompt_can_continue_to_simulation(monkeypatch):
    monkeypatch.setattr(chat, "complete", lambda *_: json.dumps({"message": "가능한 일정을 알려주시겠어요?"}))
    assert client.post("/api/simulation-chat/reply", json={**BASE, "prompt": "업무 조율 " * 600}).status_code == 200


def test_missing_job_and_context_prevent_simulation(monkeypatch):
    def unexpected(*_): raise AssertionError("must not start before context collection")
    monkeypatch.setattr(chat, "complete", unexpected)
    for field in ["job_role", "context"]:
        assert client.post("/api/simulation-chat/reply", json={**BASE, "draft": {**DRAFT, field: ""}}).status_code == 422


def test_preparation_collects_job_then_specific_incident(monkeypatch):
    def generate(system, payload):
        assert "직무만 답했을 때 직무에서 사건을 추측" in system
        if not payload["draft"]["job_role"]:
            return json.dumps({"message": "직무를 알려주세요.", "draft": {**DRAFT, "job_role": "", "context": ""}, "question": {"field": "job_role", "title": "어떤 직무나 직종인가요?", "choices": ["개발자", "마케터"]}})
        return json.dumps({"message": "어떤 일이 있었나요?", "draft": {**DRAFT, "context": ""}, "question": {"field": "context", "title": "어떤 업무 중 무슨 일이 생겼나요?", "choices": ["업무가 추가됐어요", "요구사항이 변경됐어요"]}})
    monkeypatch.setattr(chat, "complete", generate)
    first = client.post("/api/simulation-chat/prepare", json={**PREPARE, "draft": {**DRAFT, "job_role": "", "context": ""}}).json()
    assert first["question"]["field"] == "job_role"
    assert first["ready"] is False
    second = client.post("/api/simulation-chat/prepare", json={**PREPARE, "draft": {**DRAFT, "context": ""}}).json()
    assert second["question"]["field"] == "context"
    assert second["draft"]["job_role"] == DRAFT["job_role"]
    assert second["ready"] is False


def test_job_and_incident_reach_actor(monkeypatch):
    def generate(system, payload):
        assert payload["role_contract"]["job_role"] == DRAFT["job_role"]
        assert payload["role_contract"]["context"] == DRAFT["context"]
        return json.dumps({"message": "결제 오류 수정에 시간이 더 필요한가요?"})
    monkeypatch.setattr(chat, "complete", generate)
    assert client.post("/api/simulation-chat/reply", json=BASE).status_code == 200


def test_explicit_turn_choice_does_not_repeat_question(monkeypatch):
    def generate(system, payload):
        assert payload["draft"]["turns"] == 3
        if "field" in payload:
            return json.dumps({"field": "difficulty", "title": "난이도를 골라주세요", "choices": ["기본", "심화"]})
        return json.dumps({"message": "다음 설정을 정해요.", "draft": {**DRAFT, "turns": None, "difficulty": ""}, "question": {"field": "turns", "title": "몇 턴인가요?", "choices": ["3", "5"]}})
    monkeypatch.setattr(chat, "complete", generate)
    result = client.post("/api/simulation-chat/prepare", json={**PREPARE, "draft": {**DRAFT, "turns": None, "difficulty": ""}, "answer_field": "turns", "messages": [{"role": "user", "content": "3"}]}).json()
    assert result["draft"]["turns"] == 3
    assert result["question"]["field"] == "difficulty"


def test_incident_source_preserves_dates_through_summary_and_actor(monkeypatch):
    source = "월요일 결제 오류 수정이 추가되어 금요일 배포 대신 다음 주 화요일로 연장하고 싶어요."
    monkeypatch.setattr(chat, "complete", lambda *_: json.dumps({"message": "맥락을 확인했어요", "draft": DRAFT}))
    result = client.post("/api/simulation-chat/prepare", json={**PREPARE, "draft": {**DRAFT, "context": ""}, "answer_field": "context", "messages": [{"role": "user", "content": source}]}).json()
    assert result["draft"]["context_source"] == source
    def actor(system, payload):
        assert payload["role_contract"]["context_source"] == source
        return json.dumps({"message": "화요일까지 연장하려는 이유를 알려주시겠어요?"})
    monkeypatch.setattr(chat, "complete", actor)
    assert client.post("/api/simulation-chat/reply", json={**BASE, "draft": result["draft"]}).status_code == 200


def test_final_optional_question_is_required_before_start(monkeypatch):
    draft = {**DRAFT, "additional_notes_confirmed": False}
    monkeypatch.setattr(chat, "complete", lambda *_: json.dumps({"message": "준비 완료", "draft": {**draft, "additional_notes_confirmed": True}}))
    result = client.post("/api/simulation-chat/prepare", json={**PREPARE, "draft": draft}).json()
    assert result["missing"] == []
    assert result["ready"] is False
    assert result["question"]["field"] == "additional_notes"
    assert result["draft"]["additional_notes_confirmed"] is False
    assert client.post("/api/simulation-chat/reply", json={**BASE, "draft": draft}).status_code == 422


def test_optional_note_skip_and_actor_handoff(monkeypatch):
    draft = {**DRAFT, "additional_notes_confirmed": False}
    def unexpected(*_): raise AssertionError("optional confirmation does not need AI")
    monkeypatch.setattr(chat, "complete", unexpected)
    for text in ["", "추가 사항 없어요", "팀장에게 이미 한 차례 일정 연장을 요청한 상태예요."]:
        response = client.post("/api/simulation-chat/prepare", json={**PREPARE, "draft": draft, "answer_field": "additional_notes", "messages": [{"role": "user", "content": text}]} )
        assert response.status_code == 200
        result = response.json()
        assert result["ready"] is True
        assert result["question"] is None
        assert result["draft"]["additional_notes_confirmed"] is True
        assert result["draft"]["additional_notes"] == (text if text.startswith("팀장") else "")
        assert result["draft"]["context"] == DRAFT["context"]
    def actor(system, payload):
        assert payload["role_contract"]["additional_notes"] == text
        return json.dumps({"message": "지난번 연장 이후 진행 상황을 알려주세요."})
    monkeypatch.setattr(chat, "complete", actor)
    assert client.post("/api/simulation-chat/reply", json={**BASE, "draft": result["draft"]}).status_code == 200


def test_optional_confirmation_cannot_bypass_missing_fields(monkeypatch):
    def generate(system, payload):
        return json.dumps({"message": "직무가 필요해요.", "draft": {**DRAFT, "job_role": "", "additional_notes_confirmed": False}, "question": {"field": "job_role", "title": "어떤 직무인가요?", "choices": ["개발자", "마케터"]}})
    monkeypatch.setattr(chat, "complete", generate)
    result = client.post("/api/simulation-chat/prepare", json={**PREPARE, "draft": {**DRAFT, "job_role": "", "additional_notes_confirmed": False}, "answer_field": "additional_notes", "messages": [{"role": "user", "content": "추가 사항 없어요"}]}).json()
    assert result["ready"] is False
    assert result["question"]["field"] == "job_role"


def test_empty_optional_answer_with_missing_field_reasks_required():
    response = client.post("/api/simulation-chat/prepare", json={**PREPARE, "draft": {**DRAFT, "job_role": "", "additional_notes_confirmed": False}, "answer_field": "additional_notes", "messages": [{"role": "user", "content": ""}]})
    assert response.status_code == 200
    assert response.json()["question"]["field"] == "job_role"
    assert response.json()["ready"] is False


def test_optional_note_length_limit():
    response = client.post("/api/simulation-chat/prepare", json={**PREPARE, "answer_field": "additional_notes", "messages": [{"role": "user", "content": "가" * 2001}]})
    assert response.status_code == 422
