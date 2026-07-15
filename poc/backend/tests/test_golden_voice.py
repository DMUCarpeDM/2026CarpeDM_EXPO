"""합성 음성 골든 시나리오 — 개별 지표 검증(test_voice_dsp)을 넘어
'상황의 소리'를 통째로 합성해 종합 판정을 고정한다 (마스터리 플랜 ⓪).

각 시나리오는 물리적 정답이 있는 신호이므로, DSP 변경이 판정의 방향을
바꾸면 즉시 잡힌다.
"""
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


def shaky(freq: float, sec: float, amp: float = 0.3) -> np.ndarray:
    """떨리는 목소리 모사 — 피치 비브라토(6Hz ±10%) + 진폭 흔들림(8Hz ±35%)."""
    t = np.arange(int(SR * sec)) / SR
    f = freq * (1 + 0.1 * np.sin(2 * np.pi * 6 * t))
    phase = 2 * np.pi * np.cumsum(f) / SR
    envelope = amp * (1 + 0.35 * np.sin(2 * np.pi * 8 * t))
    return (envelope * np.sin(phase)).astype(np.float32)


@pytest.fixture
def wav_path(tmp_path):
    counter = {"n": 0}

    def _write(signal: np.ndarray) -> str:
        counter["n"] += 1
        path = tmp_path / f"scenario{counter['n']}.wav"
        sf.write(path, signal, SR)
        return str(path)
    return _write


def test_scenario_confident_vs_shaky_apology(wav_path):
    """안정된 보고 vs 떨리는 사과 — 종합 점수와 긴장 지표가 함께 갈라져야 한다.

    '안정된 보고'는 순음이 아니라 현실적 발화 모형: 문장 간 짧은 쉼과
    문장별 억양 변화가 있되, 미세 떨림(jitter/shimmer)은 없다.
    """
    confident = np.concatenate([
        silence(0.5), tone(140, 1.2), silence(0.3),
        tone(175, 1.2), silence(0.3), tone(150, 1.4),
    ])
    trembling = np.concatenate([silence(3.0), shaky(150, 2), silence(1.5), shaky(150, 1.5)])
    m_conf = analyze_audio(wav_path(confident), "가" * 18)
    m_shaky = analyze_audio(wav_path(trembling), "가" * 14)

    assert m_shaky["f0_jitter_pct"] > m_conf["f0_jitter_pct"]
    assert m_shaky["shimmer_pct"] > m_conf["shimmer_pct"]
    assert m_shaky["lead_in_sec"] > m_conf["lead_in_sec"] + 1.5
    assert m_shaky["long_pause_count"] >= 1
    assert score_voice(m_conf) > score_voice(m_shaky) + 5


def test_scenario_fading_out(wav_path):
    """뒤로 갈수록 목소리가 잦아드는 발화 — 후반 성량·밀도 추세가 함께 음수."""
    fading = np.concatenate([
        tone(150, 1.5, amp=0.4), silence(0.3),
        tone(150, 1.2, amp=0.25), silence(0.6),
        tone(150, 1.0, amp=0.12), silence(0.8), tone(150, 0.6, amp=0.10),
    ])
    m = analyze_audio(wav_path(fading), "가" * 16)
    assert m["energy_drift_pct"] < -25
    assert m["rate_drift_pct"] < 0


def test_scenario_uncertain_ending_vs_assertive(wav_path):
    """말끝을 올리는 답변 vs 단정적으로 닫는 답변 — 문말 억양 부호가 갈린다."""
    t = np.arange(int(SR * 1.2)) / SR

    def sweep(f0, f1):
        f = np.linspace(f0, f1, len(t))
        return (0.3 * np.sin(2 * np.pi * np.cumsum(f) / SR)).astype(np.float32)

    uncertain = np.concatenate([tone(150, 2.0), silence(0.3), sweep(140, 210)])
    assertive = np.concatenate([tone(150, 2.0), silence(0.3), sweep(190, 120)])
    m_unc = analyze_audio(wav_path(uncertain), "가" * 12)
    m_ass = analyze_audio(wav_path(assertive), "가" * 12)
    assert m_unc["final_f0_slope"] > 10
    assert m_ass["final_f0_slope"] < -10


def test_scenario_monotone_lecture(wav_path):
    """긴 단조로운 발화 — 억양 변동만 낮고 나머지는 정상이어야 한다 (오탐 방지)."""
    m = analyze_audio(wav_path(tone(150, 6)), "가" * 28)
    assert m["f0_cv"] < 0.05
    assert m["f0_jitter_pct"] < 3  # 단조로움이 떨림으로 오탐되면 안 된다
    assert m["long_pause_count"] == 0


def test_voice_determinism(wav_path):
    """같은 신호 → 같은 판정 (DSP 경로 비결정성 금지)."""
    signal = np.concatenate([silence(0.8), shaky(160, 3)])
    path = wav_path(signal)
    assert analyze_audio(path, "가" * 15) == analyze_audio(path, "가" * 15)
