"""상황 × 행동 규칙, 측정 보류, 최종 재분석의 일관성."""
import io
import json
from types import SimpleNamespace as NS

import numpy as np
import pytest
import soundfile as sf

from app.ai import voice_measurement as engine
from app.services import context_scoring as context, interaction_scoring as scoring
from app.services.judgments import evaluate, event


def policy(kind='serious', status='classified'):
    return {'kind':kind, 'status':status, 'quote':'수치 오류를 바로잡아 주세요.'}


def measurement(db=6, turn_id=1):
    return {**engine.empty_result(1, turn_id), 'calibration_id':'test-calibration',
            'analysis_status':'completed', 'quality_flags':[],
            'volume':engine.measured(relative_db=db, speech_seconds=3, noise_seconds=1, snr_db=25)}


def assess(kind='serious', voice=None, status='classified'):
    result = evaluate(1)
    result['voice_measurement'] = measurement() if voice is None else voice
    return context.apply(result, policy(kind, status), None)


@pytest.mark.parametrize('kind,db,expected', [
    ('serious',6,73), ('supportive',6,73.5), ('technical',6,None),
    ('casual',6,None), ('neutral',6,None), ('serious',5.99,75), ('serious',0,75),
])
def test_loudness_uses_context_action_rule_without_stacking_area_multiplier(kind,db,expected):
    result = assess(kind, measurement(db))
    out = scoring.calculate([result,result])
    assert out['scores']['voice'] == expected
    changes = out['changes']['voice']
    if expected is not None and expected < 75:
        assert len(changes) == 1
        assert changes[0]['base_points'] == -1
        assert changes[0]['multiplier'] == (2 if kind == 'serious' else 1.5)
        assert changes[0]['points'] == expected - 75
        assert changes[0]['evidence']['provisional'] is True
    else:
        assert not changes


@pytest.mark.parametrize('patch', [
    {'relative_db':float('nan')}, {'relative_db':float('inf')}, {'relative_db':True},
    {'relative_db':None}, {'status':'uncertain'}, {'status':'unmeasured'},
    {'speech_seconds':2.99}, {'noise_seconds':.49}, {'snr_db':9.99}, {'snr_db':None},
])
def test_short_noisy_or_unreliable_volume_never_becomes_a_penalty(patch):
    voice = measurement()
    voice['volume'].update(patch)
    result = assess(voice=voice)
    assert scoring.calculate([result])['scores']['voice'] is None
    assert not result['events']


@pytest.mark.parametrize('patch', [
    {'calibration_id':None}, {'turn_id':2}, {'quality_flags':['clipping']},
    {'engine_version':'unknown'},
])
def test_untrusted_measurement_source_abstains(patch):
    result = assess(voice={**measurement(), **patch})
    assert scoring.calculate([result])['scores']['voice'] is None


def test_unknown_context_and_natural_high_pitch_do_not_penalize():
    assert scoring.calculate([assess(status='uncertain')])['scores']['voice'] is None
    voice = measurement(0)
    voice['pitch'] = engine.measured(median_hz=450)
    result = assess(voice=voice)
    assert scoring.calculate([result])['scores']['voice'] == 75
    assert not result['events']


def test_final_measurement_replaces_provisional_event_including_retraction():
    result = assess()
    context.apply_voice(result, policy())
    assert len(result['events']) == 1
    assert scoring.calculate([result])['scores']['voice'] == 73
    result['voice_measurement'] = measurement(0)
    context.apply_voice(result, policy())
    assert not result['events']
    assert scoring.calculate([result])['scores']['voice'] == 75
    result['voice_measurement'] = engine.empty_result(1,1)
    context.apply_voice(result, policy())
    assert scoring.calculate([result])['scores']['voice'] is None


def test_combined_serious_events_change_only_matching_behaviors_and_keep_caps():
    results = []
    for turn_id in range(5):
        result = evaluate(turn_id)
        result['measured'] = ['response','posture']
        result['events'] = [event(turn_id,'response','off_topic','negative',{},''),
                            event(turn_id,'posture','sway','negative',{},'')]
        result['voice_measurement'] = measurement(turn_id=turn_id)
        context.apply(result,policy(),{'expression_model':{
            'version':'expression-resnet18-v1','samples':4,'sustained_smile_ms':3000}})
        results.append(result)
    out = scoring.calculate(results + results)
    assert out['scores'] == {'response':60,'voice':69,'expression':72,'posture':72}
    assert out['changes']['response'][0]['points'] == -2
    assert out['changes']['posture'][0]['multiplier'] == 1
    assert out['changes']['expression'][0]['base_points'] == -.5
    assert out['changes']['expression'][0]['multiplier'] == 2


def recording(amplitude=.25):
    # 3초 발화 + 1초 무음. 원시 사용자 녹음은 사용하지 않는다.
    values = np.concatenate([amplitude * np.sin(np.arange(48000) * 2 * np.pi * 180 / 16000), np.zeros(16000)])
    file = io.BytesIO()
    sf.write(file,values,16000,format='WAV',subtype='PCM_16')
    return file.getvalue()


@pytest.mark.parametrize('late_analysis', [False,True])
def test_calibrated_audio_reaches_submission_and_final_report(monkeypatch,ready_ollama,late_analysis,tmp_path):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.core.config import settings
    from app.seed.run import seed
    from app.services import voice_analysis
    from test_voice_api_v2 import CAPTURE, calibration
    seed()
    monkeypatch.setattr(settings,'media_dir',tmp_path)
    monkeypatch.setattr(context,'classify',lambda *args: policy())
    monkeypatch.setattr('app.services.response_judgment.analyze',lambda *args: ([],[],'completed'))
    monkeypatch.setattr(engine,'speech_segments',lambda samples,sr,*_: [(0.,min(3.,len(samples)/sr))] if np.any(samples) else [])
    monkeypatch.setattr(voice_analysis,'get_stt_provider',lambda: NS(transcribe_words=lambda _: [
        {'word':'오류를 확인하겠습니다','start':0.,'end':3.,'conf':.95}]))
    if late_analysis:
        monkeypatch.setattr(voice_analysis,'live_turn',lambda session,turn: engine.empty_result(session.id,turn.id,'analysis_timeout'))
    client = TestClient(app)
    session = client.post('/api/sessions',json={'service_mode':'workplace','scenario_slug':'workplace-conversation',
        'exhibition':True,'consent':{'agreed':True}}).json()
    sid,tid = session['id'],session['current_turn']['id']
    auth = {'X-Session-Token':session['access_token']}
    cal = calibration(client,session,auth).json()
    assert cal['status'] == 'measured'
    upload = client.post(f'/api/sessions/{sid}/turns/{tid}/audio',headers=auth,
        data={'voice_input':json.dumps({'calibration_id':cal['id'],'capture':CAPTURE,'excluded_intervals':[]})},
        files={'file':('synthetic.wav',recording(),'audio/wav')})
    assert upload.status_code == 200,upload.text
    response = client.post(f'/api/sessions/{sid}/turns/{tid}/response',headers=auth,
        json={'text':'오류를 확인하겠습니다.','stt_source':'webspeech','duration_ms':4000})
    assert response.status_code == 200,response.text
    judgment = response.json()['turn_signals']['judgment']
    assert scoring.calculate([judgment])['scores']['voice'] == (None if late_analysis else 73)
    assert client.post(f'/api/sessions/{sid}/finish',headers=auth).status_code in (200,202)
    report = client.get(f'/api/sessions/{sid}/report',headers=auth).json()
    assert report['fit_scores']['voice']['score'] == 73
    assert report['fit_scores']['voice']['provisional'] is True
    assert report['speech_stats']['voice_analysis']['score_status'] == 'context_provisional'
    assert report['speech_stats']['voice_analysis']['score_scope'] == 'relative_volume'
    events = [e for e in report['evidence_segments'] if e['rule'] == 'context_raised_voice']
    assert len(events) == 1
    assert (events[0]['base_points'],events[0]['multiplier'],events[0]['points']) == (-1,2,-2)
    assert report['improvements']
    assert report['deep_analysis']['interaction']['version'] == 'interaction-score-v8'


@pytest.mark.parametrize('case,expected', [
    ('loud',73), ('brief_spike',75), ('noisy',None), ('no_quiet',None), ('device_changed',None),
])
def test_synthetic_audio_quality_gates_before_context_penalty(tmp_path,monkeypatch,case,expected):
    from test_voice_measurement import CAPTURE, baseline, tone, write
    monkeypatch.setattr(engine,'speech_segments',lambda *_: [(0.,3.)])
    speech = tone(seconds=3,amplitude=.25)
    quiet = np.zeros(16000)
    if case == 'brief_spike':
        speech = tone(seconds=3,amplitude=.1)
        speech[:3200] *= 3
    elif case == 'noisy':
        quiet = tone(seconds=1,amplitude=.15)
    elif case == 'no_quiet':
        quiet = np.array([])
    reference = engine._rms(tone(seconds=3),16000,[(0.,3.)])
    capture = {**CAPTURE,'device_id':'different-mic'} if case == 'device_changed' else CAPTURE
    voice = engine.analyze(write(tmp_path,np.concatenate([speech,quiet])),
        session_id=1,turn_id=1,calibration=baseline(reference),capture=capture,references=False)
    assert scoring.calculate([assess(voice=voice)])['scores']['voice'] == expected
