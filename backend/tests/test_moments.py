"""결정적 순간 감지 검증 — 합성 타임라인·스팬으로 교차 감지 계약을 고정."""
from app.services.moments import build_moments, build_turn_moments, detect_turn_events


def bins(*values: tuple[float, float, float]) -> list[dict]:
    """(front, press, tilt) 시퀀스 → 2초 빈 타임라인."""
    return [
        {"t": i * 2.0, "front": v[0], "press": v[1], "tilt": v[2]}
        for i, v in enumerate(values)
    ]


STEADY = (0.9, 0.05, 2.0)
GAZE_OFF = (0.2, 0.05, 2.0)
TENSE = (0.9, 0.5, 2.0)
GAZE_TENSE = (0.2, 0.5, 2.0)


def test_no_moments_for_steady_turn():
    assert build_turn_moments(1, "initial", bins(STEADY, STEADY, STEADY, STEADY), None) == []


def test_single_bin_blip_ignored():
    # 1빈(2초)짜리 순간 이탈은 잡지 않는다 — 지속(2빈+)만 순간으로 인정
    timeline = bins(STEADY, GAZE_OFF, STEADY, STEADY)
    assert detect_turn_events(timeline, None) == []


def test_sustained_gaze_break_detected():
    timeline = bins(STEADY, GAZE_OFF, GAZE_OFF, STEADY)
    events = detect_turn_events(timeline, None)
    assert [e["kind"] for e in events] == ["gaze"]
    assert events[0]["at"] == 2.0


def test_composite_moment_merges_modalities():
    # 시선 이탈과 긴장 표정이 같은 구간 → 복합 순간 1개
    timeline = bins(STEADY, GAZE_TENSE, GAZE_TENSE, STEADY)
    moments = build_turn_moments(3, "pressure", timeline, None)
    assert len(moments) == 1
    m = moments[0]
    assert m["composite"] is True
    assert set(m["kinds"]) == {"gaze", "tension"}
    assert "동시에" in m["description"]
    assert "압박 질문을 받은 직후" in m["description"]  # pressure + 이른 시각


def test_moment_quotes_speech_span():
    """핵심 계약: 순간 시각의 음성 스팬에서 '그때 하던 말'을 인용한다."""
    timeline = bins(STEADY, STEADY, GAZE_TENSE, GAZE_TENSE)
    alignment = {
        "spans": [
            {"text": "결론부터 말씀드리면 정상화됐습니다", "start": 0.2, "end": 3.5,
             "rms_rel_pct": 10},
            {"text": "재발 방지는 제가 오늘 안에 정리하겠습니다", "start": 4.1, "end": 7.8,
             "rms_rel_pct": -25},
        ],
    }
    moments = build_turn_moments(2, "initial", timeline, alignment)
    assert moments[0]["quote"] is not None
    assert "재발 방지" in moments[0]["quote"]  # at=4.0초 → 두 번째 스팬


def test_voice_span_highlights_become_moments():
    alignment = {
        "spans": [
            {"text": "괜찮습니다", "start": 0.5, "end": 2.0, "rms_rel_pct": 20},
            {"text": "정말 죄송합니다", "start": 3.0, "end": 5.0, "rms_rel_pct": -40},
        ],
        "quietest": 1,
    }
    moments = build_turn_moments(1, "initial", bins(STEADY, STEADY, STEADY), alignment)
    assert any("quiet" in m["kinds"] for m in moments)


def test_session_ranking_composite_and_pressure_first():
    turns = [
        {  # 단일 모달, 평상 턴
            "turn_order": 1, "question_type": "initial",
            "timeline": bins(STEADY, GAZE_OFF, GAZE_OFF), "alignment": None,
        },
        {  # 복합 + 압박 턴 → 1순위가 되어야 한다
            "turn_order": 4, "question_type": "pressure",
            "timeline": bins(GAZE_TENSE, GAZE_TENSE, STEADY), "alignment": None,
        },
    ]
    moments = build_moments(turns)
    assert moments[0]["turn_order"] == 4
    assert moments[0]["composite"] is True


def test_session_moments_capped_at_three():
    noisy_turn = {
        "turn_order": 1, "question_type": "initial",
        "timeline": bins(
            GAZE_OFF, GAZE_OFF, STEADY, TENSE, TENSE, STEADY,
            (0.9, 0.05, 9.0), (0.9, 0.05, 9.5), STEADY,
            GAZE_OFF, GAZE_OFF, STEADY, TENSE, TENSE,
        ),
        "alignment": None,
    }
    assert len(build_moments([noisy_turn, dict(noisy_turn, turn_order=2)])) == 3


def test_moments_determinism():
    turns = [{
        "turn_order": 1, "question_type": "pressure",
        "timeline": bins(GAZE_TENSE, GAZE_TENSE, STEADY, TENSE, TENSE),
        "alignment": None,
    }]
    assert build_moments(turns) == build_moments(turns)
