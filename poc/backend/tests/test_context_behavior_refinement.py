"""상황별 행동 배율과 현재 자료 확인 요청의 자세 감점 제외."""
import json

import httpx
import pytest
from pydantic import SecretStr

from app.core.config import settings
from app.services import context_scoring as context, feedback, interaction_scoring as scoring
from app.services.judgments import evaluate, event


def policy(kind='technical', document=False):
    return {'kind':kind, 'status':'classified', 'quote':'지금 자료를 읽어 주세요.',
            'posture_context':{'kind':'document_focus' if document else 'conversation',
                               'confidence':.99, 'quote':'지금 자료를 읽어 주세요.'}}


def response(turn_id, rules, kind='technical'):
    return {'turn_id':turn_id, 'measured':['response'], 'context_policy':policy(kind),
            'events':[event(turn_id,'response',rule,'positive',{'goal_id':key},rule,key=key)
                      for rule,key in rules]}


@pytest.mark.parametrize('kind,goal,relevant,arms', [
    ('neutral',1,1,-.25), ('serious',1.5,1,-.5), ('supportive',1.25,1.25,-.25),
    ('technical',1.5,1,-.25), ('casual',1,.75,-.25),
])
def test_action_specific_rewards_and_ambiguous_posture_penalty(kind,goal,relevant,arms):
    out = scoring.calculate([response(1,[('goal_met','a')],kind),
                             response(2,[('relevant_answer','')],kind)])
    assert [e['points'] for e in out['changes']['response']] == [goal,relevant]
    result = {'measured':['posture'], 'context_policy':policy(kind),
              'events':[event(1,'posture','arms_crossed','negative',{},'')]}
    assert scoring.calculate([result])['scores']['posture'] == 75 + arms


@pytest.mark.parametrize('reverse', [False,True])
def test_goal_and_relevance_do_not_reward_the_same_answer_twice(reverse):
    rules = [('relevant_answer',''),('goal_met','a')]
    out = scoring.calculate([response(1,rules[::-1] if reverse else rules)])
    assert out['scores']['response'] == 76.5
    assert [e['rule'] for e in out['changes']['response']] == ['goal_met']


def test_previously_awarded_goal_does_not_hide_later_relevance():
    rules = [('goal_met','a'),('relevant_answer','')]
    out = scoring.calculate([response(1,rules),response(2,rules)])
    assert out['scores']['response'] == 77.5
    assert [(e['turn_id'],e['rule']) for e in out['changes']['response']] == [(1,'goal_met'),(2,'relevant_answer')]


def test_multiple_goals_have_a_two_point_turn_cap_and_eight_point_session_cap():
    results = [response(i,[('goal_met',f'{i}-a'),('goal_met',f'{i}-b'),('relevant_answer','')]) for i in range(5)]
    out = scoring.calculate(results + results)
    assert out['scores']['response'] == 83
    for i in range(5):
        assert sum(e['points'] for e in out['changes']['response'] if e['turn_id'] == i) == 2
    assert out['response_limits']['per_turn_bonus'] == 2


def test_contradiction_still_blocks_both_kinds_of_reward():
    result = response(1,[('goal_met','a'),('relevant_answer','')])
    result['events'].append(event(1,'response','contradiction','negative',{'fact_key':'일정'},'모순'))
    out = scoring.calculate([result])
    assert out['scores']['response'] == 74
    assert not out['changes']['response']


def posture_result():
    result = evaluate(1)
    result['measured'] = ['posture']
    result['events'] = [event(1,'posture',rule,'negative',{},rule) for rule in ('head_down','forward_lean')]
    return result


def test_document_request_exempts_only_related_postures_and_retains_audit_reason():
    result = posture_result()
    result['events'].append(event(1,'posture','side_lean','negative',{},'side_lean'))
    context.apply(result,policy(document=True),None)
    assert [e['rule'] for e in result['events']] == ['side_lean']
    assert feedback.select(result)['rule'] == 'side_lean'
    assert scoring.calculate([result])['scores']['posture'] == 74.25
    exemptions = result['context_assessment']['posture']['exemptions']
    assert {e['rule'] for e in exemptions} == {'head_down','forward_lean'}
    assert all(e['reason'] and e['request_quote'] == '지금 자료를 읽어 주세요.' for e in exemptions)


def test_reclassification_restores_exempt_events_without_duplication():
    result = posture_result()
    for _ in range(2):
        context.apply(result,policy(document=True),None)
        assert scoring.calculate([result])['scores']['posture'] == 75
        assert feedback.select(result) is None
        assert len(result['context_exemptions']) == 2
    for _ in range(2):
        context.apply(result,policy(),None)
        assert scoring.calculate([result])['scores']['posture'] == 74
        assert len(result['events']) == 2
        assert not result.get('context_exemptions')


def test_uncertain_context_cannot_exempt_posture():
    result = context.apply(posture_result(),{**policy(document=True),'status':'uncertain'},None)
    assert scoring.calculate([result])['scores']['posture'] == 73
    assert not result.get('context_exemptions')


@pytest.mark.parametrize('posture,expected', [
    ({'kind':'document_focus','confidence':.99,'quote':'지금 자료를 읽어 주세요.'},'document_focus'),
    ({'kind':'document_focus','confidence':.9,'quote':'지금 자료를 읽어 주세요.'},'document_focus'),
    ({'kind':'document_focus','confidence':.89,'quote':'지금 자료를 읽어 주세요.'},'conversation'),
    ({'kind':'document_focus','confidence':True,'quote':'지금 자료를 읽어 주세요.'},'conversation'),
    ({'kind':'document_focus','confidence':float('nan'),'quote':'지금 자료를 읽어 주세요.'},'conversation'),
    ({'kind':'document_focus','confidence':.99,'quote':'아까 자료를 읽어 주세요.'},'conversation'),
    ({'kind':'document_focus','confidence':.99,'quote':'저는 자료를 보고 있어요.'},'conversation'),
    ({'kind':'document_focus','confidence':.99,'quote':'없는 요청'},'conversation'),
    ({'kind':'document_focus','confidence':.99,'quote':'지금'},'conversation'),
    (None,'conversation'), ('document_focus','conversation'),
])
def test_document_exemption_requires_confident_quote_from_current_question(monkeypatch,posture,expected):
    monkeypatch.setattr(settings,'gemini_api_backend','developer')
    monkeypatch.setattr(settings,'gemini_api_key',SecretStr('synthetic-test'))
    data = {'kind':'technical','confidence':.99,'quote':'지금 자료를 읽어 주세요.','posture_context':posture}
    monkeypatch.setattr(context.httpx,'post',lambda url,**kwargs: httpx.Response(200,
        request=httpx.Request('POST',url), json={'candidates':[{'content':{'parts':[{'text':json.dumps(data)}]}}]}))
    out = context._classify('지금 자료를 읽어 주세요.','자료 확인',
        [{'question':'아까 자료를 읽어 주세요.','answer':'알겠습니다.'}],'저는 자료를 보고 있어요.')
    assert out['status'] == 'classified'
    assert out['posture_context']['kind'] == expected


def test_posture_exemption_survives_live_submission_and_report(monkeypatch,ready_ollama,tmp_path):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.seed.run import seed
    seed()
    monkeypatch.setattr(settings,'media_dir',tmp_path)
    monkeypatch.setattr(context,'classify',lambda *args: policy(document=True))
    monkeypatch.setattr('app.services.response_judgment.analyze',lambda *args: ([],[],'completed'))
    client = TestClient(app)
    session = client.post('/api/sessions',json={'service_mode':'workplace','scenario_slug':'workplace-conversation',
        'exhibition':True,'consent':{'agreed':True}}).json()
    sid,tid = session['id'],session['current_turn']['id']
    auth = {'X-Session-Token':session['access_token']}
    body = {'text':'자료에서 수치를 대조하겠습니다.','stt_source':'webspeech','duration_ms':5000,
        'nonverbal':{'frames':50,'sample_ms':100,'calibrated':True,'head_down_ratio':1,'hunched_ratio':1,
                    'posture_samples':{'head_down_ratio':50,'hunched_ratio':50}}}
    observation = client.post(f'/api/sessions/{sid}/turns/{tid}/observation',headers=auth,json=body)
    assert observation.status_code == 200,observation.text
    assert observation.json()['live_score']['scores']['posture'] == 75
    submitted = client.post(f'/api/sessions/{sid}/turns/{tid}/response',headers=auth,json=body)
    assert submitted.status_code == 200,submitted.text
    judgment = submitted.json()['turn_signals']['judgment']
    assert len(judgment['context_assessment']['posture']['exemptions']) == 2
    assert judgment['feedback'] is None
    assert client.post(f'/api/sessions/{sid}/finish',headers=auth).status_code in (200,202)
    report = client.get(f'/api/sessions/{sid}/report',headers=auth).json()
    assert report['fit_scores']['posture']['score'] == 75
    assert not report['improvements']
    assert not [e for e in report['evidence_segments'] if e['rule'] in {'head_down','forward_lean'}]
