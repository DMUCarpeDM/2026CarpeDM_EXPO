from types import SimpleNamespace as NS
import pytest
from app.services import interaction


def setup(mode="training"):
    session = NS(rapport={})
    episode = NS(id=1, checklist=[
        {"id": "a", "label": "일정", "keywords": ["내일"]},
        {"id": "b", "label": "담당", "keywords": ["제가"]}])
    scenario = NS(world_setting={"interaction": {"interview_questions": [f"질문 {i}" for i in range(6)]}})
    interaction.initialize(session, scenario, [episode], mode)
    return session


def answer(session, text, kind="main"):
    turn = NS(response_text=text, question_type=kind)
    return interaction.advance(session, turn, [turn])


def test_interview_counts_main_questions_only():
    session = setup("interview")
    assert answer(session, "답변", "followup")["index"] == 0
    for _ in range(5):
        assert not answer(session, "답변")["finished"]
    result = answer(session, "답변")
    assert result["finished"] and result["reason"] == "questions_completed"


def test_training_goals_accumulate():
    session = setup()
    assert answer(session, "내일 하겠습니다")["index"] == 1
    assert answer(session, "제가 하겠습니다")["reason"] == "goals_met"


def test_retry_twice_then_keep_unmet():
    session = setup()
    for _ in range(2):
        assert answer(session, "모르겠습니다")["index"] == 0
    assert answer(session, "모르겠습니다")["index"] == 1
    for _ in range(3):
        result = answer(session, "모르겠습니다")
    assert result["reason"] == "goals_exhausted"
    assert result["unmet"] == ["1:a", "1:b"]


def test_manual_finish_keeps_missing_goals():
    session = setup()
    answer(session, "내일")
    interaction.finish_manually(session)
    assert interaction.public_state(session)["unmet"] == ["1:b"]
    assert interaction.public_state(session)["reason"] == "manual"


def test_requires_prepared_interview_questions():
    with pytest.raises(ValueError):
        interaction.initialize(NS(rapport={}), NS(world_setting={}), [NS(id=1)], "interview")
