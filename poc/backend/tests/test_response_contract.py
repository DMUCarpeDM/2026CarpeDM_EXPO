"""/response 계약 위반이 '깨끗한 422'로 표면화되는지 — 500 둔갑 회귀 방지.

MVP가 오디오를 포함한 멀티파트를 /response로 보내던 통합 결함에서 발견:
검증 에러의 input에 업로드 바이트가 담기면 기본 인코더가 UTF-8 디코드로
크래시해 422가 500(Internal Server Error, 본문 없음)으로 둔갑했다.
클라이언트 개발자가 원인을 알 수 없게 만드는 부류의 결함이라 계약 테스트로 고정한다.
"""
from fastapi.testclient import TestClient

from app.main import app
from app.seed.run import seed

client = TestClient(app)


def _create_session() -> dict:
    seed()
    scenario = client.get("/api/scenarios").json()[0]
    r = client.post("/api/sessions", json={
        "difficulty": "basic", "mode": 5, "scenario_slug": scenario["slug"],
        "client_key": "demo-contract-test",
        "consent": {"agreed": True, "storage_policy": "none"},
    })
    assert r.status_code == 200, r.text
    return r.json()


def test_multipart_to_response_endpoint_returns_clean_422():
    session = _create_session()
    turn = session["current_turn"]
    binary = bytes(range(256)) * 8  # UTF-8로 디코드 불가능한 바이트 포함

    r = client.post(
        f"/api/sessions/{session['id']}/turns/{turn['id']}/response",
        headers={"X-Session-Token": session["access_token"]},
        data={"text": "결론부터 말씀드립니다.", "stt_source": "webspeech", "duration_ms": "1000"},
        files={"audio": ("turn.webm", binary, "audio/webm")},
    )

    assert r.status_code == 422, f"멀티파트 오발송은 422여야 한다 (500 둔갑 금지): {r.status_code}"
    body = r.json()  # JSON 본문이 있어야 클라이언트가 원인을 읽을 수 있다
    assert "detail" in body
    # 바이너리 입력은 원문 대신 크기 표기로 치환된다
    assert "bytes>" in str(body) or "body" in str(body)


def test_correct_two_call_contract_still_works():
    session = _create_session()
    turn = session["current_turn"]

    audio = client.post(
        f"/api/sessions/{session['id']}/turns/{turn['id']}/audio",
        headers={"X-Session-Token": session["access_token"]},
        files={"file": ("turn.wav", b"RIFF\x00\x00\x00\x00WAVE", "audio/wav")},
    )
    assert audio.status_code == 200, audio.text

    r = client.post(
        f"/api/sessions/{session['id']}/turns/{turn['id']}/response",
        headers={"X-Session-Token": session["access_token"]},
        json={"text": "결론부터 말씀드리면 조치가 완료됐습니다.",
              "stt_source": "webspeech", "duration_ms": 1200, "nonverbal": None},
    )
    assert r.status_code == 200, r.text
    assert "finished" in r.json()
