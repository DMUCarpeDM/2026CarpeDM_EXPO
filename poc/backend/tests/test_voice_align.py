"""텍스트-음성 정렬 분석 검증 — 합성 신호 + 주입 타임스탬프.

Vosk 실행 없이 정렬 '로직'을 검증한다: 단어 타임스탬프는 물리적 정답과 함께
주입하고, 음원은 구간별로 진폭·피치·간격을 다르게 합성한다.
"""
import numpy as np
import pytest
import soundfile as sf

from app.ai.voice_align import analyze_alignment

SR = 16000


def tone(freq: float, sec: float, amp: float = 0.3) -> np.ndarray:
    t = np.arange(int(SR * sec)) / SR
    return (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def silence(sec: float) -> np.ndarray:
    return np.zeros(int(SR * sec), dtype=np.float32)


def words_for(text: str, start: float, end: float) -> list[dict]:
    """구간 텍스트를 단어로 쪼개 균등 타임스탬프 부여."""
    tokens = text.split()
    step = (end - start) / len(tokens)
    return [
        {"word": w, "start": round(start + i * step, 2),
         "end": round(start + (i + 1) * step - 0.02, 2), "conf": 1.0}
        for i, w in enumerate(tokens)
    ]


@pytest.fixture
def wav_path(tmp_path):
    def _write(signal: np.ndarray) -> str:
        path = tmp_path / "align.wav"
        sf.write(path, signal, SR)
        return str(path)
    return _write


def three_span_signal() -> np.ndarray:
    """[보통 2s][침묵 0.8s][작게 2s][침묵 0.8s][보통 2s] — 가운데가 조용한 발화."""
    return np.concatenate([
        tone(150, 2.0, amp=0.30), silence(0.8),
        tone(150, 2.0, amp=0.12), silence(0.8),
        tone(160, 2.0, amp=0.30),
    ])


def three_span_words() -> list[dict]:
    return (
        words_for("결론부터 말씀드리면 서비스는 정상화됐습니다", 0.1, 1.9)
        + words_for("불편을 드려서 정말 죄송합니다", 2.9, 4.7)
        + words_for("재발 방지책은 오늘 안에 공유드리겠습니다", 5.7, 7.5)
    )


def test_spans_split_on_pause_gaps(wav_path):
    result = analyze_alignment(wav_path(three_span_signal()), three_span_words())
    assert result is not None
    assert len(result["spans"]) == 3
    assert "죄송합니다" in result["spans"][1]["text"]


def test_quietest_span_identified_with_relative_drop(wav_path):
    """핵심 계약: '사과 문장에서 성량이 N% 떨어졌다'를 정확한 문장 인용으로."""
    result = analyze_alignment(wav_path(three_span_signal()), three_span_words())
    assert result["quietest"] == 1
    q = result["spans"][1]
    assert q["rms_rel_pct"] <= -30  # 진폭 0.12/0.30 → 약 -45% 기대
    assert result["spans"][0]["rms_rel_pct"] > q["rms_rel_pct"]


def test_fastest_span_by_syllable_density(wav_path):
    # 같은 음원, 마지막 구간에 음절을 2배로 몰아넣음 → 속도 하이라이트
    words = (
        words_for("결론부터 말씀드리면 서비스는 정상화됐습니다", 0.1, 1.9)
        + words_for("불편을 드려서 정말 죄송합니다", 2.9, 4.7)
        + words_for("재발방지책은오늘안에 전부정리해서 공유드리고내일아침에 다시보고드리겠습니다", 5.7, 7.5)
    )
    result = analyze_alignment(wav_path(three_span_signal()), words)
    assert result.get("fastest") == 2


def test_filler_detection_conservative(wav_path):
    words = (
        [{"word": "음", "start": 0.2, "end": 0.5, "conf": 1.0},
         {"word": "어", "start": 0.7, "end": 0.95, "conf": 1.0}]
        + words_for("결론부터 말씀드리면 정상화됐습니다", 1.0, 1.9)
        + [{"word": "음", "start": 3.2, "end": 4.4, "conf": 1.0}]  # 0.6s 초과 → 실발화 간주
        + words_for("죄송합니다 바로 확인하겠습니다", 4.5, 7.4)
    )
    result = analyze_alignment(wav_path(three_span_signal()), words)
    assert result["fillers"]["count"] == 2  # 짧은 '음','어'만


def test_emphasis_contrast_detected(wav_path):
    """구간 간 성량 대비가 뚜렷하면 '강조 설계 있음'."""
    result = analyze_alignment(wav_path(three_span_signal()), three_span_words())
    assert result["emphasis"]["designed"] is True
    assert result["emphasis"]["rms_spread_pct"] >= 25


def test_flat_delivery_no_emphasis(wav_path):
    flat = np.concatenate([
        tone(150, 2.0, amp=0.3), silence(0.8),
        tone(150, 2.0, amp=0.3), silence(0.8),
        tone(150, 2.0, amp=0.3),
    ])
    result = analyze_alignment(wav_path(flat), three_span_words())
    assert result["emphasis"]["designed"] is False
    assert "quietest" not in result


def test_alignment_none_without_words(wav_path):
    assert analyze_alignment(wav_path(three_span_signal()), []) is None
    assert analyze_alignment(wav_path(three_span_signal()), [{"word": "네", "start": 0, "end": 0.3}]) is None


def test_alignment_determinism(wav_path):
    path = wav_path(three_span_signal())
    assert analyze_alignment(path, three_span_words()) == analyze_alignment(path, three_span_words())
