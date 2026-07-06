"""텍스트-음성 정렬 분석 — "어느 문장에서, 무엇을 말할 때 무너졌는가".

Vosk 단어 타임스탬프로 발화를 호흡 단위 구간(스팬)으로 나누고, 각 구간의
DSP 프로파일(성량·피치·속도)을 턴 전체 대비 상대값으로 계산한다. 리포트는
이 결과로 문장을 '인용'하며 코칭한다 — 턴 평균만 보던 분석과의 결정적 차이.

전부 로컬(Vosk + numpy). 단어 타임스탬프가 없으면(웹 STT만 사용 등) 이 분석은
조용히 생략되고 기존 턴 단위 분석만 남는다 — 폴백 우선 원칙.
"""
import numpy as np

from app.ai.text_match import count_hangul_syllables
from app.ai.voice_fit import FRAME, HOP, _estimate_f0

# 스팬 분할: 단어 사이 무성 간격이 이 이상이면 새 호흡 단위
SPAN_GAP_SEC = 0.55
MIN_SPAN_WORDS = 1
MIN_SPAN_SEC = 0.4  # 너무 짧은 조각은 프로파일 신뢰 불가 → 이웃에 흡수

# 간투어: 독립 단어로 나타난 채움말만 (보수적 — '그'는 실단어와 겹쳐 제외)
FILLER_WORDS = {"음", "어", "아", "에", "으음", "어어", "그러니까요"}
FILLER_MAX_SEC = 0.6  # 이보다 길면 실제 발화로 간주

# 강조 대비: 구간 간 성량/피치 차이가 이 이상이면 "강조 설계가 있다"
EMPHASIS_RMS_SPREAD = 0.25  # 최대/최소 구간 RMS 차 25%+
EMPHASIS_F0_SPREAD_HZ = 25.0


def _spans_from_words(words: list[dict]) -> list[dict]:
    """단어 스트림 → 호흡 단위 스팬. 침묵 간격 기준 분할 후 파편 병합."""
    spans: list[dict] = []
    cur: list[dict] = []
    for w in words:
        if cur and w["start"] - cur[-1]["end"] >= SPAN_GAP_SEC:
            spans.append(cur)
            cur = []
        cur.append(w)
    if cur:
        spans.append(cur)

    result = []
    for group in spans:
        text = " ".join(w["word"] for w in group)
        start, end = group[0]["start"], group[-1]["end"]
        result.append({"text": text, "start": start, "end": end, "words": group})
    # 너무 짧은 파편은 앞 스팬에 흡수
    merged: list[dict] = []
    for span in result:
        if merged and (span["end"] - span["start"] < MIN_SPAN_SEC
                       or len(span["words"]) < MIN_SPAN_WORDS):
            prev = merged[-1]
            prev["text"] += " " + span["text"]
            prev["end"] = span["end"]
            prev["words"] += span["words"]
        else:
            merged.append(span)
    return merged


def _region_profile(samples: np.ndarray, sr: int, start: float, end: float) -> dict:
    """[start,end] 구간의 음향 프로파일 — 유성 프레임만."""
    lo = max(0, int(start * sr))
    hi = min(len(samples), int(end * sr))
    region = samples[lo:hi]
    if len(region) < FRAME:
        return {"rms": None, "f0": None}
    n = (len(region) - FRAME) // HOP + 1
    rms_vals, f0_vals = [], []
    for i in range(n):
        seg = region[i * HOP: i * HOP + FRAME]
        r = float(np.sqrt(np.mean(seg * seg)))
        if r > 0.008:
            rms_vals.append(r)
            f0 = _estimate_f0(seg, sr)
            if f0 is not None:
                f0_vals.append(f0)
    return {
        "rms": float(np.mean(rms_vals)) if rms_vals else None,
        "f0": float(np.median(f0_vals)) if len(f0_vals) >= 3 else None,
    }


def analyze_alignment(audio_path: str, words: list[dict]) -> dict | None:
    """단어 타임스탬프 + 음원 → 구간 프로파일·간투어·강조 대비.

    returns {
      spans: [{text, start, end, rms_rel_pct, f0_hz, rate_sps, syllables}],
      quietest / loudest / fastest: 스팬 인덱스 (조건 충족 시),
      fillers: {count, per_min, examples},
      emphasis: {rms_spread_pct, f0_spread_hz, designed: bool},
    }
    """
    if not words or len(words) < 2:
        return None
    import soundfile as sf

    try:
        samples, sr = sf.read(audio_path, dtype="float32", always_2d=False)
    except Exception:
        return None
    if samples.ndim > 1:
        samples = samples.mean(axis=1)

    # 간투어 — 스팬 분할 전에 골라내고, 스팬 텍스트에는 남긴다(인용 정확성)
    fillers = [
        w for w in words
        if w["word"] in FILLER_WORDS and (w["end"] - w["start"]) <= FILLER_MAX_SEC
    ]
    total_min = max((words[-1]["end"] - words[0]["start"]) / 60, 1e-6)

    raw_spans = _spans_from_words(words)
    profiles = []
    for span in raw_spans:
        p = _region_profile(samples, sr, span["start"], span["end"])
        duration = span["end"] - span["start"]
        syllables = count_hangul_syllables(span["text"])
        profiles.append({
            "text": span["text"][:60],
            "start": round(span["start"], 2),
            "end": round(span["end"], 2),
            "syllables": syllables,
            "rate_sps": round(syllables / duration, 2) if duration > 0.3 and syllables else None,
            "rms": p["rms"],
            "f0_hz": round(p["f0"]) if p["f0"] is not None else None,
        })

    measured = [p for p in profiles if p["rms"] is not None]
    if not measured:
        return None
    turn_rms = float(np.mean([p["rms"] for p in measured]))
    for p in profiles:
        p["rms_rel_pct"] = (
            round((p["rms"] / turn_rms - 1) * 100) if p["rms"] is not None else None
        )
        del p["rms"]  # 절대값은 마이크 이득 의존 — 상대값만 노출

    result: dict = {
        "spans": profiles,
        "fillers": {
            "count": len(fillers),
            "per_min": round(len(fillers) / total_min, 1),
            "examples": [w["word"] for w in fillers[:5]],
        },
    }

    # 하이라이트 — 2스팬 이상일 때만 (한 덩어리 발화에 대비 개념은 무의미)
    if len(measured) >= 2:
        rels = [(i, p["rms_rel_pct"]) for i, p in enumerate(profiles)
                if p["rms_rel_pct"] is not None]
        quiet_i, quiet_v = min(rels, key=lambda x: x[1])
        loud_i, loud_v = max(rels, key=lambda x: x[1])
        if quiet_v <= -20:
            result["quietest"] = quiet_i
        rates = [(i, p["rate_sps"]) for i, p in enumerate(profiles) if p["rate_sps"]]
        if rates:
            fast_i, fast_v = max(rates, key=lambda x: x[1])
            if fast_v >= 6.0:
                result["fastest"] = fast_i

        f0s = [p["f0_hz"] for p in profiles if p["f0_hz"] is not None]
        rms_spread = (loud_v - quiet_v) / 100
        f0_spread = (max(f0s) - min(f0s)) if len(f0s) >= 2 else 0.0
        result["emphasis"] = {
            "rms_spread_pct": round(rms_spread * 100),
            "f0_spread_hz": round(f0_spread),
            # 강조 설계: 구간 간 성량 또는 피치 대비가 뚜렷하면 "핵심을 세워 말한다"
            "designed": rms_spread >= EMPHASIS_RMS_SPREAD or f0_spread >= EMPHASIS_F0_SPREAD_HZ,
        }

    return result
