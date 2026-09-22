from random import Random
from types import SimpleNamespace as NS

from app.services import interaction
from app.services.workplace import (
    CONTINUOUS_MODE,
    continuous_fallback_line,
    flatten_plan_items,
    pick_workplace_episodes,
    total_turns,
    validate_day_plan,
)


def _categories():
    return [
        {"id": "morning", "label": "출근", "orders": [1, 2, 3]},
        {"id": "work", "label": "업무", "orders": [4, 5, 6, 7, 8, 9, 10, 11, 12]},
        {"id": "leaving", "label": "퇴근", "orders": [13, 14, 15]},
    ]


def _episodes():
    # 막별 대표 캐릭터 — 출근=박/이, 업무=최, 퇴근=박 (실제 팩과 비슷하게)
    char = {1: "park_senior", 2: "park_senior", 3: "lee_teamlead"}
    return [
        NS(
            id=order,
            order=order,
            title=f"장면 {order}",
            situation=f"상황 {order}",
            initial_question=f"대사 {order}",
            character_id=char.get(order, "choi_coworker" if order < 13 else "park_senior"),
            virtual_time="09:00",
            question_intent="방향을 확인한다",
            checklist=[{"id": "g", "label": "방향 확인", "tip": f"팁 {order}", "keywords": ["자료 확인", "이해한 방향"]}],
        )
        for order in range(1, 16)
    ]


def test_pick_one_scene_per_category_is_stable_with_seed():
    scenario = NS(world_setting={"workplace_categories": _categories()})
    first = pick_workplace_episodes(scenario, _episodes(), Random(7))
    second = pick_workplace_episodes(scenario, _episodes(), Random(7))
    assert [episode.order for episode in first] == [episode.order for episode in second]
    assert len(first) == 3


def test_workplace_session_advances_through_twelve_beats():
    session = NS(rapport={}, mode=5, difficulty="basic")
    scenario = NS(
        title="직장",
        description="",
        characters=[{"id": "park_senior", "name": "박선임", "role": "선임", "personality": "x", "speech_style": "y"}],
        world_setting={"workplace_categories": _categories()},
    )
    interaction.initialize(session, scenario, _episodes(), "workplace", rng=Random(7))
    flow = interaction.state(session)
    assert flow["mode"] == CONTINUOUS_MODE
    assert len(flow["items"]) == 12
    briefing = interaction.public_state(session)["briefing"]
    assert briefing["step"] == 1 and briefing["category_label"] == "출근"
    for step in range(11):
        result = interaction.advance(
            session,
            NS(response_text="답변", question_type="initial" if step == 0 else "main"),
            [],
        )
        assert not result["finished"]
        assert interaction.public_state(session)["briefing"]["step"] == step + 2
    result = interaction.advance(session, NS(response_text="답변", question_type="main"), [])
    assert result["finished"] and result["reason"] == "questions_completed"
    assert "briefing" not in interaction.public_state(session)


def test_mode_ten_uses_twenty_turns():
    assert total_turns(10) == 20
    session = NS(rapport={}, mode=10, difficulty="basic")
    scenario = NS(
        title="직장",
        description="",
        characters=[{"id": "park_senior", "name": "박선임", "role": "선임", "personality": "x", "speech_style": "y"}],
        world_setting={"workplace_categories": _categories()},
    )
    interaction.initialize(session, scenario, _episodes(), "workplace", rng=Random(1))
    assert len(interaction.state(session)["items"]) == 20


def test_validate_day_plan_rejects_bad_character():
    episodes = _episodes()
    plan = {
        "acts": [
            {"id": "morning", "character_id": "nope", "beat_goals": ["a", "b", "c", "d"],
             "checklist": [{"id": "g", "label": "목표", "keywords": ["자료 확인", "이해한 방향"], "tip": "팁"}]},
            {"id": "work", "character_id": "park_senior", "beat_goals": ["a"] * 5,
             "checklist": [{"id": "g", "label": "목표", "keywords": ["자료 확인", "이해한 방향"], "tip": "팁"}]},
            {"id": "leaving", "character_id": "park_senior", "beat_goals": ["a"] * 3,
             "checklist": [{"id": "g", "label": "목표", "keywords": ["자료 확인", "이해한 방향"], "tip": "팁"}]},
        ]
    }
    try:
        validate_day_plan(plan, {"park_senior"}, 5, episodes, _categories())
        assert False, "should raise"
    except ValueError:
        pass


def test_validate_day_plan_syncs_character_opening_to_act_episode():
    """출근 막에 최동료를 넣어도 출근 장면·오프닝·캐릭터로 교정한다."""
    episodes = _episodes()
    plan = {
        "acts": [
            {
                "id": "morning",
                "character_id": "choi_coworker",
                "opening_line": "원래 제가 계속 생각하고 있던 방향이에요.",
                "beat_goals": ["a", "b", "c", "d"],
                "checklist": [{"id": "g", "label": "방향 확인", "keywords": ["자료 확인", "이해한 방향"], "tip": "팁"}],
            },
            {
                "id": "work",
                "character_id": "choi_coworker",
                "beat_goals": ["a"] * 5,
                "checklist": [{"id": "g", "label": "방향 확인", "keywords": ["자료 확인", "이해한 방향"], "tip": "팁"}],
            },
            {
                "id": "leaving",
                "character_id": "park_senior",
                "beat_goals": ["a"] * 3,
                "checklist": [{"id": "g", "label": "방향 확인", "keywords": ["자료 확인", "이해한 방향"], "tip": "팁"}],
            },
        ]
    }
    out = validate_day_plan(
        plan,
        {"park_senior", "lee_teamlead", "choi_coworker"},
        5,
        episodes,
        _categories(),
    )
    morning = out["acts"][0]
    assert morning["character_id"] in {"park_senior", "lee_teamlead"}
    anchor = next(ep for ep in episodes if ep.id == morning["episode_id"])
    assert morning["opening_line"] == anchor.initial_question
    assert morning["opening_line"] != "원래 제가 계속 생각하고 있던 방향이에요."
    assert morning["character_id"] == anchor.character_id
    assert morning["situation"] == anchor.situation
    assert morning["checklist"][0]["tip"] == anchor.checklist[0]["tip"]


def test_flatten_avoids_goal_probe_template():
    plan = {
        "acts": [{
            "id": "morning",
            "label": "출근",
            "character_id": "park_senior",
            "episode_id": 1,
            "title": "장면",
            "situation": "상황",
            "virtual_time": "09:00",
            "opening_line": "자료 한번 보세요.",
            "fallback_pool": [
                "자료 한번 보세요.",
                "할 일 없으면 먼저 물어봐야죠.",
                "부모님은 무슨 일 하세요?",
            ],
            "beat_goals": ["방향을 확인한다", "방향 확인", "방향 확인", "방향 확인"],
            "checklist": [{"id": "g", "label": "방향 확인", "keywords": ["자료 확인", "이해한 방향"], "tip": "팁"}],
            "tip": "팁",
        }]
    }
    items = flatten_plan_items(plan)
    assert items[0]["text"] == "자료 한번 보세요."
    assert all("에 대해 구체적으로 말씀해 주시겠어요?" not in item["text"] for item in items)
    assert items[1]["text"] == "할 일 없으면 먼저 물어봐야죠."
    assert items[1]["fallback_pool"] == plan["acts"][0]["fallback_pool"]


def test_continuous_fallback_uses_catchphrase_and_last_reply():
    character = {"catchphrases": ["그냥 좀", "신입인데"]}
    turns = [NS(response_text="네 알겠습니다")]
    item = {"goal": "방향을 확인한다", "label": "방향 확인"}
    line = continuous_fallback_line(character, turns, item)
    assert line.startswith("그냥 좀")
    assert "네 알겠습니다" in line
    assert "에 대해 구체적으로" not in line


def test_continuous_fallback_prefers_scene_pool_over_reactions():
    character = {
        "catchphrases": ["그냥 좀"],
        "reactions": {"risky": ["지금 그 말투는 좀 아니지 않아요? 다시 말해봐요."]},
    }
    item = {
        "goal": "방향",
        "fallback_pool": [
            "자료 한번 쭉 보고 알아서 파악해보세요.",
            "부모님은 무슨 일 하세요? 애인은 있어요?",
            "할 일 없으면 먼저 물어봐야죠.",
        ],
    }
    line = continuous_fallback_line(
        character,
        [NS(response_text="ㅅㅂ", question_text="자료 한번 쭉 보고 알아서 파악해보세요.")],
        item,
        case="risky",
    )
    assert line in item["fallback_pool"]
    assert line != "자료 한번 쭉 보고 알아서 파악해보세요."


def test_continuous_fallback_skips_used_openings_then_reactions():
    """세션 43 — 장면 풀을 다 쓰면 첫 오프닝을 재사용하지 않고 리액션으로 간다."""
    character = {
        "catchphrases": ["그냥 좀"],
        "reactions": {"missing": ["아니 그래서, 이해한 게 뭐예요? 그냥 좀 말해봐요."]},
    }
    pool = [
        "자료 한번 쭉 보고 알아서 파악해보세요. 신입이라고 하나하나 알려드릴 수는 없으니까.",
        "부모님은 무슨 일 하세요? 애인은 있어요?",
        "할 일 없으면 먼저 물어봐야죠.",
    ]
    turns = [
        NS(question_text=pool[0], response_text="네"),
        NS(question_text=pool[1], response_text="네"),
        NS(question_text=pool[2], response_text="네"),
    ]
    line = continuous_fallback_line(
        character, turns, {"goal": "방향", "fallback_pool": pool}, case="missing",
    )
    assert line not in pool
    assert "이해한 게" in line


def test_build_fallback_plan_keeps_one_anchor_per_category():
    from app.services.workplace import build_fallback_plan

    scenario = NS(world_setting={"workplace_categories": _categories()})
    plan = build_fallback_plan(scenario, _episodes(), mode=5, rng=Random(7))
    assert len(plan["acts"]) == 3
    for act in plan["acts"]:
        assert len(act["fallback_pool"]) == 1
        assert act["opening_line"] == act["fallback_pool"][0]
    items = flatten_plan_items(plan)
    morning = [row for row in items if row["act_id"] == "morning"]
    assert all(len(row["fallback_pool"]) == 1 for row in morning)


def test_continuous_fallback_prefers_reaction_pool_for_case():
    character = {
        "catchphrases": ["그냥 좀"],
        "reactions": {"risky": ["지금 그 말투는 좀 아니지 않아요? 다시 말해봐요."]},
    }
    line = continuous_fallback_line(
        character, [NS(response_text="ㅅㅂ")], {"goal": "방향"}, case="risky",
    )
    assert "말투" in line


def test_act_bridge_line_mentions_carry_then_opening():
    from app.services.workplace import act_bridge_line

    line = act_bridge_line(
        {"catchphrases": ["그래서"]},
        "자료를 먼저 확인하겠습니다",
        {"text": "이거 오늘까지 해보세요."},
    )
    assert "자료를 먼저 확인" in line
    assert "이거 오늘까지" in line


def test_flatten_marks_act_open_after_morning():
    plan = {
        "acts": [
            {
                "id": "morning", "label": "출근", "character_id": "park_senior", "episode_id": 1,
                "title": "a", "situation": "s", "virtual_time": "09:00",
                "opening_line": "오프닝1", "beat_goals": ["g1", "g2"],
                "checklist": [{"id": "g", "label": "방향 확인", "keywords": ["a", "b"], "tip": "t"}], "tip": "t",
            },
            {
                "id": "work", "label": "업무", "character_id": "choi_coworker", "episode_id": 5,
                "title": "b", "situation": "s", "virtual_time": "11:00",
                "opening_line": "오프닝2", "beat_goals": ["g1"],
                "checklist": [{"id": "g", "label": "방향 확인", "keywords": ["a", "b"], "tip": "t"}], "tip": "t",
            },
        ]
    }
    items = flatten_plan_items(plan)
    assert items[0]["act_open"] is False
    assert items[2]["act_open"] is True and items[2]["text"] == "오프닝2"


def test_dialogue_stats_snapshot_tracks_fallback_rate():
    from app.services.dialogue import stats as dialogue_stats

    before = dialogue_stats.snapshot()
    dialogue_stats.note_generated()
    dialogue_stats.note_fallback()
    after = dialogue_stats.snapshot()
    assert after["generated"] == before["generated"] + 1
    assert after["fallback"] == before["fallback"] + 1
    assert after["total"] == before["total"] + 2


def test_training_ignores_workplace_pack_slug():
    from fastapi.testclient import TestClient

    from app.main import app
    from app.seed.run import seed

    seed()
    created = TestClient(app).post("/api/sessions", json={
        "service_mode": "training",
        "scenario_slug": "workplace-conversation",
        "mode": 5,
        "consent": {"agreed": True, "storage_policy": "none"},
    })
    assert created.status_code == 200, created.text
    assert created.json()["scenario"]["slug"] != "workplace-conversation"


def test_workplace_without_categories_uses_training_flow():
    session = NS(rapport={}, mode=5)
    episode = NS(id=1, checklist=[{"id": "g", "label": "목표", "keywords": ["자료 확인"], "followup": "이어서 말씀해 주세요."}])
    interaction.initialize(session, NS(world_setting={}), [episode], "workplace")
    assert interaction.state(session)["mode"] == "training"


def test_workplace_api_starts_with_briefing_and_script_line():
    from fastapi.testclient import TestClient

    from app.main import app
    from app.seed.run import seed

    seed()
    created = TestClient(app).post("/api/sessions", json={
        "service_mode": "workplace",
        "mode": 5,
        "consent": {"agreed": True, "storage_policy": "none"},
    })
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["scenario"]["slug"] == "workplace-conversation"
    briefing = body["interaction"]["briefing"]
    assert briefing["total"] == 12
    assert briefing["step"] == 1
    assert briefing["situation"]
    assert body["interaction"]["mode"] == CONTINUOUS_MODE
    assert body["current_turn"]["question_type"] == "initial"
    assert body["current_turn"]["question_text"]
    char_id = body["current_turn"]["character_id"]
    characters = {c["id"]: c["name"] for c in body["scenario"]["characters"]}
    assert char_id in characters
    assert "에 대해 구체적으로 말씀해 주시겠어요?" not in body["current_turn"]["question_text"]
