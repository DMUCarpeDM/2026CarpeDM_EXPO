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
