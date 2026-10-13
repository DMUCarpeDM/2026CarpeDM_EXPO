"""Current workplace report contract review; AI outcomes are controlled here."""
import json
from pathlib import Path
import pytest
from app.services.judgments import event

@pytest.mark.parametrize('kind,expected,strength,improvement',[('good',76,True,False),('mixed',75.5,True,True),('off_topic',74,False,True),('empty',75,False,False),('uncertain',None,False,False),('unavailable',None,False,False)])
def test_workplace_report_score_and_feedback(monkeypatch,ready_ollama,kind,expected,strength,improvement):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.seed.run import seed
    from app.services import context_scoring
    seed()
    monkeypatch.setattr(context_scoring,'classify',lambda *args:{'kind':'neutral','status':'unavailable','multipliers':context_scoring.POLICIES['neutral']})
    def judge(current,history,goals,requested):
        events=[]
        assert requested == []  # 자유 대화 체크리스트는 명시적 질문이 아니다.
        if kind in ('good','mixed'):
            events.append(event(current.id,'response','relevant_answer','positive',{'quote':current.response_text},'질문에 직접 답하는 내용을 담았습니다.'))
            events.append(event(current.id,'response','goal_met' if kind=='good' else 'missing_goal','positive' if kind=='good' else 'negative',{'goal_id':'review-goal','quote':current.response_text},'이해한 방향을 확인했습니다.' if kind=='good' else '이해한 방향을 구체적으로 확인해 주세요.',key='review-goal'))
        elif kind=='off_topic':
            events.append(event(current.id,'response','off_topic','negative',{'quote':current.response_text},'현재 용건과 무관한 답변입니다.'))
        return events,[], kind if kind in ('uncertain','unavailable') else 'completed'
    monkeypatch.setattr('app.services.response_judgment.analyze',judge)
    client=TestClient(app)
    created=client.post('/api/sessions',json={'service_mode':'workplace','scenario_slug':'workplace-conversation','consent':{'agreed':True}})
    assert created.status_code==200,created.text
    session=created.json();sid=session['id'];auth={'X-Session-Token':session['access_token']}
    response=client.post(f'/api/sessions/{sid}/turns/{session["current_turn"]["id"]}/response',headers=auth,json={'text':'테스트 답변입니다.','stt_source':'text','duration_ms':5000})
    assert response.status_code==200,response.text
    finished=client.post(f'/api/sessions/{sid}/finish',headers=auth)
    assert finished.status_code in (200,202),finished.text
    report=client.get(f'/api/sessions/{sid}/report',headers=auth)
    assert report.status_code==200,report.text
    data=report.json()
    assert data['fit_scores']['response']['score']==expected
    assert bool(data['strengths'])==strength
    assert bool(data['improvements'])==improvement
    assert data['total_score']==expected
    target=Path('.omo/evidence/scoring-review');target.mkdir(parents=True,exist_ok=True)
    (target/f'report-{kind}.json').write_text(json.dumps({k:data.get(k) for k in ['total_score','fit_scores','strengths','improvements','headline','coaching','rebuild','evidence_segments']},ensure_ascii=False,indent=2))


def test_four_axes_survive_submission_finish_and_report(monkeypatch, ready_ollama):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.seed.run import seed
    from app.services import context_scoring
    from app.services.expression_measurement import LABELS
    seed()
    monkeypatch.setattr(context_scoring, 'classify', lambda *args: {
        'kind':'serious', 'status':'classified', 'quote':'자료 오류를 확인해 주세요.', 'multipliers':context_scoring.POLICIES['serious']})
    monkeypatch.setattr('app.services.response_judgment.analyze', lambda current, *args: (
        [event(current.id,'response','relevant_answer','positive',{'quote':current.response_text},'질문에 직접 답했습니다.')], [], 'completed'))
    client = TestClient(app)
    session = client.post('/api/sessions',json={'service_mode':'workplace','scenario_slug':'workplace-conversation','consent':{'agreed':True}}).json()
    sid = session['id']; auth = {'X-Session-Token':session['access_token']}
    # 같은 답변에서 실제 WAV→측정→보고서 경로와 비언어 점수를 함께 확인한다.
    # VAD/STT와 AI 판정만 고정해 기대 점수를 재현한다.
    from types import SimpleNamespace
    from app.ai import voice_measurement as voice
    from app.services import voice_analysis
    from test_voice_api_v2 import CAPTURE, wav, calibration
    import numpy as np
    monkeypatch.setattr(voice, 'speech_segments', lambda samples,sr,*_: [(0.,len(samples)/sr)] if np.any(samples) else [])
    monkeypatch.setattr(voice_analysis, 'get_stt_provider', lambda: SimpleNamespace(transcribe_words=lambda _: [
        {'word':'확인하겠습니다','start':0.,'end':2.,'conf':.95}]))
    cal=calibration(client,session,auth)
    assert cal.status_code==200 and cal.json()['status']=='measured'
    tid=session['current_turn']['id']
    uploaded=client.post(f'/api/sessions/{sid}/turns/{tid}/audio',headers=auth,
        data={'voice_input':json.dumps({'calibration_id':cal.json()['id'],'capture':CAPTURE,'excluded_intervals':[]})},
        files={'file':('answer.wav',wav(),'audio/wav')})
    assert uploaded.status_code==200,uploaded.text
    response = client.post(f'/api/sessions/{sid}/turns/{session["current_turn"]["id"]}/response', headers=auth, json={
        'text':'확인하겠습니다.', 'stt_source':'text', 'duration_ms':5000,
        'nonverbal':{'frames':50,'sample_ms':100,'calibrated':True,'head_down_ratio':1,
            'posture_samples':{'head_down_ratio':50},
            'expression_model':{'version':'expression-resnet18-v1','status':'unvalidated',
                'preprocessing':'imagenet-face-square-provisional-v1','samples':4,'sustained_smile_ms':3000,
                'mean_outputs':dict.fromkeys(LABELS,.9)}}})
    assert response.status_code == 200, response.text
    assert client.post(f'/api/sessions/{sid}/finish',headers=auth).status_code in (200,202)
    report = client.get(f'/api/sessions/{sid}/report',headers=auth).json()
    assert {key:value['score'] for key,value in report['fit_scores'].items()} == {
        'response':76,'voice':None,'expression':74,'posture':74}
    assert report['fit_scores']['expression']['provisional'] is True
    assert report['speech_stats']['voice_analysis']['score_status'] == 'criteria_pending'
    voice_turn=report['speech_stats']['voice_analysis']['turns'][0]
    assert voice_turn['analysis_status']=='completed'
    assert voice_turn['volume']['relative_db']==pytest.approx(0,abs=.001)
    assert voice_turn['speed']['syllables_per_second']==3.5
    assert voice_turn['pauses']['count']==0
    assert report['speech_stats']['measurement']['audio_sec']==2
    assert report['speech_stats']['avg_speech_rate']==3.5
    assert voice_turn['pitch']['median_hz'] is None
    assert report['total_score'] == 74.7
    assert report['strengths'] and len(report['improvements']) == 2
    target=Path('.omo/evidence/scoring-review/report-four-axes.json')
    target.write_text(json.dumps(report,ensure_ascii=False,indent=2))
