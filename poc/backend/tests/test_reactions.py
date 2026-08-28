"""역할극과 분리된 분석·수행도 누적 계약을 검증한다."""
from app.models import RoleplaySession
from app.seed.seed_data import ENDINGS
from app.services.dialogue import reactions

CHECKLIST = [
    {"id": "a", "label": "결론", "keywords": ["결론부터"], "followup": "A?", "weight": 1.0},
    {"id": "b", "label": "원인", "keywords": ["원인"], "followup": "B?", "weight": 1.0},
]


def session(**kwargs) -> RoleplaySession:
    return RoleplaySession(id=1, scenario_id=1, mode=5, difficulty="basic", **kwargs)


def test_classify_excellent_when_covered_and_clean():
    result = reactions.classify("결론부터 말씀드리면 서비스는 정상화됐고, 원인은 배포 문제였습니다.", CHECKLIST)

    assert result["case"] == "excellent"
    assert result["coverage"] == 1.0


def test_classify_risky_for_chat_shorthand():
    assert reactions.classify("ㅇㅇ", CHECKLIST)["case"] == "risky"


def test_rapport_high_needs_excellent_answers():
    current = session()
    for _ in range(3):
        reactions.update_rapport(current, "excellent")

    assert reactions.rapport_level(current) == "high"


def test_ending_matches_rapport_level():
    current = session()
    for _ in range(3):
        reactions.update_rapport(current, "excellent")

    assert reactions.select_ending(current)["level"] == "high"
    assert reactions.select_ending(session(rapport={"points": -2, "answered": 1})) == ENDINGS["low"]
