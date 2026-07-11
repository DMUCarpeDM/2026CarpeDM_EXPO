"""분석 파이프라인 정확성/견고성 — Tier 1 수정 회귀.

A. 분석 중 운영자 리셋(→aborted)이 completed로 되살아나지 않는다.
B. 불량 timeline 빈(클라이언트 페이로드)이 분석을 죽이지 않는다.
C1. 쉼 없는 유창한 발화가 pause 축에서 0점 절벽으로 떨어지지 않는다.
D. 빈 체크리스트(깨진 에피소드 참조)가 좋은 답변을 감점시키지 않는다.
"""
from app.ai.response_fit import analyze_response, score_response
from app.ai.scoring import band_score
from app.ai.voice_fit import PAUSE_RATIO_BANDS
from app.core.database import SessionLocal
from app.models import Consent, RoleplaySession, Scenario, SessionStatus, Turn
from app.seed.run import seed
from app.services import report as report_service
from app.services.analysis import run_analysis
from app.services.moments import build_turn_moments


def _make_analyzing_session_with_turn(db) -> int:
    scenario = db.query(Scenario).first()
    episode = scenario.episodes[0]
    session = RoleplaySession(scenario_id=scenario.id, status=SessionStatus.analyzing)
    db.add(session)
    db.flush()
    db.add(Consent(session_id=session.id, storage_policy="anonymous", agreed=True))
    db.add(Turn(
        session_id=session.id, episode_id=episode.id, order=1,
        question_type="initial", question_text=episode.initial_question,
        character_id=episode.character_id, stt_source="text",
        response_text="안녕하세요. 결론부터 말씀드리면 로그를 먼저 확인하고 바로 보고드리겠습니다.",
    ))
    db.commit()
    return session.id


# ---- A: 분석 중 리셋 보존 ----

def test_reset_during_analysis_is_not_overwritten(monkeypatch):
    seed()
    db = SessionLocal()
    try:
        sid = _make_analyzing_session_with_turn(db)
    finally:
        db.close()

    # build_report 직후 '운영자 리셋'이 다른 세션에서 들어온 것처럼 aborted로 만든다
    orig = report_service.build_report

    def sabotage(db, session, scores, ms):
        orig(db, session, scores, ms)
        other = SessionLocal()
        try:
            other.query(RoleplaySession).filter_by(id=sid).update(
                {"status": SessionStatus.aborted}
            )
            other.commit()
        finally:
            other.close()

    monkeypatch.setattr(report_service, "build_report", sabotage)
    run_analysis(sid)

    db = SessionLocal()
    try:
        s = db.get(RoleplaySession, sid)
        assert s.status == SessionStatus.aborted, "리셋된 세션이 completed로 되살아나면 안 된다"
        assert s.report is None, "중단된 세션의 리포트는 남기지 않는다"
    finally:
        db.close()


def test_normal_analysis_still_completes():
    """리셋 가드가 정상 완료 경로를 막지 않는다 (회귀)."""
    seed()
    db = SessionLocal()
    try:
        sid = _make_analyzing_session_with_turn(db)
    finally:
        db.close()
    run_analysis(sid)
    db = SessionLocal()
    try:
        s = db.get(RoleplaySession, sid)
        assert s.status == SessionStatus.completed
        assert s.report is not None
    finally:
        db.close()


def test_new_observation_metrics_flow_into_report():
    """신규 관찰 지표가 파이프라인 끝(리포트 JSON)까지 흐른다 — 배선 회귀 방지.

    텍스트 턴만 있는 세션: delivery 카드에 구체성 행이 항상 나와야 하고,
    음성 실측이 없으므로 congruence 카드는 판정 보류(부재)여야 한다.
    """
    seed()
    db = SessionLocal()
    try:
        sid = _make_analyzing_session_with_turn(db)
    finally:
        db.close()
    run_analysis(sid)
    db = SessionLocal()
    try:
        s = db.get(RoleplaySession, sid)
        deep = s.report.deep_analysis
        delivery = deep.get("delivery")
        assert delivery is not None
        assert any("구체성" in r["label"] for r in delivery["rows"])
        assert "congruence" not in deep, "음성 실측 없는 세션에 일치도 카드가 나오면 안 된다"
    finally:
        db.close()


# ---- B: 불량 timeline 견고성 ----

def test_malformed_timeline_bin_does_not_crash():
    # 't' 없는 빈, 'front'만 있는 빈 — 예전엔 bin_["t"]가 KeyError로 분석 전체를 죽였다
    bad = [{"front": 0.1, "press": 0.5}, {"t": 2, "front": 0.1}, {"t": 4}]
    result = build_turn_moments(1, "initial", bad, None)
    assert isinstance(result, list)


# ---- C1: 쉼 절벽 제거 ----

def test_fluent_no_internal_pause_not_zeroed():
    assert band_score(0.0, *PAUSE_RATIO_BANDS) == 100.0   # 쉼 없는 유창함 = 감점 아님
    assert band_score(0.20, *PAUSE_RATIO_BANDS) == 100.0  # 적정 쉼
    assert band_score(0.70, *PAUSE_RATIO_BANDS) == 0.0    # 과도한 침묵은 여전히 감점


# ---- D: 빈 체크리스트가 좋은 답을 감점시키지 않음 ----

def test_empty_checklist_does_not_tank_good_answer():
    text = ("안녕하세요, 신입 김지연입니다. 결론부터 말씀드리면 고객사 장애 로그를 "
            "먼저 확인하겠습니다. 확인 후 원인과 조치를 바로 보고드리겠습니다.")
    m = analyze_response(text, [], use_semantic=False)  # 깨진 에피소드 = 빈 체크리스트
    assert m["has_checklist"] is False
    assert score_response(m) >= 50, "빈 체크리스트가 좋은 답변을 0점 근처로 만들면 안 된다"
