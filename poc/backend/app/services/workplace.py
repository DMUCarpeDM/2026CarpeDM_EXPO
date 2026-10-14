"""직장대화 — 출근·업무·퇴근 3막. 연속 턴 예산은 mode(5=12턴, 10=20턴)."""
import random
import re
import json
from pathlib import Path

from app.services.role_boundary import is_role_drift

WORKPLACE_SLUG = "workplace-conversation"
PLAN_VERSION = "workplace-continuous-v1"
CONTINUOUS_MODE = "workplace_continuous"
# 전시 기본 12턴(mode=5), 옵션 20턴(mode=10)
TURN_BUDGETS = {5: {"morning": 4, "work": 5, "leaving": 3}, 10: {"morning": 6, "work": 8, "leaving": 6}}
ACT_IDS = ("morning", "work", "leaving")
ACT_LABELS = {"morning": "출근", "work": "업무", "leaving": "퇴근"}
# LLM 실패 시 카테고리마다 기존 팩 장면 오프닝을 이만큼 뽑아 폴백 대사로 돌린다.
FALLBACK_SCENES_PER_CATEGORY = 3
_HANGUL = re.compile(r"[가-힣]")
_SPACE = re.compile(r"\s+")


def turn_budget(mode: int) -> dict[str, int]:
    return dict(TURN_BUDGETS.get(mode, TURN_BUDGETS[5]))


def total_turns(mode: int) -> int:
    return sum(turn_budget(mode).values())


def _episodes_for_category(group, by_order: dict) -> list:
    return [by_order[order] for order in group.get("orders") or [] if order in by_order]


def pick_category_fallback_scenes(scenario, episodes, rng=None, k: int = FALLBACK_SCENES_PER_CATEGORY) -> dict[str, list]:
    """카테고리별 기존 장면 k개를 랜덤 추출한다. 폴백 대사 풀·앵커 장면용."""
    rng = rng or random
    groups = (getattr(scenario, "world_setting", None) or {}).get("workplace_categories") or []
    by_order = {episode.order: episode for episode in episodes}
    pools: dict[str, list] = {}
    for group in groups:
        act_id = group.get("id") or ""
        choices = _episodes_for_category(group, by_order)
        if not choices:
            raise ValueError(f"직장대화 카테고리 '{group.get('label', act_id)}'에 장면이 없습니다.")
        n = min(k, len(choices))
        pools[act_id] = rng.sample(choices, n)
    return pools


def pick_workplace_episodes(scenario, episodes, rng=None):
    """카테고리 순서대로 장면 1개씩 고른다. rng는 테스트에서 고정한다."""
    rng = rng or random
    pools = pick_category_fallback_scenes(scenario, episodes, rng, k=1)
    groups = (getattr(scenario, "world_setting", None) or {}).get("workplace_categories") or []
    picked = [pools[group.get("id") or ""][0] for group in groups]
    if len(picked) != len(ACT_IDS):
        raise ValueError(f"직장대화는 카테고리 {len(ACT_IDS)}개가 필요합니다.")
    return picked


def fallback_lines_from_scenes(scenes) -> list[str]:
    """장면 initial_question을 폴백 한 줄 풀로 정규화한다."""
    lines = []
    for scene in scenes or []:
        text = _SPACE.sub(" ", (getattr(scene, "initial_question", None) or "").strip())
        if text and text not in lines:
            lines.append(text[:180])
    return lines[:FALLBACK_SCENES_PER_CATEGORY]


def enrich_plan_fallback_pools(plan: dict, scenario, episodes, rng=None) -> dict:
    """대체 질문도 현재 장면의 인물·상황·평가 기준을 유지한다."""
    by_id = {episode.id: episode for episode in episodes}
    for act in plan.get("acts") or []:
        anchor = by_id[act["episode_id"]]
        act["fallback_pool"] = fallback_lines_from_scenes([anchor])
    return plan


def scene_item(episode, category):
    """짧은 폴백(구 SCRIPT)용 장면 한 칸."""
    tip_item = (episode.checklist or [{}])[0]
    return {
        "id": f"{episode.id}:scene",
        "episode_id": episode.id,
        "text": episode.initial_question,
        "title": episode.title,
        "situation": episode.situation,
        "category_id": category.get("id", ""),
        "category_label": category.get("label", ""),
        "tip": tip_item.get("tip") or tip_item.get("comment") or "",
    }


def _checklist_row(episode) -> dict:
    row = (episode.checklist or [{}])[0]
    keywords = [kw for kw in (row.get("keywords") or []) if isinstance(kw, str) and kw.strip()]
    if len(keywords) < 2:
        keywords = list(dict.fromkeys([*keywords, "이해한 방향", "확인받"]))[:2]
    return {
        "id": row.get("id") or f"ep-{episode.id}-goal",
        "label": row.get("label") or episode.title,
        "keywords": keywords[:6],
        "tip": row.get("tip") or row.get("comment") or "",
    }


def build_fallback_plan(scenario, episodes, mode: int, rng=None) -> dict:
    """카테고리별 장면 하나를 골라 동일한 상황을 이어가는 3막을 만든다."""
    rng = rng or random
    categories = (getattr(scenario, "world_setting", None) or {}).get("workplace_categories") or []
    scene_pools = pick_category_fallback_scenes(scenario, episodes, rng)
    budget = turn_budget(mode)
    acts = []
    for category in categories:
        act_id = category.get("id") or "work"
        pool = scene_pools.get(act_id) or []
        episode = pool[0]
        lines = fallback_lines_from_scenes([episode])
        n = budget.get(act_id, 4)
        check = _checklist_row(episode)
        goals = []
        for i in range(n):
            if i == 0:
                goals.append(episode.question_intent or check["label"])
            elif i == n - 1 and act_id == "leaving":
                goals.append("오늘 대화를 정리하고 자연스럽게 마무리한다.")
            else:
                goals.append(check["label"])
        acts.append({
            "id": act_id,
            "label": category.get("label") or act_id,
            "character_id": episode.character_id,
            "virtual_time": episode.virtual_time or "",
            "thread": episode.situation or episode.title,
            "beat_goals": goals,
            "opening_line": lines[0] if lines else episode.initial_question,
            "fallback_pool": lines,
            "checklist": [check],
            "episode_id": episode.id,
            "title": episode.title,
            "situation": episode.situation,
            "tip": check["tip"],
        })
    return {"version": PLAN_VERSION, "source": "fallback", "acts": acts, "carry_seed": ""}


# One prepared situation is selected per session; all five replies stay in it.
EXHIBITION_SCENES = json.loads((Path(__file__).parents[1] / "seed/workplace-exhibition.json").read_text(encoding="utf-8"))
EXHIBITION_ORDERS = tuple(scene["order"] for scene in EXHIBITION_SCENES)


def build_exhibition_plan(scenario, episodes, rng=None):
    rng = rng or random
    by_order = {ep.order: ep for ep in episodes}
    if any(order not in by_order for order in EXHIBITION_ORDERS):
        raise ValueError("전시용 시나리오가 준비되지 않았습니다.")
    groups = (scenario.world_setting or {}).get("workplace_categories") or []
    selected = rng.choice(EXHIBITION_SCENES)
    ep = by_order[selected["order"]]
    category = next(group for group in groups if selected["order"] in group.get("orders", []))
    check = dict(selected["checklist"])
    act = {
        "id": f"scene-{selected['order']}", "label": category["label"],
        "category_id": category["id"], "character_id": "park_senior",
        "actor_persona": selected["actor_persona"],
        "actor_brief": selected["actor_brief"],
        "episode_id": ep.id, "title": selected["title"], "situation": selected["situation"],
        "virtual_time": "", "tip": check["tip"], "checklist": [check],
        "opening_line": selected["opening_line"], "fallback_pool": [selected["opening_line"]],
        "beat_goals": list(selected["beat_goals"]),
        "dialogue_intents": list(selected["dialogue_intents"]),
    }
    return {"version": "workplace-exhibition-v2", "source": "curated-random", "acts": [act], "carry_seed": ""}


def _valid_keywords(keywords) -> list[str]:
    cleaned = []
    for kw in keywords or []:
        if not isinstance(kw, str):
            continue
        text = kw.strip()
        if len(text) < 2 or not _HANGUL.search(text):
            continue
        cleaned.append(text)
    return list(dict.fromkeys(cleaned))[:8]


def _orders_for_act(act_id: str, categories) -> list[int]:
    for group in categories or []:
        if group.get("id") == act_id:
            return list(group.get("orders") or [])
    return []


def anchor_episode_for_act(act_id: str, character_id: str, episodes, categories=None):
    """막(카테고리)과 캐릭터가 맞는 팩 장면을 고른다. 막 밖 캐릭터면 그 막의 장면으로 교정한다."""
    by_order = {ep.order: ep for ep in episodes}
    in_act = [by_order[order] for order in _orders_for_act(act_id, categories) if order in by_order]
    matched = [ep for ep in in_act if ep.character_id == character_id]
    if matched:
        return matched[0]
    if in_act:
        return in_act[0]
    return next((ep for ep in episodes if ep.character_id == character_id), episodes[0])


def _last_user_reply(turns) -> str:
    for turn in reversed(list(turns or [])):
        text = (getattr(turn, "response_text", None) or "").strip()
        if text:
            return _SPACE.sub(" ", text)
    return ""


def validate_day_plan(plan: dict, character_ids: set[str], mode: int, episodes, categories=None) -> dict:
    """Planner JSON을 런타임 BeatSheet로 정규화한다. 실패 시 ValueError.

    막·캐릭터·오프닝·에피소드는 팩 장면 한 세트로 맞춘다(이름/대사 불일치 방지).
    """
    if not isinstance(plan, dict):
        raise ValueError("플랜이 객체가 아닙니다")
    acts_in = plan.get("acts")
    if not isinstance(acts_in, list) or len(acts_in) != len(ACT_IDS):
        raise ValueError("막은 정확히 3개여야 합니다")
    budget = turn_budget(mode)
    acts = []
    for expected_id, raw in zip(ACT_IDS, acts_in):
        if not isinstance(raw, dict):
            raise ValueError("막 형식이 올바르지 않습니다")
        act_id = raw.get("id") or expected_id
        if act_id != expected_id:
            raise ValueError(f"막 순서는 {ACT_IDS} 고정입니다")
        requested = raw.get("character_id")
        if requested not in character_ids:
            raise ValueError(f"알 수 없는 character_id: {requested}")
        n = budget[act_id]
        goals = [str(g).strip() for g in (raw.get("beat_goals") or []) if str(g).strip()]
        if len(goals) < n:
            goals = [*goals, *([goals[-1] if goals else "대화를 이어간다"] * (n - len(goals)))]
        goals = goals[:n]
        checklist_in = raw.get("checklist") or []
        checklist = []
        for i, row in enumerate(checklist_in[:2]):
            if not isinstance(row, dict):
                continue
            keywords = _valid_keywords(row.get("keywords"))
            if len(keywords) < 2:
                continue
            label = str(row.get("label") or "대화 목표").strip()[:80]
            tip = str(row.get("tip") or "").strip()[:400]
            checklist.append({
                "id": str(row.get("id") or f"{act_id}-goal-{i+1}")[:40],
                "label": label or "대화 목표",
                "keywords": keywords,
                "tip": tip,
            })
        anchor = anchor_episode_for_act(act_id, requested, episodes, categories)
        character_id = anchor.character_id
        situation = str(raw.get("thread") or anchor.situation or "")[:240]
        if character_id != requested:
            # 인물을 교정했다면 그 인물이 맡던 상황·목표까지 함께 교정한다.
            situation = anchor.situation or ""
            checklist = [_checklist_row(anchor)]
            goals = [anchor.question_intent or checklist[0]["label"]] * n
        tip = checklist[0]["tip"] if checklist else ""
        if not checklist:
            check = _checklist_row(anchor)
            checklist = [check]
            tip = check["tip"]
        acts.append({
            "id": act_id,
            # 영문 라벨(Morning 등)이 프롬프트로 새면 Act: Morning 에코가 난다 — 카테고리 한글 고정.
            "label": next(
                (str(g.get("label") or "").strip() for g in (categories or []) if g.get("id") == act_id and str(g.get("label") or "").strip()),
                ACT_LABELS.get(act_id, act_id),
            )[:40],
            "character_id": character_id,
            "virtual_time": anchor.virtual_time or "",
            "thread": situation,
            "beat_goals": goals,
            # 오프닝은 팩 장면 고정 — 모델 opening_line이 다른 캐릭터 대사를 가져오는 경우 차단
            "opening_line": anchor.initial_question,
            "checklist": checklist,
            "episode_id": anchor.id,
            "title": anchor.title,
            "situation": situation or anchor.situation,
            "tip": tip,
        })
    return {
        "version": PLAN_VERSION,
        "source": plan.get("source") or "gemini",
        "acts": acts,
        "carry_seed": str(plan.get("carry_seed") or "")[:200],
    }


def flatten_plan_items(plan: dict) -> list[dict]:
    """BeatSheet를 interaction.items(한 칸 = 사용자 1턴)로 펼친다.

    첫 비트는 준비된 오프닝이며, 이후 text는 AI에 전달할 장면 맥락이다.
    후속 대사는 AI가 반환한 본문만 사용한다.
    """
    items = []
    for act_index, act in enumerate(plan["acts"]):
        check = (act.get("checklist") or [{}])[0]
        goals = act["beat_goals"]
        scene_pool = [str(line).strip() for line in (act.get("fallback_pool") or []) if str(line).strip() and not is_role_drift(str(line))]
        if not scene_pool and act.get("opening_line"):
            scene_pool = [act["opening_line"]]
        for i, goal in enumerate(goals):
            if i == 0:
                text = act["opening_line"]
            elif scene_pool:
                text = scene_pool[i % len(scene_pool)]
            else:
                text = ""
            items.append({
                "id": f"{act['id']}:{i+1}",
                "assessment_id": f"{act['id']}:{check.get('id') or 'goal'}",
                "episode_id": act["episode_id"],
                "text": text,
                "goal": goal,
                "dialogue_intent": (act.get('dialogue_intents') or [''] * len(goals))[i],
                "act_id": act["id"],
                "act_label": act["label"],
                "actor_persona": act.get("actor_persona"),
                "actor_brief": act.get("actor_brief"),
                "act_open": i == 0 and act_index > 0,
                "category_id": act.get("category_id", act["id"]),
                "category_label": act["label"],
                "title": act.get("title") or act["label"],
                "situation": act.get("situation") or act.get("thread") or "",
                "character_id": act["character_id"],
                "virtual_time": act.get("virtual_time") or "",
                "tip": act.get("tip") or check.get("tip") or "",
                "label": check.get("label") or goal,
                "keywords": list(check.get("keywords") or []),
                "fallback_pool": list(scene_pool),
            })
    return items
