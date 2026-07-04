from app.ai.nonverbal import score_eye, score_posture
from app.ai.response_fit import analyze_response, score_response
from app.ai.scoring import band_score, clamp, weighted_mean
from app.ai.voice_fit import estimate_from_text, score_voice

CHECKLIST = [
    {"id": "esc", "label": "에스컬레이션", "keywords": ["보고", "선임"], "weight": 1.5, "followup": "?"},
    {"id": "time", "label": "시간 약속", "keywords": ["까지", "분 안에"], "weight": 1.0, "followup": "?"},
]


def test_band_score_inside_ideal():
    assert band_score(4.0, 3.2, 5.8, 1.2, 8.5) == 100.0


def test_band_score_linear_falloff():
    assert 0 < band_score(2.0, 3.2, 5.8, 1.2, 8.5) < 100
    assert band_score(1.2, 3.2, 5.8, 1.2, 8.5) == 0.0
    assert band_score(9.0, 3.2, 5.8, 1.2, 8.5) == 0.0


def test_weighted_mean():
    assert weighted_mean([(100, 1), (50, 1)]) == 75.0
    assert weighted_mean([]) == 0.0


def test_clamp():
    assert clamp(120) == 100
    assert clamp(-5) == 0


def test_response_fit_good_answer_scores_high():
    text = "죄송합니다. 바로 선임님께 보고드리고 10분 안에 확인해서 회신드리겠습니다."
    metrics = analyze_response(text, CHECKLIST)
    assert metrics["coverage"] == 1.0
    assert not metrics["banned_hits"]
    assert score_response(metrics) >= 70


def test_response_fit_banned_phrase_penalized():
    good = analyze_response("선임님께 보고드리겠습니다. 10분 안에 확인하겠습니다.", CHECKLIST)
    bad = analyze_response("몰라요. 선임님께 보고는 할게요. 10분 안에요.", CHECKLIST)
    assert score_response(bad) < score_response(good)
    assert any(h["phrase"] == "몰라요" for h in bad["banned_hits"])


def test_politeness_formal_speech_scores_full_ratio():
    m = analyze_response("네, 알겠습니다. 바로 선임님께 보고드리겠습니다.", CHECKLIST)
    assert m["politeness"]["formal_ratio"] == 1.0
    assert m["politeness"]["banmal_count"] == 0


def test_politeness_banmal_detected_and_quoted():
    m = analyze_response("몰라. 그냥 내가 알아서 했다.", CHECKLIST)
    assert m["politeness"]["banmal_count"] >= 1
    assert m["politeness"]["banmal_quotes"], "반말 문장 인용이 있어야 함"
    polite = analyze_response("모르겠습니다. 제가 알아서 처리했습니다.", CHECKLIST)
    assert score_response(m) < score_response(polite)


def test_voice_fit_estimate_and_score():
    # 10초 동안 40음절 → 4.0 sps (이상 구간)
    m = estimate_from_text("가" * 40, duration_ms=10000)
    assert m["speech_rate_sps"] == 4.0
    assert score_voice(m) == 100.0


def test_voice_fit_no_data_returns_none():
    assert score_voice({}) is None


def test_eye_fit_scores():
    good = score_eye({"front_gaze_ratio": 0.8, "gaze_off_count": 1, "frames": 40}, 30)
    poor = score_eye({"front_gaze_ratio": 0.3, "gaze_off_count": 10, "frames": 40}, 30)
    assert good is not None and poor is not None
    assert good > poor
    assert score_eye({"front_gaze_ratio": 0.9, "frames": 2}, 30) is None  # 프레임 부족


def test_posture_fit_scores():
    good = score_posture({
        "avg_shoulder_tilt_deg": 2, "head_down_ratio": 0.05, "posture_sway": 0.02, "frames": 40,
    })
    poor = score_posture({
        "avg_shoulder_tilt_deg": 15, "head_down_ratio": 0.5, "posture_sway": 0.15, "frames": 40,
    })
    assert good is not None and poor is not None
    assert good > poor
