from random import Random
from types import SimpleNamespace as NS
from test_workplace_exhibition import fixture
from app.services import interaction
from app.services.workplace import build_exhibition_plan, flatten_plan_items
from app.core.config import settings

def test_savings_scene_is_fixed_for_every_seed_and_every_reply():
    scenario, episodes = fixture()
    for seed in range(20):
        plan = build_exhibition_plan(scenario, episodes, Random(seed), fixed_order=15)
        items = flatten_plan_items(plan)
        assert plan['source'] == 'curated-fixed'
        assert len(items) == 5
        assert {item['episode_id'] for item in items} == {15}
        assert items[0]['text'] == '월급 받으면 주로 어디에 써요? 저축은 제대로 하고 있어요?'

def test_fixed_scene_also_applies_outside_kiosk(monkeypatch):
    monkeypatch.setattr(settings, 'workplace_fixed_scene_order', 15)
    scenario, episodes = fixture()
    session = NS(rapport={}, difficulty='basic', mode=5)
    interaction.initialize(session, scenario, episodes, 'workplace')
    flow = interaction.state(session)
    assert flow['exhibition'] is True
    assert {item['episode_id'] for item in flow['items']} == {15}
