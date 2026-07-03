"""Voice-Fit: 말속도·무음 비율·에너지 안정성 분석 (S-QRGESM).

librosa가 Python 3.14를 아직 지원하지 않아 numpy+soundfile로 동일 지표를 직접 계산한다.
(RMS 프레임 에너지, 무음 구간 비율, 음절/초 말속도, 에너지 변동계수)
"""
import numpy as np

from app.ai.scoring import band_score, clamp, weighted_mean
from app.ai.text_match import count_hangul_syllables

FRAME = 2048
HOP = 512

# 한국어 자연 대화 말속도(음절/초) 기준 구간
SPEECH_RATE_BANDS = (3.2, 5.8, 1.2, 8.5)
PAUSE_RATIO_BANDS = (0.05, 0.35, 0.0, 0.75)
ENERGY_CV_BANDS = (0.15, 0.65, 0.0, 1.4)


def _frame_rms(samples: np.ndarray) -> np.ndarray:
    n = max(1, (len(samples) - FRAME) // HOP + 1)
    return np.array([
        float(np.sqrt(np.mean(samples[i * HOP: i * HOP + FRAME] ** 2)))
        for i in range(n)
    ])


def analyze_audio(path: str, response_text: str) -> dict:
    """wav 파일 → Voice-Fit 원시 지표. 실패 시 빈 dict."""
    import soundfile as sf

    try:
        samples, sr = sf.read(path, dtype="float32", always_2d=False)
    except Exception:
        return {}
    if samples.ndim > 1:
        samples = samples.mean(axis=1)
    if len(samples) < FRAME:
        return {}

    rms = _frame_rms(samples)
    duration = len(samples) / sr
    threshold = max(0.008, float(np.median(rms)) * 0.25)
    voiced = rms > threshold
    pause_ratio = float(1.0 - voiced.mean())
    voiced_duration = duration * float(voiced.mean())

    syllables = count_hangul_syllables(response_text)
    speech_rate = syllables / voiced_duration if voiced_duration > 0.3 and syllables else 0.0

    voiced_rms = rms[voiced]
    energy_cv = float(voiced_rms.std() / voiced_rms.mean()) if len(voiced_rms) > 2 else 0.0

    return {
        "duration_sec": round(duration, 2),
        "pause_ratio": round(pause_ratio, 3),
        "speech_rate_sps": round(speech_rate, 2),
        "energy_cv": round(energy_cv, 3),
        "syllables": syllables,
    }


def estimate_from_text(response_text: str, duration_ms: int) -> dict:
    """오디오가 없을 때(텍스트 입력/업로드 실패) 발화 시간 기반 근사치."""
    syllables = count_hangul_syllables(response_text)
    duration = duration_ms / 1000
    if duration < 0.5 or not syllables:
        return {}
    return {
        "duration_sec": round(duration, 2),
        "speech_rate_sps": round(syllables / duration, 2),
        "syllables": syllables,
        "estimated": True,
    }


def score_voice(metrics: dict) -> float | None:
    if not metrics:
        return None
    parts: list[tuple[float, float]] = []
    if metrics.get("speech_rate_sps"):
        parts.append((band_score(metrics["speech_rate_sps"], *SPEECH_RATE_BANDS), 0.4))
    if "pause_ratio" in metrics:
        parts.append((band_score(metrics["pause_ratio"], *PAUSE_RATIO_BANDS), 0.3))
    if "energy_cv" in metrics:
        parts.append((band_score(metrics["energy_cv"], *ENERGY_CV_BANDS), 0.3))
    if not parts:
        return None
    return clamp(weighted_mean(parts))
