"""선택 단계가 서버의 실제 장면으로 이어지는지 검증한다."""
from fastapi.testclient import TestClient

from app.main import app
from app.seed.run import seed


client = TestClient(app)
CONSENT = {"agreed": True, "storage_policy": "none"}


def test_developer_track_exposes_three_active_episodes() -> None:
    # Given: 전시용 시드를 다시 적재한 상태
    seed()

    # When: 개발자 직무 시나리오를 조회하면
    response = client.get("/api/scenarios/release-schedule-alignment")

    # Then: 선택 화면에 쓸 세 장면만 노출된다.
    assert response.status_code == 200
    titles = [episode["title"] for episode in response.json()["episodes"]]
    assert titles == [
        "프로젝트 시작 준비하기",
        "추가 기능 우선순위 정하기",
        "출시 범위와 일정 정하기",
    ]


def test_selected_episode_starts_with_that_episode() -> None:
    # Given: 개발자 직무에서 선택한 5분용 장면
    seed()
    scenarios = client.get("/api/scenarios").json()
    scenario = next(item for item in scenarios if item["slug"] == "release-schedule-alignment")
    episode = next(
        item for item in scenario["episodes"]
        if item["title"] == "추가 기능 우선순위 정하기" and 5 in item["modes"]
    )

    # When: 해당 장면을 지정해 세션을 시작하면
    response = client.post(
        "/api/sessions",
        json={
            "scenario_slug": scenario["slug"],
            "selected_episode_id": episode["id"],
            "mode": 5,
            "difficulty": "basic",
            "consent": CONSENT,
        },
    )

    # Then: 서버의 첫 질문도 선택한 장면과 동일하다.
    assert response.status_code == 200
    body = response.json()
    assert body["selected_episode_id"] == episode["id"]
    assert body["current_turn"]["episode_id"] == episode["id"]
    assert body["current_turn"]["character_id"] == "park_senior"
