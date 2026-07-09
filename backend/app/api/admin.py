"""전시 운영/기관 대시보드 API 골격 (R-HYJRLN, R-NCULBP)."""
import csv
import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.database import get_db
from app.models import AnalysisResult, FitType, Report, RoleplaySession, SessionStatus
from app.schemas import AdminMetricsOut

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

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


@router.get("/export.csv")
def export_csv(db: Session = Depends(get_db)):
    """익명 집계 CSV 내보내기 (S-BHJBJS) — 개인 식별 정보(client_key 등) 제외."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "session_id", "started_at", "mode_min", "difficulty", "status",
        "total_score", "response_fit", "voice_fit", "eye_fit", "posture_fit", "analysis_ms",
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
            s.status.value,
            report.total_score if report else "",
            *[fits.get(f, {}).get("score", "") if report else "" for f in
              ("response", "voice", "eye", "posture")],
            report.analysis_ms if report else "",
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=mirroting_sessions.csv"},
    )


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

    # 관측성 — 폴백 발동률·측정 가동률: 조용한 품질 강등(정렬 실패, 근사 폴백,
    # 홍채/3D 미가동, 다인 가드)이 전시 중 누적되고 있는지 한눈에 본다.
    turn_results = (
        db.query(AnalysisResult).filter(AnalysisResult.turn_id.is_not(None)).all()
    )
    voice = [r for r in turn_results if r.fit_type == FitType.voice]
    voice_audio = [r for r in voice if not r.raw_metrics.get("estimated")]
    eye = [r for r in turn_results if r.fit_type == FitType.eye]
    posture = [r for r in turn_results if r.fit_type == FitType.posture]
    response = [r for r in turn_results if r.fit_type == FitType.response]

    def _rate(vals: list[float]) -> float | None:
        return round(sum(vals) / len(vals), 2) if vals else None

    observability = {
        "voice_turns": len(voice),
        # 오디오 없이 발화 시간 근사로만 채점된 턴 — 마이크/녹음 문제의 신호
        "voice_estimated_turns": len(voice) - len(voice_audio),
        # Vosk 정렬(문장 인용·쉼 위치의 재료)이 실제로 붙은 비율
        "voice_alignment_rate": _rate(
            [1.0 if r.raw_metrics.get("alignment") else 0.0 for r in voice_audio]
        ),
        # 키워드가 놓친 것을 의미 매칭이 구제한 턴 비율 — 0이면 임베딩 미가동 의심
        "semantic_rescue_rate": _rate(
            [1.0 if r.raw_metrics.get("semantic_hits") else 0.0 for r in response]
        ),
        "iris_active_rate": _rate([r.raw_metrics.get("iris_ratio", 0.0) for r in eye]),
        "world_3d_rate": _rate([r.raw_metrics.get("world_ratio", 0.0) for r in posture]),
        # 다인 가드가 폐기한 프레임 총합 — 급증하면 부스 동선 문제
        "guard_dropped_frames": sum(
            r.raw_metrics.get("guard_dropped_frames", 0) for r in posture
        ),
    }

    return AdminMetricsOut(
        sessions_total=total,
        sessions_completed=completed,
        completion_rate=round(completed / total, 3) if total else 0.0,
        retry_rate=retry_rate,
        avg_total_score=round(avg_total, 1) if avg_total is not None else None,
        avg_analysis_ms=round(avg_ms, 0) if avg_ms is not None else None,
        avg_fit_scores=avg_fit_scores,
        observability=observability,
    )
