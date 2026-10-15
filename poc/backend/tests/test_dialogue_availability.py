"""대화 엔진 가용성 — 생성 오류 시 같은 턴을 보존하고 재시도한다."""
from fastapi.testclient import TestClient

from app.main import app
from app.seed.run import seed
from app.services.dialogue.gemini_provider import GeminiDialogueProvider
from app.services.dialogue.openai_provider import DialogueGenerationError, OpenAIDialogueProvider

CONSENT = {"consent": {"agreed": True, "storage_policy": "none"}}


def _create(client: TestClient) -> dict:
    # 기존 직장 시나리오로 대화 생성 장애 시 준비된 목표 대사 폴백을 검증한다.
    result = client.post("/api/sessions", json={
        "mode": 5, "difficulty": "basic", "service_mode": "workplace",
        "scenario_slug": "release-schedule-alignment", **CONSENT,
    })
    assert result.status_code == 200, result.text
    return result.json()


def test_create_session_starts_with_existing_episode_line():
    """첫 대사는 외부 API 상태와 무관하게 기존 에피소드 대사로 시작한다."""
    seed()
    data = _create(TestClient(app))
    assert data["current_turn"]["question_type"] == "initial"
    assert data["current_turn"]["question_text"]


def test_session_reports_dialogue_outage_after_the_first_answer(monkeypatch):
    """실패한 제출은 진행도에 반영하지 않고 같은 턴에서 다시 시도한다."""
    def boom(*_args, **_kwargs):
        raise DialogueGenerationError("대화 모델 연결을 확인해 주세요")

    monkeypatch.setattr(OpenAIDialogueProvider, "next_question", boom)
    monkeypatch.setattr(GeminiDialogueProvider, "next_question", boom)
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
    resumed = client.get(f"/api/sessions/{data['id']}", headers={"X-Session-Token": data["access_token"]}).json()
    assert resumed["history"] == []
    assert resumed["current_turn"]["id"] == data["current_turn"]["id"]
