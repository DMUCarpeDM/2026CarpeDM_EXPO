"""리액션 비트 + 수행도(rapport) 분기 엔진 테스트 — DB 없이 detached 객체로 검증."""
from app.models import Episode, RoleplaySession
from app.seed.seed_data import ENDINGS, REACTIONS
from app.services.dialogue import reactions
from app.services.dialogue.template_provider import TemplateDialogueProvider

CHECKLIST = [
    {"id": "a", "label": "결론", "keywords": ["결론부터"], "followup": "A?", "weight": 1.0},
    {"id": "b", "label": "원인", "keywords": ["원인"], "followup": "B?", "weight": 1.0},
]


def session(**kw) -> RoleplaySession:
    return RoleplaySession(id=1, scenario_id=1, mode=5, difficulty="basic", **kw)


# ---- 케이스 판정 ----

def test_classify_excellent_when_covered_and_clean():
    text = "결론부터 말씀드리면 서비스는 정상화됐고, 원인은 배포 문제였습니다."
    result = reactions.classify(text, CHECKLIST)
    assert result["case"] == "excellent"
    assert result["coverage"] == 1.0


def test_classify_short_answer():
    result = reactions.classify("네 알겠습니다", CHECKLIST)
    assert result["case"] == "short"


def test_classify_risky_overrides_coverage():
    text = "결론부터 말하면 원인은 있는데, 솔직히 제 잘못이 아니라고 생각합니다."
    result = reactions.classify(text, CHECKLIST)
    assert result["case"] == "risky"
    assert result["risk_hits"] >= 1


def test_classify_risky_for_banmal_or_chat_shorthand():
    assert reactions.classify("ㅇㅇ", CHECKLIST)["case"] == "risky"
    assert reactions.classify("그냥 알아서 해", CHECKLIST)["case"] == "risky"


def test_classify_missing_core():
    result = reactions.classify("오늘 날씨가 참 좋네요 그렇지 않습니까 여러분", CHECKLIST)
    assert result["case"] == "missing"


# ---- 수행도 누적/양자화 ----

def test_rapport_high_needs_excellent_answers():
    s = session()
    for _ in range(3):
        reactions.update_rapport(s, "excellent")
    assert reactions.rapport_level(s) == "high"


def test_rapport_covered_only_stays_mid():
    s = session()
    for _ in range(3):
        reactions.update_rapport(s, "covered")
    assert reactions.rapport_level(s) == "mid"


def test_rapport_risky_drops_to_low():
    s = session()
    reactions.update_rapport(s, "risky")
    reactions.update_rapport(s, "covered")
    assert reactions.rapport_level(s) == "low"


def test_rapport_defaults_mid_without_answers():
    assert reactions.rapport_level(session()) == "mid"


# ---- 리액션 선택 ----

def test_pick_reaction_uses_character_tone():
    s = session()
    reaction = reactions.pick_reaction(s, "kim_teamlead", "excellent")
    assert reaction in REACTIONS["kim_teamlead"]["excellent"]


def test_pick_reaction_avoids_repeats_within_session():
    s = session()
    pool = REACTIONS["park_senior"]["covered"]
    picked = [reactions.pick_reaction(s, "park_senior", "covered") for _ in range(len(pool))]
    assert sorted(picked) == sorted(pool)  # 전부 소진될 때까지 중복 없음


def test_pick_reaction_unknown_character_is_safe():
    assert reactions.pick_reaction(session(), "ghost", "covered") == ""


# ---- 도입 변주 (분기) ----

def make_episode(id: int, order: int, **kw) -> Episode:
    return Episode(
        id=id, scenario_id=1, order=order, title=f"EP{order}", modes=[5, 10],
        character_id="kim_teamlead", initial_question=f"기본 질문 {order}",
        virtual_time=kw.get("virtual_time", ""),
        intro_variants=kw.get("intro_variants", {}),
        checklist=kw.get("checklist", []), pressure_questions=[], max_turns=2,
    )


def make_turn(id: int, episode_id: int, order: int, response: str):
    from app.models import Turn
    return Turn(
        id=id, session_id=1, episode_id=episode_id, order=order,
        question_type="initial", question_text="q", character_id="kim_teamlead",
        response_text=response,
    )


def test_intro_variant_follows_rapport_level():
    provider = TemplateDialogueProvider()
    eps = [
        make_episode(1, 1),
        make_episode(2, 2, intro_variants={"high": "신뢰 버전", "low": "경고 버전"},
                     virtual_time="10:12"),
    ]
    turns = [make_turn(1, 1, 1, "아무 답")]

    s = session()
    for _ in range(2):
        reactions.update_rapport(s, "excellent")
    spec = provider.next_question(s, eps, turns)
    assert spec.question_text == "신뢰 버전"
    assert spec.virtual_time == "10:12"

    s_low = session()
    reactions.update_rapport(s_low, "risky")
    spec_low = provider.next_question(s_low, eps, turns)
    assert spec_low.question_text == "경고 버전"

    s_mid = session()
    reactions.update_rapport(s_mid, "covered")
    spec_mid = provider.next_question(s_mid, eps, turns)
    assert spec_mid.question_text == "기본 질문 2"


# ---- 하루의 결말 ----

def test_ending_matches_rapport_level():
    s = session()
    for _ in range(3):
        reactions.update_rapport(s, "excellent")
    assert reactions.select_ending(s)["level"] == "high"

    s2 = session()
    reactions.update_rapport(s2, "risky")
    assert reactions.select_ending(s2) == ENDINGS["low"]


# ---- LLM 폴백 ----

def test_personalize_reaction_skips_when_template_provider(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "dialogue_provider", "template")
    assert reactions.personalize_reaction("기본 반응.", {"name": "김태호"}, "답변") == "기본 반응."


def test_personalize_reaction_falls_back_on_connection_error(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "dialogue_provider", "ollama")
    monkeypatch.setattr(settings, "ollama_base_url", "http://127.0.0.1:1")  # 연결 불가
    monkeypatch.setattr(settings, "ollama_timeout_sec", 0.2)
    assert reactions.personalize_reaction("기본 반응.", {"name": "김태호"}, "답변") == "기본 반응."
