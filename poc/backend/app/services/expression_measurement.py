"""Browser-local experimental outputs and explicitly provisional context scoring."""
from pydantic import ValidationError
from app.schemas.schemas import ExpressionModelIn

LABELS = {
    "smile": "미소", "brow_furrow": "눈썹 찌푸림", "brow_raise": "눈썹 올림",
    "eyes_wide": "눈 크게 뜸", "eyes_closed": "눈 감음", "mouth_wide_open": "입 크게 벌어짐", "neutral": "무표정",
}


def summarize(session):
    turns = []
    for turn in session.turns:
        raw = (turn.nonverbal_metrics or {}).get("expression_model")
        if not raw:
            continue
        try:
            value = ExpressionModelIn.model_validate(raw)
        except ValidationError:
            continue
        turns.append({"turn_id": turn.id, "turn_order": turn.order, **value.model_dump()})
    samples = sum(t["samples"] for t in turns)
    from app.services.judgments import results
    context_scored = any((r.get("context_policy") or {}).get("status") == "classified" and "expression" in r.get("measured", []) for r in results(session))
    baseline = any("expression" in r.get("measured", []) for r in results(session))
    return {"version": "expression-resnet18-v1", "status": "unvalidated" if samples else "unmeasured",
            "scoring_enabled": baseline, "context_scored": context_scored, "provisional": True, "samples": samples, "turns": turns,
            "mean_outputs": {key: sum(t["samples"] * t["mean_outputs"][key] for t in turns) / samples for key in LABELS} if samples else {},
            "note": ("얼굴 표본과 대화 맥락으로 실험적 표정 점수를 계산했습니다. 검증된 감정·태도 판단은 아닙니다." if context_scored else "얼굴 기록은 확인했지만 대화 상황을 확인하지 못해 상황별 가감점은 적용하지 않았습니다." if baseline else "학습 전처리·판정 기준 미검증. 출력값은 감정·태도·표정 비율 또는 점수가 아닙니다.")}


def summary_text(session):
    data = summarize(session)
    if not data["samples"]:
        return "유효한 얼굴 표본이 수집되지 않아 표정 결과와 점수를 제공하지 않습니다."
    values = " · ".join(f"{name} {data['mean_outputs'][key]:.2f}" for key, name in LABELS.items())
    return f"표정 모델 표본 {data['samples']}개 · 평균 출력(0~1): {values}. 검증 전 참고값이며 표정 확정과 점수 계산은 보류합니다."
