"""브랜드 응대 매뉴얼 검색 (S-B2B-RAG) — "회사 기준으로 평가·코칭"의 근거 레이어.

B2B 서사: 기업 등록 = 응대 매뉴얼 업로드 → 그 회사 기준으로 평가한다.
EXPO 버전은 가상 브랜드('카페 온도') 매뉴얼 1개를 코퍼스로 쓰되, 구조는
RAG다 — retrieve() 인터페이스 뒤의 검색기(현재 키워드 스코어링)만 임베딩
검색으로 교체하면 된다. 키워드 검색을 기본으로 두는 이유: 결정적이라
테스트로 고정되고, Ollama 임베딩이 죽어도 코칭·judge 근거가 사라지지 않는다
(폴백 계층 원칙 — 검색 품질 강등은 있어도 기능 소멸은 없다).

사용처:
- judge (S-B2B-JUDGE): 채점 프롬프트에 매뉴얼 발췌를 근거로 주입
- 코칭 카드 (S-B2B-COACH): Before→After 제안 문장의 manual_ref
"""
import json
import re
from functools import lru_cache
from pathlib import Path

MANUALS_DIR = Path(__file__).resolve().parent.parent / "seed" / "manuals"


@lru_cache(maxsize=8)
def load_manual(brand: str) -> dict:
    """브랜드 매뉴얼 로드 — 없으면 빈 dict (매뉴얼 없는 시나리오는 조용히 비활성)."""
    for path in MANUALS_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if data.get("brand") == brand:
            return data
    return {}


def _terms(text: str) -> set[str]:
    return set(re.findall(r"[가-힣A-Za-z0-9]{2,}", text))


def retrieve(query: str, brand: str, top_k: int = 2) -> list[dict]:
    """질의와 가장 관련 있는 매뉴얼 섹션 top_k — 키워드 겹침 스코어링.

    스코어 = (키워드 명중 × 2) + (본문 단어 겹침). 명중 0이면 제외 —
    무관한 섹션을 억지로 끼워 넣어 근거를 희석하지 않는다.
    """
    manual = load_manual(brand)
    if not manual or not query:
        return []
    query_terms = _terms(query)
    scored: list[tuple[float, dict]] = []
    for section in manual.get("sections", []):
        keyword_hits = sum(
            1 for kw in section.get("keywords", [])
            if kw in query or any(kw in term for term in query_terms)
        )
        content_overlap = len(query_terms & _terms(section.get("content", "")))
        score = keyword_hits * 2.0 + content_overlap * 0.5
        if keyword_hits or content_overlap >= 3:
            scored.append((score, section))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [section for _, section in scored[:top_k]]


def excerpts_for_prompt(query: str, brand: str, top_k: int = 2, max_chars: int = 600) -> str:
    """judge 프롬프트 주입용 발췌 문자열 — 없으면 빈 문자열."""
    sections = retrieve(query, brand, top_k)
    lines = []
    used = 0
    for section in sections:
        line = f"- [{section['title']}] {section['content']}"
        if used + len(line) > max_chars:
            break
        lines.append(line)
        used += len(line)
    return "\n".join(lines)
