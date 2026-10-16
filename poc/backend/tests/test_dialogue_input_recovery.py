"""빈 입력·인식 불량과 모델 실패를 상대역의 반복 대사로 바꾸지 않는다."""
import json

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.database import SessionLocal
from app.main import app
from app.models import RoleplaySession, Turn
from app.seed.run import seed
from app.services import context_scoring, deferred_workplace, judgments, response_judgment
from app.services.dialogue.gemini_provider import GeminiDialogueProvider


@pytest.fixture
def session():
    seed()
    client = TestClient(app)
    response = client.post('/api/sessions', json={'service_mode':'workplace', 'scenario_slug':'workplace-conversation',
                                                'exhibition':True, 'consent':{'agreed':True}})
    assert response.status_code == 200, response.text
    data = response.json()
    return client, data, {'X-Session-Token':data['access_token']}


@pytest.mark.parametrize('body', [{}, {'text':None}, {'text':''}, {'text':'  '}, {'text':'null'},
                                 {'text':'NULL'}, {'text':'undefined'}, {'text':'어 음 음'},
                                 {'text':'ㄱㄴㄷ'}, {'text':'그 저 어 지직 자료 음 음 끊 끊'}])
def test_unrecognized_input_does_not_call_ai_score_or_advance(session, monkeypatch, body):
    client, data, headers = session
    monkeypatch.setattr(response_judgment, 'analyze', lambda *a: pytest.fail('invalid input reached analysis'))
    monkeypatch.setattr('app.api.sessions.get_dialogue_provider', lambda: pytest.fail('invalid input reached dialogue'))
    turn_id = data['current_turn']['id']
    result = client.post(f"/api/sessions/{data['id']}/turns/{turn_id}/response", headers=headers, json=body)
    assert result.status_code == 422, result.text
    with SessionLocal() as db:
        turn = db.get(Turn, turn_id)
        stored = db.get(RoleplaySession, data['id'])
        assert turn.answered_at is None and not turn.response_text
        assert stored.rapport['interaction']['index'] == 0
        assert judgments.results(stored) == []


@pytest.mark.parametrize('status,text', [('completed','그런데 공룡이 춤을 추면 재미있겠어요.'),
                                       ('unavailable','자료부터 확인하고 모르는 부분은 정리하겠습니다.')])
def test_off_topic_or_unavailable_score_does_not_force_repeat_request(session, monkeypatch, status, text):
    client, data, headers = session
    monkeypatch.setattr(settings, 'dialogue_provider', 'gemini')
    def analyze(turn, *args):
        events = ([judgments.event(turn.id, 'response', 'off_topic', 'negative',
                                  {'quote':text}, '무관한 발언')] if status == 'completed' else [])
        return events, [], status
    monkeypatch.setattr(response_judgment, 'analyze', analyze)
    monkeypatch.setattr(context_scoring, 'classify', lambda *a: {'kind':'neutral','status':'unavailable'})
    line = ('엉뚱한 얘기는 그만해요. 맡긴 일부터 얘기하죠.' if status == 'completed'
            else '그렇게 확인해요. 모르는 부분은 같이 짚죠.')
    monkeypatch.setattr(GeminiDialogueProvider, '_complete', lambda *a, **kw:
                        json.dumps({'supported':True, 'quotes':[]}) if kw.get('json_mode') else line)
    result = client.post(f"/api/sessions/{data['id']}/turns/{data['current_turn']['id']}/response",
                         headers=headers, json={'text':text, 'stt_source':'text'})
    assert result.status_code == 200, result.text
    assert result.json()['next_turn']['question_text'] == line
    assert result.json()['interaction']['index'] == 1
    assert result.json()['turn_signals']['judgment']['analysis_status'] == 'pending'
    with SessionLocal() as db:
        stored = db.get(RoleplaySession, data['id'])
        deferred_workplace.complete(db, stored, db.get(Turn, data['current_turn']['id']))
        rules = [e['rule'] for row in judgments.results(stored) for e in row['events']]
    assert ('off_topic' in rules) is (status == 'completed')
