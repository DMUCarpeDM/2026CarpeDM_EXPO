"""담화 구조 분석 — 보고 화법의 '조직'을 형태소 수준에서 측정한다.

체크리스트 매칭(무엇을 말했나)을 넘어, 문장이 어떻게 조직됐는가를 본다.
실무 커뮤니케이션 코칭에서 실제로 교정하는 여섯 축:

  결론 선행(BLUF)   비즈니스 보고의 제1원칙 — 첫 문장에 상태/결론이 오는가
  근거 연결         주장 뒤에 이유가 따라오는가 (이유 마커·연결어미)
  시점 약속         "확인하겠다"가 아니라 "10분 안에 확인하겠다"인가
                    — 숫자+시간 단위+기한 표지의 결합만 인정 (막연한 '나중에' 배제)
  책임 문형         1인칭 주어 + 의지 어미("제가 ~하겠습니다") — 소유권의 언어
  헤지(모호) 밀도   "좀/약간/아마/~것 같다" — 과도하면 신뢰를 깎는 완충 언어
  질문 정합성       질문의 핵심 명사가 답변에 얼마나 이어지는가 (동문서답 감지)

전부 kiwipiepy 형태소 + 정규식 — 외부 API 없음. kiwipiepy 부재 시 휴리스틱 폴백.
"""
import re
from functools import lru_cache

from app.ai.text_match import _kiwi, count_hangul_syllables  # 기존 분석기 재사용

# 결론 선행 마커 — 상태 선언(해결/정상/가능 여부)이나 명시적 결론 신호
CONCLUSION_MARKERS = [
    "결론부터", "결론은", "정리하면", "요약하면", "먼저 말씀드리면", "한마디로",
    "해결됐", "해결되었", "복구됐", "복구되었", "정상화", "정상입니다", "정상이에요",
    "가능합니다", "어렵습니다", "안 됩니다", "됩니다", "참석하겠", "완료됐", "완료되었",
]

# 근거 마커 — 어휘 + 연결어미(원인·이유)
REASON_MARKERS = ["때문", "왜냐하면", "이유는", "근거는", "원인은", "덕분에", "라서"]
REASON_EC_FORMS = ("아서", "어서", "니까", "느라", "으므로", "므로")

# 헤지(완충) 표현 — 밀도가 높으면 확신 없는 인상
HEDGE_PATTERNS = [
    "아마", "혹시", "약간", "조금", "좀 ", "뭔가", "일단", "왠지",
    "것 같", "듯합니", "듯해요", "지도 모르", "려나", "그럭저럭",
]

# 시점 약속: (숫자/한글 수사)+(시간 단위) 또는 시간 명사 + 기한 표지
_TIME_COMMIT_RE = re.compile(
    r"([0-9]+|한|두|세|네|다섯|열)\s*(분|시간|일|주)\s*(안에|이내|내로|내에|후에|뒤에|까지)"
    r"|(오늘|내일|모레|이번\s*주|퇴근\s*전|점심\s*전|오전|오후)\s*(중으로|안에|까지|내로)"
    r"|(바로|즉시|지금)\s*(확인|회신|공유|보고|말씀|전달|연락)"
)

# 책임 문형: 1인칭 주어("제가/저는") 문장에 의지 선어말어미(-겠-) 또는 수행 동사
_OWNERSHIP_RE = re.compile(r"(제가|저는|저부터)[^.?!]{0,40}(겠|하겠|드리겠|보겠|올리겠)")

# 청자 배려(You-attitude): "안 됩니다"로 끝나는 불가 통보 vs 대안이 따라오는 불가.
# 대안은 같은 문장 또는 바로 다음 문장까지 인정한다 ("어렵습니다. 대신 내일—").
NEGATIVE_PATTERNS = [
    "안 됩니다", "안 돼요", "안 될 것", "못 합니다", "못 해요", "불가능",
    "어렵습니다", "어려울 것", "힘듭니다", "힘들 것",
]
ALTERNATIVE_MARKERS = [
    "대신", "다만", "가능한", "방법", "내일", "다음에", "이후에", "일찍",
    "까지는 가능", "라면 가능", "먼저 해", "시간을 조정",
]


@lru_cache(maxsize=256)
def _content_nouns(text: str) -> frozenset[str]:
    """일반·고유 명사 집합 (2자 이상 — 조사·형식 명사 잡음 제거)."""
    if _kiwi is None or not text:
        return frozenset()
    return frozenset(
        t.form for t in _kiwi.tokenize(text)
        if t.tag in ("NNG", "NNP") and len(t.form) >= 2
    )


def _sentences(text: str) -> list[str]:
    if _kiwi is not None:
        try:
            return [s.text.strip() for s in _kiwi.split_into_sents(text) if s.text.strip()]
        except Exception:
            pass
    return [s.strip() for s in re.split(r"[.!?\n]", text) if s.strip()]


def analyze_discourse(text: str, question_text: str = "") -> dict:
    """응답의 담화 구조 지표. 텍스트가 너무 짧으면(한 문장 미만) 대부분 None."""
    text = (text or "").strip()
    if not text:
        return {}
    sents = _sentences(text)
    syllables = max(count_hangul_syllables(text), 1)

    # 결론 선행 — 첫 문장(없으면 첫 40자) 안에 결론 마커
    head = sents[0] if sents else text[:40]
    conclusion_first = any(m in head for m in CONCLUSION_MARKERS)

    # 근거 연결 — 어휘 마커 + 원인·이유 연결어미(EC)
    reason_count = sum(1 for m in REASON_MARKERS if m in text)
    if _kiwi is not None:
        reason_count += sum(
            1 for t in _kiwi.tokenize(text)
            if t.tag == "EC" and any(t.form.endswith(f) for f in REASON_EC_FORMS)
        )

    # 시점 약속 — 구체적 기한이 있는 약속만 인정
    time_commitments = len(_TIME_COMMIT_RE.findall(text))

    # 책임 문형
    ownership_count = len(_OWNERSHIP_RE.findall(text))

    # 헤지 밀도 (100음절당) — 짧은 답변에서 과대평가되지 않게 음절 정규화
    hedge_count = sum(text.count(p) for p in HEDGE_PATTERNS)
    hedge_per_100 = round(hedge_count / syllables * 100, 2)

    # 질문 정합성 — 질문 핵심 명사의 재사용률 (질문 명사 2개 미만이면 판정 보류)
    alignment = None
    q_nouns = _content_nouns(question_text)
    if len(q_nouns) >= 2:
        a_nouns = _content_nouns(text)
        alignment = round(len(q_nouns & a_nouns) / len(q_nouns), 3)

    # 청자 배려: 대안 없는 불가 통보 — 다음 문장까지의 대안 제시는 인정
    negative_no_alternative = 0
    for i, sent in enumerate(sents):
        if any(p in sent for p in NEGATIVE_PATTERNS):
            window = sent + " " + (sents[i + 1] if i + 1 < len(sents) else "")
            if not any(m in window for m in ALTERNATIVE_MARKERS):
                negative_no_alternative += 1

    # 문장 부담 — 만연체 감지 (평균 문장 음절, 문장당 최대 연결어미 수)
    sent_syllables = [count_hangul_syllables(s) for s in sents] or [syllables]
    max_clauses = 0
    if _kiwi is not None:
        for s in sents:
            max_clauses = max(max_clauses, sum(1 for t in _kiwi.tokenize(s) if t.tag == "EC"))

    return {
        "sentence_count": len(sents),
        "conclusion_first": conclusion_first,
        "reason_marker_count": reason_count,
        "time_commitment_count": time_commitments,
        "ownership_count": ownership_count,
        "hedge_count": hedge_count,
        "hedge_per_100syl": hedge_per_100,
        "negative_no_alternative": negative_no_alternative,
        "question_alignment": alignment,
        "avg_sentence_syllables": round(sum(sent_syllables) / len(sent_syllables), 1),
        "max_clauses_per_sentence": max_clauses,
    }
