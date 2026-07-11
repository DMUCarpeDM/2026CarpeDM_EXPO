"""Voice-Fit DSP 검증 — 합성 신호의 물리적 정답과 측정값 대조."""
import numpy as np
import pytest
import soundfile as sf

from app.ai.voice_fit import analyze_audio, score_voice

SR = 16000


def tone(freq: float, sec: float, amp: float = 0.3) -> np.ndarray:
    t = np.arange(int(SR * sec)) / SR
    return (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def silence(sec: float) -> np.ndarray:
    return np.zeros(int(SR * sec), dtype=np.float32)


@pytest.fixture
def wav_path(tmp_path):
    def _write(signal: np.ndarray) -> str:
        path = tmp_path / "test.wav"
        sf.write(path, signal, SR)
        return str(path)
    return _write


def test_lead_in_and_pause_structure(wav_path):
    # [1.0s 침묵][2s 150Hz][0.6s 침묵][2s 150Hz] — 개시 지연 1초, 발화 중 침묵 1회
    signal = np.concatenate([silence(1.0), tone(150, 2), silence(0.6), tone(150, 2)])
    m = analyze_audio(wav_path(signal), "가" * 20)
    assert 0.7 <= m["lead_in_sec"] <= 1.3
    assert m["long_pause_count"] == 0          # 0.6s < 1.2s
    assert 0.3 <= m["mean_pause_sec"] <= 0.9
    assert 0.08 <= m["pause_ratio"] <= 0.22    # 0.6 / 4.6


def test_long_pause_detected(wav_path):
    signal = np.concatenate([tone(150, 1.5), silence(1.8), tone(150, 1.5)])
    m = analyze_audio(wav_path(signal), "가" * 15)
    assert m["long_pause_count"] == 1


def test_f0_tracking_accuracy(wav_path):
    m = analyze_audio(wav_path(tone(150, 3)), "가" * 12)
    assert m["f0_mean_hz"] is not None
    assert abs(m["f0_mean_hz"] - 150) <= 8     # ±5% 이내
    assert m["f0_cv"] < 0.05                    # 순음 = 완전 단조


def test_f0_variation_detected(wav_path):
    # 120Hz ↔ 200Hz 교차 — 억양 변화가 있는 발화 모사
    signal = np.concatenate([tone(120, 1), tone(200, 1), tone(120, 1), tone(200, 1)])
    m = analyze_audio(wav_path(signal), "가" * 16)
    assert m["f0_cv"] is not None
    assert m["f0_cv"] > 0.12


def test_f0_octave_outlier_repair():
    """옥타브 이탈 수리 계약 — 이웃 합의의 정확히 2배/절반인 '고립' 표본만
    되돌리고, 플래토와 실제 억양 점프(120→200 등)는 절대 건드리지 않는다.
    프레임 단위 연속성 보정은 래칫 오작동으로 기각했다(그 회귀 방지가 이 테스트)."""
    from app.ai.voice_fit import _fix_octave_outliers

    # 고립된 2배 튐 → 합의로 복귀
    assert _fix_octave_outliers([150, 150, 150, 300, 150, 150]) \
        == [150, 150, 150, 150.0, 150, 150]
    # 고립된 절반 꺼짐 → 합의로 복귀
    assert _fix_octave_outliers([200, 200, 100, 200, 200, 200]) \
        == [200, 200, 200.0, 200, 200, 200]
    # 실제 억양 점프(120→200, 2배 아님)는 무변형 — 과교정 금지
    jump = [120.0, 120.0, 120.0, 200.0, 200.0, 200.0]
    assert _fix_octave_outliers(list(jump)) == jump
    # 무성(None) 보존 + 짧은 트랙(<5 표본)은 손대지 않음
    with_none = [150.0, None, 150.0, 300.0, 150.0, 150.0]
    assert _fix_octave_outliers(with_none)[3] == 150.0
    assert _fix_octave_outliers(with_none)[1] is None
    assert _fix_octave_outliers([150.0, 300.0]) == [150.0, 300.0]


def test_energy_drift_measured(wav_path):
    # 후반 성량 절반 → 큰 폭의 음수 드리프트
    signal = np.concatenate([tone(150, 2, amp=0.4), tone(150, 2, amp=0.15)])
    m = analyze_audio(wav_path(signal), "가" * 16)
    assert m["energy_drift_pct"] < -30


def test_monotone_penalized_in_score(wav_path):
    # 같은 말속도·무음 조건에서 억양 변화가 있으면 점수가 높아야 함
    mono = analyze_audio(wav_path(tone(150, 4)), "가" * 18)
    varied_sig = np.concatenate([tone(120, 1), tone(180, 1), tone(140, 1), tone(200, 1)])
    varied = analyze_audio(wav_path(varied_sig), "가" * 18)
    assert score_voice(varied) > score_voice(mono)


def test_jitter_low_for_steady_tone(wav_path):
    # 순음은 주기 변동이 거의 없어야 한다 (긴장 떨림 오탐 방지)
    m = analyze_audio(wav_path(tone(150, 3)), "가" * 12)
    assert m["f0_jitter_pct"] is not None
    assert m["f0_jitter_pct"] < 3


def test_jitter_detects_pitch_tremor(wav_path):
    # 150Hz에 6Hz 비브라토(±12Hz) — 목소리 떨림 모사 → 순음보다 지터가 커야 한다
    t = np.arange(int(SR * 3)) / SR
    freq = 150 + 12 * np.sin(2 * np.pi * 6 * t)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    tremor = (0.3 * np.sin(phase)).astype(np.float32)
    m_tremor = analyze_audio(wav_path(tremor), "가" * 12)
    m_steady = analyze_audio(wav_path(tone(150, 3)), "가" * 12)
    assert m_tremor["f0_jitter_pct"] is not None
    assert m_tremor["f0_jitter_pct"] > m_steady["f0_jitter_pct"]


def test_shimmer_detects_amplitude_tremor(wav_path):
    # 8Hz 진폭 변조(±40%) — 성량 떨림 모사 → 순음보다 shimmer가 커야 한다
    t = np.arange(int(SR * 3)) / SR
    am = (0.3 * (1 + 0.4 * np.sin(2 * np.pi * 8 * t)) * np.sin(2 * np.pi * 150 * t)).astype(np.float32)
    m_am = analyze_audio(wav_path(am), "가" * 12)
    m_steady = analyze_audio(wav_path(tone(150, 3)), "가" * 12)
    assert m_am["shimmer_pct"] is not None
    assert m_am["shimmer_pct"] > m_steady["shimmer_pct"]


def test_final_f0_slope_direction(wav_path):
    # 마지막 구간의 피치가 내려가면 음수(단정), 올라가면 양수(불확실)
    t = np.arange(int(SR * 2)) / SR
    def sweep(f_start, f_end):
        freq = np.linspace(f_start, f_end, len(t))
        phase = 2 * np.pi * np.cumsum(freq) / SR
        return (0.3 * np.sin(phase)).astype(np.float32)
    falling = analyze_audio(wav_path(sweep(220, 130)), "가" * 10)
    rising = analyze_audio(wav_path(sweep(130, 220)), "가" * 10)
    assert falling["final_f0_slope"] is not None and falling["final_f0_slope"] < -10
    assert rising["final_f0_slope"] is not None and rising["final_f0_slope"] > 10


def test_periodicity_high_for_pure_tone(wav_path):
    # 순음은 주기성이 매우 높고, 백색소음 섞인 신호는 낮아야 한다
    rng = np.random.default_rng(42)
    t = np.arange(int(SR * 3)) / SR
    breathy = (0.15 * np.sin(2 * np.pi * 150 * t) + 0.15 * rng.standard_normal(len(t))).astype(np.float32)
    m_pure = analyze_audio(wav_path(tone(150, 3)), "가" * 12)
    m_breathy = analyze_audio(wav_path(breathy), "가" * 12)
    assert m_pure["periodicity"] is not None and m_pure["periodicity"] > 0.8
    assert m_breathy["periodicity"] is not None
    assert m_pure["periodicity"] > m_breathy["periodicity"]


# ---- 신규 관찰 지표: 억양 폭·모노톤 구간·말끝 소실 ----

def test_pitch_range_semitones(wav_path):
    # 120↔200Hz 교차 = 약 8.8반음, 순음은 ~0반음
    varied_sig = np.concatenate([tone(120, 1), tone(200, 1), tone(120, 1), tone(200, 1)])
    varied = analyze_audio(wav_path(varied_sig), "가" * 16)
    mono = analyze_audio(wav_path(tone(150, 3)), "가" * 12)
    assert varied["pitch_range_st"] is not None and varied["pitch_range_st"] >= 6
    assert mono["pitch_range_st"] is not None and mono["pitch_range_st"] <= 1.5


def test_monotone_run_measures_flat_stretch(wav_path):
    # 4초 순음 → 최장 모노톤 구간이 발화 길이에 근접해야 한다
    mono = analyze_audio(wav_path(tone(150, 4)), "가" * 18)
    assert mono["monotone_run_sec"] is not None and mono["monotone_run_sec"] >= 3.0
    # 1초마다 톤이 크게 바뀌면 런이 그 주기 수준으로 짧아야 한다
    varied_sig = np.concatenate([tone(120, 1), tone(180, 1), tone(140, 1), tone(200, 1)])
    varied = analyze_audio(wav_path(varied_sig), "가" * 18)
    assert (varied["monotone_run_sec"] or 0) <= 1.6


def test_final_fade_detects_dying_ending(wav_path):
    # 마지막 0.7초 성량이 크게 줄어든 발화 — "~하겠습니…" 말끝 소실 모사
    fading = np.concatenate([tone(150, 3, amp=0.4), tone(150, 0.7, amp=0.12)])
    m = analyze_audio(wav_path(fading), "가" * 16)
    assert m["final_fade_pct"] is not None and m["final_fade_pct"] <= -45
    # 끝까지 일정한 성량이면 소실로 판정하지 않는다
    steady = analyze_audio(wav_path(tone(150, 3)), "가" * 12)
    assert steady["final_fade_pct"] is not None and steady["final_fade_pct"] >= -15


# ---- 소음 강건 VAD: 전시장 배경 소음에서도 발화 구조가 살아있어야 한다 ----

def noisy(sec: float, amp: float = 0.06, seed: int = 7) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return (amp * rng.standard_normal(int(SR * sec))).astype(np.float32)


def test_vad_lead_in_survives_background_noise(wav_path):
    # [소음만 1.5s][발화+소음 2s] — 에너지 임계만 쓰면 소음 구간이 발화로 오인돼
    # 개시 지연이 0으로 붕괴한다. 평탄도 게이트가 이를 막아야 한다.
    signal = np.concatenate([noisy(1.5), tone(150, 2) + noisy(2, seed=8)])
    m = analyze_audio(wav_path(signal), "가" * 10)
    assert m, "소음 환경에서 분석이 죽으면 안 된다"
    assert 1.1 <= m["lead_in_sec"] <= 1.9


def test_vad_pause_structure_under_noise(wav_path):
    # 발화 사이 0.7초 침묵이 배경 소음으로 채워져도 침묵으로 인지돼야 한다
    signal = np.concatenate([
        tone(150, 1.5) + noisy(1.5, seed=9), noisy(0.7, seed=10),
        tone(150, 1.5) + noisy(1.5, seed=11),
    ])
    m = analyze_audio(wav_path(signal), "가" * 12)
    assert m["mean_pause_sec"] >= 0.4
    assert m["pause_ratio"] >= 0.10


def test_vad_noise_only_recording_rejected(wav_path):
    # 마이크가 소음만 담았다면 발화로 오인하지 말고 미측정 처리해야 한다
    m = analyze_audio(wav_path(noisy(4.0, amp=0.1)), "가" * 10)
    assert m == {}
