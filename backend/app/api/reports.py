from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import AnalysisResult, Report, RoleplaySession, SessionStatus
from app.schemas import ReportOut

router = APIRouter(prefix="/sessions", tags=["reports"])


def _turn_breakdown(db: Session, session: RoleplaySession) -> list[dict]:
    """턴별 4-Fit 점수 분해 — 리포트 타임라인용."""
    results = db.scalars(
        select(AnalysisResult).where(
            AnalysisResult.session_id == session.id,
            AnalysisResult.turn_id.is_not(None),
        )
    ).all()
    scores_by_turn: dict[int, dict[str, float]] = {}
    for r in results:
        scores_by_turn.setdefault(r.turn_id, {})[r.fit_type.value] = round(r.score, 1)
    breakdown = []
    for turn in session.turns:
        if turn.id not in scores_by_turn:
            continue
        breakdown.append({
            "turn_order": turn.order,
            "question_type": turn.question_type,
            "episode_title": turn.episode.title,
            "question": turn.question_text[:60],
            "scores": scores_by_turn[turn.id],
        })
    return breakdown


@router.get("/{session_id}/report", response_model=ReportOut)
def get_report(session_id: int, db: Session = Depends(get_db)):
    session = db.get(RoleplaySession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다")
    report = session.report
    if report is None:
        raise HTTPException(status_code=404, detail="리포트가 아직 생성되지 않았습니다")

    # 직전 결과 비교 (S-AIFLSE, S-FFQILY): 같은 클라이언트·시나리오·모드의 직전 완료 세션
    previous = None
    prev_session = (
        db.query(RoleplaySession)
        .filter(
            RoleplaySession.client_key == session.client_key,
            RoleplaySession.scenario_id == session.scenario_id,
            RoleplaySession.mode == session.mode,
            RoleplaySession.status == SessionStatus.completed,
            RoleplaySession.id < session.id,
        )
        .order_by(RoleplaySession.id.desc())
        .first()
    )
    if prev_session and prev_session.report:
        prev_report: Report = prev_session.report
        previous = {
            "session_id": prev_session.id,
            "total_score": prev_report.total_score,
            "fit_scores": {
                fit: data.get("score") for fit, data in prev_report.fit_scores.items()
            },
        }

    return ReportOut(
        session_id=session.id,
        total_score=report.total_score,
        fit_scores=report.fit_scores,
        strengths=report.strengths,
        improvements=report.improvements,
        evidence_segments=report.evidence_segments,
        headline=report.headline,
        turn_breakdown=_turn_breakdown(db, session),
        analysis_ms=report.analysis_ms,
        mode=session.mode,
        difficulty=session.difficulty,
        previous=previous,
    )
