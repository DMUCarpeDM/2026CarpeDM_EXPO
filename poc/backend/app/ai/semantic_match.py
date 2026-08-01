"""로컬 임베딩 의미 매칭 — 키워드가 놓치는 패러프레이즈를 잡는다 (마스터리 ②).

"고객께 사과드립니다"는 '죄송' 키워드 없이도 사과다. 체크리스트 항목의 의미
앵커와 응답 문장을 로컬 임베딩(Ollama /api/embed 배치, 구형은 /api/embeddings
단건 폴백, API 키 무관)으로 비교해 키워드 매칭에 OR로 보탠다.

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
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError

import httpx
import numpy as np

from app.core.config import settings

# 2026-07-07 bge-m3 + 다중 앵커(예시문) + 절 단위 골든 셋 보정:
#   패러프레이즈(잡아야 함) 0.833~0.982 / 동문서답(잡으면 안 됨) 0.551~0.670
#   → 0.68~0.80 전 구간에서 4/4 인식·오탐 0. 0.69 = 오탐 경계(0.67) 바로 위 +
#   커버리지(항목 단위) 라이브 테스트 통과를 함께 만족하는 값.
# 비교 실험 기록: 단일 라벨+키워드 앵커는 양/음성이 겹쳐 분리 불가(여유 -0.016),
# nomic-embed-text는 유사도가 0.77~0.89로 뭉개져 분리 불가 → bge-m3 채택.
#
# 2026-07-29 Windows 전시 PC 재보정(WINDOWS-SETUP.md): 골든 셋을 17점으로 확충해
#   0.68~0.80 전 구간에서 인식 9/9·오탐 0 → 0.69 유지. 위 "양성 4·음성 3" 기록은
#   이 재보정으로 대체됐다(구 주석이 남아 자기 감사 문서에 오탐을 만들었다).
# 남은 한계(진짜 결함): 음성 표본에 hard negative가 없다 — 전부 무관한 답변이라
#   "사과는 했으나 조치·시점이 빠진 그럴듯한 답" 구간이 보정 집합에 빠져 있다.
#   게다가 음성 표본 일부는 키워드 채점기가 낮게 준 케이스를 재활용해 만든다
#   (calibrate_semantic.py) — 순환 보정이므로, 다음 보정은 hard negative를 사람이
#   직접 라벨링해 넣어야 의미가 있다.
SEMANTIC_THRESHOLD = 0.69
# Windows 전시 PC(i7-12700, CPU 추론) 실측: bge-m3는 요청당 고정 ~3s가 든다
# (배치 20건도 3.6s — 항목 수가 아니라 '요청 횟수'가 비용). 그래서
# ① 임베딩은 한 턴에 한 번의 배치 요청으로 모으고(_embed_many),
# ② 시간 상한은 소켓 read 타임아웃이 아니라 배치 전체 예산으로 건다 —
#    Ollama가 바이트를 찔끔찔끔 흘리면 per-recv 타임아웃은 영원히 안 터진다(실측).
PROBE_TIMEOUT_SEC = 5.0        # 요청당 고정 ~3s 실측 반영 (1.0은 명목뿐이었다)
EMBED_TIMEOUT_SEC = 2.0        # 레거시 단건 경로(/api/embeddings 폴백)의 per-recv 상한
EMBED_BATCH_BUDGET_SEC = 10.0  # 배치 한 번의 벽시계 예산 — 초과 시 브레이커·키워드 폴백
AVAILABILITY_TTL_SEC = 60.0  # 가용성 재프로브 주기 — 다운/복구를 이 주기 안에 반영
BREAKER_FAILURES = 2         # 연속 임베딩 실패 임계 — 도달 시 쿨다운 동안 즉시 폴백
BREAKER_COOLDOWN_SEC = 60.0
CACHE_MAX = 4096             # 앵커는 세션 간 반복 — 캐시 상한 도달 시 오래된 것부터 제거

_avail_state: tuple[float, bool] | None = None  # (프로브 시각 monotonic, 결과)
_fail_streak = 0
_blocked_until = 0.0  # 브레이커 개방 종료 시각 (monotonic)
_cache: dict[str, tuple[float, ...]] = {}  # 삽입 순서 유지(3.7+) → FIFO 제거
_cache_lock = threading.Lock()
# 벽시계 예산 강제용 — 예산 초과로 버려진 요청이 워커 하나를 점유해도
# 다음 배치는 남은 워커로 진행되고, 그마저 막히면 result(timeout)가 대기를 끊는다.
_embed_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="embed")


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


def _cache_put(pairs: dict[str, tuple[float, ...]]) -> None:
    """캐시에 채우고 상한 초과분은 오래된 것부터 비운다. 실패 결과는 저장하지
    않는다 — 실패가 캐시되면 Ollama 복구 후에도 앵커가 영구히 '임베딩 불가'로 남는다."""
    with _cache_lock:
        _cache.update(pairs)
        while len(_cache) > CACHE_MAX:
            _cache.pop(next(iter(_cache)))


def _record_failure() -> None:
    global _fail_streak, _blocked_until
    _fail_streak += 1
    if _fail_streak >= BREAKER_FAILURES:
        _blocked_until = time.monotonic() + BREAKER_COOLDOWN_SEC
        _fail_streak = 0
        print(f"[semantic] 임베딩 연속 실패 — {BREAKER_COOLDOWN_SEC:.0f}s 동안 키워드 폴백")


def _post_embed_batch(texts: list[str]) -> list[tuple[float, ...]]:
    """/api/embed 배치 호출 (워커 스레드에서 실행). 예외는 호출부에서 처리."""
    resp = httpx.post(
        f"{settings.ollama_base_url}/api/embed",
        json={
            "model": settings.ollama_embed_model, "input": texts,
            "keep_alive": settings.ollama_keep_alive,
        },
        timeout=EMBED_BATCH_BUDGET_SEC,  # per-recv 상한(보조) — 진짜 상한은 future 예산
    )
    resp.raise_for_status()
    embeddings = resp.json().get("embeddings") or []
    if len(embeddings) != len(texts):
        raise ValueError(f"배치 임베딩 개수 불일치: {len(embeddings)}/{len(texts)}")
    return [tuple(map(float, v)) for v in embeddings]


def _legacy_fetch(texts: list[str]) -> None:
    """구형 Ollama(/api/embed 미지원) 폴백 — 단건 순차. 브레이커가 열리면 중단."""
    for text in texts:
        if time.monotonic() < _blocked_until:
            return
        try:
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
        except Exception:
            _record_failure()
            continue
        globals()["_fail_streak"] = 0
        _cache_put({text: tuple(map(float, vec))})


def _embed_many(
    texts: list[str], budget_sec: float = EMBED_BATCH_BUDGET_SEC,
) -> dict[str, tuple[float, ...]]:
    """여러 문장을 한 번의 배치 요청으로 임베딩해 {텍스트: 벡터}를 돌려준다.

    실패한(또는 브레이커로 건너뛴) 텍스트는 결과에서 빠진다 — 호출부는 빠진
    항목을 '의미 매칭 불가'로 취급하고 키워드 판정으로 폴백한다.
    시간 상한은 future.result(timeout=예산)의 벽시계 기준: Ollama가 응답을
    천천히 흘려도 여기서 대기가 끊긴다.
    """
    global _fail_streak
    unique = list(dict.fromkeys(t for t in texts if t.strip()))
    with _cache_lock:
        missing = [t for t in unique if t not in _cache]
    if missing and time.monotonic() >= _blocked_until:
        future = _embed_pool.submit(_post_embed_batch, missing)
        try:
            vectors = future.result(timeout=budget_sec)
        except FutureTimeoutError:
            future.cancel()
            _record_failure()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:  # 구형 Ollama — 배치 엔드포인트 없음
                _legacy_fetch(missing)
            else:
                _record_failure()
        except Exception:
            _record_failure()
        else:
            _fail_streak = 0
            _cache_put(dict(zip(missing, vectors)))
    with _cache_lock:
        return {t: _cache[t] for t in unique if t in _cache}


def _embed(text: str) -> tuple[float, ...] | None:
    """단건 임베딩 + 브레이커 (배치 경로 재사용) — 보정 스크립트·외부 호출용."""
    return _embed_many([text]).get(text)


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

    # 문장 + 절 단위 — 여러 의도가 한 문장에 섞이면(예: 원인+조치+재발 방지)
    # 문장 임베딩이 희석돼 항목별 유사도가 전부 어중간해진다. 절은 부모
    # 문장 인덱스를 유지해 인용 근거 선택(hits)과 호환된다.
    unit_pairs: list[tuple[str, int]] = []
    for i, s in enumerate(sentences):
        units = [s]
        clauses = [c.strip() for c in re.split(r",\s*", s) if len(c.strip()) >= 6]
        if len(clauses) >= 2:
            units += clauses
        unit_pairs += [(u, i) for u in units]

    # 발화 유닛 + 앵커 전부를 한 번의 배치 요청으로 — 이 PC 실측상 임베딩
    # 비용은 항목 수가 아니라 요청 횟수가 지배한다 (단건 3s ≈ 배치 20건 3.6s).
    anchor_texts = {item["id"]: _anchors(item) for item in checklist}
    all_texts = [u for u, _ in unit_pairs]
    for anchors in anchor_texts.values():
        all_texts += anchors
    vecs = _embed_many(all_texts)

    sent_vecs = [(vecs[u], i) for u, i in unit_pairs if u in vecs]
    if not sent_vecs:
        return None

    covered: set[str] = set()
    hits: dict[str, list[int]] = {}
    for item in checklist:
        anchor_vecs = [vecs[a] for a in anchor_texts[item["id"]] if a in vecs]
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
