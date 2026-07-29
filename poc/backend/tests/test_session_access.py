"""세션 접근 보안 — 능력 토큰(IDOR 차단)·동의 게이트·미저장 파기·설정 안전장치·E2E 리포트."""
from fastapi.testclient import TestClient
import pytest

from app.core.config import settings
from app.core.database import SessionLocal
from app.main import _assert_secure_config, app
from app.models import RoleplaySession, SessionStatus, Turn
from app.seed.run import seed

pytestmark = pytest.mark.usefixtures("ready_ollama")

client = TestClient(app)

CONSENT = {"agreed": True, "storage_policy": "none"}


def _create() -> dict:
    return client.post(
        "/api/sessions",
        json={"mode": 5, "difficulty": "basic", "consent": CONSENT},
    ).json()


def test_session_endpoints_require_matching_token():
    seed()
    a = _create()
    b = _create()
    sid, token = a["id"], a["access_token"]
    assert token, "생성 응답에 세션 능력 토큰이 있어야 한다"
    # 토큰 없음 → 403
    assert client.get(f"/api/sessions/{sid}").status_code == 403
    # 남의 토큰 → 403 (IDOR 차단: 순차 id 열거로 타인 세션 열람 불가)
    assert client.get(
        f"/api/sessions/{sid}", headers={"X-Session-Token": b["access_token"]}
    ).status_code == 403
    # 내 토큰 → 200
    assert client.get(
        f"/api/sessions/{sid}", headers={"X-Session-Token": token}
    ).status_code == 200
    # progress도 동일하게 보호된다
    assert client.get(f"/api/sessions/{sid}/progress").status_code == 403


def test_unknown_session_is_404_even_without_token():
    seed()
    assert client.get("/api/sessions/999999").status_code == 404


def test_survey_requires_session_token():
    """설문도 다른 세션 API처럼 능력 토큰을 요구한다 — id 열거로 타인 세션의
    KPI 설문을 위조·덮어쓰기하는 IDOR 차단."""
    seed()
    a = _create()
    body = {"q_clarity": 5, "q_empathy": 4, "q_personalization": 5, "comment": "좋았어요"}
    assert client.post(f"/api/sessions/{a['id']}/survey", json=body).status_code == 403
    assert client.post(
        f"/api/sessions/{a['id']}/survey", json=body,
        headers={"X-Session-Token": a["access_token"]},
    ).status_code == 201


def test_consent_gate_blocks_without_agreement():
    seed()
    r = client.post(
        "/api/sessions",
        json={
            "mode": 5,
            "difficulty": "basic",
            "consent": {"agreed": False, "storage_policy": "none"},
        },
    )
    assert r.status_code == 400


def test_response_text_length_is_bounded():
    seed()
    a = _create()
    r = client.post(
        f"/api/sessions/{a['id']}/turns/{a['current_turn']['id']}/response",
        json={"text": "가" * 5000, "stt_source": "text", "duration_ms": 3000},
        headers={"X-Session-Token": a["access_token"]},
    )
    assert r.status_code == 422  # max_length 초과 → 무한 저장·DoS 차단


def test_transcript_purged_and_report_available_on_none_consent():
    """미저장 동의: 대화 전문은 파기하되 집계 리포트는 남는다. (겸 E2E 리포트 경로 커버)"""
    seed()
    a = _create()
    sid = a["id"]
    auth = {"X-Session-Token": a["access_token"]}
    answer = "안녕하세요, 신입 김지연입니다. 오늘 목표는 개발 환경 셋업이고 우선 로그부터 확인하겠습니다."
    client.post(
        f"/api/sessions/{sid}/turns/{a['current_turn']['id']}/response",
        json={"text": answer, "stt_source": "text", "duration_ms": 8000},
        headers=auth,
    )
    client.post(f"/api/sessions/{sid}/finish", headers=auth)
    # 배경 분석 타이밍에 의존하지 않게 동기 완료 보장 (run_analysis는 멱등)
    from app.services.analysis import run_analysis

    run_analysis(sid)

    # E2E: 리포트 엔드포인트가 실제로 응답한다 (기존 커버리지 공백 — reports.py 첫 HTTP 검증)
    rep = client.get(f"/api/sessions/{sid}/report", headers=auth)
    assert rep.status_code == 200
    assert rep.json()["total_score"] >= 0

    # 미저장 동의 → 발화 전문 파기, 세션·리포트(집계)는 유지
    db = SessionLocal()
    try:
        turns = db.query(Turn).filter_by(session_id=sid).all()
        assert turns and all(t.response_text == "" for t in turns)
        sess = db.get(RoleplaySession, sid)
        assert sess.status == SessionStatus.completed
        assert sess.report is not None
    finally:
        db.close()


def test_require_secure_rejects_insecure_config(monkeypatch):
    monkeypatch.setattr(settings, "require_secure", True)
    monkeypatch.setattr(settings, "jwt_secret", "change-me-in-production")
    monkeypatch.setattr(settings, "admin_token", "")
    raised = False
    try:
        _assert_secure_config()
    except RuntimeError:
        raised = True
    assert raised, "require_secure면 기본 시크릿·빈 토큰으로 기동을 거부해야 한다"

    # 안전한 설정이면 통과
    monkeypatch.setattr(settings, "jwt_secret", "a-real-random-secret")
    monkeypatch.setattr(settings, "admin_token", "expo-secret")
    _assert_secure_config()
