"""4-Fit 리포트 생성 — 전문가 기준 템플릿 피드백 (F-FHVXPD, S-JPGYZW).

각 코멘트는 '관측된 사실 → 해석 → 추천 행동' 구조를 따른다 (R-LKTYCM 수용 기준).
"""
from sqlalchemy import select

from app.models import AnalysisResult, FitType, Report, RoleplaySession

FIT_LABELS = {
    FitType.response: "Response-Fit (응답 적절성)",
    FitType.voice: "Voice-Fit (발화 안정성)",
    FitType.eye: "Eye-Fit (시선 유지)",
    FitType.posture: "Posture-Fit (자세 안정)",
}

STRENGTH_TEMPLATES = {
    FitType.response: "상황에 필요한 핵심 요소를 잘 담아 응답했습니다.",
    FitType.voice: "말속도와 발화 흐름이 안정적으로 유지됐습니다.",
    FitType.eye: "대화 중 정면 응시가 잘 유지됐습니다.",
    FitType.posture: "상체 자세가 흔들림 없이 안정적이었습니다.",
}

NOT_MEASURED = {
    FitType.voice: "음성이 측정되지 않아 Voice-Fit은 평가에서 제외됐습니다.",
    FitType.eye: "카메라 미사용으로 Eye-Fit은 평가에서 제외됐습니다.",
    FitType.posture: "카메라 미사용으로 Posture-Fit은 평가에서 제외됐습니다.",
}


def _response_evidence(turn_results: list[AnalysisResult]) -> dict | None:
    worst = min(turn_results, key=lambda r: r.score, default=None)
    if worst is None:
        return None
    m = worst.raw_metrics
    missing_labels = [i["label"] for i in m.get("missing", [])]
    banned = [h["phrase"] for h in m.get("banned_hits", [])]
    observed_parts = []
    if missing_labels:
        observed_parts.append(f"누락된 핵심 요소: {', '.join(missing_labels[:3])}")
    if banned:
        observed_parts.append(f"위험 표현 사용: '{', '.join(banned[:2])}'")
    if not observed_parts:
        observed_parts.append(f"핵심 요소 커버리지 {int(m.get('coverage', 0) * 100)}%")
    interpretation = (
        "핵심 요소가 빠지면 듣는 사람이 상황을 다시 물어야 해 신뢰가 낮아집니다."
        if missing_labels else
        "위험 표현은 책임 회피나 무성의로 해석될 수 있습니다."
        if banned else
        "응답 구조가 대체로 갖춰져 있습니다."
    )
    suggestion = (
        f"다음에는 '{missing_labels[0]}'을(를) 먼저 한 문장으로 말해보세요."
        if missing_labels else
        "같은 상황에서 '확인 후 O시까지 회신드리겠습니다'처럼 대안을 붙여보세요."
    )
    return _segment(worst, "response", " · ".join(observed_parts), interpretation, suggestion)


def _voice_evidence(turn_results: list[AnalysisResult]) -> dict | None:
    worst = min(turn_results, key=lambda r: r.score, default=None)
    if worst is None:
        return None
    m = worst.raw_metrics
    rate = m.get("speech_rate_sps", 0)
    pause = m.get("pause_ratio")
    if rate and rate > 5.8:
        observed = f"말속도 {rate}음절/초 (권장 3.2~5.8)"
        interp = "말이 빨라지면 전달 안정도가 낮아지고 긴장한 인상을 줍니다."
        sugg = "핵심 문장 앞에서 한 박자 쉬고, 문장을 짧게 끊어 말해보세요."
    elif rate and rate < 3.2:
        observed = f"말속도 {rate}음절/초 (권장 3.2~5.8)"
        interp = "너무 느린 말속도는 자신감이 없어 보일 수 있습니다."
        sugg = "결론 문장을 미리 정해두고 바로 말하는 연습을 해보세요."
    elif pause is not None and pause > 0.35:
        observed = f"무음 구간 비율 {int(pause * 100)}% (권장 35% 이하)"
        interp = "긴 침묵이 반복되면 답변 준비가 안 된 인상을 줍니다."
        sugg = "생각할 시간이 필요하면 '잠시 정리해서 말씀드리겠습니다'라고 말한 뒤 이어가세요."
    else:
        observed = f"말속도 {rate}음절/초, 무음 비율 {int((pause or 0) * 100)}%"
        interp = "발화 흐름이 안정적입니다."
        sugg = "지금 페이스를 유지하며 문장 끝을 명확하게 맺어보세요."
    return _segment(worst, "voice", observed, interp, sugg)


def _eye_evidence(turn_results: list[AnalysisResult]) -> dict | None:
    worst = min(turn_results, key=lambda r: r.score, default=None)
    if worst is None:
        return None
    ratio = worst.raw_metrics.get("front_gaze_ratio", 0)
    observed = f"정면 응시 비율 {int(ratio * 100)}% (권장 65% 이상)"
    if ratio < 0.65:
        interp = "핵심 내용을 말할 때 시선이 흩어지면 확신이 없어 보입니다."
        sugg = "질문한 상대의 눈썹 사이를 본다는 느낌으로 2~3초씩 시선을 고정해보세요."
    else:
        interp = "시선 유지가 안정적입니다."
        sugg = "중요한 문장에서 시선을 살짝 더 오래 고정하면 전달력이 올라갑니다."
    return _segment(worst, "eye", observed, interp, sugg)


def _posture_evidence(turn_results: list[AnalysisResult]) -> dict | None:
    worst = min(turn_results, key=lambda r: r.score, default=None)
    if worst is None:
        return None
    m = worst.raw_metrics
    tilt = m.get("avg_shoulder_tilt_deg", 0)
    head_down = m.get("head_down_ratio", 0)
    if head_down > 0.2:
        observed = f"고개 숙임 비율 {int(head_down * 100)}%"
        interp = "고개가 자주 내려가면 위축된 인상을 줍니다."
        sugg = "답변 시작 전에 턱을 살짝 들고 어깨를 펴는 루틴을 만들어보세요."
    elif tilt > 6:
        observed = f"평균 어깨 기울기 {tilt:.1f}° (권장 6° 이하)"
        interp = "어깨가 기울면 긴장하거나 방어적인 자세로 보일 수 있습니다."
        sugg = "의자에 등을 붙이고 양쪽 어깨 높이를 맞춘 상태에서 말해보세요."
    else:
        observed = f"평균 어깨 기울기 {tilt:.1f}°, 고개 숙임 {int(head_down * 100)}%"
        interp = "자세가 안정적으로 유지됐습니다."
        sugg = "지금 자세를 기준으로 손동작을 조금 더 활용해도 좋습니다."
    return _segment(worst, "posture", observed, interp, sugg)


def _segment(result: AnalysisResult, fit: str, observed: str, interpretation: str, suggestion: str) -> dict:
    turn = result.turn_id
    return {
        "turn_id": turn,
        "fit_type": fit,
        "observed": observed,
        "interpretation": interpretation,
        "suggestion": suggestion,
    }


EVIDENCE_BUILDERS = {
    FitType.response: _response_evidence,
    FitType.voice: _voice_evidence,
    FitType.eye: _eye_evidence,
    FitType.posture: _posture_evidence,
}


def build_report(
    db,
    session: RoleplaySession,
    session_scores: dict[FitType, float | None],
    analysis_ms: int,
) -> Report:
    turn_results = db.scalars(
        select(AnalysisResult).where(
            AnalysisResult.session_id == session.id,
            AnalysisResult.turn_id.is_not(None),
        )
    ).all()
    by_fit: dict[FitType, list[AnalysisResult]] = {}
    for r in turn_results:
        by_fit.setdefault(r.fit_type, []).append(r)

    turn_order = {t.id: t.order for t in session.turns}
    turn_quote = {t.id: t.response_text for t in session.turns}

    fit_scores: dict[str, dict] = {}
    strengths: list[str] = []
    improvements: list[str] = []
    evidence_segments: list[dict] = []

    for fit in FitType:
        score = session_scores.get(fit)
        if score is None:
            fit_scores[fit.value] = {
                "score": None,
                "label": FIT_LABELS[fit],
                "summary": NOT_MEASURED.get(fit, "측정되지 않았습니다."),
            }
            continue

        segment = EVIDENCE_BUILDERS[fit](by_fit.get(fit, []))
        summary = segment["interpretation"] if segment else ""
        fit_scores[fit.value] = {
            "score": round(score, 1),
            "label": FIT_LABELS[fit],
            "summary": summary,
        }
        if segment:
            segment["turn_order"] = turn_order.get(segment["turn_id"], 0)
            quote = turn_quote.get(segment["turn_id"], "")
            segment["quote"] = quote[:80] + ("…" if len(quote) > 80 else "")
            evidence_segments.append(segment)

        if score >= 75:
            strengths.append(f"{FIT_LABELS[fit]} — {STRENGTH_TEMPLATES[fit]}")
        else:
            sugg = segment["suggestion"] if segment else ""
            improvements.append(f"{FIT_LABELS[fit]} — {sugg}")

    available = [s for s in session_scores.values() if s is not None]
    total = round(sum(available) / len(available), 1) if available else 0.0

    report = Report(
        session_id=session.id,
        total_score=total,
        fit_scores=fit_scores,
        strengths=strengths,
        improvements=improvements,
        evidence_segments=sorted(evidence_segments, key=lambda s: s["turn_order"]),
        analysis_ms=analysis_ms,
    )
    db.add(report)
    db.commit()
    return report
