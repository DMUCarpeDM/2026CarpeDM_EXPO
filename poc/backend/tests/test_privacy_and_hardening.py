"""G5 통합 봉합 검증 — verbatim 파기·타임라인 타입 가드·modes 마이그레이션·업로드 상한·기관 모드 가드.

리뷰 보드가 확인한 결함의 회귀 방지: '미저장' 동의의 발화 원문 잔존 사본(#9 MAJOR),
타임라인 타입 오염 포이즌필(#11 MAJOR), 구형 DB modes 포맷 크래시(#7 BLOCKER),
오디오 업로드 무제한(#9 MAJOR), require_admin 두 인증 모델의 합성 계약.
"""
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.main import _purge_expired_quotes, app
from app.models import Consent, Episode, Report, RoleplaySession, Scenario, SessionStatus, utcnow
from app.seed.run import _migrate_modes_json, seed
from app.services import moments
from app.services.analysis import strip_turn_verbatim

client = TestClient(app)

pytestmark = pytest.mark.usefixtures("ready_ollama")

CONSENT = {"agreed": True, "storage_policy": "none"}


def _create() -> dict:
    return client.post(
        "/api/sessions",
        json={"mode": 5, "difficulty": "basic", "consent": CONSENT},
    ).json()


# ---- '미저장' 파기: 턴 레벨 verbatim ----

def test_strip_turn_verbatim_removes_utterance_copies():
    metrics = {
        "quotes": {"best": {"text": "발화 원문", "score": 88}, "worst": {"text": "원문2", "score": 12}},
        "politeness": {"banmal_quotes": ["야 이거"], "formal_pct": 0.9},
        "alignment": {"spans": [{"start": 0.0, "end": 1.2, "text": "호흡 단위 원문"}]},
        "speech_rate": 4.2,
    }
    out = strip_turn_verbatim(metrics)
    assert "text" not in out["quotes"]["best"]
    assert out["quotes"]["best"]["score"] == 88
    assert "banmal_quotes" not in out["politeness"]
    assert out["politeness"]["formal_pct"] == 0.9
    assert "text" not in out["alignment"]["spans"][0]
    assert out["alignment"]["spans"][0]["end"] == 1.2
    assert out["speech_rate"] == 4.2
    assert metrics["quotes"]["best"]["text"] == "발화 원문", "원본을 제자리 변형하면 안 된다"


def test_strip_turn_verbatim_tolerates_missing_sections():
    assert strip_turn_verbatim({}) == {}
    assert strip_turn_verbatim({"quotes": None, "alignment": {"spans": None}}) == {
        "quotes": None, "alignment": {"spans": None},
    }


# ---- '미저장' 파기: 보관 만료 리포트 인용 ----

def test_purge_expired_quotes_blanks_none_policy_reports():
    seed()
    seg = [{"quote": "발화 원문", "observed": "관찰", "fit_type": "response"}]
    db = SessionLocal()
    try:
        scenario = db.query(Scenario).first()
        old = RoleplaySession(
            scenario_id=scenario.id, status=SessionStatus.completed,
            ended_at=utcnow() - timedelta(days=settings.media_retention_days + 1),
        )
        fresh = RoleplaySession(
            scenario_id=scenario.id, status=SessionStatus.completed, ended_at=utcnow(),
        )
        db.add_all([old, fresh])
        db.flush()
        db.add(Consent(session_id=old.id, agreed=True, storage_policy="none"))
        db.add(Consent(session_id=fresh.id, agreed=True, storage_policy="none"))
        db.add(Report(
            session_id=old.id, total_score=70.0,
            evidence_segments=seg, rebuild={"quote": "원문"}, headline={"sentence": "s"},
        ))
        db.add(Report(session_id=fresh.id, total_score=70.0, evidence_segments=seg))
        db.commit()
        old_id, fresh_id = old.id, fresh.id
    finally:
        db.close()

    _purge_expired_quotes()

    db = SessionLocal()
    try:
        old_r = db.query(Report).filter_by(session_id=old_id).first()
        fresh_r = db.query(Report).filter_by(session_id=fresh_id).first()
        assert old_r.evidence_segments == [] and old_r.rebuild == {} and old_r.headline == {}
        assert old_r.total_score == 70.0, "KPI 집계 수치는 보존한다"
        assert fresh_r.evidence_segments, "보관 기간 내 리포트는 열람을 위해 남긴다"
    finally:
        db.close()


# ---- 타임라인 타입 오염 가드 ----

def test_runs_survives_type_polluted_timeline_bins():
    timeline = [
        {"t": "2", "front": 0.1},      # t가 문자열 — 산술에서 TypeError였던 페이로드
        {"t": 4, "front": "0.1"},      # 값이 문자열 — 비교에서 TypeError였던 페이로드
        {"front": 0.2},                 # t 누락
        {"t": None, "front": None},
        {"t": True, "front": 0.1},      # bool은 int의 서브클래스 — 시각으로 취급하지 않는다
        {"t": 6, "front": 0.1},
        {"t": 8, "front": 0.1},
        {"t": 10, "front": 0.1},
    ]
    runs = moments._runs(timeline, "front", lambda v: v < 0.5)
    assert runs and runs[0]["start"] == 6, "오염 빈이 있어도 정상 빈의 연속 구간은 감지된다"


# ---- 구형 DB modes 포맷 마이그레이션 ----

def test_migrate_modes_json_converts_legacy_text_rows():
    seed()
    with engine.begin() as conn:
        conn.execute(text("UPDATE episodes SET modes = '5,10'"))
        conn.execute(text(
            "UPDATE episodes SET modes = '' WHERE id = (SELECT MIN(id) FROM episodes)"
        ))

    _migrate_modes_json()

    db = SessionLocal()
    try:
        episodes = db.query(Episode).all()  # 구형 포맷이 남아 있으면 여기서 JSONDecodeError
        values = {tuple(ep.modes) if isinstance(ep.modes, list) else ep.modes for ep in episodes}
        assert values <= {(5, 10), ()}, f"콤마 문자열이 JSON 배열로 변환돼야 한다: {values}"
    finally:
        db.close()

    seed()  # 시드가 정본 데이터로 복원 (다른 테스트에 오염을 남기지 않는다)


# ---- 오디오 업로드 상한 ----

def test_upload_audio_rejects_oversized_payload(monkeypatch):
    from app.api import sessions as sessions_api

    seed()
    a = _create()
    sid, token = a["id"], a["access_token"]
    turn_id = a["current_turn"]["id"]
    monkeypatch.setattr(sessions_api, "MAX_AUDIO_BYTES", 1024)
    resp = client.post(
        f"/api/sessions/{sid}/turns/{turn_id}/audio",
        files={"file": ("a.wav", b"x" * 2048, "audio/wav")},
        headers={"X-Session-Token": token},
    )
    assert resp.status_code == 413


# ---- 관리자 가드: 두 인증 모델의 합성 ----

def test_admin_institution_mode_ignores_ops_token(monkeypatch):
    """기관 모드(admin_auth_required)에서는 role='admin' JWT만 유효 — 운영 토큰으로 우회 불가."""
    seed()
    monkeypatch.setattr(settings, "admin_auth_required", True)
    monkeypatch.setattr(settings, "admin_token", "expo-secret")
    resp = client.post("/api/admin/reset", headers={"X-Admin-Token": "expo-secret"})
    assert resp.status_code == 403
