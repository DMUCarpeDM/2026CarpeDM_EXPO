from pydantic import SecretStr
import re

from app.core.config import settings
from app.models import Episode, RoleplaySession, Scenario, Turn
from app.services.dialogue.openai_provider import OpenAIDialogueProvider
from app.services.workplace import CONTINUOUS_MODE


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


def test_valid_line_rejects_act_meta_leak():
    """세션 39 turn 69 재현 — 막 메타가 대사로 새면 폴백해야 한다."""
    from app.services.dialogue.openai_provider import _history_question, _scene_context, _valid_line

    assert _valid_line("그냥 지난달 보고서부터 먼저 읽어요.")
    assert not _valid_line("Act**: * Act: Morning")
    assert not _valid_line("Act: Morning")
    assert not _valid_line("**아침 막**")
    assert not _valid_line("Okay, read the report.")
    # 세션 43 — 잘린 Gemini 대사
    assert not _valid_line("보고까지 할 건 없고,")
    assert not _valid_line("그럼 우선 자료 중에서 일정표")
    assert _history_question("Act**: * Act: Morning") == "(이전 장면)"
    assert _scene_context({"act_id": "morning", "act_label": "Act: Morning"}) == "출근"
    assert _scene_context({"act_id": "morning", "act_label": "출근"}) == "출근"


def test_continuous_mode_falls_back_when_model_leaks_act_meta(monkeypatch):
    from app.services.dialogue import stats as dialogue_stats

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "Act**: * Act: Morning"}}]}

    monkeypatch.setattr(settings, "openai_api_key", SecretStr("test-key"))
    monkeypatch.setattr(
        "app.services.dialogue.openai_provider.httpx.post",
        lambda *_a, **_k: FakeResponse(),
    )
    scenario = Scenario(
        id=1,
        slug="workplace-conversation",
        title="직장 대화",
        description="하루",
        world_setting={"user_role": "신입", "company": "클라우드밋"},
        characters=[{
            "id": "park_senior",
            "name": "박선임",
            "role": "선임",
            "personality": "업무를 떠넘기는 선임",
            "speech_style": "편한 존댓말",
            "catchphrases": ["그냥 좀"],
            "difficulty_persona": {"basic": "부드럽게 부탁한다."},
        }],
    )
    episode = Episode(
        id=1, scenario_id=1, order=1, title="출근", modes=[5],
        character_id="park_senior",
        initial_question="자료 한번 쭉 보고 알아서 파악해보세요.",
        situation="아침", question_intent="파악", max_turns=4, checklist=[], pressure_questions=[],
    )
    session = RoleplaySession(id=39, scenario_id=1, mode=5, difficulty="basic", rapport={
        "interaction": {
            "version": "interaction-v1",
            "mode": CONTINUOUS_MODE,
            "index": 1,
            "finished": False,
            "carry": "",
            "last_case": "ok",
            "items": [
                {
                    "id": "morning-0",
                    "episode_id": 1,
                    "character_id": "park_senior",
                    "text": "자료 한번 쭉 보고 알아서 파악해보세요.",
                    "goal": "방향을 확인한다",
                    "act_id": "morning",
                    "act_label": "출근",
                    "fallback_pool": ["자료 한번 쭉 보고 알아서 파악해보세요.", "할 일 없으면 먼저 물어봐야죠."],
                },
                {
                    "id": "morning-1",
                    "episode_id": 1,
                    "character_id": "park_senior",
                    "text": "할 일 없으면 먼저 물어봐야죠.",
                    "goal": "방향을 확인한다",
                    "act_id": "morning",
                    "act_label": "출근",
                    "fallback_pool": ["자료 한번 쭉 보고 알아서 파악해보세요.", "할 일 없으면 먼저 물어봐야죠."],
                },
            ],
        }
    })
    before = dialogue_stats.snapshot()["fallback"]
    turn = Turn(
        id=68, session_id=39, episode_id=1, order=1, question_type="main",
        question_text="그냥 지난달 보고서부터 먼저 읽",
        character_id="park_senior",
        response_text="네 지난달 포함 최근 3개월 보고서 읽고 숙지해 놓겠습니다",
    )
    spec = OpenAIDialogueProvider().next_question(session, scenario, [episode], [turn])
    assert spec.question_text != "Act**: * Act: Morning"
    assert re.search(r"[가-힣]", spec.question_text)
    assert dialogue_stats.snapshot()["fallback"] == before + 1


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
    assert "성격(고정):" in prompt
    assert "현재 난이도 태도(세션 고정):" in prompt


def test_persona_includes_fixed_enrichment_fields_when_present():
    from app.services.dialogue.openai_provider import _persona

    thin = _persona(
        {"name": "손님", "role": "고객", "personality": "화난 단골", "speech_style": "짧은 존댓말"},
        "basic",
    )
    assert "나와의 관계:" not in thin
    assert "성격(고정): 화난 단골" in thin
    assert "현재 난이도 태도(세션 고정):" in thin

    rich = _persona(
        {
            "name": "박선임",
            "role": "선임",
            "personality": "친한 척",
            "speech_style": "편한 존댓말",
            "relation_to_user": "같은 팀 선임",
            "catchphrases": ["그냥 좀", "신입인데"],
            "never": ["사과"],
            "goals": "일을 넘긴다",
            "do": "부탁한다",
            "dont": "온보딩",
            "difficulty_persona": {"basic": "부드럽게 부탁한다."},
        },
        "basic",
    )
    assert "나와의 관계: 같은 팀 선임" in rich
    assert "자주 쓰는 말: 그냥 좀, 신입인데" in rich
    assert "절대 안 하는 말/행동: 사과" in rich
    assert "이 사람의 숨은 목표: 일을 넘긴다" in rich
    assert "현재 난이도 태도(세션 고정): 부드럽게 부탁한다." in rich


def test_next_question_stops_after_the_mode_turn_limit(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", SecretStr("test-key"))
    session = RoleplaySession(id=1, scenario_id=1, mode=5, difficulty="basic")
    turns = [_turn() for _ in range(6)]

    next_turn = OpenAIDialogueProvider().next_question(session, _scenario(), [_episode()], turns)

    assert next_turn is None


def test_interview_reaction_uses_shared_feedback_but_keeps_prepared_question(monkeypatch):
    from app.services import interaction, judgments, feedback
    scenario = _scenario()
    scenario.world_setting = {"interaction": {"interview_questions": [f"주요 질문 {i}" for i in range(6)]}}
    session = RoleplaySession(id=1, scenario_id=1, mode=5, difficulty="basic")
    interaction.initialize(session, scenario, [_episode()], "interview")
    value = interaction.state(session)
    value["index"] = 1
    interaction.save(session, value)
    observation = judgments.evaluate(1, duration_ms=5000,
        nonverbal={"frames": 30, "sample_ms": 200, "calibrated": True, "head_down_ratio": .7, "posture_samples": {"head_down_ratio": 30}})
    feedback.assign(session, observation, 1)
    judgments.persist(session, observation)
    captured = {}
    class Response:
        def raise_for_status(self):
            pass
        def json(self):
            return {"choices": [{"message": {"content": "고개를 조금 들어 저를 보며 말씀해 주시겠어요?"}}]}
    def post(url, **kwargs):
        captured.update(kwargs)
        return Response()
    monkeypatch.setattr(settings, "openai_api_key", SecretStr("test"))
    monkeypatch.setattr('app.services.dialogue.openai_provider.httpx.post', post)
    spec = OpenAIDialogueProvider().next_question(session, scenario, [_episode()], [_turn()])
    assert spec.question_type == "main" and spec.question_text == "주요 질문 1"
    assert spec.reaction_text == "고개를 조금 들어 저를 보며 말씀해 주시겠어요?"
    assert 'head_down' in captured['json']['messages'][1]['content']
    assert '표정·감정·성격을 지적하지 않습니다' in captured['json']['messages'][0]['content']
