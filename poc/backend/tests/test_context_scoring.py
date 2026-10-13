from types import SimpleNamespace as NS
import json
import httpx
import pytest
from pydantic import SecretStr
from app.core.config import settings
from app.services import context_scoring as context, interaction_scoring as scoring
from app.services.judgments import evaluate, event


def policy(kind='serious'):
    return {'kind':kind,'status':'classified','quote':'자료 오류를 바로잡아 주세요.', 'multipliers':context.POLICIES[kind]}


def test_context_changes_multiple_areas_without_fabricating_unmeasured_scores():
    result = {'turn_id':1,'measured':['response','posture'], 'events':[
        event(1,'response','missing_goal','negative',{'goal_id':'x'},''),
        event(1,'posture','sway','negative',{},'')], 'context_policy':policy()}
    out = scoring.calculate([result])
    assert out['scores']['response'] == 74.25
    assert out['scores']['posture'] == 74
    assert out['scores']['voice'] is None
    assert out['scores']['expression'] is None


@pytest.mark.parametrize('kind,ms,samples,expected', [('serious',3000,4,True),('serious',2999,4,False),('serious',3000,3,False),('casual',5000,6,False),('neutral',5000,6,False)])
def test_sustained_smile_only_scores_with_serious_context(kind,ms,samples,expected):
    result=evaluate(1)
    context.apply(result,policy(kind),{'expression_model':{'version':'expression-resnet18-v1','samples':samples,'sustained_smile_ms':ms}})
    out=scoring.calculate([result,result])
    assert len(out['changes']['expression']) == int(expected)
    assert out['scores']['expression'] == (74 if expected else 75 if samples >= 4 else None)


def test_context_failure_is_neutral_and_cached(monkeypatch):
    context.classify.cache_clear()
    monkeypatch.setattr(settings,'gemini_api_key',SecretStr('test'))
    monkeypatch.setattr(settings,'gemini_api_backend','api_key')
    calls=[]
    def fail(*args,**kwargs):
        calls.append(1)
        raise httpx.ReadTimeout('offline')
    monkeypatch.setattr(context.httpx,'post',fail)
    for _ in range(3):
        assert context.classify(1,1,'질문','상황')['kind']=='neutral'
    assert len(calls)==1
    context.classify.cache_clear()


def test_grounded_context_is_classified_once_per_turn(monkeypatch):
    context.classify.cache_clear()
    monkeypatch.setattr(settings,'gemini_api_key',SecretStr('test'))
    monkeypatch.setattr(settings,'gemini_api_backend','api_key')
    calls=[]
    def respond(url,**kwargs):
        calls.append(kwargs)
        data={'kind':'serious','quote':'자료 오류','confidence':.95}
        return httpx.Response(200,request=httpx.Request('POST',url),json={'candidates':[{'content':{'parts':[{'text':json.dumps(data)}]}}]})
    monkeypatch.setattr(context.httpx,'post',respond)
    for _ in range(3):
        assert context.classify(2,1,'자료 오류를 바로잡아 주세요.','업무')['kind']=='serious'
    assert len(calls)==1
    assert context.classify(2,2,'안녕하세요','업무')['status']=='uncertain'
    context.classify.cache_clear()


def test_live_polling_is_read_only_and_final_submission_uses_same_policy(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.seed.run import seed
    from app.core.database import SessionLocal
    from app.models import RoleplaySession
    from app.services.expression_measurement import LABELS
    from app.services import judgments
    seed()
    monkeypatch.setattr(context,'classify',lambda *args: policy())
    monkeypatch.setattr('app.services.response_judgment.analyze',lambda *args: ([],[], 'unavailable'))
    # 이 테스트는 관측 저장 정책을 검증하므로 외부 대화 API에 의존하지 않는다.
    monkeypatch.setattr('app.services.dialogue.openai_provider.OpenAIDialogueProvider._generate_continuous_line',
                        lambda *args: '확인한 내용을 알려줘요.')
    client=TestClient(app)
    created=client.post('/api/sessions',json={'service_mode':'workplace','scenario_slug':'workplace-conversation','consent':{'agreed':True}}).json()
    sid,tid=created['id'],created['current_turn']['id']
    auth={'X-Session-Token':created['access_token']}
    model={'version':'expression-resnet18-v1','status':'unvalidated','preprocessing':'imagenet-face-square-provisional-v1',
           'samples':4,'sustained_smile_ms':3000,'mean_outputs':dict.fromkeys(LABELS,.9)}
    body={'text':'확인하겠습니다.', 'duration_ms':5000, 'nonverbal':{'expression_model':model,
        'frames':50,'sample_ms':100,'calibrated':True,
        'head_down_ratio':1,'avg_shoulder_tilt_deg':20,'hunched_ratio':1,
        'posture_samples':{'head_down_ratio':50,'avg_shoulder_tilt_deg':50,'hunched_ratio':50}}}
    scores=[]
    for _ in range(3):
        response=client.post(f'/api/sessions/{sid}/turns/{tid}/observation',headers=auth,json=body)
        assert response.status_code==200,response.text
        scores.append(response.json()['live_score']['scores']['expression'])
        assert response.json()['live_score']['scores']['posture'] == 73
    assert scores==[74]*3
    with SessionLocal() as db:
        assert not judgments.results(db.get(RoleplaySession,sid))
    response=client.post(f'/api/sessions/{sid}/turns/{tid}/response',headers=auth,json=body)
    assert response.status_code==200,response.text
    with SessionLocal() as db:
        stored=judgments.results(db.get(RoleplaySession,sid))
        assert scoring.calculate(stored)['scores']['expression']==74
        assert scoring.calculate(stored)['scores']['posture']==73
        assert len([e for r in stored for e in r['events'] if e['rule']=='context_smile'])==1


def test_context_receives_scene_history_and_reclassifies_new_answer(monkeypatch):
    from app.services.dialogue import gemini_provider as provider
    context.classify.cache_clear()
    monkeypatch.setattr(settings,'gemini_api_backend','vertex')
    monkeypatch.setattr(provider,'_gemini_headers',lambda: {})
    monkeypatch.setattr(provider,'_gemini_url',lambda _: 'https://example.invalid/test')
    calls=[]
    def respond(url,**kwargs):
        payload=json.loads(kwargs['json']['contents'][0]['parts'][0]['text']); calls.append(payload)
        data={'kind':'serious','quote':'고객에게 잘못 전달됐습니다','confidence':.95}
        return httpx.Response(200,request=httpx.Request('POST',url),json={'candidates':[{'content':{'parts':[{'text':json.dumps(data)}]}}]})
    monkeypatch.setattr(context.httpx,'post',respond)
    history=[{'question':'무슨 일이에요?','answer':'고객에게 잘못 전달됐습니다'}]
    for _ in range(2):
        assert context.classify(8,2,'어떻게 처리할 거예요?','자료 오류',history)['kind']=='serious'
    context.classify(8,2,'어떻게 처리할 거예요?','자료 오류',history,'정정 내용을 전달했습니다.')
    assert len(calls)==2
    assert calls[0]['history']==history
    assert calls[1]['answer']=='정정 내용을 전달했습니다.'
    context.classify.cache_clear()


def test_four_context_areas_do_not_invent_measurement_or_voice_score():
    result=evaluate(1)
    result['voice_measurement']={'speed':{'status':'measured','syllables_per_second':4}}
    context.apply(result,policy(),None)
    assert set(result['context_assessment'])=={'response','voice','expression','posture'}
    assert result['context_assessment']['voice']['status']=='reference_only'
    assert result['context_assessment']['posture']['status']=='unmeasured'
    assert scoring.calculate([result])['scores']['voice'] is None


@pytest.mark.parametrize('kind,response_points,missing_points,posture_points,voice_points', [
    ('neutral', 1, -.5, -1, 1), ('serious', 1, -.75, -1, 1.05),
    ('supportive', 1.25, -.5, -.85, 1.05), ('technical', 1, -.75, -.75, 1),
    ('casual', .75, -.25, -.75, .9),
])
def test_each_context_adjusts_evidence_instead_of_awarding_for_the_context(kind,response_points,missing_points,posture_points,voice_points):
    result = {'measured':['response','posture','voice'], 'context_policy':policy(kind), 'events':[
        event(1,'response','relevant_answer','positive',{},''),
        event(1,'response','missing_goal','negative',{'goal_id':'x'},''),
        event(1,'posture','sway','negative',{},''),
        event(1,'voice','clear_pace','positive',{},'')]}
    out = scoring.calculate([result])
    assert [e['points'] for e in out['changes']['response']] == [response_points, missing_points]
    assert out['changes']['posture'][0]['points'] == posture_points
    assert out['changes']['voice'][0]['points'] == voice_points  # 구형 측정 근거에만 적용
    assert out['scores']['expression'] is None
    result['events'] = []
    assert scoring.calculate([result])['scores'] == {'response':75, 'posture':75, 'voice':75, 'expression':None}


@pytest.mark.parametrize('kind', list(context.POLICIES))
def test_serious_off_topic_is_doubled_but_contradiction_stays_fixed(kind):
    results = [{'measured':['response'], 'context_policy':policy(kind),
        'events':[event(i,'response','off_topic','negative',{},'')]} for i in (1,2)]
    out = scoring.calculate(results + results)
    multiplier = 2 if kind == 'serious' else 1.5 if kind in {'technical','supportive'} else 1
    assert out['scores']['response'] == 75 - 3 * multiplier
    assert [e['points'] for e in out['changes']['response']] == [-multiplier,-2 * multiplier]
    results[0]['events'] = [event(1,'response','contradiction','negative',{'fact_key':'담당자'},'')]
    assert scoring.calculate(results[:1])['scores']['response'] == 74


@pytest.mark.parametrize('kind', list(context.POLICIES))
def test_overlapping_posture_signals_are_bounded_per_turn_and_session(kind):
    results = [{'measured':['posture'], 'context_policy':policy(kind), 'events':[
        event(i,'posture',rule,'negative',{},'')
        for rule in ('head_down','side_lean','forward_lean','sway','hand_face')]} for i in range(5)]
    out = scoring.calculate(results + results)
    assert out['scores']['posture'] == 69
    assert sum(e['points'] for e in out['changes']['posture']) == -6
    for i in range(5):
        assert sum(e['points'] for e in out['changes']['posture'] if e['turn_id'] == i) >= -2
    assert out['limits']['nonverbal_penalty']['posture'] == {'per_turn':2,'session':6}


def test_five_turn_smile_reference_is_small_and_uncertain_context_never_penalizes():
    results = []
    for i in range(5):
        result = evaluate(i)
        context.apply(result,policy(),{'expression_model':{
            'version':'expression-resnet18-v1','samples':10,'sustained_smile_ms':10000}})
        results.append(result)
    out = scoring.calculate(results + results)
    assert out['scores']['expression'] == 72
    assert sum(e['points'] for e in out['changes']['expression']) == -3
    for result in results:
        result['context_policy']['status'] = 'uncertain'
    assert scoring.calculate(results)['scores']['expression'] == 75


@pytest.mark.parametrize('kind,status,expected', [
    ('technical','classified',76), ('unknown','classified',76),
    ('serious','uncertain',76), ('serious','unavailable',76),
])
def test_server_policy_ignores_arbitrary_or_stale_multiplier_numbers(kind,status,expected):
    result = {'measured':['response'], 'context_policy':{
        'kind':kind,'status':status,'multipliers':{'response':100}},
        'events':[event(1,'response','relevant_answer','positive',{},'')]}
    assert scoring.calculate([result])['scores']['response'] == expected


def test_voice_v2_measurements_stay_unscored_in_every_context():
    for kind in context.POLICIES:
        result = evaluate(1)
        result['events'] += scoring.audio_events(1, {
            'engine_version':'voice-measure-v2','duration_sec':10,'speech_rate_sps':9}, 'workplace')
        result['voice_measurement'] = {'speed':{'status':'measured','syllables_per_second':9}}
        context.apply(result,policy(kind),None)
        assert scoring.calculate([result])['scores']['voice'] is None
        assert result['context_assessment']['voice']['status'] == 'reference_only'
