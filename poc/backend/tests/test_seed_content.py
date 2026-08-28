"""시드가 GPT-4o 역할극에 필요한 장면·분석 정보를 갖추는지 검증한다."""
from app.seed.seed_data import BANNED_PHRASES, EPISODES, RECOMMENDED_PHRASES_BY_CONTEXT


def test_every_checklist_item_has_enough_keywords_and_followup():
    for episode in EPISODES:
        for item in episode["checklist"]:
            assert len(item["keywords"]) >= 5, f"{episode['title']}/{item['id']}: 키워드 5개 미만"
            assert item["followup"].strip(), f"{episode['title']}/{item['id']}: 분석 기준 설명 없음"
            assert item["label"].strip()


def test_banned_phrases_meet_spec():
    assert len(BANNED_PHRASES) >= 20
    for phrase in BANNED_PHRASES:
        assert phrase["severity"] in ("high", "medium")
        assert len(phrase["reason"]) >= 10


def test_recommended_phrases_grouped_by_context():
    assert set(RECOMMENDED_PHRASES_BY_CONTEXT) >= {"보고", "사과", "거절/조율", "감사/관계"}
    assert all(len(group) >= 3 for group in RECOMMENDED_PHRASES_BY_CONTEXT.values())


def test_every_episode_has_roleplay_context_and_an_initial_line():
    for episode in EPISODES:
        assert episode["initial_question"].strip(), f"{episode['title']}: 첫 대사 없음"
        assert len(episode["situation"]) >= 30, f"{episode['title']}: 역할극 배경 부족"
        assert len(episode["question_intent"]) >= 30, f"{episode['title']}: 연습 목표 부족"


def test_keywords_match_common_conjugations():
    from app.ai.text_match import matched_checklist_ids

    episode = next(item for item in EPISODES if item["order"] == 1)
    covered = matched_checklist_ids(
        "안녕하세요, 신입 김지연입니다. 플랫폼팀 업무를 맡았고 오늘 목표는 온보딩 파악입니다. 잘 부탁드립니다.",
        episode["checklist"],
    )

    assert "intro_attitude" in covered
