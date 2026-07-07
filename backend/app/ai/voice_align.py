"""텍스트-음성 정렬 분석 — "어느 문장에서, 무엇을 말할 때 무너졌는가".

Vosk 단어 타임스탬프로 발화를 호흡 단위 구간(스팬)으로 나누고, 각 구간의
DSP 프로파일(성량·피치·속도)을 턴 전체 대비 상대값으로 계산한다. 리포트는
이 결과로 문장을 '인용'하며 코칭한다 — 턴 평균만 보던 분석과의 결정적 차이.

전부 로컬(Vosk + numpy). 단어 타임스탬프가 없으면(웹 STT만 사용 등) 이 분석은
조용히 생략되고 기존 턴 단위 분석만 남는다 — 폴백 우선 원칙.
"""
import numpy as np

from app.ai.text_match import count_hangul_syllables
from app.ai.voice_fit import FRAME, HOP, LONG_PAUSE_SEC, _estimate_f0

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

# ---- 쉼 위치 품질 (전문가 관용 규칙) ----
# 같은 1.2초 침묵도 위치가 다르면 정반대로 들린다: 문장 사이(종결어미 뒤)의 쉼은
# 의도적 완급·호흡이고, 문장 중간의 끊김은 머뭇거림이다. 종결 판정은 한국어
# 존댓말·평서 종결의 마지막 음절(요/다/죠/까)로 근사한다 — 오분류의 방향이
# '머뭇거림을 완급으로 봐주는' 쪽(과소 감점)이 되도록 보수적으로 설계.
SENTENCE_FINAL_CHARS = ("요", "다", "죠", "까")
DEAD_AIR_SEC = 2.5  # 이보다 길면 문장 사이라도 데드에어 — 청자가 끊김으로 인지


def classify_long_pauses(words: list[dict]) -> dict:
    """단어 간격에서 긴 침묵(1.2s+)을 골라 위치로 분류.

    returns {deliberate: [{at, dur}], hesitations: [{at, dur, after, context}]}
    """
    deliberate: list[dict] = []
    hesitations: list[dict] = []
    for i in range(1, len(words)):
        prev, nxt = words[i - 1], words[i]
        gap = nxt["start"] - prev["end"]
        if gap < LONG_PAUSE_SEC:
            continue
        entry = {"at": round(prev["end"], 2), "dur": round(gap, 2)}
        if prev["word"].endswith(SENTENCE_FINAL_CHARS) and gap < DEAD_AIR_SEC:
            deliberate.append(entry)
        else:
            entry["after"] = prev["word"]
            # 인용 문맥: 끊기기 직전에 하던 말 (최대 4단어)
            entry["context"] = " ".join(w["word"] for w in words[max(0, i - 4):i])
            hesitations.append(entry)
    return {"deliberate": deliberate, "hesitations": hesitations}


def detect_restarts(words: list[dict]) -> dict:
    """단어 반복 재시작("그 그", "저는 저는") — 전사 기반 근사, 관찰 지표.

    간투어(FILLER_WORDS)는 별도 집계되므로 제외. 3연속 이상 반복도 1회로 센다.
    """
    count = 0
    examples: list[str] = []
    i = 1
    while i < len(words):
        word = words[i]["word"]
        if word == words[i - 1]["word"] and word not in FILLER_WORDS:
            count += 1
            if len(examples) < 3:
                examples.append(f"{word} {word}")
            while i < len(words) and words[i]["word"] == word:
                i += 1
        else:
            i += 1
    return {"count": count, "examples": examples}


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

    # 쉼 위치 품질 — score_voice의 위치 인지 페널티와 리포트 인용의 재료
    pauses = classify_long_pauses(words)
    result["pause_quality"] = {
        "deliberate_count": len(pauses["deliberate"]),
        "hesitation_count": len(pauses["hesitations"]),
    }
    if pauses["hesitations"]:
        result["worst_hesitation"] = max(pauses["hesitations"], key=lambda h: h["dur"])
        # moments(결정적 순간)용 시각 목록 — 상위 5개
        result["hesitations"] = [
            {"at": h["at"], "dur": h["dur"]} for h in pauses["hesitations"][:5]
        ]
    restarts = detect_restarts(words)
    if restarts["count"]:
        result["restarts"] = restarts

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
