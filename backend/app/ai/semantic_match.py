"""로컬 임베딩 의미 매칭 — 키워드가 놓치는 패러프레이즈를 잡는다 (마스터리 ②).

"고객께 사과드립니다"는 '죄송' 키워드 없이도 사과다. 체크리스트 항목의 의미
앵커와 응답 문장을 로컬 임베딩(Ollama /api/embeddings, API 키 무관)으로 비교해
키워드 매칭에 OR로 보탠다.

폴백 우선: Ollama가 없거나 느리면 None을 반환하고 키워드 매칭만 동작한다.
가용성 프로브는 프로세스당 1회 — 꺼진 Ollama에 턴마다 타임아웃을 내지 않는다.

임계값 주의: SEMANTIC_THRESHOLD는 보수적 초기값이다. 임계값이 낮으면 무관한
문장이 커버로 오인된다(오판 억제 위반). scripts/calibrate_semantic.py로
골든 셋 기반 재보정 후 조정하라.
"""
from functools import lru_cache

import httpx
import numpy as np

from app.core.config import settings

SEMANTIC_THRESHOLD = 0.66  # 코사인 유사도 — 골든 셋으로 재보정 필요 (보수적 초기값)
PROBE_TIMEOUT_SEC = 1.0
EMBED_TIMEOUT_SEC = 2.0


def _probe() -> bool:
    """Ollama 임베딩 모델 가용성 1회 확인."""
    try:
        resp = httpx.post(
            f"{settings.ollama_base_url}/api/embeddings",
            json={"model": settings.ollama_embed_model, "prompt": "ping"},
            timeout=PROBE_TIMEOUT_SEC,
        )
        resp.raise_for_status()
        return bool(resp.json().get("embedding"))
    except Exception:
        return False


@lru_cache(maxsize=1)
def available() -> bool:
    return settings.semantic_match_enabled and _probe()


@lru_cache(maxsize=2048)
def _embed(text: str) -> tuple[float, ...] | None:
    """단문 임베딩 (캐시) — 체크리스트 앵커는 세션 간 반복되므로 캐시 효율이 높다."""
    try:
        resp = httpx.post(
            f"{settings.ollama_base_url}/api/embeddings",
            json={"model": settings.ollama_embed_model, "prompt": text},
            timeout=EMBED_TIMEOUT_SEC,
        )
        resp.raise_for_status()
        vec = resp.json().get("embedding")
        return tuple(vec) if vec else None
    except Exception:
        return None


def _cosine(a: tuple[float, ...], b: tuple[float, ...]) -> float:
    va, vb = np.asarray(a), np.asarray(b)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
    return float(va @ vb / denom) if denom > 1e-9 else 0.0


def _anchor(item: dict) -> str:
    """체크리스트 항목의 의미 앵커 — 라벨과 대표 키워드로 항목의 '뜻'을 요약."""
    keywords = " ".join(item.get("keywords", [])[:6])
    return f"{item.get('label', '')} ({keywords})"


def semantic_checklist_ids(
    text: str, checklist: list[dict], sentences: list[str] | None = None,
) -> tuple[set[str], dict[str, list[int]]] | None:
    """의미 기반 커버 항목. None = 의미 매칭 사용 불가(키워드만 사용하라).

    returns (covered_ids, {item_id: [매칭된 문장 인덱스…]}) — 문장 인덱스는
    인용 근거 선택에 쓰인다.
    """
    if not text.strip() or not checklist or not available():
        return None
    if sentences is None:
        from app.ai.discourse import _sentences

        sentences = _sentences(text)
    if not sentences:
        return None

    sent_vecs = [(_embed(s), i) for i, s in enumerate(sentences)]
    sent_vecs = [(v, i) for v, i in sent_vecs if v is not None]
    if not sent_vecs:
        return None

    covered: set[str] = set()
    hits: dict[str, list[int]] = {}
    for item in checklist:
        anchor_vec = _embed(_anchor(item))
        if anchor_vec is None:
            continue
        matched = [
            i for v, i in sent_vecs if _cosine(anchor_vec, v) >= SEMANTIC_THRESHOLD
        ]
        if matched:
            covered.add(item["id"])
            hits[item["id"]] = matched
    return covered, hits
