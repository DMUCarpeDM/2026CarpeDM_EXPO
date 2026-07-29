"""대화 엔진 가용성 — 개인화(LLM)가 죽어도 체험은 죽지 않는다.

전시 원칙: 시작 게이트(dialogue_require_ollama)는 운영 정책이지만, 게이트를
통과한 뒤의 세션은 Ollama가 내려가도 템플릿 대본 폴백으로 끝까지 진행된다.
예전 동작(개인화 실패 → rollback + 503)은 방문객이 방금 말한 답변을 통째로
버리고 체험을 벽돌로 만들었다 — 그 회귀를 여기서 막는다.
"""
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.seed.run import seed
from app.services.dialogue.ollama_provider import OllamaDialogueProvider

CONSENT = {"consent": {"agreed": True, "storage_policy": "none"}}


def _create(client: TestClient) -> dict:
    result = client.post("/api/sessions", json={"mode": 5, "difficulty": "basic", **CONSENT})
    assert result.status_code == 200, result.text
    return result.json()


def test_create_session_starts_with_template_when_gate_disabled(monkeypatch):
    """게이트 off + Ollama 부재 → 503이 아니라 템플릿 대본으로 시작한다."""
    monkeypatch.setattr(settings, "dialogue_provider", "template")
    monkeypatch.setattr(settings, "dialogue_require_ollama", False)
    seed()
    data = _create(TestClient(app))
    assert data["current_turn"]["question_text"]  # 템플릿 초기 질문 그대로


def test_session_survives_personalization_outage_mid_run(monkeypatch):
    """진행 중 Ollama 사망 시나리오 — 답변 제출이 503으로 버려지지 않는다."""
    from app.api import sessions

    monkeypatch.setattr(settings, "dialogue_provider", "ollama")
    monkeypatch.setattr(sessions, "ollama_dialogue_ready", lambda: True)
    # 개인화가 전부 실패하는 상태 (연결 끊김·타임아웃과 동일한 반환 계약)
    monkeypatch.setattr(
        OllamaDialogueProvider, "personalize_question",
        lambda _self, spec, *_a, **_k: None,
    )
    seed()
    client = TestClient(app)
    data = _create(client)

    result = client.post(
        f"/api/sessions/{data['id']}/turns/{data['current_turn']['id']}/response",
        json={
            "text": "안녕하십니까, 오늘 합류한 신입 개발자입니다. 온보딩 문서 파악과 장애 대응 참관을 목표로 하겠습니다.",
            "stt_source": "text", "duration_ms": 8000,
        },
        headers={"X-Session-Token": data["access_token"]},
    )
    assert result.status_code == 200, result.text
    body = result.json()
    # 대화가 계속된다 — 다음 턴 질문은 템플릿 대본이라도 반드시 존재한다
    assert body["finished"] is False
    assert body["next_turn"]["question_text"]


def test_strict_gate_still_blocks_session_start(monkeypatch):
    """기본값(require_ollama=True)에서는 기존 운영 게이트가 유지된다."""
    monkeypatch.setattr(settings, "dialogue_provider", "template")  # ready 프로브 False
    monkeypatch.setattr(settings, "dialogue_require_ollama", True)
    seed()
    result = TestClient(app).post(
        "/api/sessions", json={"mode": 5, "difficulty": "basic", **CONSENT},
    )
    assert result.status_code == 503
