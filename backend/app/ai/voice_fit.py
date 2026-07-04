"""Voice-Fit: 발화 안정성 분석 (S-QRGESM).

librosa가 Python 3.14를 아직 지원하지 않아 numpy+soundfile로 직접 구현한다.

측정 지표:
- 말속도(음절/초)        — STT 음절 수 / 유성 구간 길이 (조음 속도)
- 침묵 구조              — 응답 개시 지연(lead-in), 발화 중 무음 비율,
                           긴 침묵(>1.2s) 횟수, 평균 침묵 길이
- 성량 안정성            — 유성 프레임 RMS 변동계수, 전/후반 성량 변화율
- 억양 다이내믹스(F0)    — 프레임 자기상관 기반 기본주파수 추적 →
                           평균 F0와 변동계수 (단조로움/불안정 판별)
"""
import numpy as np

from app.ai.scoring import band_score, clamp, weighted_mean
from app.ai.text_match import count_hangul_syllables

FRAME = 2048
HOP = 512

# -- 밴드 근거 --
# 말속도(음절/초): 한국어 뉴스 낭독 약 5.5~6.5, 일상 대화체 약 4~5.
# 보고·면접 상황은 또박또박 전달이 우선이므로 3.5~5.5를 적정 구간으로 둔다.
SPEECH_RATE_BANDS = (3.5, 5.5, 1.5, 8.0)
# 발화 중 무음 비율: 짧은 응답 발화에서는 5~35%가 안정적으로 들린다.
PAUSE_RATIO_BANDS = (0.05, 0.35, 0.0, 0.70)
# 에너지 변동계수: 0.2~0.6은 자연스러운 강세 변화 범위.
ENERGY_CV_BANDS = (0.20, 0.60, 0.0, 1.20)
# 응답 개시 지연: 2.5초까지는 생각을 정리하는 자연스러운 간격, 8초 이상은 침묵 압박.
LEAD_IN_BANDS = (0.0, 2.5, 0.0, 8.0)
# F0 변동계수: 자연 발화 0.08~0.35. 0.05 미만은 단조로운 톤,
# 0.5 초과는 피치가 불안정하게 흔들리는 상태로 본다.
F0_CV_BANDS = (0.08, 0.35, 0.0, 0.60)

# 한국어 성인 발화 F0 탐색 범위 (Hz)
F0_MIN, F0_MAX = 75, 400
PAUSE_MIN_SEC = 0.25   # 이보다 짧은 무음은 조음 간격으로 보고 무시
LONG_PAUSE_SEC = 1.2   # 침묵으로 인지되는 길이


def _frame_rms(samples: np.ndarray) -> np.ndarray:
    n = max(1, (len(samples) - FRAME) // HOP + 1)
    return np.array([
        float(np.sqrt(np.mean(samples[i * HOP: i * HOP + FRAME] ** 2)))
        for i in range(n)
    ])


def _segments(mask: np.ndarray) -> list[tuple[int, int, bool]]:
    """프레임 마스크 → (시작, 끝(미포함), 유성 여부) 연속 구간 목록."""
    segs = []
    start = 0
    for i in range(1, len(mask) + 1):
        if i == len(mask) or mask[i] != mask[start]:
            segs.append((start, i, bool(mask[start])))
            start = i
    return segs


def _estimate_f0(frame: np.ndarray, sr: int) -> float | None:
    """자기상관 기반 프레임 F0 추정 (75~400Hz). 주기성이 약하면 None."""
    frame = frame - frame.mean()
    energy = float(np.dot(frame, frame))
    if energy < 1e-6:
        return None
    corr = np.correlate(frame, frame, mode="full")[len(frame) - 1:]
    lag_min = int(sr / F0_MAX)
    lag_max = min(int(sr / F0_MIN), len(corr) - 1)
    if lag_max <= lag_min:
        return None
    window = corr[lag_min:lag_max]
    peak = int(np.argmax(window)) + lag_min
    # 주기성 신뢰도: 정규화 자기상관 피크가 낮으면 무성음으로 판단
    if corr[peak] / corr[0] < 0.35:
        return None
    return sr / peak


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
    sec_per_frame = HOP / sr
    threshold = max(0.008, float(np.median(rms)) * 0.25)
    voiced = rms > threshold
    if not voiced.any():
        return {}

    segs = _segments(voiced)

    # 응답 개시 지연: 첫 유성 구간 전 무음 길이 (녹음 시작 = 질문 직후)
    first_voiced_idx = int(np.argmax(voiced))
    lead_in_sec = first_voiced_idx * sec_per_frame

    # 발화 스팬(첫 유성~마지막 유성) 내부의 침묵 구조
    last_voiced_idx = len(voiced) - int(np.argmax(voiced[::-1]))
    span = voiced[first_voiced_idx:last_voiced_idx]
    pauses = [
        (e - s) * sec_per_frame
        for s, e, v in _segments(span)
        if not v and (e - s) * sec_per_frame >= PAUSE_MIN_SEC
    ]
    span_sec = max(len(span) * sec_per_frame, 1e-6)
    pause_ratio = float(sum(pauses) / span_sec)
    long_pause_count = sum(1 for p in pauses if p >= LONG_PAUSE_SEC)
    mean_pause_sec = float(np.mean(pauses)) if pauses else 0.0

    voiced_duration = float(voiced.sum()) * sec_per_frame
    syllables = count_hangul_syllables(response_text)
    speech_rate = syllables / voiced_duration if voiced_duration > 0.3 and syllables else 0.0

    voiced_rms = rms[voiced]
    energy_cv = float(voiced_rms.std() / voiced_rms.mean()) if len(voiced_rms) > 2 else 0.0

    # 전/후반 성량 변화: 후반 유성 RMS 평균 / 전반 대비 (음수 = 목소리가 작아짐)
    half = (first_voiced_idx + last_voiced_idx) // 2
    front = rms[first_voiced_idx:half][voiced[first_voiced_idx:half]]
    back = rms[half:last_voiced_idx][voiced[half:last_voiced_idx]]
    energy_drift_pct = (
        round((float(back.mean()) / float(front.mean()) - 1.0) * 100)
        if len(front) > 2 and len(back) > 2 else 0
    )

    # F0 추적 (유성 프레임을 4개 간격으로 서브샘플 — 성능/정확도 균형)
    f0_values = []
    for i in np.flatnonzero(voiced)[::4]:
        frame = samples[i * HOP: i * HOP + FRAME]
        if len(frame) == FRAME:
            f0 = _estimate_f0(frame, sr)
            if f0 is not None:
                f0_values.append(f0)
    f0_mean = float(np.median(f0_values)) if len(f0_values) >= 5 else None
    f0_cv = (
        float(np.std(f0_values) / np.mean(f0_values))
        if f0_mean is not None else None
    )

    return {
        "duration_sec": round(duration, 2),
        "lead_in_sec": round(lead_in_sec, 2),
        "pause_ratio": round(pause_ratio, 3),
        "long_pause_count": long_pause_count,
        "mean_pause_sec": round(mean_pause_sec, 2),
        "speech_rate_sps": round(speech_rate, 2),
        "energy_cv": round(energy_cv, 3),
        "energy_drift_pct": energy_drift_pct,
        "f0_mean_hz": round(f0_mean) if f0_mean is not None else None,
        "f0_cv": round(f0_cv, 3) if f0_cv is not None else None,
        "syllables": syllables,
    }


def estimate_from_text(response_text: str, duration_ms: int) -> dict:
    """오디오가 없을 때(음성 인식 턴) 발화 시간 기반 근사치."""
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
        parts.append((band_score(metrics["speech_rate_sps"], *SPEECH_RATE_BANDS), 0.30))
    if "pause_ratio" in metrics:
        parts.append((band_score(metrics["pause_ratio"], *PAUSE_RATIO_BANDS), 0.20))
    if "energy_cv" in metrics:
        parts.append((band_score(metrics["energy_cv"], *ENERGY_CV_BANDS), 0.15))
    if "lead_in_sec" in metrics:
        parts.append((band_score(metrics["lead_in_sec"], *LEAD_IN_BANDS), 0.15))
    if metrics.get("f0_cv") is not None:
        parts.append((band_score(metrics["f0_cv"], *F0_CV_BANDS), 0.20))
    if not parts:
        return None
    return clamp(weighted_mean(parts))
