"""팁과 역할 발화가 함께 사용하는 근거 선택. 표정은 실시간 개입에서 제외한다."""
from app.services.judgments import results

PRIORITY = {"contradiction": 0, "missing_goal": 1, "fast_speech": 2,
            "hand_face": 3, "head_down": 4, "side_lean": 5, "forward_lean": 6, "sway": 7}


def select(judgment):
    candidates = [e for e in judgment.get("events", [])
                  if e.get("outcome") == "negative" and e.get("area") != "expression" and e.get("rule") in PRIORITY]
    return min(candidates, key=lambda e: PRIORITY[e["rule"]]) if candidates else None


def for_dialogue(session):
    values = results(session)
    if not values:
        return None
    latest = values[-1]
    return latest.get("feedback")


def assign(session, judgment, order):
    selected = select(judgment)
    previous = dict((session.rapport or {}).get("feedback_history") or {})
    if selected:
        rule = selected["rule"]
        # 역할 대사에서도 같은 지적을 매 답변마다 반복하지 않는다.
        if rule != "contradiction" and order - previous.get(rule, -10) < 2:
            selected = None
        else:
            previous[rule] = order
    judgment["feedback"] = selected
    session.rapport = {**(session.rapport or {}), "feedback_history": previous}
    return selected


def confirmation_text(item):
    evidence = item["evidence"]
    before, now = evidence["previous_quote"][:45], evidence["quote"][:45]
    return f'앞에서는 “{before}”, 지금은 “{now}”라고 말씀하셨는데, 어떤 내용이 맞을까요?'
