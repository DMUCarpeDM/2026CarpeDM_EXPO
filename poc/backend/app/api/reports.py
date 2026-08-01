from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_session
from app.core.database import get_db
from app.models import (
    DEMO_CLIENT_KEY_PREFIX,
    AnalysisResult,
    Report,
    RoleplaySession,
    SessionStatus,
)
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
        # 시선(eye)은 점수 축이 아니라 관찰 신호 — 턴별 4-Fit 타임라인에서 제외
        if r.fit_type.value == "eye":
            continue
        scores_by_turn.setdefault(r.turn_id, {})[r.fit_type.value] = round(r.score, 1)
    breakdown = []
    for turn in session.turns:
        if turn.id not in scores_by_turn:
            continue
        breakdown.append({
            "turn_order": turn.order,
            "question_type": turn.question_type,
            # 과거 시드 방식이 남긴 깨진 에피소드 참조 방어
            "episode_title": turn.episode.title if turn.episode else "",
            "question": turn.question_text[:60],
            "scores": scores_by_turn[turn.id],
        })
    return breakdown


@router.get("/{session_id}/report", response_model=ReportOut)
def get_report(
    session: RoleplaySession = Depends(require_session),
    db: Session = Depends(get_db),
):
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

    # 현장 체험자 백분위 (표본 5건 이상일 때만) — 전시 경쟁 요소.
    # 산식 버전이 다른 점수는 비교 표본에서 제외 (engine_version 스냅샷).
    # 데모/리허설 세션(demo-*)도 제외 — 리허설 시드가 방문자 백분위를 오염시키지 않도록.
    percentile_top = None
    other_scores = [
        row[0]
        for row in db.query(Report.total_score)
        .join(RoleplaySession, Report.session_id == RoleplaySession.id)
        .filter(
            Report.session_id != session.id,
            Report.engine_version == report.engine_version,
            ~RoleplaySession.client_key.like(f"{DEMO_CLIENT_KEY_PREFIX}%"),
        )
        .all()
    ]
    if len(other_scores) >= 5:
        beaten = sum(1 for s in other_scores if s < report.total_score)
        percentile_top = max(1, 100 - round(beaten / len(other_scores) * 100))

    # 심층 분석은 저장본에 조회 시점 정보를 더해 내려준다 (저장본은 불변):
    deep = dict(report.deep_analysis or {})

    # 1) 코호트 백분위 — Fit별로 현장 축적 데이터 대비 위치 (표본 20+에서만, 신뢰 우선)
    cohort_rows = []
    for fit, data in (report.fit_scores or {}).items():
        if data.get("score") is None:
            continue
        # 관찰 신호(시선)는 점수 축이 아니므로 코호트 순위에서 제외
        if data.get("observation"):
            continue
        others = [
            row[0]
            for row in db.query(AnalysisResult.score)
            .join(RoleplaySession, AnalysisResult.session_id == RoleplaySession.id)
            .filter(
                AnalysisResult.fit_type == fit,
                AnalysisResult.turn_id.is_(None),
                AnalysisResult.session_id != session.id,
                # 데모/리허설 세션 제외 — percentile_top과 동일 근거
                ~RoleplaySession.client_key.like(f"{DEMO_CLIENT_KEY_PREFIX}%"),
            )
            .all()
        ]
        if len(others) >= 20:
            beaten = sum(1 for s in others if s < data["score"])
            cohort_rows.append({
                "fit": fit,
                "label": data.get("label", fit),
                "top_pct": max(1, 100 - round(beaten / len(others) * 100)),
                "n": len(others),
            })
    if cohort_rows:
        deep["cohort"] = {"title": "현장 체험자 대비", "rows": cohort_rows}

    # 2) 재방문 성장 델타 — "지난번 동요형 → 이번 회복형" 서사
    if prev_session and prev_session.report:
        prev_deep = prev_session.report.deep_analysis or {}
        prev_level = (prev_deep.get("composure") or {}).get("level")
        cur_level = (deep.get("composure") or {}).get("level")
        rank = {"동요형": 0, "회복형": 1, "침착형": 2}
        if prev_level and cur_level and prev_level != cur_level:
            improved = rank.get(cur_level, 0) > rank.get(prev_level, 0)
            deep["growth"] = {
                "from": prev_level,
                "to": cur_level,
                "improved": improved,
                "comment": (
                    f"지난 도전에서는 압박에 '{prev_level}'이었는데, 이번엔 '{cur_level}'이에요 — "
                    + ("압박 앞에서 몸이 배우고 있어요. 이 변화가 진짜 성장입니다."
                       if improved else
                       "오늘은 컨디션 영향이 있었을 수 있어요. 다음 도전에서 다시 확인해봐요."),
                ),
            }

    # 영수증 QR (S-B2B-CLAIM): 아직 계정에 귀속되지 않은 세션만 클레임 링크를 준다
    claim_url = ""
    if session.claim_token and session.user_id is None:
        from app.core.config import settings

        claim_url = f"{settings.claim_base_url}?token={session.claim_token}"

    from app.services.score_policy import grade_of

    return ReportOut(
        session_id=session.id,
        total_score=report.total_score,
        fit_scores=report.fit_scores,
        strengths=report.strengths,
        improvements=report.improvements,
        evidence_segments=report.evidence_segments,
        headline=report.headline,
        rebuild=report.rebuild,
        speech_stats=report.speech_stats,
        day_ending=report.day_ending or {},
        deep_analysis=deep,
        percentile_top=percentile_top,
        turn_breakdown=_turn_breakdown(db, session),
        analysis_ms=report.analysis_ms,
        mode=session.mode,
        difficulty=session.difficulty,
        previous=previous,
        grade=grade_of(report.total_score),
        claim_url=claim_url,
        coaching=list(getattr(report, "coaching", None) or []),
        emotion_journey=dict(session.emotion or {}),
    )
