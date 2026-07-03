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
