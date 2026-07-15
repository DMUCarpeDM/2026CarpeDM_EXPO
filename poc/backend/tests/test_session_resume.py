"""세션 복구 API — 새로고침·크래시 후 진행 상태와 턴 이력을 되돌려준다."""
from fastapi.testclient import TestClient

from app.main import app
from app.seed.run import seed

client = TestClient(app)


def _create_session() -> dict:
    return client.post("/api/sessions", json={
        "mode": 5,
        "difficulty": "basic",
        "consent": {"agreed": True, "storage_policy": "none"},
    }).json()


def test_resume_returns_current_turn_and_history():
    seed()
    created = _create_session()
    sid = created["id"]
    auth = {"X-Session-Token": created["access_token"]}
    first_turn = created["current_turn"]

    answer = (
        "안녕하세요, 신입 김지연입니다. 플랫폼팀 운영 지원을 맡았고 "
        "오늘 목표는 개발 환경 셋업입니다. 잘 부탁드립니다."
    )
    result = client.post(
        f"/api/sessions/{sid}/turns/{first_turn['id']}/response",
        json={"text": answer, "stt_source": "text", "duration_ms": 8000},
        headers=auth,
    ).json()
    assert result["finished"] is False

    resumed = client.get(f"/api/sessions/{sid}", headers=auth).json()
    assert resumed["status"] == "in_progress"
    assert resumed["current_turn"]["id"] == result["next_turn"]["id"]
    assert len(resumed["history"]) == 1
    assert resumed["history"][0]["id"] == first_turn["id"]
    assert resumed["history"][0]["response_text"] == answer
    assert resumed["history"][0]["episode_title"]
    assert resumed["elapsed_sec"] >= 0
    assert resumed["scenario"]["characters"], "복원 화면 렌더에 캐릭터 정보가 필요하다"


def test_resume_unknown_session_is_404():
    seed()
    assert client.get("/api/sessions/999999").status_code == 404
