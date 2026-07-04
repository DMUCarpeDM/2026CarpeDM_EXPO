"""한국어 응답 텍스트 ↔ 체크리스트 키워드 매칭 유틸.

kiwipiepy가 있으면 형태소 기본형까지 함께 비교해 활용형 변화("배우겠습니다"→"배우다")에
강해진다. 없어도 공백 제거 부분 문자열 매칭으로 동작한다(전시 안정성 우선).
"""
from functools import lru_cache

try:
    from kiwipiepy import Kiwi

    _kiwi: "Kiwi | None" = Kiwi()
except ImportError:  # pragma: no cover
    _kiwi = None


def _squash(text: str) -> str:
    return text.replace(" ", "").lower()


@lru_cache(maxsize=512)
def _lemmas(text: str) -> tuple[str, ...]:
    if _kiwi is None:
        return ()
    tokens = _kiwi.tokenize(text)
    return tuple(t.form for t in tokens)


def contains_keyword(text: str, keyword: str) -> bool:
    if not text or not keyword:
        return False
    if _squash(keyword) in _squash(text):
        return True
    return keyword in _lemmas(text)


def match_any(text: str, keywords: list[str]) -> bool:
    return any(contains_keyword(text, kw) for kw in keywords)


def matched_checklist_ids(text: str, checklist: list[dict]) -> set[str]:
    """응답이 커버한 체크리스트 항목 id 집합."""
    return {item["id"] for item in checklist if match_any(text, item.get("keywords", []))}


def count_hangul_syllables(text: str) -> int:
    return sum(1 for ch in text if "가" <= ch <= "힣")


# ---------------------------------------------------------------------------
# 격식 분석 — 종결어미(EF) 형태소 기반
# ---------------------------------------------------------------------------
# 합쇼체(격식): -습니다/-ㅂ니다/-습니까 → form에 "니다"/"니까" 포함
# 해요체(비격식 존대): -어요/-네요/-세요/-죠 → form이 "요"로 끝나거나 "죠"
# 그 외 EF(-다/-어/-야/-자/-냐 등)는 구어 응답 맥락에서 반말로 분류
_FALLBACK_FORMAL_MARKERS = ["습니다", "니다", "세요", "드리", "겠습", "입니다", "요"]


def _classify_ef(form: str) -> str:
    if "니다" in form or "니까" in form:
        return "formal"
    if form.endswith("요") or form in ("죠", "지요", "네요", "세요"):
        return "polite"
    return "banmal"


def politeness_profile(text: str) -> dict:
    """문장별 종결어미를 분석해 격식 비율과 반말 문장 인용을 반환.

    returns: {formal_ratio: 0~1, ef_count, banmal_count, banmal_quotes: [문장...]}
    kiwipiepy가 없으면 마커 휴리스틱으로 근사(반말 인용은 비활성).
    """
    if _kiwi is None or not text.strip():
        stripped = text.strip()
        formal = any(m in stripped for m in _FALLBACK_FORMAL_MARKERS)
        return {
            "formal_ratio": 1.0 if formal else 0.0,
            "ef_count": 0,
            "banmal_count": 0 if formal else 1,
            "banmal_quotes": [],
        }

    try:
        sentences = [s.text for s in _kiwi.split_into_sents(text)]
    except Exception:
        sentences = [text]

    counts = {"formal": 0, "polite": 0, "banmal": 0}
    banmal_quotes: list[str] = []
    for sent in sentences:
        efs = [t.form for t in _kiwi.tokenize(sent) if t.tag == "EF"]
        if not efs:
            continue
        # 문장의 마지막 종결어미가 그 문장의 격식을 결정
        kind = _classify_ef(efs[-1])
        counts[kind] += 1
        if kind == "banmal":
            banmal_quotes.append(sent.strip()[:60])

    total = sum(counts.values())
    if total == 0:
        # 종결어미가 없으면(명사구 답변 등) 마커 휴리스틱으로 근사
        formal = any(m in text for m in _FALLBACK_FORMAL_MARKERS)
        return {
            "formal_ratio": 1.0 if formal else 0.5,
            "ef_count": 0,
            "banmal_count": 0,
            "banmal_quotes": [],
        }
    return {
        "formal_ratio": (counts["formal"] + counts["polite"]) / total,
        "ef_count": total,
        "banmal_count": counts["banmal"],
        "banmal_quotes": banmal_quotes[:3],
    }
