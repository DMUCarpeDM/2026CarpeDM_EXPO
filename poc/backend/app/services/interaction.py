"""시나리오 목표·주요 면접 질문 기준 진행. 상태는 rapport.interaction에 보존한다."""
from app.ai.text_match import matched_checklist_ids
from app.services.workplace import CONTINUOUS_MODE, build_fallback_plan, enrich_plan_fallback_pools, flatten_plan_items

VERSION = "interaction-v1"
# 읽는 순서 3: 대화의 진행표입니다. 무엇을 확인했고 다음에 무엇을 물을지 기억합니다.
# 면접은 주요 질문에 답한 수, 직무교육은 목표를 확인했는지가 진행 기준입니다.
# '답변을 했다'와 '내용이 충분하다'는 다릅니다. 면접의 met는 현재 질문 응답 기록입니다.
MAX_RETRIES = 2
SCRIPT_MODES = {"interview", "workplace", CONTINUOUS_MODE}


def state(session):
    return dict((session.rapport or {}).get("interaction") or {})


def save(session, value):
    session.rapport = {**(session.rapport or {}), "interaction": value}


def assessment_goals(value):
    """연속 대화의 진행 ID와 평가 ID를 분리해 같은 목표를 중복 가산하지 않는다."""
    items = value.get("items") or []
    if value.get("mode") == CONTINUOUS_MODE:
        index = value.get("index", 0)
        if value.get("finished") or index >= len(items):
            return []
        item = items[index]
        goal_id = item.get("assessment_id") or f"{item['act_id']}:goal"
        return [{**item, "id": goal_id}] if "keywords" in item else []
    return [item for item in items if "keywords" in item]


def _plan_workplace(session, scenario, episodes, rng):
    """Gemini Day Plan을 시도하고 실패하면 팩 폴백 BeatSheet를 쓴다."""
    from app.core.config import settings
    from app.services.dialogue import get_dialogue_provider

    if settings.dialogue_provider == "gemini":
        provider = get_dialogue_provider()
        plan_fn = getattr(provider, "plan_workplace_day", None)
        if plan_fn is not None:
            try:
                plan = plan_fn(session, scenario, episodes)
                return enrich_plan_fallback_pools(plan, scenario, episodes, rng)
            except Exception:
                pass
    return build_fallback_plan(scenario, episodes, session.mode, rng)


def initialize(session, scenario, episodes, service_mode, rng=None):
    policy = (scenario.world_setting or {}).get("interaction") or {}
    if service_mode == "workplace" and not (scenario.world_setting or {}).get("workplace_categories"):
        service_mode = "training"
    if service_mode == "interview":
        # 현재 질문은 문자열 목록입니다. 항목별 인정 기준을 넣으려면 여기의 items 구조와
        # sessions.py가 분석기에 넘기는 목표 목록을 함께 바꿔야 합니다.
        questions = policy.get("interview_questions") or []
        if not 6 <= len(questions) <= 12 or any(not isinstance(q, str) or not q.strip() or len(q) > 180 for q in questions):
            raise ValueError("면접 시나리오에는 주요 질문을 6~12개 준비해야 합니다.")
        rubric = policy.get("interview_rubric")
        items = ([{**q, "episode_id": episodes[0].id} for q in rubric["questions"]] if rubric else
                 [{"id": f"question-{i+1}", "text": q, "episode_id": episodes[0].id} for i, q in enumerate(questions)])
        value = {"version": VERSION, "mode": service_mode, "items": items, "index": 0,
                 "attempts": {}, "met": [], "unmet": [], "unverified": [], "reason": None, "finished": False}
    elif service_mode == "workplace":
        plan = _plan_workplace(session, scenario, episodes, rng)
        items = flatten_plan_items(plan)
        if not items:
            raise ValueError("직장대화 Day Plan에 비트가 없습니다.")
        value = {
            "version": VERSION,
            "mode": CONTINUOUS_MODE,
            "items": items,
            "index": 0,
            "attempts": {},
            "met": [],
            "unmet": [],
            "unverified": [],
            "reason": None,
            "finished": False,
            "plan": {"version": plan.get("version"), "source": plan.get("source"), "carry_seed": plan.get("carry_seed", "")},
            "carry": plan.get("carry_seed") or "",
        }
    else:
        items = [{**item, "id": f"{ep.id}:{item['id']}", "episode_id": ep.id,
                  "text": item.get("followup") or f"{item['label']} 내용을 구체적으로 말씀해 주세요."}
                 for ep in episodes for item in (ep.checklist or [])]
        if not items:
            raise ValueError("훈련 시나리오에는 목표 체크리스트가 필요합니다.")
        value = {"version": VERSION, "mode": service_mode, "items": items, "index": 0,
                 "attempts": {}, "met": [], "unmet": [], "unverified": [], "reason": None, "finished": False}
    if service_mode == "interview" and policy.get("interview_rubric"):
        value.update(rubric_version=rubric["version"], brief=rubric["brief"], question_results={})
    if service_mode == "training" and policy.get("cafe_orders_version"):
        from app.services import cafe
        value = cafe.initialize(value, session.difficulty)
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
    if value.get("cafe"):
        from app.services import cafe
        value = cafe.advance(value, turn, (judgment or {}).get("cafe_assessment"))
        save(session, value)
        return value
    if value.get("rubric_version"):
        from app.services import interview
        assessment = (judgment or {}).get("interview_assessment") or {"status": "uncertain", "bonus_ids": [], "explanation": "분석 자료 없음"}
        value = interview.advance(value, turn, assessment)
        if judgment is not None:
            judgment["interview_result"] = next(r for r in value["question_results"].values() if turn.id in r["answer_turn_ids"])
        save(session, value)
        return value
    items = value["items"]
    if value["mode"] in SCRIPT_MODES:
        # 빈 답변은 API에서 거부한다. 후속 질문은 준비된 장면 수에 넣지 않는다.
        if turn.question_type in {"initial", "main"}:
            current = items[value["index"]]
            value["met"] = list(dict.fromkeys([*value["met"], current["id"]]))
            # 연속 모드: 막이 바뀔 때 직전 사용자 답을 carry로 한 줄 요약(잘라 저장)
            if value["mode"] == CONTINUOUS_MODE:
                nxt = value["index"] + 1
                if nxt < len(items) and items[nxt].get("act_id") != current.get("act_id"):
                    snippet = (turn.response_text or "").strip().replace("\n", " ")
                    value["carry"] = snippet[:120]
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
            # 처음 질문 + 추가 질문 2회에도 확인하지 못했다면 미달성/확인 불가로 남깁니다.
            # 다음 항목으로 넘어간다고 해서 이 목표를 달성했다고 기록하지는 않습니다.
            bucket = "unverified" if judgment and judgment.get("semantic_status") == "unavailable" else "unmet"
            value[bucket] = list(dict.fromkeys([*value[bucket], current["id"]]))
        while value["index"] < len(items) and items[value["index"]]["id"] in value["met"] + value["unmet"] + value["unverified"]:
            value["index"] += 1
    if value["index"] >= len(items):
        value["finished"] = True
        value["reason"] = "questions_completed" if value["mode"] in SCRIPT_MODES else "goals_met" if len(value["met"]) == len(items) else "analysis_unavailable" if value.get("unverified") else "goals_exhausted"
    save(session, value)
    return value


def current_briefing(value):
    if value.get("mode") not in {"workplace", CONTINUOUS_MODE} or value.get("finished"):
        return None
    items = value.get("items") or []
    index = value.get("index", 0)
    if index >= len(items):
        return None
    item = items[index]
    return {
        "category_id": item.get("category_id", "") or item.get("act_id", ""),
        "category_label": item.get("category_label", "") or item.get("act_label", ""),
        "title": item.get("title", ""),
        "situation": item.get("situation", ""),
        "tip": item.get("tip", ""),
        "step": index + 1,
        "total": len(items),
        "goal": item.get("goal", ""),
    }


def public_state(session):
    value = state(session)
    if not value:
        return {}
    payload = {key: value[key] for key in ("version", "mode", "index", "met", "unmet", "finished", "reason")} | {"total": len(value["items"]), "pending_confirmation": value.get("pending_confirmation", False), "unverified": value.get("unverified", []),
        "finished": value["finished"] and not value.get("pending_confirmation", False)}
    briefing = current_briefing(value)
    if briefing:
        payload["briefing"] = briefing
    return payload


def finish_manually(session):
    value = state(session)
    if value and (not value.get("finished") or value.get("pending_confirmation")):
        value["finished"] = True
        value["reason"] = "manual"
        value["pending_confirmation"] = False
        if value.get("cafe"):
            from app.services import cafe
            ids = value["cafe"]["seen_turns"]
            outcome = cafe.result(value, ids[-1] if ids else 0)
            value["cafe_result"] = outcome
            value["reason"] = "goals_met" if outcome["goal_met"] else "goals_exhausted" if outcome["measured"] else "analysis_unavailable"
            value["met"] = [item["id"] for item in value["items"]] if outcome["goal_met"] else []
        if value.get("rubric_version"):
            value["unverified"] = list(dict.fromkeys([*value.get("unverified", []), *[item["id"] for item in value["items"] if item["id"] not in value["met"] + value["unmet"]]]))
        else:
            value["unmet"] = [item["id"] for item in value["items"] if item["id"] not in value["met"] + value.get("unverified", [])]
        save(session, value)
