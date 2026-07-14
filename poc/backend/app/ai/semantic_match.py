"""로컬 임베딩 의미 매칭 — 키워드가 놓치는 패러프레이즈를 잡는다 (마스터리 ②).

"고객께 사과드립니다"는 '죄송' 키워드 없이도 사과다. 체크리스트 항목의 의미
앵커와 응답 문장을 로컬 임베딩(Ollama /api/embeddings, API 키 무관)으로 비교해
키워드 매칭에 OR로 보탠다.

폴백 우선: Ollama가 없거나 느리면 None을 반환하고 키워드 매칭만 동작한다.
가용성 프로브는 TTL 주기로 재확인 — 부팅 때 없던 Ollama가 나중에 떠도 자동
승격되고, 전시 중 죽으면 서킷 브레이커가 즉시 폴백으로 강등한다. 리액션 분류가
라이브 턴에서 이 모듈을 지나므로, 죽은 Ollama에 문장마다 타임아웃을 내면
다음 질문이 그만큼 늦어진다(전시 생존성).

임계값 주의: SEMANTIC_THRESHOLD는 임베딩 모델에 종속된다. 모델을 바꾸면 반드시
scripts/calibrate_semantic.py로 골든 셋 재보정 후 조정하라. 임계값이 낮으면
무관한 문장이 커버로 오인된다(오판 억제 위반).
"""
import re
import time
from functools import lru_cache

import httpx
import numpy as np

from app.core.config import settings

# 2026-07-07 bge-m3 + 다중 앵커(예시문) + 절 단위 골든 셋 보정:
#   패러프레이즈(잡아야 함) 0.833~0.982 / 동문서답(잡으면 안 됨) 0.551~0.670
#   → 0.68~0.80 전 구간에서 4/4 인식·오탐 0. 0.69 = 오탐 경계(0.67) 바로 위 +
#   커버리지(항목 단위) 라이브 테스트 통과를 함께 만족하는 값.
# 비교 실험 기록: 단일 라벨+키워드 앵커는 양/음성이 겹쳐 분리 불가(여유 -0.016),
# nomic-embed-text는 유사도가 0.77~0.89로 뭉개져 분리 불가 → bge-m3 채택.
# 주의: 골든 셋이 작다(양성 4·음성 3) — 케이스 확충 후 calibrate_semantic.py 재보정.
SEMANTIC_THRESHOLD = 0.69
PROBE_TIMEOUT_SEC = 1.0
EMBED_TIMEOUT_SEC = 2.0
AVAILABILITY_TTL_SEC = 60.0  # 가용성 재프로브 주기 — 다운/복구를 이 주기 안에 반영
BREAKER_FAILURES = 2         # 연속 임베딩 실패 임계 — 도달 시 쿨다운 동안 즉시 폴백
BREAKER_COOLDOWN_SEC = 60.0

_avail_state: tuple[float, bool] | None = None  # (프로브 시각 monotonic, 결과)
_fail_streak = 0
_blocked_until = 0.0  # 브레이커 개방 종료 시각 (monotonic)


def _probe() -> bool:
    """Ollama 임베딩 모델 가용성 1회 확인."""
    try:
        resp = httpx.post(
            f"{settings.ollama_base_url}/api/embeddings",
            json={
                "model": settings.ollama_embed_model, "prompt": "ping",
                "keep_alive": settings.ollama_keep_alive,
            },
            timeout=PROBE_TIMEOUT_SEC,
        )
        resp.raise_for_status()
        return bool(resp.json().get("embedding"))
    except Exception:
        return False


def available() -> bool:
    """TTL 캐시된 가용성 — 브레이커 개방 중에는 프로브 없이 즉시 False."""
    global _avail_state
    if not settings.semantic_match_enabled:
        return False
    now = time.monotonic()
    if now < _blocked_until:
        return False
    if _avail_state is None or now - _avail_state[0] >= AVAILABILITY_TTL_SEC:
        _avail_state = (now, _probe())
    return _avail_state[1]


@lru_cache(maxsize=2048)
def _embed_cached(text: str) -> tuple[float, ...]:
    """단문 임베딩 (캐시) — 체크리스트 앵커는 세션 간 반복되므로 캐시 효율이 높다.

    실패는 예외로 던져 캐시에 남기지 않는다 — 실패 결과가 캐시되면 Ollama 복구
    후에도 앵커가 영구히 '임베딩 불가'로 남는다.
    """
    resp = httpx.post(
        f"{settings.ollama_base_url}/api/embeddings",
        json={
            "model": settings.ollama_embed_model, "prompt": text,
            "keep_alive": settings.ollama_keep_alive,
        },
        timeout=EMBED_TIMEOUT_SEC,
    )
    resp.raise_for_status()
    vec = resp.json().get("embedding")
    if not vec:
        raise ValueError("빈 임베딩 응답")
    return tuple(vec)


def _embed(text: str) -> tuple[float, ...] | None:
    """임베딩 + 서킷 브레이커 — 연속 실패 시 쿨다운 동안 시도 없이 폴백한다."""
    global _fail_streak, _blocked_until
    if time.monotonic() < _blocked_until:
        return None
    try:
        vec = _embed_cached(text)
    except Exception:
        _fail_streak += 1
        if _fail_streak >= BREAKER_FAILURES:
            _blocked_until = time.monotonic() + BREAKER_COOLDOWN_SEC
            _fail_streak = 0
            print(f"[semantic] 임베딩 연속 실패 — {BREAKER_COOLDOWN_SEC:.0f}s 동안 키워드 폴백")
        return None
    _fail_streak = 0
    return vec


def _cosine(a: tuple[float, ...], b: tuple[float, ...]) -> float:
    va, vb = np.asarray(a), np.asarray(b)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
    return float(va @ vb / denom) if denom > 1e-9 else 0.0


def _anchors(item: dict) -> list[str]:
    """체크리스트 항목의 의미 앵커들 — 라벨+키워드 요약 1개 + 예시문(paraphrases).

    예시문은 사용자 발화와 같은 '문장' 형태라 문장-문장 비교가 성립한다.
    라벨+키워드 자루 단일 앵커는 표면형이 먼 패러프레이즈("한숨 돌리셔도
    됩니다"=안심시키기)를 놓친다 — 2026-07-07 골든 셋 실측으로 확인된 한계.
    """
    keywords = " ".join(item.get("keywords", [])[:6])
    return [f"{item.get('label', '')} ({keywords})", *item.get("paraphrases", [])]


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

    # 문장 + 절 단위 임베딩 — 여러 의도가 한 문장에 섞이면(예: 원인+조치+재발
    # 방지) 문장 임베딩이 희석돼 항목별 유사도가 전부 어중간해진다. 절은 부모
    # 문장 인덱스를 유지해 인용 근거 선택(hits)과 호환된다.
    sent_vecs: list[tuple[tuple[float, ...], int]] = []
    for i, s in enumerate(sentences):
        units = [s]
        clauses = [c.strip() for c in re.split(r",\s*", s) if len(c.strip()) >= 6]
        if len(clauses) >= 2:
            units += clauses
        sent_vecs += [(v, i) for u in units if (v := _embed(u)) is not None]
    if not sent_vecs:
        return None

    covered: set[str] = set()
    hits: dict[str, list[int]] = {}
    for item in checklist:
        anchor_vecs = [v for a in _anchors(item) if (v := _embed(a)) is not None]
        if not anchor_vecs:
            continue
        matched = [
            i for v, i in sent_vecs
            if max(_cosine(av, v) for av in anchor_vecs) >= SEMANTIC_THRESHOLD
        ]
        if matched:
            covered.add(item["id"])
            hits[item["id"]] = matched
    return covered, hits
