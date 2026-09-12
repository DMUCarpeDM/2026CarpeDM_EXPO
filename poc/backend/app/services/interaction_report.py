"""공통 판단에 따른 점수·보고서. 이전 엔진 점수와 분리한다."""
import copy
from app.models import AnalysisResult, FitType, Report
from app.services import interaction, interaction_scoring as scoring, judgments

LABELS = {"response": "응답", "voice": "음성", "expression": "표정", "posture": "자세"}


def prepare(db, session):
    values = copy.deepcopy(judgments.results(session))
    by_turn = {r["turn_id"]: r for r in values}
    rows = db.query(AnalysisResult).filter_by(session_id=session.id).all()
    mode = interaction.state(session)["mode"]
    for row in rows:
        if row.fit_type == FitType.voice and row.turn_id in by_turn:
            events = scoring.audio_events(row.turn_id, row.raw_metrics, mode)
            if events:
                result = by_turn[row.turn_id]
                result["events"].extend(events)
                result["measured"] = list(dict.fromkeys([*result["measured"], "voice"]))
    present = set()
    for row in rows:
        if row.fit_type == FitType.eye:
            continue
        result = by_turn.get(row.turn_id)
        score = scoring.calculate([result])["scores"].get(row.fit_type.value) if result else None
        if score is None:
            db.delete(row)
        else:
            row.score = score
            row.engine_version = scoring.VERSION
            present.add((row.turn_id, row.fit_type.value))
    for result in values:
        for area, score in scoring.calculate([result])["scores"].items():
            if score is not None and (result["turn_id"], area) not in present:
                db.add(AnalysisResult(session_id=session.id, turn_id=result["turn_id"],
                    fit_type=FitType(area), score=score, raw_metrics={}, engine_version=scoring.VERSION))
    return scoring.calculate(values), rows


def build(db, session, outcome, raw_rows, analysis_ms):
    from app.services.report import _build_speech_stats
    events = [event for items in outcome["changes"].values() for event in items] + outcome["contradictions"]
    positive = list(dict.fromkeys(e["message"] for e in events if e["outcome"] == "positive"))[:3]
    negative = list(dict.fromkeys(e["message"] for e in events if e["outcome"] == "negative"))[:3]
    turns = {t.id: t for t in session.turns}
    evidence = [{"turn_id": e["turn_id"], "turn_order": turns[e["turn_id"]].order,
        "fit_type": e["area"], "quote": e["evidence"].get("quote", ""),
        "observed": e["message"], "interpretation": e["message"],
        "suggestion": e["message"] if e["outcome"] == "negative" else "",
        "event_id": e["id"], "rule": e["rule"], "points": e.get("points", -4),
        "evidence": e["evidence"]} for e in events]
    available = outcome["total"] is not None
    report = Report(session_id=session.id, total_score=outcome["total"] if available else 0,
        engine_version=scoring.VERSION if available else scoring.NO_SCORE,
        fit_scores={area: {"score": score, "label": LABELS[area],
            "summary": "판단할 측정 자료가 부족합니다." if score is None else "75점에서 확인된 근거에 따라 가감했습니다."}
            for area, score in outcome["scores"].items()},
        strengths=positive, improvements=negative, evidence_segments=evidence,
        headline={"sentence": negative[0] if negative else "확인된 근거를 바탕으로 결과를 정리했습니다." if available else "측정 자료가 부족해 점수를 계산하지 않았습니다."},
        deep_analysis={"interaction": {**outcome, "progress": interaction.public_state(session)}},
        speech_stats=_build_speech_stats(raw_rows, session), analysis_ms=analysis_ms,
        rebuild={}, coaching=[], day_ending={})
    db.add(report)
    db.commit()
    return report
