from pydantic import SecretStr

from app.core.config import settings
from app.models import Episode, RoleplaySession, Scenario, Turn
from app.services.dialogue.openai_provider import OpenAIDialogueProvider


def _scenario() -> Scenario:
    return Scenario(
        id=1,
        slug="cafe",
        title="카페 온도",
        description="컴플레인 고객 응대 연습",
        world_setting={"user_role": "매장 크루"},
        characters=[{
            "id": "customer",
            "name": "강선우 고객",
            "role": "고객",
            "role_key": "customer",
            "personality": "음료가 잘못 나와 화가 난 단골 고객",
            "speech_style": "짧고 불만이 담긴 존댓말",
            "difficulty_persona": {"basic": "불만을 말하지만 대화할 여지를 준다."},
        }],
    )


def _episode() -> Episode:
    return Episode(
        id=1,
        scenario_id=1,
        order=1,
        title="잘못 나온 음료",
        modes=[5],
        character_id="customer",
        initial_question="저기요, 온도라떼를 시켰는데 이건 아메리카노잖아요.",
        situation="픽업대 앞에서 잘못 나온 음료를 받은 고객이 출근에 늦었다며 항의한다.",
        question_intent="공감, 사과, 즉시 조치를 자연스럽게 연습한다.",
        max_turns=3,
        checklist=[],
        pressure_questions=[],
    )


def _turn() -> Turn:
    return Turn(
        id=1,
        session_id=1,
        episode_id=1,
        order=1,
        question_type="initial",
        question_text="저기요, 온도라떼를 시켰는데 이건 아메리카노잖아요.",
        character_id="customer",
        response_text="정말 죄송합니다. 바로 다시 만들어 드리겠습니다.",
    )


def test_first_question_keeps_the_existing_episode_line():
    provider = OpenAIDialogueProvider()

    first = provider.first_question(RoleplaySession(id=1, scenario_id=1, mode=5), [_episode()])

    assert first.question_text == "저기요, 온도라떼를 시켰는데 이건 아메리카노잖아요."
    assert first.question_type == "initial"


def test_next_question_sends_full_roleplay_context_to_gpt4o(monkeypatch):
    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "상대: 강선우 고객: 그럼 새 음료는 언제 받을 수 있나요?"}}]}

    def fake_post(_url, **kwargs):
        captured.update(kwargs)
        return FakeResponse()

    monkeypatch.setattr(settings, "openai_api_key", SecretStr("test-key"))
    monkeypatch.setattr("app.services.dialogue.openai_provider.httpx.post", fake_post)
    session = RoleplaySession(id=1, scenario_id=1, mode=5, difficulty="basic")
    provider = OpenAIDialogueProvider()

    next_turn = provider.next_question(session, _scenario(), [_episode()], [_turn()])

    assert next_turn is not None
    assert next_turn.question_type == "ai_roleplay"
    assert next_turn.question_text == "그럼 새 음료는 언제 받을 수 있나요?"
    prompt = captured["json"]["messages"][1]["content"]
    assert "카페 온도" in prompt
    assert "강선우 고객" in prompt
    assert "매장 크루" in prompt
    assert "정말 죄송합니다" in prompt


def test_next_question_stops_after_the_mode_turn_limit(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", SecretStr("test-key"))
    session = RoleplaySession(id=1, scenario_id=1, mode=5, difficulty="basic")
    turns = [_turn() for _ in range(6)]

    next_turn = OpenAIDialogueProvider().next_question(session, _scenario(), [_episode()], turns)

    assert next_turn is None
