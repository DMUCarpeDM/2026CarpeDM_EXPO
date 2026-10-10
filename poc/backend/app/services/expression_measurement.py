"""Browser-local experimental outputs; no emotion inference or scoring."""
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
    return {"version": "expression-resnet18-v1", "status": "unvalidated" if samples else "unmeasured",
            "scoring_enabled": False, "samples": samples, "turns": turns,
            "mean_outputs": {key: sum(t["samples"] * t["mean_outputs"][key] for t in turns) / samples for key in LABELS} if samples else {},
            "note": "학습 전처리·판정 기준 미검증. 출력값은 감정·태도·표정 비율 또는 점수가 아닙니다."}


def summary_text(session):
    data = summarize(session)
    if not data["samples"]:
        return "유효한 얼굴 표본이 수집되지 않아 표정 결과와 점수를 제공하지 않습니다."
    values = " · ".join(f"{name} {data['mean_outputs'][key]:.2f}" for key, name in LABELS.items())
    return f"표정 모델 표본 {data['samples']}개 · 평균 출력(0~1): {values}. 검증 전 참고값이며 표정 확정과 점수 계산은 보류합니다."
