"""Ollama 필수 대화 엔진 — 준비되지 않으면 시뮬레이션을 시작하지 않는다."""
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


def test_returns_no_personalized_question_when_ollama_unreachable(monkeypatch):
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
    assert provider.personalize_question(spec, "상황", "핵심 없는 대답") is None


def test_first_question_starts_from_the_episode_plan(monkeypatch):
    monkeypatch.setattr(settings, "ollama_base_url", "http://127.0.0.1:1")
    provider = OllamaDialogueProvider()
    session = RoleplaySession(id=1, scenario_id=1, mode=5, difficulty="basic")
    spec = provider.first_question(session, [make_episode()])
    assert spec.question_text == "질문"


def test_personalization_prompt_locks_the_selected_scene(monkeypatch):
    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"message": {"content": "현재 장애 원인과 조치 담당자를 말씀해 주시겠어요?"}}

    def fake_post(_url, **kwargs):
        captured.update(kwargs["json"])
        return FakeResponse()

    monkeypatch.setattr("app.services.dialogue.ollama_provider.httpx.post", fake_post)
    provider = OllamaDialogueProvider()
    spec = provider.first_question(RoleplaySession(id=1, scenario_id=1, mode=5), [make_episode()])

    result = provider.personalize_question(
        spec,
        "고객 서비스 장애를 대응하는 중입니다.",
        "원인을 확인 중입니다.",
        {"name": "김 팀장", "role": "상사", "personality": "차분함", "speech_style": "짧은 존댓말"},
        "basic",
    )

    system = captured["messages"][0]["content"]
    prompt = captured["messages"][1]["content"]
    assert result == "현재 장애 원인과 조치 담당자를 말씀해 주시겠어요?"
    assert "새 업무·인물·일정·조건을 만들거나" in system
    assert "고객 서비스 장애를 대응하는 중입니다." in prompt
    assert "[참고용 기본 질문]" in prompt
    assert captured["options"]["temperature"] == 0.15


def test_rejects_a_validly_formatted_question_outside_the_selected_scene(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"message": {"content": "다음 주 신제품 발표 자료는 누가 준비하나요?"}}

    monkeypatch.setattr("app.services.dialogue.ollama_provider.httpx.post", lambda *_args, **_kwargs: FakeResponse())
    provider = OllamaDialogueProvider()
    spec = provider.first_question(RoleplaySession(id=1, scenario_id=1, mode=5), [make_episode()])

    result = provider.personalize_question(
        spec,
        "고객 서비스 장애를 대응하는 중입니다.",
        "원인을 확인 중입니다.",
    )

    assert result is None


def test_create_session_rejects_when_ollama_is_unavailable(monkeypatch):
    """Ollama가 준비되지 않으면 대본만으로 세션을 시작하지 않는다."""
    from fastapi.testclient import TestClient

    from app.main import app
    from app.seed.run import seed

    monkeypatch.setattr(settings, "dialogue_provider", "template")

    seed()
    client = TestClient(app)
    result = client.post("/api/sessions", json={
        "mode": 5, "difficulty": "basic",
        "consent": {"agreed": True, "storage_policy": "none"},
    })
    assert result.status_code == 503
    assert "Ollama" in result.json()["detail"]
