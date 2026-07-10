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
# 떨림 전용 짧은 창 — 표준 프레임(128ms)은 생리적 떨림 대역(4~12Hz)을 평균으로
# 지워버린다(골든 시나리오 test_scenario_confident_vs_shaky_apology가 잡은 결함).
TREMOR_FRAME = 1024  # 64ms — 떨림 주기를 뭉개지 않으면서 75Hz F0도 추정 가능
TREMOR_HOP = 256     # 16ms — 진폭 떨림 궤적 해상도

# -- 밴드 근거 --
# 말속도(음절/초): 한국어 뉴스 낭독 약 5.5~6.5, 일상 대화체 약 4~5.
# 보고·면접 상황은 또박또박 전달이 우선이므로 3.5~5.5를 적정 구간으로 둔다.
SPEECH_RATE_BANDS = (3.5, 5.5, 1.5, 8.0)
# 발화 중 무음 비율: 문장 내부의 긴 쉼(≥0.25s)이 발화 스팬에서 차지하는 비율.
# 0~35%는 정상 — 쉼이 적/없는 유창한 단답을 침묵 70% 발화와 같은 0점으로 만들던
# 절벽(ideal_low=0.05)을 제거하고, '과도한 침묵'만 감점한다. 쇄도·단조는 말속도·F0가 잡는다.
PAUSE_RATIO_BANDS = (0.0, 0.35, 0.0, 0.70)
# 에너지 변동계수: 0.2~0.6은 자연스러운 강세 변화 범위.
ENERGY_CV_BANDS = (0.20, 0.60, 0.0, 1.20)
# 응답 개시 지연: 2.5초까지는 생각을 정리하는 자연스러운 간격, 8초 이상은 침묵 압박.
LEAD_IN_BANDS = (0.0, 2.5, 0.0, 8.0)
# F0 변동계수: 자연 발화 0.08~0.35. 0.05 미만은 단조로운 톤,
# 0.5 초과는 피치가 불안정하게 흔들리는 상태로 본다.
F0_CV_BANDS = (0.08, 0.35, 0.0, 0.60)
# 생리적 떨림 페널티: 억양(느린 F0 변화)은 보상하되, 떨림(빠른 미세 변동)은
# 감점해야 한다 — 골든 시나리오가 잡아낸 결함: 떨리는 발화의 변동이 '자연스러운
# 억양·강세' 대역에 들어가 오히려 보상받았다. 오판 억제를 위해 jitter(주파수)와
# shimmer(진폭)가 '동시에' 뚜렷할 때만, 상한을 두고 감점한다.
TREMOR_JITTER_FLOOR = 6.0   # % — 이하는 정상 변동 (합성 보정: 안정 발화 모형 ~0-2%)
TREMOR_SHIMMER_FLOOR = 8.0  # %
TREMOR_PENALTY_CAP = 18.0
# 긴 침묵 페널티: long_pause_count(1.2s+)가 집계만 되고 채점에 반영되지 않던
# 결함(골든 시나리오 발견) — 청자가 인지하는 끊김이므로 회당 감점, 상한 존재.
LONG_PAUSE_PENALTY = 5.0
LONG_PAUSE_PENALTY_CAP = 15.0

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


def _spectral_flatness(samples: np.ndarray) -> np.ndarray:
    """프레임별 스펙트럼 평탄도 — 0에 가까우면 음조(음성), 1에 가까우면 광대역 소음.

    전시장 웅성거림 대응의 핵심: 에너지 임계만으로는 배경 소음이 발화로
    오인된다. 음성은 스펙트럼이 뾰족하고(조화 구조) 소음은 평탄하다.
    """
    n = max(1, (len(samples) - FRAME) // HOP + 1)
    win = np.hanning(FRAME)
    flat = np.empty(n)
    for i in range(n):
        seg = samples[i * HOP: i * HOP + FRAME]
        if len(seg) < FRAME:
            flat[i] = 1.0
            continue
        power = np.abs(np.fft.rfft(seg * win)) ** 2 + 1e-12
        flat[i] = float(np.exp(np.mean(np.log(power))) / np.mean(power))
    return flat


# 소음 강건 VAD: 에너지 임계(발화량 대비)는 v1 그대로 두고, 소음 판별은
# 스펙트럼 평탄도가 전담한다. 에너지 기반 소음 바닥 추정은 "작게 말한 구간"과
# "배경 소음"을 원리적으로 구분할 수 없어 폐기했다 (드리프트 회귀로 검증됨).
FLATNESS_MAX = 0.5  # 이보다 평탄하면 소음으로 판정 (순음/음성 ~0.0x, 백색소음 ~1)


def _voiced_mask(samples: np.ndarray, rms: np.ndarray) -> np.ndarray:
    """에너지 임계 + 스펙트럼 평탄도 게이트 — 소음 강건 발화 검출."""
    threshold = max(0.008, float(np.median(rms)) * 0.25)
    return (rms > threshold) & (_spectral_flatness(samples) < FLATNESS_MAX)


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


def _fix_octave_outliers(track: list) -> list:
    """트랙 단위 옥타브 이탈 수리 — 이웃 합의 기반, 스무더가 아니라 글리치 수리.

    자기상관 추정은 프레임 단위로 F0가 배/반으로 튈 수 있다(옥타브 오류) —
    jitter(인접 상대 변화)를 ±100%씩 오염시키는 최악의 잡음. 프레임 단위 연속성
    보정은 완전 주기 신호의 서브하모닉 상관이 항상 높아 래칫처럼 오작동하므로
    (자체 하네스로 확인), 트랙 전체에서 **이웃 중앙값의 정확히 2배/절반(±10%)인
    표본만** 합의 옥타브로 되돌린다. 플래토(연속 구간)와 실제 억양 점프는 이웃
    합의가 그쪽으로 서 있으므로 절대 건드리지 않는다. None(무성)은 보존.
    """
    voiced = [(i, v) for i, v in enumerate(track) if v is not None]
    if len(voiced) < 5:
        return track
    fixed = list(track)
    values = [v for _, v in voiced]
    for k, (i, v) in enumerate(voiced):
        neighbors = values[max(0, k - 3):k] + values[k + 1:k + 4]
        if len(neighbors) < 3:
            continue
        med = float(np.median(neighbors))
        if med <= 0:
            continue
        if abs(v / 2 - med) / med < 0.10:      # 합의의 2배로 튐 → 절반으로
            fixed[i] = v / 2
        elif abs(v * 2 - med) / med < 0.10:    # 합의의 절반으로 꺼짐 → 2배로
            fixed[i] = v * 2
    return fixed


def _tremor_metrics(samples: np.ndarray, sr: int) -> tuple[float | None, float | None]:
    """짧은 창 기반 jitter(%)/shimmer(%) — 4~12Hz 생리적 떨림에 민감한 전용 경로.

    침묵 경계의 점프가 떨림으로 오인되지 않도록, 활성 구간 내부의 인접 변화만 본다.
    주의: 절대 임계값(TREMOR_*_FLOOR)은 합성 신호로 보정된 값 — 실제 육성으로
    현장 재보정이 필요하다 (demo-checklist 참조).
    """
    # 진폭 궤적 (16ms 홉, 64ms 창) → shimmer
    n = (len(samples) - TREMOR_FRAME) // TREMOR_HOP
    if n < 12:
        return None, None
    env = np.empty(n, dtype=np.float64)
    for i in range(n):
        seg = samples[i * TREMOR_HOP: i * TREMOR_HOP + TREMOR_FRAME]
        env[i] = np.sqrt(np.mean(seg * seg))
    thr = max(0.008, float(np.median(env)) * 0.25)
    active_idx = np.flatnonzero(env > thr)

    shimmer = None
    if len(active_idx) >= 12:
        adjacent = active_idx[1:][np.diff(active_idx) == 1]
        rel = np.abs(env[adjacent] - env[adjacent - 1]) / np.maximum(env[adjacent - 1], 1e-9)
        if len(rel) >= 10:
            shimmer = float(np.median(rel) * 100)

    # F0 궤적 (32ms 홉, 64ms 창) → jitter. 옥타브 튐은 인접 상대 변화를 ±100%씩
    # 오염시키므로 트랙 완성 후 이웃 합의로 수리한다 — jitter의 최대 수혜 지점.
    f0_track: list[float | None] = []
    for i in range(0, len(samples) - TREMOR_FRAME, TREMOR_HOP * 2):
        seg = samples[i: i + TREMOR_FRAME]
        if float(np.sqrt(np.mean(seg * seg))) <= thr:
            f0_track.append(None)
        else:
            f0_track.append(_estimate_f0(seg, sr))
    f0_track = _fix_octave_outliers(f0_track)
    rels = [
        abs(b - a) / a
        for a, b in zip(f0_track, f0_track[1:])
        if a is not None and b is not None
    ]
    jitter = float(np.median(rels) * 100) if len(rels) >= 8 else None
    return jitter, shimmer


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
    voiced = _voiced_mask(samples, rms)
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

    # F0 추적 (유성 프레임을 4개 간격으로 서브샘플 — 성능/정확도 균형).
    # 트랙 완성 후 고립 옥타브 이탈을 이웃 합의로 수리한다.
    f0_values = []
    for i in np.flatnonzero(voiced)[::4]:
        frame = samples[i * HOP: i * HOP + FRAME]
        if len(frame) == FRAME:
            f0 = _estimate_f0(frame, sr)
            if f0 is not None:
                f0_values.append(f0)
    f0_values = [v for v in _fix_octave_outliers(f0_values) if v is not None]
    f0_mean = float(np.median(f0_values)) if len(f0_values) >= 5 else None
    f0_cv = (
        float(np.std(f0_values) / np.mean(f0_values))
        if f0_mean is not None else None
    )
    # 피치·성량 떨림(jitter/shimmer): 짧은 창 전용 경로 — 표준 프레임은
    # 생리적 떨림(4~12Hz)을 평균으로 지우므로 별도 측정한다.
    f0_jitter_pct, shimmer_pct = _tremor_metrics(samples, sr)

    # 주기성 강도(HNR 근사): 유성 프레임 정규화 자기상관 피크의 평균.
    # 낮으면 숨이 많이 섞인 소리(속삭임·긴장으로 조여진 발성) — 관찰 지표.
    periodicity = None
    peaks: list[float] = []
    for i in np.flatnonzero(voiced)[::8]:
        frame = samples[i * HOP: i * HOP + FRAME]
        if len(frame) < FRAME:
            continue
        f = frame - frame.mean()
        e = float(np.dot(f, f))
        if e < 1e-6:
            continue
        corr = np.correlate(f, f, mode="full")[len(f) - 1:]
        lag_min = int(sr / F0_MAX)
        lag_max = min(int(sr / F0_MIN), len(corr) - 1)
        if lag_max > lag_min:
            peaks.append(float(corr[lag_min:lag_max].max() / corr[0]))
    if len(peaks) >= 4:
        periodicity = float(np.mean(peaks))

    # 문말 억양: 마지막 유성 구간의 F0 선형 기울기(Hz/s).
    # 뚜렷한 하강(-)은 단정적 종결, 상승(+)은 의문/불확실하게 들리는 말끝 — 관찰 지표.
    final_f0_slope = None
    voiced_segs = [(s, e) for s, e, v in segs if v]
    if voiced_segs:
        fs, fe = voiced_segs[-1]
        tail_f0: list[tuple[float, float]] = []  # (시각, f0)
        for i in range(fs, fe):
            frame = samples[i * HOP: i * HOP + FRAME]
            if len(frame) < FRAME:
                continue
            f0 = _estimate_f0(frame, sr)
            if f0 is not None:
                tail_f0.append((i * sec_per_frame, f0))
        # 문말 기울기 회귀에 옥타브 이탈이 섞이면 기울기가 폭주한다 — 수리 후 사용
        fixed = _fix_octave_outliers([f for _, f in tail_f0])
        tail_f0 = [(t, f) for (t, _), f in zip(tail_f0, fixed) if f is not None]
        if len(tail_f0) >= 5:
            ts = np.array([t for t, _ in tail_f0])
            fs_arr = np.array([f for _, f in tail_f0])
            final_f0_slope = float(np.polyfit(ts - ts[0], fs_arr, 1)[0])

    # 말속도 추세: 전/후반 유성 프레임 밀도 변화(%) — 후반에 급해지는지.
    rate_drift_pct = 0
    span_len = last_voiced_idx - first_voiced_idx
    if span_len >= 20:
        mid = first_voiced_idx + span_len // 2
        d_front = float(voiced[first_voiced_idx:mid].mean())
        d_back = float(voiced[mid:last_voiced_idx].mean())
        if d_front > 0.05:
            rate_drift_pct = round((d_back / d_front - 1.0) * 100)

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
        "f0_jitter_pct": round(f0_jitter_pct, 1) if f0_jitter_pct is not None else None,
        "shimmer_pct": round(shimmer_pct, 1) if shimmer_pct is not None else None,
        "periodicity": round(periodicity, 3) if periodicity is not None else None,
        "final_f0_slope": round(final_f0_slope, 1) if final_f0_slope is not None else None,
        "rate_drift_pct": rate_drift_pct,
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
    score = weighted_mean(parts)

    # 생리적 떨림 페널티 — jitter와 shimmer가 동시에 뚜렷할 때만 (단독 상승은 무시)
    jitter = metrics.get("f0_jitter_pct")
    shimmer = metrics.get("shimmer_pct")
    if jitter is not None and shimmer is not None \
            and jitter > TREMOR_JITTER_FLOOR and shimmer > TREMOR_SHIMMER_FLOOR:
        score -= min(
            TREMOR_PENALTY_CAP,
            3.0 * (jitter - TREMOR_JITTER_FLOOR) + 1.5 * (shimmer - TREMOR_SHIMMER_FLOOR),
        )

    # 긴 침묵 페널티 — 위치 인지(전문가 관용 규칙): 문장 사이(종결어미 뒤)의
    # 1.2~2.5초 쉼은 의도적 완급으로 관용하고, 문장 중간의 끊김과 2.5초+
    # 데드에어만 감점한다. 정렬(단어 타임스탬프)이 없으면 기존 위치 무차별
    # 페널티로 폴백 — 하위 호환.
    pause_quality = (metrics.get("alignment") or {}).get("pause_quality")
    if pause_quality is not None:
        score -= min(LONG_PAUSE_PENALTY_CAP,
                     LONG_PAUSE_PENALTY * pause_quality.get("hesitation_count", 0))
    else:
        score -= min(LONG_PAUSE_PENALTY_CAP,
                     LONG_PAUSE_PENALTY * metrics.get("long_pause_count", 0))
    return clamp(score)
