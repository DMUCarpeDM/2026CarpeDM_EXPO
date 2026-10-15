from fastapi.testclient import TestClient
from app.main import app
from app.seed.run import seed
from app.core.database import SessionLocal
from app.models import RoleplaySession
from app.services import context_scoring, deferred_workplace, judgments, response_judgment, voice_analysis


def test_workplace_generates_all_five_turns_without_waiting_for_scoring(monkeypatch, ready_ollama):
    seed()
    from app.services.dialogue.base import QuestionSpec
    monkeypatch.setattr('app.services.dialogue.openai_provider.OpenAIDialogueProvider.next_question',
        lambda _self,_session,_scenario,_episodes,turns: QuestionSpec(episode_id=turns[-1].episode_id,
            character_id=turns[-1].character_id,question_type='main',question_text='공개할 수 있는 범위를 말씀해 주시겠어요?'))
    def unexpected(*args, **kwargs):
        raise AssertionError('Internal scoring must not run before the next dialogue')
    monkeypatch.setattr(response_judgment, 'analyze', unexpected)
    monkeypatch.setattr(context_scoring, 'classify_turn', unexpected)
    monkeypatch.setattr(voice_analysis, 'live_turn', unexpected)
    client = TestClient(app)
    created = client.post('/api/sessions', json={'service_mode':'workplace','scenario_slug':'workplace-conversation',
        'mode':5,'difficulty':'basic','exhibition':True,'consent':{'agreed':True,'storage_policy':'none'}})
    assert created.status_code == 200, created.text
    data = created.json(); auth={'X-Session-Token':data['access_token']}; turn=data['current_turn']
    for index in range(5):
        response=client.post(f"/api/sessions/{data['id']}/turns/{turn['id']}/response",headers=auth,
            json={'text':'개인적인 내용은 공개하지 않겠습니다.','stt_source':'webspeech','duration_ms':5000})
        assert response.status_code == 200,response.text
        out=response.json()
        assert out['turn_signals']['judgment']['analysis_status']=='pending'
        assert out['finished'] is (index==4)
        if index<4:turn=out['next_turn']
    seen=[]
    def evaluate(current, history, goals, requested):
        assert all(t.order<=current.order for t in history)
        assert goals and requested==[]
        seen.append(current.order)
        event=judgments.event(current.id,'response','relevant_answer','positive',{'quote':current.response_text},'자신의 의사를 분명하게 표현했어요.')
        return [event],[], 'completed'
    monkeypatch.setattr(response_judgment,'analyze',evaluate)
    monkeypatch.setattr(context_scoring,'classify_turn',lambda *a:{'kind':'neutral','status':'unavailable','multipliers':context_scoring.POLICIES['neutral']})
    with SessionLocal() as db:
        session=db.get(RoleplaySession,data['id'])
        for t in sorted(session.turns,key=lambda t:t.order):
            deferred_workplace.complete(db,session,t)
            deferred_workplace.complete(db,session,t)
        results=judgments.results(session)
        assert len(results)==5
        assert all(r['analysis_status']=='completed' and 'response' in r['measured'] for r in results)
        assert seen==[1,2,3,4,5]
        db.commit()
    finished=client.post(f"/api/sessions/{data['id']}/finish",headers=auth)
    assert finished.status_code==202,finished.text
    report=client.get(f"/api/sessions/{data['id']}/report",headers=auth)
    assert report.status_code==200,report.text
    assert report.json()['fit_scores']['response']['score'] is not None
    assert report.json()['strengths']
    assert seen==[1,2,3,4,5]


def test_nonblocking_voice_queue_retains_measurement_for_report(monkeypatch,tmp_path):
    from types import SimpleNamespace
    from threading import Event
    from app.ai import voice_measurement as engine
    path=tmp_path/'audio.wav';path.write_bytes(b'queued voice')
    session=SimpleNamespace(id=771,rapport={'voice_engine_version':engine.VERSION})
    turn=SimpleNamespace(id=771,audio_path=str(path))
    started,release=Event(),Event()
    calls=[]
    def measure(*args):
        calls.append(1);started.set();assert release.wait(5)
        return engine.empty_result(771,771,'fixture'),None,{'status_code':200,'latency_ms':1,'error_message':''}
    monkeypatch.setattr(voice_analysis,'_measure',measure)
    try:
        result=voice_analysis.live_turn(session,turn,wait=False)
        assert result['quality_flags']==['analysis_pending']
        assert started.wait(2)
    finally:
        release.set()
    final=voice_analysis.finish_turn(session,turn)
    assert final['quality_flags']==['fixture']
    assert len(calls)==1


def test_late_audio_upload_keeps_new_dialogue_state_and_queues_only_voice_work(monkeypatch, ready_ollama):
    import copy,json
    from app.models import Turn
    from test_voice_api_v2 import wav
    from app.services.dialogue.base import QuestionSpec
    seed()
    monkeypatch.setattr('app.services.dialogue.openai_provider.OpenAIDialogueProvider.next_question',
        lambda _self,_session,_scenario,_episodes,turns: QuestionSpec(episode_id=turns[-1].episode_id,
            character_id=turns[-1].character_id,question_type='main',question_text='공개할 범위를 말씀해 주세요.'))
    queued=[]
    evaluations=[]
    def judge(current,*args):
        evaluations.append(current.id)
        return [],[], 'completed'
    monkeypatch.setattr(response_judgment,'analyze',judge)
    monkeypatch.setattr(context_scoring,'classify_turn',lambda *a:{'kind':'neutral','status':'unavailable','multipliers':context_scoring.POLICIES['neutral']})
    monkeypatch.setattr(voice_analysis,'prime_stored_turn',lambda *ids:queued.append(ids))
    client=TestClient(app)
    data=client.post('/api/sessions',json={'service_mode':'workplace','scenario_slug':'workplace-conversation',
        'exhibition':True,'consent':{'agreed':True,'storage_policy':'none'}}).json()
    sid,tid=data['id'],data['current_turn']['id'];auth={'X-Session-Token':data['access_token']}
    response=client.post(f'/api/sessions/{sid}/turns/{tid}/response',headers=auth,
        json={'text':'개인적인 내용은 공개하지 않겠습니다.','duration_ms':5000})
    assert response.status_code==200,response.text
    assert queued==[]
    with SessionLocal() as db:
        before=copy.deepcopy(db.get(RoleplaySession,sid).rapport)
    source={'calibration_id':data['voice_analysis']['calibration']['id'],'capture':None,'excluded_intervals':[]}
    uploaded=client.post(f'/api/sessions/{sid}/turns/{tid}/audio',headers=auth,
        data={'voice_input':json.dumps(source)},files={'file':('answer.wav',wav(),'audio/wav')})
    assert uploaded.status_code==200,uploaded.text
    assert queued==[(sid,tid)]
    with SessionLocal() as db:
        assert db.get(RoleplaySession,sid).rapport==before
        turn=db.get(Turn,tid)
        assert turn.nonverbal_metrics['_voice_input']['calibration_id']==source['calibration_id']
        baseline,stored=voice_analysis._input(db.get(RoleplaySession,sid),turn)
        assert baseline['id']==source['calibration_id'] and stored['capture'] is None
        deferred_workplace.complete(db,db.get(RoleplaySession,sid),turn)
        assert evaluations==[tid]
