"""Exercise real posture inference with expression aggregates across a complete day."""
import json
from pydantic import SecretStr
from fastapi.testclient import TestClient
from app.ai.posture_ensemble import ROOT, VERSION
from app.core.config import settings
from app.main import app
from app.seed.run import seed
from app.services.expression_measurement import LABELS


def test_twelve_turn_day_preserves_model_outputs_and_reports_honest_scores(monkeypatch):
    monkeypatch.setattr(settings, 'dialogue_provider', 'openai')
    monkeypatch.setattr(settings, 'openai_api_key', SecretStr(''))
    monkeypatch.setattr(settings, 'gemini_api_key', SecretStr(''))
    monkeypatch.setattr('app.services.response_judgment.analyze', lambda *_: ([], [], 'unavailable'))
    seed()
    client = TestClient(app)
    response = client.post('/api/sessions', json={
        'service_mode': 'workplace', 'scenario_slug': 'workplace-conversation', 'mode': 5,
        'consent': {'agreed': True, 'storage_policy': 'none'}})
    assert response.status_code == 200, response.text
    session = response.json()
    sid = session['id']
    auth = {'X-Session-Token': session['access_token']}
    features = json.loads((ROOT / 'golden.json').read_text())['features'][0]
    expression = {'version': 'expression-resnet18-v1', 'status': 'unvalidated',
        'preprocessing': 'imagenet-face-square-provisional-v1', 'samples': 3,
        'mean_outputs': dict.fromkeys(LABELS, .5)}
    nonverbal = {'expression_model': expression,
        'pose_ensemble': {'version': VERSION, 'sample_ms': 80, 'features': [features] * 40}}
    categories = []
    for i in range(12):
        current = client.get(f'/api/sessions/{sid}', headers=auth).json()
        categories.append(current['interaction']['briefing']['category_id'])
        turn = current['current_turn']['id']
        response = client.post(f'/api/sessions/{sid}/turns/{turn}/response', headers=auth,
            json={'text': '자료를 확인하고 가능한 일정부터 공유하겠습니다.',
                'stt_source': 'text', 'duration_ms': 4000, 'nonverbal': nonverbal})
        assert response.status_code == 200, response.text
        assert response.json()['finished'] == (i == 11)
    assert categories == ['morning'] * 4 + ['work'] * 5 + ['leaving'] * 3
    # The client finishes after the final answer/audio upload before requesting a report.
    response = client.post(f'/api/sessions/{sid}/finish', headers=auth)
    assert response.status_code in (200, 202), response.text
    response = client.get(f'/api/sessions/{sid}/report', headers=auth)
    assert response.status_code == 200, response.text
    report = response.json()
    analysis = report['speech_stats']['expression_analysis']
    assert analysis['samples'] == 36 and len(analysis['turns']) == 12
    assert analysis['mean_outputs'] == dict.fromkeys(LABELS, .5)
    assert analysis['scoring_enabled'] is False
    assert report['fit_scores']['expression']['score'] is None
    assert report['fit_scores']['posture']['score'] is not None
    assert report['fit_scores']['response']['score'] is None
