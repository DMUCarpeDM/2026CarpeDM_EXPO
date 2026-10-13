from random import Random
from types import SimpleNamespace as NS
import json
from pathlib import Path

from app.services import interaction, context_scoring
from app.services.workplace import build_exhibition_plan, flatten_plan_items, EXHIBITION_ORDERS, EXHIBITION_SCENES


def fixture():
    pack = json.loads((Path(__file__).parents[1] / 'app/seed/packs/workplace-conversation.json').read_text())
    return NS(world_setting=pack['world_setting']), [NS(id=e['order'], **e) for e in pack['episodes']]


def test_one_of_four_prepared_scenarios_has_five_continuous_beats():
    scenario, episodes = fixture()
    assert EXHIBITION_ORDERS == (2, 13, 15, 5)
    assert len(EXHIBITION_SCENES) == 4
    selected_orders = set()
    for seed in range(30):
        plan = build_exhibition_plan(scenario, episodes, Random(seed))
        items = flatten_plan_items(plan)
        assert len(plan['acts']) == 1
        assert len(items) == 5
        assert items[0]["text"] in [s["opening_line"] for s in EXHIBITION_SCENES]
        assert len({item['id'] for item in items}) == 5
        assert len({item['episode_id'] for item in items}) == 1
        assert len({item['assessment_id'] for item in items}) == 1
        assert not any(item['act_open'] for item in items)
        episode_id = items[0]['episode_id']
        selected_orders.add(episode_id)
        configured = next(scene for scene in EXHIBITION_SCENES if scene['order'] == episode_id)
        assert all(item["label"] == configured["checklist"]["label"] for item in items)
        assert all(item["actor_persona"] == configured["actor_persona"] for item in items)
        assert [item['goal'] for item in items] == configured['beat_goals']
        assert all(item['situation'] == configured['situation'] for item in items)
        assert items == flatten_plan_items(build_exhibition_plan(scenario, episodes, Random(seed)))
    assert selected_orders == set(EXHIBITION_ORDERS)


def test_exhibition_skips_planning_and_keeps_one_scenario_until_fifth_answer(monkeypatch):
    scenario, episodes = fixture()
    session = NS(rapport={}, mode=5)
    monkeypatch.setattr(interaction, '_plan_workplace', lambda *a: (_ for _ in ()).throw(AssertionError('slow planner called')))
    flow = interaction.initialize(session, scenario, episodes, 'workplace', Random(4), exhibition=True)
    overview = interaction.public_state(session)['overview']
    assert len(overview) == 1
    assert interaction.public_state(session)['total'] == 5
    for index in range(5):
        assert interaction.public_state(session)['overview'] == overview
        assert interaction.current_briefing(flow)['step'] == 1
        assert interaction.current_briefing(flow)['total'] == 1
        flow = interaction.advance(session, NS(question_type='main', response_text='확인하겠습니다.'), [], {})
        assert flow['finished'] is (index == 4)


def test_exhibition_api_finishes_in_five_answers_and_retains_scenario_history(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.seed.run import seed
    from app.core.database import SessionLocal
    from app.models import RoleplaySession
    from app.core.config import settings
    from pydantic import SecretStr
    monkeypatch.setattr(settings, 'dialogue_provider', 'openai')
    monkeypatch.setattr(settings, 'openai_api_key', SecretStr(''))
    seed()
    seen = []
    history_sizes = []
    generated = []
    from app.services.dialogue.openai_provider import OpenAIDialogueProvider
    def followup(self, session, scenario, character, turns, flow, item):
        assert all(t.episode_id == item['episode_id'] for t in turns)
        assert all(t.character_id == item['character_id'] for t in turns)
        generated.append(len(turns))
        return f"방금 말한 내용에서 다음 행동을 설명해 주세요. {len(turns)}번째 확인이에요."
    monkeypatch.setattr(OpenAIDialogueProvider, '_generate_continuous_line', followup)
    def judge(turn, history, *args):
        assert all(t.episode_id == turn.episode_id for t in history)
        history_sizes.append(len([t for t in history if t.id != turn.id and t.response_text]))
        return [], [], 'completed'
    monkeypatch.setattr('app.services.response_judgment.analyze', judge)
    monkeypatch.setattr(context_scoring, 'classify', lambda *a: {'kind':'neutral','status':'unavailable','multipliers':context_scoring.POLICIES['neutral']})
    client = TestClient(app)
    response = client.post('/api/sessions', json={'service_mode':'workplace','scenario_slug':'workplace-conversation',
        'exhibition':True,'consent':{'agreed':True,'storage_policy':'none'}})
    assert response.status_code == 200, response.text
    data=response.json(); sid=data['id']; auth={'X-Session-Token':data['access_token']}
    overview=data['interaction']['overview']; assert len(overview)==1
    turn=data['current_turn']
    for index in range(5):
        seen.append(turn['episode_id'])
        resumed=client.get(f'/api/sessions/{sid}',headers=auth).json()
        assert resumed['interaction']['overview']==overview
        response=client.post(f"/api/sessions/{sid}/turns/{turn['id']}/response",headers=auth,
            json={'text':'내용을 확인한 뒤 가능한 일정과 필요한 자료를 말씀드리겠습니다.','duration_ms':5000})
        assert response.status_code==200,response.text
        result=response.json()
        assert result['finished'] is (index==4)
        if index < 4: turn=result['next_turn']
    assert len(set(seen))==1
    assert generated == [1, 2, 3, 4]
    assert history_sizes == [0, 1, 2, 3, 4]
    with SessionLocal() as db:
        session=db.get(RoleplaySession,sid)
        assert len(session.turns)==5


def test_context_uses_selected_scene_instead_of_original_episode(monkeypatch):
    scene = EXHIBITION_SCENES[1]
    turn = NS(id=9, episode_id=13, character_id='park_senior', order=1,
              question_text=scene['opening_line'], response_text='개인 약속은 말하고 싶지 않아요.')
    session = NS(id=7, turns=[turn], rapport={'interaction': {'index': 1, 'items': [
        {'episode_id': 2, 'character_id': 'park_senior', 'situation': '다른 장면'},
        {'episode_id': 13, 'character_id': 'park_senior', 'situation': scene['situation']}]}})
    seen = []
    monkeypatch.setattr(context_scoring, 'classify', lambda *args: seen.append(args) or {})
    context_scoring.classify_turn(session, turn, '퇴근하려는데 상사가 일을 맡긴다.')
    assert seen[0][3] == scene['situation']
    session.rapport = {}
    context_scoring.classify_turn(session, turn, '일반 시나리오 상황')
    assert seen[1][3] == '일반 시나리오 상황'
