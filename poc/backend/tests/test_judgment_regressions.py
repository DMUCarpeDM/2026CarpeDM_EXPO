import json
from types import SimpleNamespace as NS
import pytest
from app.services import response_judgment as judge, interaction_scoring as scoring, context_scoring as context
from app.services.judgments import event, evaluate
from app.services.dialogue.openai_provider import _grounded_actor_line, _valid_line
from app.services.workplace import continuous_fallback_line


def turn(text):
    return NS(id=2, order=2, question_text='누가 자료를 담당합니까?', response_text=text)


@pytest.mark.parametrize('text', ['네, 알겠습니다.', '네', '예. 알겠어요!', '넵 알겠습니다'])
def test_ack_never_awards_even_if_model_claims_goal(text, monkeypatch):
    monkeypatch.setattr(judge.httpx, 'post', lambda *a, **k: pytest.fail('ack should not call model'))
    current = turn(text)
    assert judge.analyze(current, [], [], []) == ([], [], 'completed')
    assert judge.validate({'relevant_quote': text, 'met_goals': [{'goal_id': 'x', 'quote': text}]},
                          current, [], [{'id': 'x', 'label': '확인'}], []) == ([], [])


@pytest.mark.parametrize('text', ['그 저 어 지직 자료 음 음 끊 끊', '어 음 음', 'ㄱㄴㄷ'])
def test_noise_withholds_score(monkeypatch, text):
    monkeypatch.setattr(judge.httpx, 'post', lambda *a, **k: pytest.fail('noise should not call model'))
    events, met, status = judge.analyze(turn(text), [], [], [])
    assert status == 'uncertain' and not events and not met
    assert scoring.calculate([{'measured': [], 'events': events}])['scores']['response'] is None


@pytest.mark.parametrize('text', ['네, 내일까지 자료를 정리하겠습니다.', '마이크에서 지직 소리가 나는데 다시 말씀해주시겠어요?', '김 대리', '10월 14일'])
def test_short_or_noisy_but_meaningful_answers_are_not_blocked(text):
    assert judge.transcript_status(text) is None


def test_explicit_uncertainty_discards_spurious_events():
    assert judge.validate({'assessment_status': 'uncertain', 'relevant_quote': '자료'},
                          turn('자료 음'), [], [], []) == ([], [])


def test_contradiction_removes_bonus_and_is_deducted_once_from_response():
    prior = NS(id=1, order=1, response_text='제가 이 자료 담당자입니다.')
    current = turn('저는 이 자료 담당자가 아닙니다.')
    data = {'relevant_quote': current.response_text, 'conflicts': [{
        'previous_turn_id': 1, 'previous_quote': prior.response_text, 'current_quote': current.response_text,
        'fact_key': '담당자', 'confidence': .99, 'explained_change': False}]}
    events, met = judge.validate(data, current, [prior], [], [])
    assert [e['rule'] for e in events] == ['contradiction'] and not met
    events.append(event(2, 'response', 'relevant_answer', 'positive', {}, ''))
    out = scoring.calculate([{'measured': ['response', 'posture'], 'events': events}])
    assert out['scores']['response'] == 74 and out['scores']['posture'] == 75
    assert out['total'] == 74.5 and not out['changes']['response']
    data['conflicts'][0]['explained_change'] = True
    assert [e['rule'] for e in judge.validate(data, current, [prior], [], [])[0]] == ['relevant_answer']


def test_expression_survives_context_failure_but_no_smile_penalty():
    result = evaluate(1)
    context.apply(result, {'kind': 'neutral', 'status': 'unavailable', 'multipliers': context.POLICIES['neutral']},
                  {'expression_model': {'version': 'expression-resnet18-v1', 'samples': 4, 'sustained_smile_ms': 4000}})
    out = scoring.calculate([result])
    assert out['scores']['expression'] == 75 and not out['changes']['expression']


def test_failed_context_retries_after_short_cache(monkeypatch):
    context.classify.cache_clear()
    clock = [0]
    calls = []
    monkeypatch.setattr(context, 'monotonic', lambda: clock[0])
    def classify(*args):
        calls.append(1)
        return {'status': 'unavailable' if len(calls) == 1 else 'classified'}
    monkeypatch.setattr(context, '_classify', classify)
    assert context.classify(1, 1, 'q', 's')['status'] == 'unavailable'
    assert context.classify(1, 1, 'q', 's')['status'] == 'unavailable'
    clock[0] = 6
    assert context.classify(1, 1, 'q', 's')['status'] == 'classified'
    assert len(calls) == 2
    context.classify.cache_clear()


def test_three_sentence_actor_is_rejected():
    assert not _valid_line('갑자기 무슨 점수예요? 팀장님에게 보고해야 해요. 자료는 다 봤어요?')
    assert _valid_line('자료는 다 봤어요? 이해한 방향을 알려 주세요.')


@pytest.mark.parametrize('answer', [ {'supported': False, 'quotes': []}, {'supported': True, 'quotes': ['없는 보고 일정']}, {}, None])
def test_ungrounded_actor_or_failed_verifier_uses_current_scene(answer):
    scene = {'text': '자료를 먼저 읽어 주세요.', 'situation': '자료 확인', 'episode_id': 1,
             'fallback_pool': ['내일 팀장에게 보고해 주세요.']}
    def complete(*args, **kwargs):
        return json.dumps(answer)
    out = _grounded_actor_line('팀장님에게 보고해야 해요.', NS(), {'id': 'a'}, [], scene, complete)
    assert out == scene['text']
    assert continuous_fallback_line({}, [], scene) == scene['text']


def test_grounded_actor_keeps_valid_line():
    scene = {'text': '자료를 먼저 읽어 주세요.', 'situation': '자료 확인'}
    line = '자료를 읽고 이해한 내용을 알려 주시겠어요?'
    assert _grounded_actor_line(line, NS(), {}, [], scene, lambda *a, **k: json.dumps({
        'supported': True, 'quotes': ['자료를 먼저 읽어 주세요.']})) == line


@pytest.mark.parametrize('text,expected', [('네, 알겠습니다.',75), ('그 저 어 지직 자료 음 음 끊 끊',None)])
def test_real_judgment_guard_survives_submission_and_report(monkeypatch, ready_ollama, text, expected):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.seed.run import seed
    from app.services.expression_measurement import LABELS
    seed()
    monkeypatch.setattr(context, 'classify', lambda *a: {
        'kind':'neutral','status':'unavailable','multipliers':context.POLICIES['neutral']})
    client = TestClient(app)
    created = client.post('/api/sessions', json={'service_mode':'workplace',
        'scenario_slug':'workplace-conversation','consent':{'agreed':True}}).json()
    sid = created['id']; auth = {'X-Session-Token':created['access_token']}
    model = {'version':'expression-resnet18-v1','status':'unvalidated',
        'preprocessing':'imagenet-face-square-provisional-v1','samples':4,'sustained_smile_ms':4000,
        'mean_outputs':dict.fromkeys(LABELS,.9)}
    response = client.post(f'/api/sessions/{sid}/turns/{created["current_turn"]["id"]}/response', headers=auth,
        json={'text':text,'stt_source':'webspeech','duration_ms':5000,'nonverbal':{'expression_model':model}})
    assert response.status_code == 200, response.text
    assert client.post(f'/api/sessions/{sid}/finish', headers=auth).status_code in (200,202)
    report = client.get(f'/api/sessions/{sid}/report',headers=auth).json()
    assert report['fit_scores']['response']['score'] == expected
    assert report['fit_scores']['expression']['score'] == 75
    assert '맥락 가감점은 보류' in report['fit_scores']['expression']['summary']
    assert report['fit_scores']['voice']['score'] is None
    assert not report['strengths'] and not report['improvements']
    from pathlib import Path
    target=Path('.omo/evidence/judgment-fixes');target.mkdir(parents=True,exist_ok=True)
    (target / ('api-ack.json' if expected else 'api-noise.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2))


def test_gemini_generation_verifies_invented_report_destination():
    from app.services.dialogue.gemini_provider import GeminiDialogueProvider
    provider = GeminiDialogueProvider()
    calls = []
    def complete(system, user, **kwargs):
        calls.append((system, user))
        return '팀장님에게 보고해 주세요.' if len(calls) == 1 else json.dumps({'supported':False,'quotes':[]})
    provider._complete = complete
    scene = {'text':'자료를 먼저 읽어 주세요.','situation':'자료 확인','episode_id':1}
    line = provider._generate_continuous_line(NS(difficulty='basic'), NS(world_setting={}), {'id':'a'}, [], {}, scene)
    assert line == scene['text'] and len(calls) == 2
    assert '페르소나' not in calls[1][1]


@pytest.mark.parametrize('quote,awarded', [
    ('제가 이해한 방향을 확인받지는 않겠습니다.',False),
    ('제가 이해한 방향을 확인받지 못했습니다.',False),
    ('제가 이해한 방향을 확인받겠습니다.',True),
    ('자료는 받지 못했지만 제가 이해한 방향을 확인받겠습니다.',True),
])
def test_explicit_negative_goal_quote_never_awards(quote, awarded):
    current=turn(quote)
    events, met=judge.validate({'met_goals':[{'goal_id':'direction','quote':quote}]},current,[],
                               [{'id':'direction','label':'이해한 방향을 확인'}],[])
    assert bool(met) is awarded
    assert bool(events) is awarded
