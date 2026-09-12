"""공통 판단 계약. 점수와 대사는 이 근거를 소비하고 별도로 재판정하지 않는다."""
import math
from app.ai.text_match import matched_checklist_ids

VERSION = "judgment-v1"
# 전시 검증용 초기 정책. 누적 집계이므로 연속 행동 시간으로 해석하지 않는다.
POSTURE_RULES = {
    "head_down": ("head_down_ratio", .45, "고개를 조금 들어 상대를 바라보세요."),
    "side_lean": ("avg_shoulder_tilt_deg", 12, "어깨 높이를 편하게 맞춰 보세요."),
    "forward_lean": ("hunched_ratio", .45, "상체를 편하게 세워 보세요."),
    "sway": ("posture_sway", .12, "몸의 움직임을 잠시 줄여 보세요."),
    "hand_face": ("hand_face_sec", 3, "손을 얼굴에서 내려 편하게 두세요."),
}
MIN_SAMPLE_MS = 3000


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def event(turn_id, area, rule, outcome, evidence, message, *, key=None):
    return {"id": f"{VERSION}:{turn_id}:{area}:{rule}:{key or ''}", "version": VERSION,
            "turn_id": turn_id, "area": area, "rule": rule, "outcome": outcome,
            "evidence": evidence, "message": message}


def evaluate(turn_id, *, text="", goals=(), nonverbal=None, duration_ms=0):
    events, measured = [], []
    met = sorted(matched_checklist_ids(text, goals)) if text else []
    if text and goals:
        measured.append("response")
        for goal in goals:
            if goal["id"] in met:
                events.append(event(turn_id, "response", "goal_met", "positive",
                    {"goal_id": goal["id"], "label": goal["label"], "quote": text[:1000]},
                    f"{goal['label']} 내용을 답변에 담았습니다.", key=goal["id"]))
    nv = nonverbal or {}
    frames, sample_ms = nv.get("frames"), nv.get("sample_ms")
    enough = (nv.get("calibrated") is True and number(frames) and frames >= 15
              and number(sample_ms) and 40 <= sample_ms <= 1000
              and number(duration_ms) and duration_ms >= MIN_SAMPLE_MS
              and frames * sample_ms >= MIN_SAMPLE_MS)
    if enough:
        for rule, (metric, threshold, message) in POSTURE_RULES.items():
            value = nv.get(metric)
            if not number(value) or value < 0:
                continue
            if "posture" not in measured:
                measured.append("posture")
            if value >= threshold:
                events.append(event(turn_id, "posture", rule, "negative",
                    {"metric": metric, "value": value, "threshold": threshold,
                     "duration_ms": duration_ms, "basis": "turn_aggregate"}, message))
    return {"version": VERSION, "turn_id": turn_id, "measured": measured,
            "events": events, "met_goals": met}


def persist(session, result):
    """각 턴의 최종 판단만 저장. 같은 턴 재처리는 교체되어 중복되지 않는다."""
    values = dict((session.rapport or {}).get("judgments") or {})
    values[str(result["turn_id"])] = result
    session.rapport = {**(session.rapport or {}), "judgments": values}


def results(session):
    return list(((session.rapport or {}).get("judgments") or {}).values())
