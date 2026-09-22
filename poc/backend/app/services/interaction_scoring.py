"""측정 근거의 가감점과 상한. 전시 검증용 초기 정책."""
from app.services.judgments import event, number
from app.services.contradictions import keys as conflict_keys

VERSION = "interaction-score-v1"
# 읽는 순서 4: 모델이 남긴 관찰 기록을 실제 점수로 바꾸는 곳입니다.
# POINTS는 현재 적용되는 점수표입니다. 새 계획서의 시험용 숫자와 같다고 보면 안 됩니다.
# 간투어·말 반복 가감점은 아직 이 점수표에 없습니다. 추후 관찰 품질 확인 후 연결할 부분입니다.
NO_SCORE = "interaction-no-score"
AREAS = ("response", "voice", "expression", "posture")
POINTS = {"goal_met": 3, "relevant_answer": 3, "missing_goal": -6,
    "head_down": -4, "side_lean": -4, "forward_lean": -4, "sway": -4, "hand_face": -4, "arms_crossed": -4,
    "fast_speech": -4, "slow_speech": -4, "long_pause": -4, "clear_pace": 3}


def public_total(report):
    return None if report is None or report.engine_version == NO_SCORE else report.total_score


def audio_events(turn_id, metrics, mode):
    if metrics and metrics.get("engine_version") == "voice-measure-v2":
        return []  # 감점 기준 검증 전에는 측정값만 전달한다.
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
    # 같은 사건 ID는 한 번만 반영합니다. 모순은 영역 점수가 아니라 전체 평균에서 따로 뺍니다.
    # 현재 목표 충족과 누락은 서로 다른 규칙으로 누적됩니다.
    # 새 설계의 '후속 답변으로 충족하면 이전 감점을 교체'하는 동작은 별도 구현이 필요합니다.
    measured = {area for result in results for area in result.get("measured", [])}
    changes = {area: [] for area in AREAS}
    used, counts, facts, conflicts = set(), {}, set(), []
    for result in results:
        for item in result.get("events", []):
            if item.get("scorable") is False or item["id"] in used:
                continue
            used.add(item["id"])
            rule, area = item["rule"], item["area"]
            if rule == "contradiction":
                identifiers = conflict_keys(item["evidence"])
                if identifiers and not identifiers.intersection(facts):
                    conflicts.append(item)
                facts.update(identifiers)
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
            # 측정하지 못한 영역에는 0점이나 기본 75점을 주지 않고 None(점수 없음)을 남깁니다.
            scores[area] = None
            continue
        plus = min(15, sum(max(0, e["points"]) for e in changes[area]))
        minus = min(30, sum(max(0, -e["points"]) for e in changes[area]))
        scores[area] = max(0, min(100, 75 + plus - minus))
    interview_results = [r["interview_result"] for r in results if r.get("interview_result")]
    if interview_results:
        from app.services.interview import score_events
        latest = {}
        for result in interview_results:
            key = (result["rubric_version"], result["question_id"])
            if key not in latest or result["answer_turn_ids"][-1] >= latest[key]["answer_turn_ids"][-1]:
                latest[key] = result
        changes["response"] = [e for r in latest.values() for e in score_events(r)]
        scores["response"] = max(0, min(100, 75 + sum(e["points"] for e in changes["response"]))) if changes["response"] else None
    cafe_results = [r["cafe_result"] for r in results if r.get("cafe_result")]
    if cafe_results:
        latest = cafe_results[-1]
        changes["response"] = latest["events"] if latest["measured"] else []
        plus = min(6, sum(max(0, e["points"]) for e in changes["response"]))
        minus = min(15, sum(max(0, -e["points"]) for e in changes["response"]))
        scores["response"] = 75 + plus - minus if latest["measured"] else None
    values = [s for s in scores.values() if s is not None]
    deduction = min(12, len(conflicts) * 4)
    return {"version": VERSION, "scores": scores,
        "response_policy": ("interview-2026-09-16-v1" if interview_results else "cafe-orders-2026-09-16-v1" if cafe_results else VERSION),
        "response_limits": ({"base": 75, "per_question": {"fulfilled": 3, "insufficient": -2, "irrelevant_or_skip": -4}, "concept_bonus_per_job_question": 2, "range": [0, 100]}
                            if interview_results else {"base": 75, "bonus": 6, "penalty": 15} if cafe_results else {"base": 75, "bonus": 15, "penalty": 30}),
        "limits": {"base": 75, "bonus": 15, "penalty": 30, "repeats": 3, "contradiction": 12},
        "total": round(max(0, sum(values) / len(values) - deduction), 1) if values else None,
        "contradiction_deduction": deduction, "contradictions": conflicts, "changes": changes}
