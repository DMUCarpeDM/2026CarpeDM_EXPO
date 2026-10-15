"""생성된 상대역 본문을 그대로 전달하고 실패 시 가짜 대사를 만들지 않는다."""
import json
from pathlib import Path
from types import SimpleNamespace as NS

import httpx
import pytest
from pydantic import SecretStr

from app.core.config import settings
from app.services.dialogue.openai_provider import DialogueGenerationError, _actor_prompt, _generate_actor_line
from app.services.dialogue.gemini_provider import GeminiDialogueProvider, _call_gemini
from app.services.dialogue.ollama_provider import OllamaDialogueProvider


def fixture():
    session = NS(difficulty='basic', mode=5, rapport={})
    character = {'id':'senior','name':'박선임'}
    scenario = NS(world_setting={}, characters=[character])
    scene = {'episode_id':1,'character_id':'senior','text':'자료를 읽어 주세요.',
             'situation':'자료 확인', 'dialogue_intent':'방금 말한 확인 순서를 받아들이고 남은 질문만 확인한다.',
             'goal':'평가 비밀 목표', 'tip':'점수 비밀 기준',
             'recovery_lines':['자료에서 막히는 부분은 여기서 짚죠.']}
    turns = [NS(character_id='senior',episode_id=1,question_text='자료를 읽어 주세요.',
                response_text='자료를 먼저 읽고 이해한 방향과 질문을 정리해서 확인받겠습니다.')]
    return session, scenario, character, turns, scene


def test_current_conversation_intent_is_used_without_exposing_assessment_or_future_flow():
    session, scenario, character, turns, scene = fixture()
    prompt = _actor_prompt(session,scenario,character,turns,scene)
    assert scene['dialogue_intent'] in prompt
    assert scene['goal'] not in prompt and scene['tip'] not in prompt
    assert 'recovery_lines' not in prompt


def test_curated_personas_keep_anger_about_work_not_private_closeness():
    pack = json.loads((Path(__file__).parents[1] / 'app/seed/packs/workplace-conversation.json').read_text())
    chars = {c['id']:c for c in pack['characters']}
    for key in ('park_senior','lee_teamlead'):
        character = chars[key]
        assert '기본 상태부터' in character['difficulty_persona']['basic']
        assert '화' in character['personality']
        assert '친해지자는 건데' not in character['catchphrases']
    assert '구체적인 해결책' in chars['park_senior']['personality']


@pytest.mark.parametrize('line', [
    '자료를 읽어 주세요.',  # 앞서 했던 말이어도 재작성하지 않음
    '지금 이야기하던 용건에 대해 다시 말씀해 주시겠어요?',
    '평가자로서 피드백을 드리겠습니다.',
    '내일 인사팀에 새 자료를 제출해요.',
    '  박선임: "첫 문장.\n두 번째 문장. 세 번째 문장."  ',
    '**Act: Morning**', 'Okay, read the report.',
    '보고까지 할 건 없고,', '긴 응답입니다. ' * 40,
])
def test_actor_returns_first_model_output_exactly_once(line):
    calls = []
    def complete(system, prompt, **kwargs):
        calls.append(kwargs)
        assert not kwargs.get('json_mode')
        return line
    assert _generate_actor_line(*fixture(), complete) == line
    assert len(calls) == 1


@pytest.mark.parametrize('empty', [None, '', ' \n '])
def test_absent_model_body_is_an_error_not_a_replacement_line(empty):
    with pytest.raises(DialogueGenerationError, match='본문이 없습니다'):
        _generate_actor_line(*fixture(), lambda *a, **kw: empty)


def test_transport_error_does_not_retry_or_replace_dialogue():
    calls = []
    def unavailable(*args, **kwargs):
        calls.append(1)
        raise DialogueGenerationError('통신 실패')
    with pytest.raises(DialogueGenerationError, match='통신 실패'):
        _generate_actor_line(*fixture(), unavailable)
    assert len(calls) == 1


@pytest.mark.parametrize('provider', ['openai', 'gemini', 'ollama'])
def test_actual_transport_preserves_quotes_prefix_whitespace_and_partial_text(monkeypatch, provider):
    from app.services.dialogue.openai_provider import OpenAIDialogueProvider
    line = '  박선임: "확인해요.\n그 다음에는,  '
    calls = []
    monkeypatch.setattr(settings, 'openai_api_key', SecretStr('test'))
    monkeypatch.setattr(settings, 'gemini_api_key', SecretStr('test'))
    def post(url, **kwargs):
        calls.append(kwargs)
        if provider == 'openai':
            payload = {'choices': [{'finish_reason': 'length', 'message': {'content': line}}]}
        elif provider == 'gemini':
            payload = {'candidates': [{'finishReason': 'MAX_TOKENS', 'content': {'parts': [{'text': line}]}}]}
        else:
            payload = {'message': {'content': line}}
        return httpx.Response(200, request=httpx.Request('POST', url), json=payload)
    monkeypatch.setattr(httpx, 'post', post)
    session, scenario, character, turns, scene = fixture()
    obj = {'openai': OpenAIDialogueProvider, 'gemini': GeminiDialogueProvider, 'ollama': OllamaDialogueProvider}[provider]()
    assert obj._generate_continuous_line(session, scenario, character, turns, {}, scene) == line
    assert len(calls) == 1


def test_scoring_and_planning_still_require_complete_json(monkeypatch):
    monkeypatch.setattr(settings, 'gemini_api_key', SecretStr('test'))
    monkeypatch.setattr(httpx, 'post', lambda url, **kw: httpx.Response(
        200, request=httpx.Request('POST', url), json={'candidates': [
            {'finishReason': 'MAX_TOKENS', 'content': {'parts': [{'text': '{}'}]}}]}))
    with pytest.raises(DialogueGenerationError, match='토큰 한도'):
        _call_gemini('system', 'user', max_tokens=30, temperature=0, json_mode=True)


@pytest.fixture
def api_session(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.seed.run import seed
    from app.services import context_scoring, response_judgment
    seed()
    monkeypatch.setattr(settings, 'dialogue_provider', 'gemini')
    monkeypatch.setattr(response_judgment, 'analyze', lambda *a: ([], [], 'unavailable'))
    monkeypatch.setattr(context_scoring, 'classify', lambda *a: {'kind': 'neutral', 'status': 'unavailable'})
    client = TestClient(app)
    created = client.post('/api/sessions', json={'service_mode': 'workplace',
        'scenario_slug': 'workplace-conversation', 'exhibition': True, 'consent': {'agreed': True}})
    assert created.status_code == 200, created.text
    data = created.json()
    return client, data, {'X-Session-Token': data['access_token']}


def test_api_returns_and_stores_model_text_for_all_three_turns(api_session, monkeypatch):
    from app.core.database import SessionLocal
    from app.models import Turn
    client, data, auth = api_session
    turn = data['current_turn']
    line = '  AI: "첫 문장.\n둘째 문장. 셋째 문장."  ' + '확인해요. ' * 35
    calls = []
    def complete(*args, **kwargs):
        calls.append(kwargs)
        assert not kwargs.get('json_mode')
        return line
    monkeypatch.setattr(GeminiDialogueProvider, '_complete', complete)
    for index in range(3):
        response = client.post(f"/api/sessions/{data['id']}/turns/{turn['id']}/response", headers=auth,
            json={'text': '자료를 먼저 확인하고 모르는 내용을 정리해서 말씀드리겠습니다.'})
        assert response.status_code == 200, response.text
        result = response.json()
        assert result['finished'] is (index == 2)
        if not result['finished']:
            turn = result['next_turn']
            assert turn['question_text'] == line
            with SessionLocal() as db:
                assert db.get(Turn, turn['id']).question_text == line
    assert len(calls) == 2  # 첫 대사는 준비된 시작 질문, 마지막 답변 뒤에는 종료


@pytest.mark.parametrize('result', [None, '', 'timeout'])
def test_api_error_keeps_turn_and_score_without_authored_recovery(api_session, monkeypatch, result):
    from app.core.database import SessionLocal
    from app.models import RoleplaySession, Turn
    from app.services import judgments
    client, data, auth = api_session
    tid = data['current_turn']['id']
    def complete(*args, **kwargs):
        if result == 'timeout':
            raise DialogueGenerationError('통신 실패')
        return result
    monkeypatch.setattr(GeminiDialogueProvider, '_complete', complete)
    response = client.post(f"/api/sessions/{data['id']}/turns/{tid}/response", headers=auth,
        json={'text': '자료를 확인하고 모르는 부분을 정리하겠습니다.'})
    assert response.status_code == 503, response.text
    assert 'next_turn' not in response.json()
    with SessionLocal() as db:
        turn = db.get(Turn, tid)
        session = db.get(RoleplaySession, data['id'])
        assert turn.answered_at is None and not turn.response_text
        assert session.rapport['interaction']['index'] == 0
        assert judgments.results(session) == []


def test_contradiction_keeps_scoring_but_does_not_inject_fixed_question(api_session, monkeypatch):
    from app.core.database import SessionLocal
    from app.models import RoleplaySession
    from app.services import deferred_workplace, judgments, response_judgment
    client, data, auth = api_session
    # 기존 전시 외 연속 세션도 고정 모순 질문으로 AI 호출을 건너뛰지 않는다.
    with SessionLocal() as db:
        session = db.get(RoleplaySession, data['id'])
        flow = dict(session.rapport['interaction'])
        flow.pop('exhibition', None)
        session.rapport = {**session.rapport, 'interaction': flow}
        db.commit()
    def analyze(turn, *args):
        return [judgments.event(turn.id, 'response', 'contradiction', 'negative',
            {'fact_key': '담당', 'previous_quote': '제가 담당합니다', 'quote': '담당이 아닙니다'}, '담당자 모순')], [], 'completed'
    monkeypatch.setattr(response_judgment, 'analyze', analyze)
    line = '담당이 바뀐 건지 먼저 얘기해요.'
    monkeypatch.setattr(GeminiDialogueProvider, '_complete', lambda *a, **kw: line)
    response = client.post(f"/api/sessions/{data['id']}/turns/{data['current_turn']['id']}/response", headers=auth,
        json={'text': '저는 담당이 아닙니다. 담당자를 다시 확인하겠습니다.'})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['next_turn']['question_text'] == line
    assert result['next_turn']['question_type'] == 'main'
    assert result['turn_signals']['judgment']['analysis_status'] == 'pending'
    with SessionLocal() as db:
        session = db.get(RoleplaySession, data['id'])
        turn = next(t for t in session.turns if t.id == data['current_turn']['id'])
        deferred_workplace.complete(db, session, turn)
        assert any(e['rule'] == 'contradiction' for row in judgments.results(session) for e in row['events'])



@pytest.mark.parametrize('model,requested,expected', [
    ('gemini-3.5-flash-lite', 0, 1.0),
    ('gemini-3-flash-preview', .45, 1.0),
    ('gemini-2.5-flash', .45, .45),
])
def test_gemini_sampling_avoids_low_temperature_loop_regression(monkeypatch, model, requested, expected):
    from app.services.dialogue import gemini_provider as provider
    monkeypatch.setattr(provider.settings, 'gemini_model', model)
    assert provider._sampling_temperature(requested) == expected


def test_exhibition_uses_scoped_actor_rules_and_preserves_generated_line():
    from app.services.dialogue.openai_provider import EXHIBITION_ACTOR_SYSTEM_PROMPT
    session, scenario, character, turns, scene = fixture()
    scene['actor_persona'] = '성미가 급한 박선임'
    seen = []
    def complete(system, prompt, **kwargs):
        seen.append(system)
        return '할 수 있는지부터 분명히 얘기해요.'
    assert _generate_actor_line(session, scenario, character, turns, scene, complete) == '할 수 있는지부터 분명히 얘기해요.'
    assert seen == [EXHIBITION_ACTOR_SYSTEM_PROMPT]
