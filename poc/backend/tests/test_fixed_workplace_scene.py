from random import Random
from types import SimpleNamespace as NS
from test_workplace_exhibition import fixture
from app.services import interaction
from app.services.workplace import build_exhibition_plan, flatten_plan_items
from app.core.config import settings

def test_dinner_scene_can_be_selected_for_every_seed_and_every_reply():
    scenario, episodes = fixture()
    for seed in range(20):
        plan = build_exhibition_plan(scenario, episodes, Random(seed), fixed_order=15)
        items = flatten_plan_items(plan)
        assert plan['source'] == 'curated-fixed'
        assert len(items) == 5
        assert {item['episode_id'] for item in items} == {15}
        assert items[0]['text'] == '오늘 고생했다고 팀장님이 회식 쏘신대요! 첫날인데 같이 갈 거죠? 부담되면 빠져도 된다고는 하셨어요.'

def test_fixed_scene_also_applies_outside_kiosk(monkeypatch):
    monkeypatch.setattr(settings, 'workplace_fixed_scene_order', 15)
    scenario, episodes = fixture()
    session = NS(rapport={}, difficulty='basic', mode=5)
    interaction.initialize(session, scenario, episodes, 'workplace')
    flow = interaction.state(session)
    assert flow['exhibition'] is True
    assert {item['episode_id'] for item in flow['items']} == {15}


def test_workplace_pack_uses_only_female_characters():
    from app.seed.packs import load_pack_files
    pack = next(pack for pack in load_pack_files() if pack['slug'] == 'workplace-conversation')
    assert all(character.get('voice_gender') == 'female' for character in pack['characters'])


def test_disabled_scenarios_cannot_be_forced_back_into_exhibition():
    import pytest
    scenario, episodes = fixture()
    for order in (2, 13, 5):
        with pytest.raises(ValueError, match='비활성화'):
            build_exhibition_plan(scenario, episodes, fixed_order=order)


def test_no_enabled_scene_reports_configuration_error(monkeypatch):
    import pytest
    import app.services.workplace as workplace
    monkeypatch.setattr(workplace, 'EXHIBITION_SCENES', [
        {**scene, 'enabled': False} for scene in workplace.EXHIBITION_SCENES
    ])
    scenario, episodes = fixture()
    with pytest.raises(ValueError, match='활성화된'):
        build_exhibition_plan(scenario, episodes)
