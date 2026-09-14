"""공통 판단 계약. 점수와 대사는 이 근거를 소비하고 별도로 재판정하지 않는다."""
import math
from app.ai.text_match import matched_checklist_ids, count_hangul_syllables

VERSION = "judgment-v1"
# 공통 기록 양식입니다. event는 '어느 답변에서 무엇을 관찰했는가'를 담은 한 장의 기록입니다.
# measured는 측정할 수 있었던 영역 목록입니다. 기록이 없다는 것과 문제가 없다는 것은 다릅니다.
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


def evaluate(turn_id, *, text="", goals=(), nonverbal=None, duration_ms=0, voice_text=False):
    events, measured = [], []
    classified = None
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
    if "pose_ensemble" in nv and nv["pose_ensemble"] is not None:
        from app.ai.posture_ensemble import analyze
        classified = analyze(nv["pose_ensemble"], duration_ms)
        if classified["status"] == "measured":
            measured.append("posture")
            rules = {"head_down": "head_down", "torso_side_lean": "side_lean",
                     "torso_forward_lean": "forward_lean", "arms_crossed": "arms_crossed", "hand_to_face": "hand_face"}
            for label, rule in rules.items():
                hit = classified["labels"][label]
                if hit["ratio"] >= .45:
                    message = "팔짱을 풀고 편하게 대화해 보세요." if rule == "arms_crossed" else POSTURE_RULES[rule][2]
                    events.append(event(turn_id, "posture", rule, "negative",
                        {**hit, "label":label, "source":classified["version"], "samples":classified["samples"],
                         "valid_ms":classified["valid_ms"], "ratio_threshold":.45}, message))
    if enough and nv.get("pose_ensemble") is None:
        for rule, (metric, threshold, message) in POSTURE_RULES.items():
            samples = (nv.get("posture_samples") or {}).get(metric)
            if not number(samples) or samples < 15 or samples > frames or samples * sample_ms < MIN_SAMPLE_MS:
                continue
            value = nv.get(metric)
            if not number(value) or value < 0:
                continue
            if "posture" not in measured:
                measured.append("posture")
            if value >= threshold:
                events.append(event(turn_id, "posture", rule, "negative",
                    {"metric": metric, "value": value, "threshold": threshold,
                     "duration_ms": duration_ms, "basis": "turn_aggregate"}, message))
    # Chrome 전사의 경과 시간 기준 빠른 말하기 안내. 추정치이므로 채점에는 쓰지 않는다.
    if voice_text and number(duration_ms) and duration_ms >= 10000 and count_hangul_syllables(text) >= 40:
        rate = count_hangul_syllables(text) / (duration_ms / 1000)
        if rate > 8.5:
            item = event(turn_id, "voice", "fast_speech", "negative",
                {"metric": "speech_rate_sps", "value": round(rate, 2), "threshold": 8.5,
                 "source": "chrome-elapsed-estimate", "duration_ms": duration_ms},
                "핵심 문장 사이에 잠깐 쉬며 조금 천천히 말해 보세요.")
            item["scorable"] = False
            events.append(item)
    return {"version": VERSION, "turn_id": turn_id, "measured": measured,
            "events": events, "met_goals": met,
            **({"posture_model": classified} if classified is not None else {})}


def persist(session, result):
    """각 턴의 최종 판단만 저장. 같은 턴 재처리는 교체되어 중복되지 않는다."""
    # 같은 turn_id(답변 번호)를 다시 저장하면 이전 기록을 교체해 이중 반영을 막습니다.
    values = dict((session.rapport or {}).get("judgments") or {})
    values[str(result["turn_id"])] = result
    session.rapport = {**(session.rapport or {}), "judgments": values}


def results(session):
    return sorted(((session.rapport or {}).get("judgments") or {}).values(), key=lambda value: value["turn_id"])
