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
    assert out['scores']['response'] == 74.4
    assert out['scores']['posture'] == 73.8
    assert out['scores']['voice'] is None
    assert out['scores']['expression'] is None


@pytest.mark.parametrize('kind,ms,samples,expected', [('serious',3000,4,True),('serious',2999,4,False),('serious',3000,3,False),('casual',5000,6,False),('neutral',5000,6,False)])
def test_sustained_smile_only_scores_with_serious_context(kind,ms,samples,expected):
    result=evaluate(1)
    context.apply(result,policy(kind),{'expression_model':{'version':'expression-resnet18-v1','samples':samples,'sustained_smile_ms':ms}})
    out=scoring.calculate([result,result])
    assert len(out['changes']['expression']) == int(expected)
    assert out['scores']['expression'] == (73.7 if expected else 75 if samples >= 4 else None)


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
    client=TestClient(app)
    created=client.post('/api/sessions',json={'service_mode':'workplace','scenario_slug':'workplace-conversation','consent':{'agreed':True}}).json()
    sid,tid=created['id'],created['current_turn']['id']
    auth={'X-Session-Token':created['access_token']}
    model={'version':'expression-resnet18-v1','status':'unvalidated','preprocessing':'imagenet-face-square-provisional-v1',
           'samples':4,'sustained_smile_ms':3000,'mean_outputs':dict.fromkeys(LABELS,.9)}
    body={'text':'확인하겠습니다.', 'duration_ms':5000, 'nonverbal':{'expression_model':model}}
    scores=[]
    for _ in range(3):
        response=client.post(f'/api/sessions/{sid}/turns/{tid}/observation',headers=auth,json=body)
        assert response.status_code==200,response.text
        scores.append(response.json()['live_score']['scores']['expression'])
    assert scores==[73.7]*3
    with SessionLocal() as db:
        assert not judgments.results(db.get(RoleplaySession,sid))
    response=client.post(f'/api/sessions/{sid}/turns/{tid}/response',headers=auth,json=body)
    assert response.status_code==200,response.text
    with SessionLocal() as db:
        stored=judgments.results(db.get(RoleplaySession,sid))
        assert scoring.calculate(stored)['scores']['expression']==73.7
        assert len([e for r in stored for e in r['events'] if e['rule']=='context_smile'])==1
