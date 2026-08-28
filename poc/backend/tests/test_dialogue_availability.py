"""대화 엔진 가용성 — 첫 대사는 고정, 이후 GPT-4o 오류는 명확히 알린다."""
from fastapi.testclient import TestClient

from app.main import app
from app.seed.run import seed
from app.services.dialogue.openai_provider import DialogueGenerationError, OpenAIDialogueProvider

CONSENT = {"consent": {"agreed": True, "storage_policy": "none"}}


def _create(client: TestClient) -> dict:
    result = client.post("/api/sessions", json={"mode": 5, "difficulty": "basic", **CONSENT})
    assert result.status_code == 200, result.text
    return result.json()


def test_create_session_starts_with_existing_episode_line():
    """첫 대사는 GPT-4o 상태와 무관하게 기존 에피소드 대사로 시작한다."""
    seed()
    data = _create(TestClient(app))
    assert data["current_turn"]["question_type"] == "initial"
    assert data["current_turn"]["question_text"]


def test_session_reports_gpt4o_outage_after_the_first_answer(monkeypatch):
    """역할극 대사 생성 실패는 템플릿으로 바꾸지 않고 503으로 알린다."""
    monkeypatch.setattr(
        OpenAIDialogueProvider,
        "next_question",
        lambda *_args: (_ for _ in ()).throw(DialogueGenerationError("GPT-4o 연결을 확인해 주세요")),
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
    assert result.status_code == 503
    assert result.json()["detail"] == "GPT-4o 연결을 확인해 주세요"
