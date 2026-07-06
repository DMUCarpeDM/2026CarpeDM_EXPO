"""심층 교차 분석 검증 — 순수 빌더 함수를 합성 데이터로 대조."""
from app.services.deep_analysis import build_adaptation, build_composure, build_delivery


# ---- delivery (담화 구조) ----

def _discourse(**kw) -> dict:
    base = {
        "conclusion_first": True, "time_commitment_count": 1, "ownership_count": 1,
        "hedge_per_100syl": 1.0, "question_alignment": 0.6,
        "max_clauses_per_sentence": 2, "sentence_count": 3,
    }
    base.update(kw)
    return base


def test_delivery_praises_structured_speaker():
    d = build_delivery([_discourse(), _discourse()])
    assert d is not None
    assert "완급" in d["comment"]  # 개선 지점이 없으면 다음 단계 제시


def test_delivery_flags_off_topic_first():
    # 정합성 문제가 결론 선행 문제보다 우선 지적돼야 한다 (동문서답이 더 치명적)
    d = build_delivery([_discourse(question_alignment=0.05, conclusion_first=False)])
    assert "질문" in d["comment"]


def test_delivery_moderate_alignment_not_flagged():
    # 자기소개 등 명사 재사용이 낮은 턴이 섞인 보통 수준(0.2)은 지적하지 않는다
    d = build_delivery([_discourse(question_alignment=0.2, conclusion_first=False)])
    assert "질문" not in d["comment"]


def test_delivery_flags_missing_deadline():
    d = build_delivery([_discourse(time_commitment_count=0)])
    assert "기한" in d["comment"] or "시점" in d["comment"]


def test_delivery_none_without_data():
    assert build_delivery([]) is None
    assert build_delivery([{}]) is None


# ---- composure (압박 내성) ----

def _pair(front=0.9, blink=15.0, press=0.05, jitter=3.0, pause=0.15):
    return (
        {"front_gaze_ratio": front, "blink_per_min": blink, "mouth_press_ratio": press},
        {"f0_jitter_pct": jitter, "pause_ratio": pause},
    )


def test_composure_calm_profile():
    normal = [_pair(), _pair()]
    pressure = [_pair()]  # 압박에서도 동일 → 침착형
    c = build_composure(pressure, normal)
    assert c["level"] == "침착형"


def test_composure_shaken_profile():
    normal = [_pair(), _pair()]
    pressure = [_pair(front=0.55, blink=30.0, press=0.35, jitter=12.0)]  # 다중 악화
    c = build_composure(pressure, normal)
    assert c["level"] == "동요형"
    assert any("정면 응시" in r["label"] for r in c["rows"])


def test_composure_needs_both_groups():
    assert build_composure([], [_pair()]) is None
    assert build_composure([_pair()], []) is None


# ---- adaptation (적응 곡선) ----

def test_adaptation_up_trend():
    a = build_adaptation([(1, 50.0), (2, 60.0), (3, 75.0), (4, 80.0)])
    assert a["trend"] == "up"
    assert a["points"][0]["turn_order"] == 1


def test_adaptation_down_trend():
    a = build_adaptation([(1, 85.0), (2, 75.0), (3, 60.0), (4, 55.0)])
    assert a["trend"] == "down"


def test_adaptation_flat_and_minimum_turns():
    assert build_adaptation([(1, 70.0), (2, 72.0), (3, 69.0)])["trend"] == "flat"
    assert build_adaptation([(1, 70.0), (2, 90.0)]) is None  # 3턴 미만 판정 보류
