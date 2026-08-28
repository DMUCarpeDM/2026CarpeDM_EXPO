from app.ai.live_coaching import analyze_live_coaching, count_stutters, fallback_reaction


def test_measured_unstable_posture_creates_posture_coaching_only_after_calibration():
    observation = analyze_live_coaching({
        "calibrated": True,
        "frames": 30,
        "avg_shoulder_tilt_deg": 14.0,
        "posture_sway": 0.14,
        "head_down_ratio": 0.1,
        "tilt_drift_deg": 2.0,
    }, "일정을 확인해서 다시 말씀드리겠습니다.")

    assert observation["issues"] == [{
        "kind": "posture", "reasons": ["어깨 기울기 14.0도", "상체 흔들림 0.14"],
    }]
    assert "자세" in fallback_reaction(observation)


def test_voice_coaching_uses_fillers_and_repeated_syllables_without_changing_score():
    text = "어 어 어 지금 저 저 저 확인해 볼게요. 음 그러니까요"
    observation = analyze_live_coaching({}, text, 5000)

    assert count_stutters(text) >= 1
    assert observation["values"]["filler_count"] >= 3
    assert {issue["kind"] for issue in observation["issues"]} == {"voice"}
    assert "말이" in fallback_reaction(observation)


def test_uncalibrated_camera_never_labels_posture_as_bad():
    observation = analyze_live_coaching({
        "calibrated": False, "frames": 100, "avg_shoulder_tilt_deg": 35,
        "posture_sway": 0.5, "head_down_ratio": 0.9, "tilt_drift_deg": 20,
    }, "정상적인 답변입니다.")

    assert observation["issues"] == []


def test_hand_and_torso_measurements_distinguish_hunched_and_leaning_back():
    hunched = analyze_live_coaching({
        "calibrated": True, "frames": 30, "hunched_ratio": 0.6,
        "lean_back_ratio": 0.1, "hand_face_sec": 0,
    }, "상황을 확인해서 말씀드리겠습니다.")
    leaned_back = analyze_live_coaching({
        "calibrated": True, "frames": 30, "hunched_ratio": 0.1,
        "lean_back_ratio": 0.6, "hand_face_sec": 4,
    }, "상황을 확인해서 말씀드리겠습니다.")

    assert "앞으로 숙인 자세 60%" in hunched["issues"][0]["reasons"]
    assert "등받이에 기댄 자세 60%" in leaned_back["issues"][0]["reasons"]
    assert "손은 얼굴에서 내리고" in fallback_reaction(leaned_back)
