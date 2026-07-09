"""전시 운영/기관 대시보드 API 골격 (R-HYJRLN, R-NCULBP).

인증: 전시 모드(admin_auth_required=False)에서는 무인증 허용(로컬 단독 키오스크),
기관 모드에서는 role='admin' JWT를 강제한다. 파괴적/유출성 행위는 audit_events에 기록.
"""
import csv
import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, aliased

from app.api.deps import require_admin
from app.core.database import get_db
from app.models import (
    AnalysisResult,
    AuditEvent,
    Report,
    RoleplaySession,
    SessionStatus,
    SurveyResponse,
    User,
)
from app.schemas import AdminMetricsOut

router = APIRouter(prefix="/admin", tags=["admin"])

ACTIVE = (SessionStatus.ready, SessionStatus.in_progress, SessionStatus.analyzing)


def _audit(db: Session, user: User | None, action: str, payload: dict) -> None:
    db.add(AuditEvent(user_id=user.id if user else None, action=action, payload=payload))
    db.commit()


@router.post("/reset")
def exhibition_reset(
    db: Session = Depends(get_db),
    user: User | None = Depends(require_admin),
):
    """1클릭 초기화 (S-CTECCW): 진행 중인 세션을 모두 중단하고 다음 체험자를 준비."""
    aborted = (
        db.query(RoleplaySession)
        .filter(RoleplaySession.status.in_(ACTIVE))
        .update({"status": SessionStatus.aborted}, synchronize_session=False)
    )
    db.commit()
    _audit(db, user, "exhibition_reset", {"aborted_sessions": aborted})
    return {"ok": True, "aborted_sessions": aborted}


@router.get("/export.csv")
def export_csv(
    db: Session = Depends(get_db),
    user: User | None = Depends(require_admin),
):
    """익명 집계 CSV 내보내기 (S-BHJBJS) — 개인 식별 정보(client_key 등) 제외."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "session_id", "started_at", "mode_min", "difficulty", "attempt_no", "status",
        "total_score", "response_fit", "voice_fit", "eye_fit", "posture_fit",
        "engine_version", "analysis_ms",
    ])
    sessions = db.query(RoleplaySession).order_by(RoleplaySession.id).all()
    for s in sessions:
        report = s.report
        fits = report.fit_scores if report else {}
        writer.writerow([
            s.id,
            s.started_at.isoformat(timespec="seconds") if s.started_at else "",
            s.mode,
            s.difficulty,
            s.attempt_no,
            s.status.value,
            report.total_score if report else "",
            *[fits.get(f, {}).get("score", "") if report else "" for f in
              ("response", "voice", "eye", "posture")],
            report.engine_version if report else "",
            report.analysis_ms if report else "",
        ])
    buf.seek(0)
    _audit(db, user, "export_csv", {"rows": len(sessions)})
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=mirroting_sessions.csv"},
    )


@router.get("/metrics", response_model=AdminMetricsOut)
def metrics(
    db: Session = Depends(get_db),
    user: User | None = Depends(require_admin),
):
    total = db.query(func.count(RoleplaySession.id)).scalar() or 0
    completed = (
        db.query(func.count(RoleplaySession.id))
        .filter(RoleplaySession.status == SessionStatus.completed)
        .scalar() or 0
    )

    # 재도전율: 같은 client_key로 2회 이상 수행한 세션 비율 근사 (하위 호환)
    distinct_clients = (
        db.query(func.count(func.distinct(RoleplaySession.client_key))).scalar() or 0
    )
    retry_rate = round(1 - distinct_clients / total, 3) if total else 0.0

    # 2차 수행률 (KPI): 1차 수행 대비 2차 도전 비율 — attempt_no 기반 정확 집계
    first_attempts = (
        db.query(func.count(RoleplaySession.id))
        .filter(RoleplaySession.attempt_no == 1)
        .scalar() or 0
    )
    second_attempts = (
        db.query(func.count(RoleplaySession.id))
        .filter(RoleplaySession.attempt_no == 2)
        .scalar() or 0
    )
    second_attempt_rate = round(second_attempts / first_attempts, 3) if first_attempts else 0.0

    # 1차→2차 평균 점수 개선 (KPI): 같은 참여자×시나리오×모드의 리포트 점수 차 평균
    s1, s2 = aliased(RoleplaySession), aliased(RoleplaySession)
    r1, r2 = aliased(Report), aliased(Report)
    avg_improvement = (
        db.query(func.avg(r2.total_score - r1.total_score))
        .select_from(s1)
        .join(s2, (s2.client_key == s1.client_key)
              & (s2.scenario_id == s1.scenario_id)
              & (s2.mode == s1.mode)
              & (s2.attempt_no == 2))
        .join(r1, r1.session_id == s1.id)
        .join(r2, r2.session_id == s2.id)
        .filter(s1.attempt_no == 1)
        .scalar()
    )

    avg_total = db.query(func.avg(Report.total_score)).scalar()
    avg_ms = db.query(func.avg(Report.analysis_ms)).scalar()

    # fit별 평균 — 정량의 단일 진실인 analysis_results(세션 레벨)에서 SQL 집계
    avg_fit_scores = {
        fit.value: round(avg, 1)
        for fit, avg in db.query(AnalysisResult.fit_type, func.avg(AnalysisResult.score))
        .filter(AnalysisResult.turn_id.is_(None))
        .group_by(AnalysisResult.fit_type)
        .all()
    }

    # 만족도 설문 평균 (KPI 3종) — 미응답(NULL)은 AVG가 자동 제외
    sc, se, sp = db.query(
        func.avg(SurveyResponse.q_clarity),
        func.avg(SurveyResponse.q_empathy),
        func.avg(SurveyResponse.q_personalization),
    ).one()
    survey_avg = {
        "clarity": round(sc, 2) if sc is not None else None,
        "empathy": round(se, 2) if se is not None else None,
        "personalization": round(sp, 2) if sp is not None else None,
    }

    return AdminMetricsOut(
        sessions_total=total,
        sessions_completed=completed,
        completion_rate=round(completed / total, 3) if total else 0.0,
        retry_rate=retry_rate,
        second_attempt_rate=second_attempt_rate,
        avg_total_score=round(avg_total, 1) if avg_total is not None else None,
        avg_analysis_ms=round(avg_ms, 0) if avg_ms is not None else None,
        avg_fit_scores=avg_fit_scores,
        avg_improvement=round(avg_improvement, 1) if avg_improvement is not None else None,
        survey_avg=survey_avg,
    )
