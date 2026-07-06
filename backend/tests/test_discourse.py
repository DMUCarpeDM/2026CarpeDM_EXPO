"""담화 구조 분석 검증 — 실제 보고 화법 예문 대조."""
from app.ai.discourse import analyze_discourse

GOOD_REPORT = (
    "결론부터 말씀드리면 서비스는 정상화됐습니다. "
    "원인은 오전 인증 서버 배포 문제였기 때문에 선임님이 롤백으로 복구하셨습니다. "
    "재발 방지를 위해 제가 오늘 퇴근 전까지 모니터링 체크리스트를 정리하겠습니다."
)

VAGUE_ANSWER = (
    "음 그게 아마 뭔가 배포 쪽 문제인 것 같기도 하고요. "
    "약간 이따가 한번 보긴 할 텐데 좀 애매한 것 같습니다."
)


def test_conclusion_first_detected():
    assert analyze_discourse(GOOD_REPORT)["conclusion_first"] is True
    assert analyze_discourse(VAGUE_ANSWER)["conclusion_first"] is False


def test_reason_markers_counted():
    assert analyze_discourse(GOOD_REPORT)["reason_marker_count"] >= 1
    assert analyze_discourse("그냥 그렇게 됐습니다.")["reason_marker_count"] == 0


def test_time_commitment_requires_deadline():
    # 구체적 기한 → 인정
    assert analyze_discourse("10분 안에 확인해서 회신드리겠습니다.")["time_commitment_count"] == 1
    assert analyze_discourse("오늘 퇴근 전까지 정리하겠습니다.")["time_commitment_count"] >= 1
    # 막연한 약속 → 불인정
    assert analyze_discourse("나중에 확인해보겠습니다.")["time_commitment_count"] == 0


def test_ownership_pattern():
    assert analyze_discourse("제가 바로 확인해서 보고드리겠습니다.")["ownership_count"] >= 1
    assert analyze_discourse("확인이 필요할 것 같습니다.")["ownership_count"] == 0


def test_hedge_density_contrast():
    good = analyze_discourse(GOOD_REPORT)["hedge_per_100syl"]
    vague = analyze_discourse(VAGUE_ANSWER)["hedge_per_100syl"]
    assert vague > good * 2  # 모호 답변의 헤지 밀도가 확연히 높아야 함


def test_question_alignment_detects_off_topic():
    question = "지금 고객사 로그인 장애 상황이 어떻게 되는 건가요? 고객사에 뭐라고 안내하죠?"
    on_topic = "로그인 장애는 현재 원인 파악 중이고, 고객사에는 10분 안에 안내드리겠습니다."
    off_topic = "저는 오늘 점심에 김치찌개를 먹었습니다. 회사 근처 식당이 맛있네요."
    a1 = analyze_discourse(on_topic, question)["question_alignment"]
    a2 = analyze_discourse(off_topic, question)["question_alignment"]
    assert a1 is not None and a2 is not None
    assert a1 > a2
    assert a2 <= 0.2


def test_alignment_none_when_question_too_short():
    assert analyze_discourse("네 알겠습니다.", "네?")["question_alignment"] is None


def test_run_on_sentence_detected():
    long_sentence = (
        "제가 아침에 출근해서 로그를 확인하다가 이상한 걸 발견했는데 그게 배포 때문인 것 "
        "같아서 선임님께 여쭤보려고 했는데 회의 중이셔서 기다리다가 결국 말씀을 못 드려서 "
        "지금까지 오게 됐습니다."
    )
    m = analyze_discourse(long_sentence)
    assert m["max_clauses_per_sentence"] >= 4  # 만연체 — 절이 과다하게 이어짐
    assert m["avg_sentence_syllables"] > 60


def test_empty_text_safe():
    assert analyze_discourse("") == {}
