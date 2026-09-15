import json
import numpy as np
from app.ai.posture_ensemble import ROOT, VERSION, probabilities
from app.services.judgments import evaluate
from app.services.interaction_scoring import calculate


def test_exported_models_match_notebook_reference():
    golden = json.loads((ROOT/'golden.json').read_text())
    actual = probabilities(golden['features'])
    for label, values in actual.items():
        np.testing.assert_allclose(values, golden['probabilities'][label], atol=1e-5, rtol=0)


def test_no_pose_does_not_fall_back_to_geometry():
    nv = {'frames':100, 'sample_ms':80, 'calibrated':True,
          'head_down_ratio':1, 'posture_samples':{'head_down_ratio':100},
          'pose_ensemble':{'version':VERSION, 'sample_ms':80, 'features':[]}}
    judged=evaluate(1, nonverbal=nv, duration_ms=8000)
    assert judged['measured'] == []
    assert calculate([judged])['total'] is None


def test_model_results_feed_existing_score_once_per_turn():
    features=json.loads((ROOT/'golden.json').read_text())['features'][0]
    nv={'pose_ensemble':{'version':VERSION,'sample_ms':80,'features':[features]*40}}
    judged=evaluate(1,nonverbal=nv,duration_ms=3200)
    assert judged['measured']==['posture']
    assert all(e['evidence']['source']==VERSION for e in judged['events'])
    score=calculate([judged])
    assert score['scores']['posture'] is not None
    assert calculate([judged,judged])['total']==score['total']
    assert len(judged['events']) <= 5


def test_bad_feature_shape_is_rejected_by_api_contract():
    import pytest
    from app.schemas.schemas import NonverbalIn
    for row in ([0]*26, [float('nan')]*27):
        with pytest.raises(ValueError):
            NonverbalIn(pose_ensemble={'version':VERSION,'sample_ms':80,'features':[row]})


def test_observation_api_runs_attached_model_without_storing_poll(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.seed.run import seed
    seed()
    client=TestClient(app)
    session=client.post('/api/sessions',json={'consent':{'agreed':True}}).json()
    feature=json.loads((ROOT/'golden.json').read_text())['features'][0]
    response=client.post(f'/api/sessions/{session["id"]}/turns/{session["current_turn"]["id"]}/observation',
        headers={'X-Session-Token':session['access_token']},
        json={'duration_ms':3200,'nonverbal':{'pose_ensemble':{'version':VERSION,'sample_ms':80,'features':[feature]*40}}})
    assert response.status_code==200, response.text
    assert response.json()['judgment']['measured']==['posture']
