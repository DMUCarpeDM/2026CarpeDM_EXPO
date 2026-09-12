"""측정 근거의 가감점과 상한. 전시 검증용 초기 정책."""
from app.services.judgments import event, number

VERSION = "interaction-score-v1"
NO_SCORE = "interaction-no-score"
AREAS = ("response", "voice", "expression", "posture")
POINTS = {"goal_met": 3, "relevant_answer": 3, "missing_goal": -6,
    "head_down": -4, "side_lean": -4, "forward_lean": -4, "sway": -4, "hand_face": -4,
    "fast_speech": -4, "slow_speech": -4, "long_pause": -4, "clear_pace": 3}


def public_total(report):
    return None if report is None or report.engine_version == NO_SCORE else report.total_score


def audio_events(turn_id, metrics, mode):
    if not metrics or metrics.get("estimated") or not number(metrics.get("duration_sec")) or metrics["duration_sec"] < 3:
        return []
    speed = metrics.get("speech_rate_sps")
    if not number(speed) or speed <= 0:
        return []
    low, high = (2.5, 6.5) if mode == "interview" else (2.5, 7.0)
    rule = "fast_speech" if speed > high else "slow_speech" if speed < low else "clear_pace"
    messages = {"fast_speech": "말하는 속도를 조금 낮춰 보세요.", "slow_speech": "짧은 문장으로 핵심을 이어 말해 보세요.", "clear_pace": "측정된 말속도가 연습 기준 안에 있습니다."}
    events = [event(turn_id, "voice", rule, "positive" if rule == "clear_pace" else "negative",
        {"metric": "speech_rate_sps", "value": speed, "range": [low, high], "source": "audio"}, messages[rule])]
    pauses = metrics.get("long_pause_count")
    if number(pauses) and pauses >= 3:
        events.append(event(turn_id, "voice", "long_pause", "negative",
            {"metric": "long_pause_count", "value": pauses, "threshold": 3, "source": "audio"},
            "긴 쉼이 반복됐습니다. 한 문장씩 정리해서 이어 말해 보세요."))
    return events


def calculate(results):
    measured = {area for result in results for area in result.get("measured", [])}
    changes = {area: [] for area in AREAS}
    used, counts, facts, conflicts = set(), {}, set(), []
    for result in results:
        for item in result.get("events", []):
            if item["id"] in used:
                continue
            used.add(item["id"])
            rule, area = item["rule"], item["area"]
            if rule == "contradiction":
                fact = "".join(item["evidence"]["fact_key"].split()).casefold()
                if fact not in facts:
                    facts.add(fact)
                    conflicts.append(item)
                continue
            if rule not in POINTS or area not in measured or area not in changes:
                continue
            key = (area, rule, item["evidence"].get("goal_id", ""))
            cap = 1 if rule in {"goal_met", "missing_goal"} else 3
            if counts.get(key, 0) >= cap:
                continue
            counts[key] = counts.get(key, 0) + 1
            changes[area].append({**item, "points": POINTS[rule]})
    scores = {}
    for area in AREAS:
        if area not in measured:
            scores[area] = None
            continue
        plus = min(15, sum(max(0, e["points"]) for e in changes[area]))
        minus = min(30, sum(max(0, -e["points"]) for e in changes[area]))
        scores[area] = max(0, min(100, 75 + plus - minus))
    values = [s for s in scores.values() if s is not None]
    deduction = min(12, len(conflicts) * 4)
    return {"version": VERSION, "scores": scores,
        "limits": {"base": 75, "bonus": 15, "penalty": 30, "repeats": 3, "contradiction": 12},
        "total": round(max(0, sum(values) / len(values) - deduction), 1) if values else None,
        "contradiction_deduction": deduction, "contradictions": conflicts, "changes": changes}
