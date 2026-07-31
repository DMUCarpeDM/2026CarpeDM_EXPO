"""배치 임베딩 경로 회귀 테스트.

배경: Windows 전시 PC 실측에서 bge-m3 임베딩이 '요청당' 고정 ~3s로,
앵커를 단건 순차 요청하던 구조는 첫 턴을 1분 이상 지연시켰다. 또한 Ollama가
응답 바이트를 천천히 흘리면 httpx per-recv 타임아웃이 영원히 안 터진다.
그래서 ① 한 턴의 임베딩은 한 번의 배치 요청, ② 상한은 벽시계 예산
(future.result(timeout))으로 강제한다. 그 계약을 여기서 고정한다.
"""
import time

import httpx
import pytest

from app.ai import semantic_match


@pytest.fixture(autouse=True)
def _reset_state():
    semantic_match._cache.clear()
    semantic_match._fail_streak = 0
    semantic_match._blocked_until = 0.0
    semantic_match._avail_state = None
    yield
    semantic_match._cache.clear()
    semantic_match._fail_streak = 0
    semantic_match._blocked_until = 0.0
    semantic_match._avail_state = None


def _ok_batch_response(url: str, texts: list[str]) -> httpx.Response:
    return httpx.Response(
        200,
        json={"embeddings": [[float(len(t)), 1.0, 0.0] for t in texts]},
        request=httpx.Request("POST", url),
    )


def test_batch_is_one_request_and_primes_cache(monkeypatch):
    calls = []

    def fake_post(url, json=None, timeout=None):
        calls.append((url, json))
        return _ok_batch_response(url, json["input"])

    monkeypatch.setattr(semantic_match.httpx, "post", fake_post)

    got = semantic_match._embed_many(["결론 보고", "일정 공유", "결론 보고"])
    assert set(got) == {"결론 보고", "일정 공유"}
    assert len(calls) == 1
    assert calls[0][0].endswith("/api/embed")
    assert calls[0][1]["input"] == ["결론 보고", "일정 공유"]  # 중복 제거 + 순서 유지

    # 두 번째 호출은 전부 캐시 — HTTP 없음
    got2 = semantic_match._embed_many(["결론 보고", "일정 공유"])
    assert got2 == got
    assert len(calls) == 1


def test_budget_timeout_opens_breaker_and_stops_calls(monkeypatch):
    attempts = []

    def slow_batch(texts):
        attempts.append(list(texts))
        time.sleep(0.6)
        return [(0.0, 0.0, 0.0) for _ in texts]

    monkeypatch.setattr(semantic_match, "_post_embed_batch", slow_batch)

    assert semantic_match._embed_many(["느린 문장"], budget_sec=0.05) == {}
    assert semantic_match._embed_many(["느린 문장"], budget_sec=0.05) == {}
    # BREAKER_FAILURES(2) 도달 — 쿨다운 동안 시도 자체가 없어야 한다
    assert semantic_match._blocked_until > time.monotonic()
    n = len(attempts)
    assert semantic_match._embed_many(["느린 문장"], budget_sec=0.05) == {}
    assert len(attempts) == n


def test_batch_404_falls_back_to_legacy_singles(monkeypatch):
    calls = []

    def fake_post(url, json=None, timeout=None):
        calls.append(url)
        if url.endswith("/api/embed"):
            return httpx.Response(404, request=httpx.Request("POST", url))
        return httpx.Response(
            200, json={"embedding": [0.5, 0.5, 0.0]},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(semantic_match.httpx, "post", fake_post)

    got = semantic_match._embed_many(["구형 폴백 문장"])
    assert got == {"구형 폴백 문장": (0.5, 0.5, 0.0)}
    assert [u.split("/api/")[1] for u in calls] == ["embed", "embeddings"]


def test_single_embed_reuses_batch_cache(monkeypatch):
    calls = []

    def fake_post(url, json=None, timeout=None):
        calls.append(url)
        return _ok_batch_response(url, json["input"])

    monkeypatch.setattr(semantic_match.httpx, "post", fake_post)

    semantic_match._embed_many(["앵커 문장"])
    assert semantic_match._embed("앵커 문장") is not None
    assert len(calls) == 1
