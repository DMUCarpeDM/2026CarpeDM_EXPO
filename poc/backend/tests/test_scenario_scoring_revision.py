"""시나리오별 근거, 이탈 우선순위, 비중, 측정 기반 비언어 평가 회귀."""
import copy
from types import SimpleNamespace as NS

import pytest

from app.ai import voice_measurement as engine
from app.services import context_scoring as context, deferred_workplace, interaction
from app.services import interaction_scoring as scoring, response_judgment as judge, voice_analysis
from app.services.judgments import event, evaluate
from test_workplace_exhibition import fixture
from test_voice_measurement import CAPTURE, tone, write


def turn(text, question='오늘 목표를 말해 주세요.', number=1):
    return NS(id=number, order=number, question_text=question, response_text=text,
              episode_id=1, character_id='park_senior', nonverbal_metrics={},
              response_duration_ms=5000, stt_source='typed')


def evidence(current, **values):
    return {'assessment_status': 'completed', 'assessed_quote': current.response_text, **values}


@pytest.mark.parametrize('vague', ['vague', 'substantive'])
def test_grounded_off_topic_precedes_answer_specificity(vague):
    current = turn('파이썬으로 게임을 만들어 주세요.')
    data = evidence(current, answer_kind=vague, off_topic_quote=current.response_text, off_topic_confidence=.99)
    events, met = judge.validate(data, current, [], [], [])
    assert [e['rule'] for e in events] == ['off_topic'] and not met
    result = scoring.calculate([{'measured': ['response'], 'events': events}])
    assert result['scores']['response'] == 73


@pytest.mark.parametrize('patch', [
    {'assessment_status': 'uncertain'}, {'off_topic_confidence': .89},
    {'off_topic_quote': '파이썬'}, {'relevant_quote': '오늘'},
])
def test_vague_does_not_override_uncertainty_or_partial_relevance(patch):
    current = turn('오늘 파이썬 작업에 대해 알고 싶습니다.')
    data = evidence(current, answer_kind='vague', off_topic_quote=current.response_text, off_topic_confidence=.99)
    assert judge.validate({**data, **patch}, current, [], [], []) == ([], [])


def scene(order):
    scenario, episodes = fixture()
    class Pick:
        def choice(self, rows):
            return next(row for row in rows if row['order'] == order)
    session = NS(id=1, rapport={}, mode=5, turns=[])
    flow = interaction.initialize(session, scenario, episodes, 'workplace', Pick(), exhibition=True)
    return session, flow


def test_scenarios_have_distinct_rubrics_and_deferred_missing_candidates():
    for order, suffixes, requested_count in [(1, {'name','role','daily-goal'}, 3),
                                             (15, {'attendance','conditions','boundary'}, 1)]:
        session, flow = scene(order)
        goals = interaction.assessment_goals(flow)
        assert {g['id'].split(':')[1] for g in goals} == suffixes
        current = turn('제가 아는 범위에서 답하겠습니다.')
        snapshot = deferred_workplace.pending(current, flow)['deferred_context']
        assert snapshot['goals'] == goals
        assert len(snapshot['requested']) == requested_count
        assert len(flow['items']) == 5


def test_explicit_missing_goal_is_scored_and_followup_completion_replaces_it():
    _, flow = scene(1)
    goals = interaction.assessment_goals(flow)
    goal = next(g for g in goals if g['id'].endswith('daily-goal'))
    current = turn('저는 민수입니다.')
    data = evidence(current, missing_goals=[{'goal_id':goal['id'],
        'request_quote':'오늘 목표를 말해 주세요.', 'confidence':.99}])
    events, _ = judge.validate(data,current,[],goals,interaction.requested_goals(flow))
    first = {'turn_id':1,'measured':['response'],'events':events}
    assert scoring.calculate([first])['scores']['response'] == 74
    following = turn('오늘은 팀원들께 인사하겠습니다.',number=2)
    events, _ = judge.validate(evidence(following,met_goals=[{'goal_id':goal['id'],
        'quote':following.response_text}]),following,[current],goals,[])
    out = scoring.calculate([first, {'turn_id':2,'measured':['response'],'events':events}])
    assert out['scores']['response'] == 77
    assert [e['rule'] for e in out['changes']['response']] == ['goal_met']


def test_absent_request_and_optional_private_details_cannot_be_deducted():
    _, flow = scene(15)
    goals = interaction.assessment_goals(flow)
    current = turn('오늘은 참석하지 않겠습니다.','오늘 참석하실 거예요?')
    optional = next(g for g in goals if g['id'].endswith('boundary'))
    data = evidence(current, missing_goals=[{'goal_id':optional['id'],
        'request_quote':current.question_text,'confidence':.99}])
    assert judge.validate(data,current,[],goals,[g['id'] for g in goals]) == ([],[])
    data['missing_goals'][0] = {'goal_id':goals[0]['id'],'request_quote':'개인 일정이 뭔가요?','confidence':.99}
    assert judge.validate(data,current,[],goals,interaction.requested_goals(flow)) == ([],[])


def test_clear_refusal_can_meet_attendance_goal_without_rewarding_acceptance_only():
    _, flow = scene(15)
    goals = interaction.assessment_goals(flow)
    current = turn('오늘은 참석하지 않겠습니다.')
    events, met = judge.validate(evidence(current,met_goals=[{'goal_id':goals[0]['id'],
        'quote':current.response_text}]),current,[],goals,[])
    assert met == [goals[0]['id']] and len(events) == 1
    assert judge.analyze(turn('네, 알겠습니다.'),[],goals,[]) == ([],[],'completed')


def test_total_uses_configured_weights_and_renormalizes_missing_axes():
    result = {'measured':list(scoring.AREAS),'events':[
        event(1,'response','off_topic','negative',{},''),
        event(1,'voice','clear_pace','positive',{},'')]}
    out = scoring.calculate([result])
    assert out['scores'] == {'response':73,'voice':77,'expression':75,'posture':75}
    assert out['total'] == 74.7  # 73*.4 + 77*.25 + 75*.2 + 75*.15
    result['measured'] = ['response','voice']
    out = scoring.calculate([result])
    assert out['total'] == round((73*.4 + 77*.25)/.65,1)
    assert out['scores']['expression'] is None and out['effective_weights']['expression'] == 0
    assert scoring.calculate([result],{'response':1,'voice':0})['total'] == 73
    assert scoring.calculate([])['total'] is None


def policy(kind='neutral', profile='introduction'):
    return {'kind':kind,'status':'classified','quote':'오늘 목표를 말해 주세요.','delivery_profile':profile}


def expression(smile=.1, neutral=.8, sustained=0):
    return {'expression_model':{'version':'expression-resnet18-v1','samples':6,
        'sustained_smile_ms':sustained,'mean_outputs':{'smile':smile,'neutral':neutral}}}


def test_expression_changes_with_observed_signal_and_context_without_forcing_smiles():
    natural = context.apply(evaluate(1),policy(),expression())
    assert scoring.calculate([natural])['scores']['expression'] == 76
    smiling = context.apply(evaluate(1),policy(profile='invitation'),expression(.9,.1,4000))
    assert scoring.calculate([smiling])['scores']['expression'] == 76
    serious = context.apply(evaluate(1),policy('serious'),expression(.9,.1,4000))
    assert scoring.calculate([serious])['scores']['expression'] == 73
    context.apply(serious,policy(),expression())
    assert scoring.calculate([serious])['scores']['expression'] == 76
    assert len(serious['events']) == 1
    context.apply(serious,policy(),None)
    assert scoring.calculate([serious])['scores']['expression'] is None
    uncertain = context.apply(evaluate(1),{**policy(),'status':'uncertain'},expression())
    assert not uncertain['events']


def voice(turn_id=1, rms=.1, rate=4, **patch):
    return engine.complete_shape({**engine.empty_result(1,turn_id), 'duration_sec':20,'analysis_status':'partial','quality_flags':[],
        'capture':CAPTURE,
        'volume':engine.missing('personal_reference_unavailable',rms=rms,speech_seconds=5,noise_seconds=1,snr_db=30),
        'speed':engine.measured(syllables_per_second=rate), 'pauses':engine.measured(count=0,segments=[]), **patch})


def test_pace_depends_on_scene_and_also_works_with_personal_calibration():
    for profile, expected in [('introduction',73),('invitation',77)]:
        result = {**evaluate(1),'voice_measurement':voice(rate=6.5)}
        context.apply_voice(result,policy(profile=profile))
        assert scoring.calculate([result])['scores']['voice'] == expected
    result['voice_measurement']['volume'] = engine.measured(relative_db=0)
    result['voice_measurement']['calibration_id'] = 'personal'
    context.apply_voice(result,policy(profile='invitation'))
    assert scoring.calculate([result])['scores']['voice'] == 77


def test_repeated_long_internal_pauses_affect_score_but_one_thinking_pause_does_not():
    result = {**evaluate(1),'voice_measurement':voice()}
    result['voice_measurement']['pauses'] = engine.measured(count=3,segments=[
        {'start':i*4+1,'end':i*4+4,'duration_sec':3} for i in range(3)])
    context.apply_voice(result,policy())
    assert {e['rule'] for e in result['events']} == {'clear_pace','long_pause'}
    assert scoring.calculate([result])['scores']['voice'] == 75
    result['voice_measurement']['pauses']['segments'] = result['voice_measurement']['pauses']['segments'][:1]
    context.apply_voice(result,policy())
    assert [e['rule'] for e in result['events']] == ['clear_pace']


def test_standard_voice_uses_only_earlier_same_capture_and_does_not_mutate_raw_values():
    raw = {'1':voice(1), '2':voice(2,rms=.25)}
    session = NS(turns=[turn('',number=2),turn('',number=1)],rapport={'voice_measurements':raw})
    before = copy.deepcopy(raw)
    compared = voice_analysis.scoring_measurements(session)
    assert compared['1']['volume']['relative_db'] is None
    assert compared['2']['volume']['relative_db'] == pytest.approx(7.9588,abs=.001)
    assert compared['2']['volume']['reference_turn_id'] == 1
    assert raw == before
    result = {**evaluate(2),'voice_measurement':compared['2']}
    context.apply_voice(result,policy('serious'))
    assert 'context_raised_voice' in [e['rule'] for e in result['events']]


@pytest.mark.parametrize('kind,points',[('neutral',-1),('casual',-.5),('technical',-2),('serious',-4),('supportive',-3)])
def test_same_volume_change_has_bounded_context_specific_weight(kind,points):
    session=NS(turns=[turn('',number=1),turn('',number=2)],
        rapport={'voice_measurements':{'1':voice(1),'2':voice(2,rms=.25)}})
    measured=voice_analysis.scoring_measurements(session)['2']
    result={**evaluate(2),'voice_measurement':measured}
    context.apply(result,policy(kind),None)
    changes=scoring.calculate([result])['changes']['voice']
    assert next(e['points'] for e in changes if e['rule']=='context_raised_voice')==points


@pytest.mark.parametrize('bad', ['clipping','noise','short','device','agc'])
def test_session_reference_rejects_unreliable_or_changed_capture(bad):
    first, second = voice(1), voice(2,rms=.25)
    if bad == 'clipping': first['quality_flags']=['clipping']
    if bad == 'noise': first['volume']['snr_db']=5
    if bad == 'short': first['volume']['speech_seconds']=1
    if bad == 'device': second['capture']={**CAPTURE,'device_id':'another'}
    if bad == 'agc': second['capture']={**CAPTURE,'auto_gain_control':True}
    session = NS(turns=[turn('',number=1),turn('',number=2)],rapport={'voice_measurements':{'1':first,'2':second}})
    assert voice_analysis.scoring_measurements(session)['2']['volume']['relative_db'] is None


def test_standard_recording_retains_acoustic_quality_for_later_comparison(monkeypatch,tmp_path):
    import numpy as np
    monkeypatch.setattr(engine,'speech_segments',lambda *_:[(0.,3.)])
    recorded = engine.analyze(write(tmp_path,np.concatenate([tone(3),np.zeros(16000)])),
        session_id=1,turn_id=1,calibration={'source':'standard','id':'standard-v1'},capture=CAPTURE,references=False)
    assert recorded['volume']['speech_seconds'] == 3
    assert recorded['volume']['noise_seconds'] == 1
    assert recorded['volume']['snr_db'] > 10
    assert recorded['capture'] == CAPTURE
    assert recorded['volume']['relative_db'] is None


def test_five_turn_api_report_uses_scene_rubric_and_all_four_weighted_scores(monkeypatch):
    import json
    from pathlib import Path
    from fastapi.testclient import TestClient
    from app.main import app
    from app.seed.run import seed
    from app.core.config import settings
    from app.services.dialogue.openai_provider import OpenAIDialogueProvider
    from app.services.expression_measurement import LABELS

    seed()
    monkeypatch.setattr(settings,'workplace_fixed_scene_order',1)
    monkeypatch.setattr(OpenAIDialogueProvider,'_generate_continuous_line',lambda *_:'오늘 목표를 조금 더 알려주세요.')
    monkeypatch.setattr(context,'classify',lambda *_:policy())
    seen = []
    def analyze(current, history, goals, requested):
        seen.append((goals,requested))
        selected = goals[min(current.order-1,2)]
        events, met = judge.validate(evidence(current,met_goals=[{
            'goal_id':selected['id'],'quote':current.response_text}]),current,history,goals,requested)
        return events, met, 'completed'
    monkeypatch.setattr(judge,'analyze',analyze)
    def finish(session,current,**kwargs):
        measurement=voice(current.id,rms=.1 if current.order==1 else .25)
        voice_analysis.store_measurement(session,current.id,measurement)
        return (measurement,None) if kwargs.get('include_stt_log') else measurement
    monkeypatch.setattr(voice_analysis,'finish_turn',finish)
    client=TestClient(app)
    created=client.post('/api/sessions',json={'service_mode':'workplace','scenario_slug':'workplace-conversation',
        'consent':{'agreed':True,'storage_policy':'none'}}).json()
    sid=created['id']; auth={'X-Session-Token':created['access_token']}; current=created['current_turn']
    model={'version':'expression-resnet18-v1','status':'unvalidated',
        'preprocessing':'imagenet-face-square-provisional-v1','samples':6,'sustained_smile_ms':0,
        'mean_outputs':{**dict.fromkeys(LABELS,.1),'neutral':.8}}
    for index in range(5):
        response=client.post(f"/api/sessions/{sid}/turns/{current['id']}/response",headers=auth,
            json={'text':['저는 민수입니다.','저는 자료 정리를 맡았습니다.','오늘 목표는 절차를 배우는 것입니다.',
                          '먼저 안내 문서를 읽겠습니다.','네, 기본 절차를 익히겠습니다.'][index],
                  'duration_ms':5000,'nonverbal':{'calibrated':True,'frames':20,'sample_ms':200,
                    'head_down_ratio':.6,'posture_samples':{'head_down_ratio':20},'expression_model':model}})
        assert response.status_code==200,response.text
        data=response.json()
        assert data['finished'] is (index==4)
        current=data.get('next_turn')
    assert client.post(f'/api/sessions/{sid}/finish',headers=auth).status_code in (200,202)
    response=client.get(f'/api/sessions/{sid}/report',headers=auth)
    assert response.status_code==200,response.text
    report=response.json(); scores={k:v['score'] for k,v in report['fit_scores'].items()}
    assert all(scores[k] is not None for k in scoring.AREAS)
    assert all(55 <= scores[k] <= 89 for k in scoring.AREAS)
    assert len(seen)==5 and all(len(goals)==len(requested)==3 for goals,requested in seen)
    detail=report['deep_analysis']['interaction']
    assert detail['weights']==scoring.DEFAULT_WEIGHTS
    assert report['total_score']==round(sum(scores[k]*scoring.DEFAULT_WEIGHTS[k] for k in scoring.AREAS),1)
    assert report['strengths'] and report['improvements']
    volumes=[v['volume'] for v in report['speech_stats']['voice_analysis']['turns']]
    assert volumes[0]['relative_db'] is None
    assert all(v['reference_source']=='session' for v in volumes[1:])
    path=Path('../../output/qa/2026-10-16-scoring/api-report.json')
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(report,ensure_ascii=False,indent=2))
