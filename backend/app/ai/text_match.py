"""한국어 응답 텍스트 ↔ 체크리스트 키워드 매칭 유틸.

kiwipiepy가 있으면 형태소 기본형까지 함께 비교해 활용형 변화("배우겠습니다"→"배우다")에
강해진다. 없어도 공백 제거 부분 문자열 매칭으로 동작한다(전시 안정성 우선).

부정 인지: "보고드리지 않겠습니다"가 '보고' 커버로 오판되던 구멍을 막는다.
보수 설계 — 오판의 방향이 '부정을 놓침'(기존과 동일)이지 '긍정을 부정으로
오판'(새 위험)이 되지 않도록, 키워드에 직접 붙은 부정만 좁게 판정한다.
"""
import re
from functools import lru_cache

try:
    from kiwipiepy import Kiwi

    _kiwi: "Kiwi | None" = Kiwi()
except ImportError:  # pragma: no cover
    _kiwi = None


def kiwi_available() -> bool:
    """형태소 분석기 가동 여부 — 없으면 격식/기본형 판정이 문자열 근사로 강등된다."""
    return _kiwi is not None


def _squash(text: str) -> str:
    return text.replace(" ", "").lower()


@lru_cache(maxsize=512)
def _lemmas(text: str) -> tuple[str, ...]:
    if _kiwi is None:
        return ()
    tokens = _kiwi.tokenize(text)
    return tuple(t.form for t in tokens)


# 장형 부정: 키워드 직후 5자(공백 제거) 안의 "-지 않/-지 못"만 부정으로 본다.
# 창을 좁게 잡고 절 경계(문장부호)에서 끊어, 다른 절의 부정("보고드리고,
# 재발하지 않도록…")이 앞 절의 키워드를 죽이지 않게 한다.
_NEG_WINDOW = 5
_NEG_SUFFIXES = ("지않", "지는않", "진않", "지못", "지를못")
# 목적·소망 부정은 부정이 아니라 다짐이다: "재발하지 않도록 하겠습니다"의
# '재발'은 재발 방지 의지의 커버 — 부정 게이트에서 면제한다.
_NEG_EXEMPT_AFTER = ("도록", "게", "게끔", "을까", "았으면", "었으면")


def _negated_after(squashed: str, end: int) -> bool:
    window = squashed[end: end + _NEG_WINDOW + 4]
    for stop in ".,!?":
        cut = window.find(stop)
        if cut != -1:
            window = window[:cut]
    for suffix in _NEG_SUFFIXES:
        pos = window.find(suffix)
        if pos == -1 or pos >= _NEG_WINDOW:
            continue
        tail = window[pos + len(suffix):]
        if not any(tail.startswith(x) for x in _NEG_EXEMPT_AFTER):
            return True
    return False


def _short_negated(text: str, keyword: str) -> bool:
    """단형 부정: '안/못' 단독 어절이 키워드 어절 바로 앞 ("안 보고했어요").

    '방안 보고…'의 '안'처럼 단어 일부인 경우를 어절 경계로 배제한다.
    """
    return re.search(
        rf"(?:^|[\s,.!?])[안못]\s+{re.escape(keyword)}", text,
    ) is not None


def contains_keyword(text: str, keyword: str) -> bool:
    if not text or not keyword:
        return False
    sq_text, sq_kw = _squash(text), _squash(keyword)

    idx = sq_text.find(sq_kw)
    if idx != -1:
        # 표면 일치가 있으면 출현별로 부정 여부를 본다 — 부정 아닌 출현이 하나라도
        # 있으면 매칭. 전부 부정 맥락이면 매칭 아님 (lemma 우회도 막는다).
        occurrences = 0
        while idx != -1:
            occurrences += 1
            if not _negated_after(sq_text, idx + len(sq_kw)):
                # 단형 부정은 어절 경계가 필요해 원문 기준 — 단일 출현일 때만 적용
                # (다중 출현의 개별 대응은 과잉 — 놓치는 방향이 안전하다)
                if occurrences == 1 and sq_text.count(sq_kw) == 1 \
                        and _short_negated(text, keyword):
                    pass
                else:
                    return True
            idx = sq_text.find(sq_kw, idx + 1)
        return False
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
