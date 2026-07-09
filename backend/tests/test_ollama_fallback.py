"""하이브리드 대화 엔진 — LLM 연결 실패 시 템플릿 폴백 보장 (전시 안정성 핵심)."""
from app.core.config import settings
from app.models import Episode, RoleplaySession, Turn
from app.services.dialogue.ollama_provider import OllamaDialogueProvider


def make_episode() -> Episode:
    return Episode(
        id=1, scenario_id=1, order=1, title="EP1", modes=[5, 10],
        character_id="kim_teamlead", initial_question="질문",
        situation="상황", max_turns=3,
        checklist=[{"id": "a", "label": "핵심 A", "keywords": ["보고"], "followup": "A는요?", "weight": 1.0}],
        pressure_questions=[],
    )


def test_falls_back_to_template_when_ollama_unreachable(monkeypatch):
    monkeypatch.setattr(settings, "ollama_base_url", "http://127.0.0.1:1")  # 연결 불가 주소
    monkeypatch.setattr(settings, "ollama_timeout_sec", 0.2)
    provider = OllamaDialogueProvider()
    session = RoleplaySession(id=1, scenario_id=1, mode=5, difficulty="basic")
    eps = [make_episode()]
    turns = [Turn(
        id=1, session_id=1, episode_id=1, order=1, question_type="initial",
        question_text="질문", character_id="kim_teamlead", response_text="핵심 없는 대답",
    )]
    spec = provider.next_question(session, eps, turns)
    assert spec is not None
    assert spec.question_text == "A는요?"  # 템플릿 질문 그대로 (폴백)
    assert spec.question_type == "followup"


def test_first_question_always_uses_template(monkeypatch):
    monkeypatch.setattr(settings, "ollama_base_url", "http://127.0.0.1:1")
    provider = OllamaDialogueProvider()
    session = RoleplaySession(id=1, scenario_id=1, mode=5, difficulty="basic")
    spec = provider.first_question(session, [make_episode()])
    assert spec.question_text == "질문"
