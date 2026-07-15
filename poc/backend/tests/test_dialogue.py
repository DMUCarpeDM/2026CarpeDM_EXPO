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
        deepening_questions=kw.get("deepening_questions", []),
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


def test_basic_difficulty_gets_one_pressure_for_composure():
    # 압박 내성 렌즈(composure)는 압박 턴이 있어야 성립 — basic 난이도에도
    # basic 플래그가 붙은 압박 질문이 세션당 1회 나가야 한다
    eps = [
        make_episode(1, 1, checklist=CHECKLIST, max_turns=3,
                     pressure_questions=[{"text": "basic 압박!", "trigger": "any", "basic": True}]),
        make_episode(2, 2),
    ]
    turns = [make_turn(1, 1, 1, "보고드리고 확인하겠습니다")]  # 전부 커버
    spec = provider.next_question(session(difficulty="basic"), eps, turns)
    assert spec is not None
    assert spec.question_type == "pressure"


def test_basic_pressure_only_once_per_session():
    # 세션당 1회 — 이미 압박을 받았으면 다음 에피소드에서는 안 나간다
    eps = [
        make_episode(1, 1, checklist=CHECKLIST, max_turns=3,
                     pressure_questions=[{"text": "P1", "trigger": "any", "basic": True}]),
        make_episode(2, 2, checklist=CHECKLIST, max_turns=3,
                     pressure_questions=[{"text": "P2", "trigger": "any", "basic": True}]),
        make_episode(3, 3),
    ]
    turns = [
        make_turn(1, 1, 1, "보고드리고 확인하겠습니다"),
        make_turn(2, 1, 2, "네 압박 대응", qtype="pressure"),
        make_turn(3, 2, 3, "보고드리고 확인하겠습니다"),
    ]
    spec = provider.next_question(session(difficulty="basic"), eps, turns)
    assert spec is not None
    assert spec.question_type != "pressure"  # 두 번째 에피소드에서는 압박 없음


def test_basic_pressure_skips_non_basic_questions():
    # basic 플래그가 없는 압박 질문은 basic 난이도에서 나가지 않는다 (심화로 대체)
    eps = [
        make_episode(1, 1, checklist=CHECKLIST, max_turns=3,
                     pressure_questions=[{"text": "hard만", "trigger": "any"}],
                     deepening_questions=[{"text": "심화?", "intent": "x"}]),
        make_episode(2, 2),
    ]
    turns = [make_turn(1, 1, 1, "보고드리고 확인하겠습니다")]
    spec = provider.next_question(session(difficulty="basic"), eps, turns)
    assert spec is not None
    assert spec.question_type == "deepening"


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


DEEPENING = [
    {"text": "심화 A?", "intent": "전개 A"},
    {"text": "심화 B?", "intent": "전개 B"},
]


def test_good_answer_gets_deepening_not_scene_end():
    # 상황당 1답변 증발 방지의 핵심 계약: 체크리스트를 다 커버한 좋은 답에도
    # 장면이 끝나지 않고 심화 질문으로 이어진다
    eps = [
        make_episode(1, 1, checklist=CHECKLIST, max_turns=3, deepening_questions=DEEPENING),
        make_episode(2, 2),
    ]
    turns = [make_turn(1, 1, 1, "바로 보고드리고 확인하겠습니다")]  # 전부 커버
    spec = provider.next_question(session(), eps, turns)
    assert spec is not None
    assert spec.question_type == "deepening"
    assert spec.episode_id == 1  # 같은 장면 유지 — 페이드 전환 없음


def test_deepening_once_then_advances():
    eps = [
        make_episode(1, 1, checklist=CHECKLIST, max_turns=3, deepening_questions=DEEPENING),
        make_episode(2, 2),
    ]
    turns = [
        make_turn(1, 1, 1, "바로 보고드리고 확인하겠습니다"),
        make_turn(2, 1, 2, "네, 그렇게 진행하겠습니다", qtype="deepening"),
    ]
    spec = provider.next_question(session(), eps, turns)
    assert spec is not None
    assert spec.episode_id == 2 and spec.question_type == "initial"


def test_deepening_rotates_by_session_for_retry_variety():
    eps = [
        make_episode(1, 1, checklist=CHECKLIST, max_turns=3, deepening_questions=DEEPENING),
        make_episode(2, 2),
    ]
    turns = [make_turn(1, 1, 1, "바로 보고드리고 확인하겠습니다")]
    s1 = RoleplaySession(id=1, scenario_id=1, mode=5, difficulty="basic")
    s2 = RoleplaySession(id=2, scenario_id=1, mode=5, difficulty="basic")
    q1 = provider.next_question(s1, eps, turns).question_text
    q2 = provider.next_question(s2, eps, turns).question_text
    assert q1 != q2  # 재도전(새 세션)이면 다른 심화 질문


def test_missing_followup_beats_deepening():
    # 교정이 전개보다 먼저 — 누락이 있으면 심화가 아니라 후속 질문
    eps = [
        make_episode(1, 1, checklist=CHECKLIST, max_turns=3, deepening_questions=DEEPENING),
        make_episode(2, 2),
    ]
    turns = [make_turn(1, 1, 1, "전혀 무관한 대답")]
    spec = provider.next_question(session(), eps, turns)
    assert spec.question_type == "followup"


def test_deepening_respects_budget_reserve():
    # 남은 에피소드 몫(각 1턴)을 침범하면서까지 심화를 던지지 않는다
    eps = [
        make_episode(i, i, deepening_questions=DEEPENING if i == 1 else [], max_turns=3)
        for i in range(1, 7)
    ]
    turns = [make_turn(1, 1, 1, "좋은 대답")]
    spec = provider.next_question(session(), eps, turns)
    assert spec.episode_id == 2  # 심화 대신 진행 (예산 6, 남은 에피소드 5)


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
