"""시나리오 목표·주요 면접 질문 기준 진행. 상태는 rapport.interaction에 보존한다."""
from app.ai.text_match import matched_checklist_ids

VERSION = "interaction-v1"
MAX_RETRIES = 2


def state(session):
    return dict((session.rapport or {}).get("interaction") or {})


def save(session, value):
    session.rapport = {**(session.rapport or {}), "interaction": value}


def initialize(session, scenario, episodes, service_mode):
    policy = (scenario.world_setting or {}).get("interaction") or {}
    if service_mode == "interview":
        questions = policy.get("interview_questions") or []
        if not 6 <= len(questions) <= 12 or any(not isinstance(q, str) or not q.strip() or len(q) > 180 for q in questions):
            raise ValueError("면접 시나리오에는 주요 질문을 6~12개 준비해야 합니다.")
        items = [{"id": f"question-{i+1}", "text": q, "episode_id": episodes[0].id} for i, q in enumerate(questions)]
    else:
        items = [{**item, "id": f"{ep.id}:{item['id']}", "episode_id": ep.id,
                  "text": item.get("followup") or f"{item['label']} 내용을 구체적으로 말씀해 주세요."}
                 for ep in episodes for item in (ep.checklist or [])]
        if not items:
            raise ValueError("훈련 시나리오에는 목표 체크리스트가 필요합니다.")
    value = {"version": VERSION, "mode": service_mode, "items": items, "index": 0,
             "attempts": {}, "met": [], "unmet": [], "unverified": [], "reason": None, "finished": False}
    save(session, value)
    return value


def advance(session, turn, turns, judgment=None):
    value = state(session)
    if value and turn.question_type == "confirmation":
        value["pending_confirmation"] = False
        save(session, value)
        return value
    if not value or value.get("finished"):
        return value
    items = value["items"]
    if value["mode"] == "interview":
        # 빈 답변은 API에서 거부한다. 후속 질문은 주요 질문 수에 넣지 않는다.
        if turn.question_type in {"initial", "main"}:
            value["met"] = list(dict.fromkeys([*value["met"], items[value["index"]]["id"]]))
            value["index"] += 1
    else:
        history = " ".join(t.response_text or "" for t in turns)
        met = set(judgment["met_goals"]) if judgment is not None else matched_checklist_ids(history, items)
        value["met"] = list(dict.fromkeys([*value["met"], *sorted(met)]))
        value["unmet"] = [key for key in value["unmet"] if key not in value["met"]]
        value["unverified"] = [key for key in value.get("unverified", []) if key not in value["met"]]
        current = items[value["index"]]
        attempts = dict(value["attempts"])
        attempts[current["id"]] = attempts.get(current["id"], 0) + 1
        value["attempts"] = attempts
        if current["id"] not in value["met"] and attempts[current["id"]] >= 1 + MAX_RETRIES:
            bucket = "unverified" if judgment and judgment.get("semantic_status") == "unavailable" else "unmet"
            value[bucket] = list(dict.fromkeys([*value[bucket], current["id"]]))
        while value["index"] < len(items) and items[value["index"]]["id"] in value["met"] + value["unmet"] + value["unverified"]:
            value["index"] += 1
    if value["index"] >= len(items):
        value["finished"] = True
        value["reason"] = "questions_completed" if value["mode"] == "interview" else "goals_met" if len(value["met"]) == len(items) else "analysis_unavailable" if value.get("unverified") else "goals_exhausted"
    save(session, value)
    return value


def public_state(session):
    value = state(session)
    if not value:
        return {}
    return {key: value[key] for key in ("version", "mode", "index", "met", "unmet", "finished", "reason")} | {"total": len(value["items"]), "pending_confirmation": value.get("pending_confirmation", False), "unverified": value.get("unverified", []),
        "finished": value["finished"] and not value.get("pending_confirmation", False)}


def finish_manually(session):
    value = state(session)
    if value and (not value.get("finished") or value.get("pending_confirmation")):
        value["finished"] = True
        value["reason"] = "manual"
        value["pending_confirmation"] = False
        value["unmet"] = [item["id"] for item in value["items"] if item["id"] not in value["met"] + value.get("unverified", [])]
        save(session, value)
