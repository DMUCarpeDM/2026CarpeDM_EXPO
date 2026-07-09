"""대화 엔진 단위 테스트 — DB 없이 detached 모델 객체로 검증."""
from app.models import Episode, RoleplaySession, Turn
from app.services.dialogue.template_provider import TemplateDialogueProvider

provider = TemplateDialogueProvider()


def make_episode(id: int, order: int, modes: list | None = None, max_turns: int = 2, **kw) -> Episode:
    return Episode(
        id=id,
        scenario_id=1,
        order=order,
        title=f"EP{order}",
        modes=modes if modes is not None else [5, 10],
        character_id="kim_teamlead",
        initial_question=f"질문 {order}",
        checklist=kw.get("checklist", []),
        pressure_questions=kw.get("pressure_questions", []),
        max_turns=max_turns,
    )


CHECKLIST = [
    {"id": "a", "label": "핵심 A", "keywords": ["보고"], "followup": "A는요?", "weight": 1.5},
    {"id": "b", "label": "핵심 B", "keywords": ["확인"], "followup": "B는요?", "weight": 1.0},
]


def make_turn(id: int, episode_id: int, order: int, response: str, qtype: str = "initial") -> Turn:
    return Turn(
        id=id, session_id=1, episode_id=episode_id, order=order,
        question_type=qtype, question_text="q", character_id="kim_teamlead",
        response_text=response,
    )


def session(mode: int = 5, difficulty: str = "basic") -> RoleplaySession:
    return RoleplaySession(id=1, scenario_id=1, mode=mode, difficulty=difficulty)


def test_first_question_uses_first_episode_of_mode():
    eps = [make_episode(1, 1), make_episode(2, 2, modes=[10])]
    spec = provider.first_question(session(mode=5), eps)
    assert spec.episode_id == 1
    assert spec.question_type == "initial"


def test_mode_10_includes_exclusive_episodes():
    eps = [make_episode(1, 1), make_episode(2, 2, modes=[10])]
    assert len(provider.episodes_for_mode(eps, 5)) == 1
    assert len(provider.episodes_for_mode(eps, 10)) == 2


def test_missing_checklist_triggers_weighted_followup():
    eps = [make_episode(1, 1, checklist=CHECKLIST, max_turns=3), make_episode(2, 2)]
    turns = [make_turn(1, 1, 1, "네 알겠습니다")]  # a(보고), b(확인) 모두 누락
    spec = provider.next_question(session(), eps, turns)
    assert spec is not None
    assert spec.question_type == "followup"
    assert spec.question_text == "A는요?"  # weight 1.5 > 1.0


def test_covered_checklist_advances_to_next_episode():
    eps = [make_episode(1, 1, checklist=CHECKLIST, max_turns=3), make_episode(2, 2)]
    turns = [make_turn(1, 1, 1, "바로 보고드리고 확인하겠습니다")]
    spec = provider.next_question(session(), eps, turns)
    assert spec is not None
    assert spec.episode_id == 2
    assert spec.question_type == "initial"


def test_pressure_mode_asks_pressure_question_when_covered():
    eps = [
        make_episode(1, 1, checklist=CHECKLIST, max_turns=3,
                     pressure_questions=[{"text": "압박!", "trigger": "any"}]),
        make_episode(2, 2),
    ]
    turns = [make_turn(1, 1, 1, "보고드리고 확인하겠습니다")]
    spec = provider.next_question(session(difficulty="pressure"), eps, turns)
    assert spec is not None
    assert spec.question_type == "pressure"


def test_ends_after_last_episode():
    eps = [make_episode(1, 1, checklist=CHECKLIST, max_turns=2)]
    turns = [
        make_turn(1, 1, 1, "보고드리겠습니다"),
        make_turn(2, 1, 2, "확인했습니다", qtype="followup"),
    ]
    assert provider.next_question(session(), eps, turns) is None


def test_budget_reserves_turns_for_remaining_episodes():
    # 예산 6(5분 모드), 남은 에피소드 5개 → 후속 질문 대신 다음 에피소드로 넘어가야 함
    eps = [make_episode(i, i, checklist=CHECKLIST if i == 1 else [], max_turns=3) for i in range(1, 7)]
    turns = [make_turn(1, 1, 1, "전혀 관련 없는 대답")]
    spec = provider.next_question(session(), eps, turns)
    assert spec is not None
    assert spec.episode_id == 2  # followup 대신 진행


def test_same_followup_not_repeated():
    eps = [make_episode(1, 1, checklist=CHECKLIST, max_turns=3), make_episode(2, 2)]
    turns = [
        make_turn(1, 1, 1, "..."),
        make_turn(2, 1, 2, "여전히 무관한 대답", qtype="followup"),
    ]
    turns[1].question_text = "A는요?"  # 이미 A를 물었음
    spec = provider.next_question(session(), eps, turns)
    assert spec is not None
    # A 후속을 반복하지 않고 B 후속 질문
    assert spec.question_text == "B는요?"
