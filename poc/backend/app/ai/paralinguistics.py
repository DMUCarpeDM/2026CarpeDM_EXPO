"""파라링귀스틱 지표 (S-B2B-PARA) — LLM이 텍스트 의미에서 못 보는 '전달력' 신호.

멀티모달 평가 융합의 신호처리 축: 텍스트 의미 평가(LLM·의미 매칭)와 별개로,
오디오·전사·타임스탬프에서 전달력 지표를 직접 계산해 리포트에 합류시킨다.

지표 4종 (docs/plan/b2b/ai-architecture.md):
- 발화 속도: voice_fit.speech_rate_sps(음절/초) → 분당 음절(SPM)로 환산 표기
- 응답 지연: voice_fit.lead_in_sec (질문 후 첫 발화까지의 침묵)
- 긴 멈춤: voice_fit.long_pause_count (1.2s+ 침묵 횟수)
- 필러 워드: 이 모듈 — 전사 텍스트의 간투사("어…", "음…", "그니까") 빈도

필러 측정의 정직한 한계: 서버 STT(whisper)는 간투사를 상당 부분 정규화해
지우므로 측정치는 하한선이다. 그래서 필러는 표정과 같은 '관찰 레이어'로
리포트에만 표기하고 점수에는 반영하지 않는다 — 전사기 교체(필러 보존 전사)로
신뢰도가 확보되면 채점 편입을 재검토한다 (STT 로드맵 R2).
측정 정책: 음성 기반 턴(오디오 실측·음성 인식)만 측정, 텍스트 입력 턴은 제외.
"""
import re

from app.ai.text_match import count_hangul_syllables

# 한국어 간투사(필러) — 독립 토큰으로 나타난 경우만 센다. 과탐 방지가 원칙:
# 관형사·부사로 정상 사용되는 토큰("그 부분", "약간 늦어짐", "일단 확인", "막 도착")은
# 필러 판정이 원리적으로 불가능해 목록에서 제외했다. 남긴 것은 문장 성분일
# 가능성이 낮은 간투사뿐이다 — 측정치가 하한선인 이유가 하나 더 늘지만,
# 코칭에서 오탐("'그 부분'을 필러라고?")은 측정 누락보다 신뢰를 크게 깎는다.
_FILLER_PATTERN = re.compile(
    r"(?:^|[\s,])"
    r"(어+|음+|으음+|어유|저기요?|아니\s?근데|뭐랄까요?|그니까요?|그러니까요?)"
    r"(?=$|[\s,.!?…~])"
)


def analyze_fillers(text: str) -> dict:
    """전사 텍스트의 필러 빈도. 텍스트가 없으면 빈 dict."""
    if not text or not text.strip():
        return {}
    hits: dict[str, int] = {}
    for match in _FILLER_PATTERN.finditer(text):
        token = match.group(1).strip()
        base = re.sub(r"(.)\1+$", r"\1", token)  # "어어어" → "어" 로 정규화 집계
        hits[base] = hits.get(base, 0) + 1
    syllables = count_hangul_syllables(text)
    total = sum(hits.values())
    return {
        "filler_count": total,
        "filler_hits": sorted(hits.items(), key=lambda kv: kv[1], reverse=True)[:5],
        "filler_per_100_syllables": round(total / syllables * 100, 1) if syllables else 0.0,
    }


def summarize(voice_metrics_list: list[dict]) -> dict:
    """세션 전체 파라링귀스틱 요약 — 리포트 '말하기 데이터' 스트립용.

    입력: 턴별 Voice raw_metrics(오디오 실측 + webspeech 근사 혼재).
    표기 원칙: 실측이 하나도 없으면 해당 항목은 None (없는 걸 있는 척 하지 않는다).
    """
    measured = [m for m in voice_metrics_list if m and not m.get("estimated")]
    all_with_rate = [m for m in voice_metrics_list if m and m.get("speech_rate_sps")]

    # 분당 음절(SPM) — "말 속도: 분당 380음절" 표기의 근거. 근사 턴 포함(속도는
    # 발화 시간 기반 근사도 유효), 단 실측 여부를 함께 기록한다.
    spm = None
    if all_with_rate:
        rates = [m["speech_rate_sps"] for m in all_with_rate]
        spm = round(sum(rates) / len(rates) * 60)

    lead_ins = [m["lead_in_sec"] for m in measured if m.get("lead_in_sec") is not None]
    long_pauses = sum(m.get("long_pause_count", 0) for m in measured)

    filler_total = sum(m.get("fillers", {}).get("filler_count", 0) for m in voice_metrics_list if m)
    filler_hits: dict[str, int] = {}
    for m in voice_metrics_list:
        for token, count in (m or {}).get("fillers", {}).get("filler_hits", []):
            filler_hits[token] = filler_hits.get(token, 0) + count

    summary = {
        "speech_rate_spm": spm,
        "speech_rate_note": _rate_note(spm),
        "lead_in_mean_sec": round(sum(lead_ins) / len(lead_ins), 1) if lead_ins else None,
        "long_pause_total": long_pauses if measured else None,
        "filler_count": filler_total,
        "filler_top": sorted(filler_hits.items(), key=lambda kv: kv[1], reverse=True)[:3],
        "measured_turns": len(measured),
    }
    return summary


def _rate_note(spm: int | None) -> str:
    """말 속도 한 줄 해석 — 영수증·리포트 표기용 (보고 상황 기준 210~330 SPM 적정)."""
    if spm is None:
        return ""
    if spm > 360:
        return "긴장 시 빨라지는 패턴이에요 — 문장 끝에서 반 박자 쉬어보세요."
    if spm > 330:
        return "살짝 빠른 편이에요 — 핵심 단어 앞에서 속도를 늦춰보세요."
    if spm < 180:
        return "차분하지만 느린 편이에요 — 결론 문장은 한 호흡에 말해보세요."
    if spm < 210:
        return "여유 있는 속도예요."
    return "전달하기 좋은 안정적인 속도예요."
