"""담화 구조 분석 — 보고 화법의 '조직'을 형태소 수준에서 측정한다.

체크리스트 매칭(무엇을 말했나)을 넘어, 문장이 어떻게 조직됐는가를 본다.
실무 커뮤니케이션 코칭에서 실제로 교정하는 축:

  결론 선행(BLUF)   비즈니스 보고의 제1원칙 — 첫 문장에 상태/결론이 오는가
  결론 도달 거리    결론이 나오기까지 몇 음절을 듣게 만들었는가 (선행 여부의 정량판)
  근거 연결         주장 뒤에 이유가 따라오는가 (이유 마커·연결어미)
  시점 약속         "확인하겠다"가 아니라 "10분 안에 확인하겠다"인가
                    — 숫자+시간 단위+기한 표지의 결합만 인정 (막연한 '나중에' 배제)
  책임 문형         1인칭 주어 + 의지 어미("제가 ~하겠습니다") — 소유권의 언어
  헤지(모호) 밀도   "좀/약간/아마/~것 같다" — 과도하면 신뢰를 깎는 완충 언어
  질문 정합성       질문의 핵심 명사가 답변에 얼마나 이어지는가 (동문서답 감지)
  구체성            숫자·수량 표현의 수 — "문의 5건, 고객사 3곳"이 보고의 급을 가른다
  어휘 다양성       내용어 기본형의 반복 정도 — 같은 단어만 도는 답변 감지
  말끝 흐림         연결어미로 끝나 완결되지 않은 문장 ("~해서…") — 자신감 신호
  쿠션어            "죄송하지만/괜찮으시다면" — 청자 배려의 긍정 지표
  자기 수정         "그게 아니라" 류 되감기 — 문장 설계 전에 말이 나가는 습관

전부 kiwipiepy 형태소 + 정규식 — 외부 API 없음. kiwipiepy 부재 시 휴리스틱 폴백.
신규 지표는 전부 관찰 전용(점수 미반영) — 리포트·심층 분석 카드에서만 소비한다.
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

# 완곡 명령(상향 지시형): 신입이 상사·선배에게 명령/지시형 종결어미를 쓰는 실수.
# 종결이 명령형("~하세요/~하십시오")이되, 정중한 요청(부탁드립니다/해 주시겠어요?)·
# 인사말(안녕하세요/수고하세요)은 지시가 아니므로 제외한다. 관찰 코칭 전용이며,
# 오분류는 '놓침'(과소 감지) 쪽으로 좁게 설계한다(요청형 어미를 넓게 면제).
_DIRECTIVE_ENDINGS = ("세요", "십시오")
_REQUEST_SOFTENERS = (
    "부탁", "여쭤", "여쭙", "여쭈", "양해", "죄송", "실례", "혹시",
    "괜찮으시", "괜찮으면", "주시겠", "주실", "주시면", "주시길",
)
_PLEASANTRY = ("안녕", "수고", "고생", "축하", "환영", "감사")

# 구체성: 숫자·수량 표현 — 아라비아 숫자(+단위)와 한글 수사+단위 결합.
# 단위 없는 맨 숫자("3시까지"의 3)도 구체성이므로 숫자 자체를 센다.
# '한번'(부사, "한번 볼게요")은 수량이 아니므로 '한'은 공백+단위 결합만,
# '번' 계수사와의 결합은 제외한다 — 오탐(막연한 말을 구체로 오인)이 더 나쁘다.
_NUMERIC_RE = re.compile(
    r"[0-9]+(?:[.,][0-9]+)?"
    r"|한\s+(?:개|건|명|곳|가지|분|시간|일|주)"
    r"|(?:두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(?:개|건|명|곳|번|가지|분|시간|일|주|차례)"
)

# 쿠션어(완충 표현) — 요청·거절·정정 앞에 얹는 청자 배려 언어. 긍정 지표(가점 아님).
CUSHION_PHRASES = [
    "죄송하지만", "죄송한데", "번거로우시겠지만", "바쁘신 와중에", "바쁘시겠지만",
    "괜찮으시다면", "괜찮으시면", "실례지만", "실례가 안 된다면", "양해 부탁",
    "말씀 중에 죄송", "여쭤봐도 될까요", "여쭤봐도 괜찮을까요",
]

# 자기 수정(되감기) — 말이 문장 설계보다 먼저 나갈 때의 정정 마커. 보수적으로 좁게.
SELF_REPAIR_PATTERNS = [
    "그게 아니라", "아 아니", "아니 잠깐", "잘못 말씀드렸", "정정하겠습니다", "정정할게요",
]

# 어휘 다양성이 의미를 갖는 최소 내용어 표본 — 이보다 짧으면 판정 보류(None)
_LEXICAL_MIN_TOKENS = 20
# 내용어 품사: 일반·고유 명사, 동사, 형용사, 일반 부사, 어근
_CONTENT_TAGS = ("NNG", "NNP", "VV", "VA", "MAG", "XR")

# 말끝 흐림 폴백(형태소 분석기 부재 시): 대표적 연결어미로 끝나는 문장만 좁게 판정
_TRAILING_FALLBACK_ENDINGS = ("인데", "는데", "해서", "라서", "하고", "이고", "지만")


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


def _lexical_diversity(text: str) -> float | None:
    """내용어 기본형 TTR(고유 내용어/전체 내용어). 표본 부족·분석기 부재 시 None.

    구어 답변은 짧아 원 TTR이 길이에 민감하다 — 최소 표본 게이트로 보류 처리.
    """
    if _kiwi is None:
        return None
    tokens = [t.form for t in _kiwi.tokenize(text) if t.tag in _CONTENT_TAGS]
    if len(tokens) < _LEXICAL_MIN_TOKENS:
        return None
    return round(len(set(tokens)) / len(tokens), 2)


def _is_trailing(sentence: str) -> bool:
    """말끝 흐림 — 문장이 종결어미 없이 연결어미로 끝나는가 ("확인은 했는데…").

    명사구 답변("네, 알겠습니다" 뒤의 "플랫폼팀 업무요" 등)은 EF가 없어도
    완결이므로, '마지막 형태소가 연결어미(EC)'일 때만 흐림으로 판정한다.
    """
    if count_hangul_syllables(sentence) < 4:
        return False  # 짧은 조각은 판정 보류 — 간투사·호응 표현 오판 방지
    if _kiwi is not None:
        tokens = [t for t in _kiwi.tokenize(sentence) if t.tag not in ("SF", "SP", "SE", "SW")]
        return bool(tokens) and tokens[-1].tag == "EC"
    stripped = sentence.rstrip(".!?… ")
    return stripped.endswith(_TRAILING_FALLBACK_ENDINGS) and not stripped.endswith("요")


def _conclusion_delay(sents: list[str]) -> int | None:
    """결론 마커가 등장하기 전까지 청자가 들은 음절 수. 결론 문장이 없으면 None.

    conclusion_first(불리언)의 정량판 — '얼마나 미뤘는가'를 거리로 보여준다.
    """
    heard = 0
    for sent in sents:
        if any(m in sent for m in CONCLUSION_MARKERS):
            return heard
        heard += count_hangul_syllables(sent)
    return None


def _directive_to_senior(sents: list[str]) -> int:
    """상사·선배 대상 지시형 종결 문장 수 — 요청·인사말은 명령이 아니므로 제외."""
    count = 0
    for s in sents:
        core = s.rstrip(" .!?~…\t").strip()
        if not core.endswith(_DIRECTIVE_ENDINGS):
            continue
        if any(w in s for w in _REQUEST_SOFTENERS):  # 부탁·양해·완곡 요청형
            continue
        if any(p in s for p in _PLEASANTRY):          # 안녕하세요/수고하세요 등 인사
            continue
        count += 1
    return count


def analyze_discourse(
    text: str, question_text: str = "", listener_seniority: str = "",
) -> dict:
    """응답의 담화 구조 지표. 텍스트가 너무 짧으면(한 문장 미만) 대부분 None.

    listener_seniority: 청자 지위("superior"|"senior"|"peer"|"other"|""). 상사·선배
    (superior/senior)일 때만 완곡 명령(상향 지시형)을 집계한다 — 동료·타부서에는
    지시형이 결례로 보기 어려워 과잉 지적을 피한다.
    """
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

    # 완곡 명령(상향 지시형) — 상사·선배 대상 턴에서만 집계
    directive_to_senior = (
        _directive_to_senior(sents)
        if listener_seniority in ("superior", "senior") else 0
    )

    # 문장 부담 — 만연체 감지 (평균 문장 음절, 문장당 최대 연결어미 수)
    sent_syllables = [count_hangul_syllables(s) for s in sents] or [syllables]
    max_clauses = 0
    if _kiwi is not None:
        for s in sents:
            max_clauses = max(max_clauses, sum(1 for t in _kiwi.tokenize(s) if t.tag == "EC"))

    # 구체성 — 숫자·수량 표현 수 ("15분 안에", "문의 5건")
    specificity_count = len(_NUMERIC_RE.findall(text))

    # 쿠션어·자기 수정 — 출현 횟수 (원문 인용 없음: 미저장 동의 파기 경로와 무관하게 안전)
    cushion_count = sum(text.count(p) for p in CUSHION_PHRASES)
    self_repair_count = sum(text.count(p) for p in SELF_REPAIR_PATTERNS)

    # 말끝 흐림 — 연결어미로 끝나 완결되지 않은 문장 수
    trailing_count = sum(1 for s in sents if _is_trailing(s))

    return {
        "sentence_count": len(sents),
        "conclusion_first": conclusion_first,
        "conclusion_delay_syllables": _conclusion_delay(sents),
        "reason_marker_count": reason_count,
        "time_commitment_count": time_commitments,
        "ownership_count": ownership_count,
        "hedge_count": hedge_count,
        "hedge_per_100syl": hedge_per_100,
        "negative_no_alternative": negative_no_alternative,
        "directive_to_senior": directive_to_senior,
        "question_alignment": alignment,
        "avg_sentence_syllables": round(sum(sent_syllables) / len(sent_syllables), 1),
        "max_clauses_per_sentence": max_clauses,
        "specificity_count": specificity_count,
        "lexical_diversity": _lexical_diversity(text),
        "trailing_count": trailing_count,
        "cushion_count": cushion_count,
        "self_repair_count": self_repair_count,
    }
