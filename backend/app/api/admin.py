"""전시 운영/기관 대시보드 API 골격 (R-HYJRLN, R-NCULBP)."""
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Report, RoleplaySession, SessionStatus
from app.schemas import AdminMetricsOut

router = APIRouter(prefix="/admin", tags=["admin"])

ACTIVE = (SessionStatus.ready, SessionStatus.in_progress, SessionStatus.analyzing)


@router.post("/reset")
def exhibition_reset(db: Session = Depends(get_db)):
    """1클릭 초기화 (S-CTECCW): 진행 중인 세션을 모두 중단하고 다음 체험자를 준비."""
    aborted = (
        db.query(RoleplaySession)
        .filter(RoleplaySession.status.in_(ACTIVE))
        .update({"status": SessionStatus.aborted}, synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "aborted_sessions": aborted}


@router.get("/metrics", response_model=AdminMetricsOut)
def metrics(db: Session = Depends(get_db)):
    total = db.query(func.count(RoleplaySession.id)).scalar() or 0
    completed = (
        db.query(func.count(RoleplaySession.id))
        .filter(RoleplaySession.status == SessionStatus.completed)
        .scalar() or 0
    )

    # 재도전율: 같은 client_key로 2회 이상 수행한 세션 비율 근사
    distinct_clients = (
        db.query(func.count(func.distinct(RoleplaySession.client_key))).scalar() or 0
    )
    retry_rate = round(1 - distinct_clients / total, 3) if total else 0.0

    avg_total = db.query(func.avg(Report.total_score)).scalar()
    avg_ms = db.query(func.avg(Report.analysis_ms)).scalar()

    avg_fits: dict[str, float | None] = {}
    for report in db.query(Report).all():
        for fit, data in report.fit_scores.items():
            if data.get("score") is not None:
                avg_fits.setdefault(fit, []).append(data["score"])  # type: ignore[arg-type]
    avg_fit_scores = {
        fit: round(sum(scores) / len(scores), 1) for fit, scores in avg_fits.items()
    }

    return AdminMetricsOut(
        sessions_total=total,
        sessions_completed=completed,
        completion_rate=round(completed / total, 3) if total else 0.0,
        retry_rate=retry_rate,
        avg_total_score=round(avg_total, 1) if avg_total is not None else None,
        avg_analysis_ms=round(avg_ms, 0) if avg_ms is not None else None,
        avg_fit_scores=avg_fit_scores,
    )
