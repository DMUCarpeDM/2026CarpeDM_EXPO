"""Vertex authentication is shared by roleplay and grounded goal assessment."""
from types import SimpleNamespace
import json
from pydantic import SecretStr
from app.core.config import settings
from app.services import response_judgment
from app.services.dialogue import gemini_provider as provider


def test_vertex_uses_project_url_and_bearer_credentials(monkeypatch):
    monkeypatch.setattr(settings, 'gemini_api_backend', 'vertex')
    monkeypatch.setattr(settings, 'gemini_vertex_project', 'test-project')
    monkeypatch.setattr(settings, 'gemini_api_key', SecretStr(''))
    monkeypatch.setattr(provider, '_vertex_credentials', lambda: SimpleNamespace(valid=True, token='test-only-token'))
    assert provider._gemini_url('test-model') == 'https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/publishers/google/models/test-model:generateContent'
    assert provider._gemini_headers() == {'Authorization': 'Bearer test-only-token'}


def test_vertex_goal_assessment_does_not_require_developer_api_key(monkeypatch):
    monkeypatch.setattr(settings, 'gemini_api_backend', 'vertex')
    monkeypatch.setattr(settings, 'gemini_vertex_project', 'test-project')
    monkeypatch.setattr(settings, 'gemini_api_key', SecretStr(''))
    monkeypatch.setattr(provider, '_gemini_headers', lambda: {'Authorization': 'Bearer test-only-token'})
    answer = '오늘 오후에 자료를 확인하고 공유하겠습니다.'
    turn = SimpleNamespace(id=1, order=1, question_text='언제 확인할 수 있나요?', response_text=answer)
    evidence = {'relevant_quote': answer, 'met_goals': [{'goal_id': 'time', 'quote': '오늘 오후'}], 'missing_goal_ids': [], 'conflicts': []}
    seen = []
    def post(url, **kwargs):
        seen.append((url, kwargs['headers']))
        return SimpleNamespace(raise_for_status=lambda: None, json=lambda: {'candidates': [{'content': {'parts': [{'text': json.dumps(evidence)}]}}]})
    monkeypatch.setattr(response_judgment.httpx, 'post', post)
    events, met, status = response_judgment.analyze(turn, [], [{'id': 'time', 'label': '확인 시점'}], ['time'])
    assert status == 'completed' and met == ['time']
    assert any(e['rule'] == 'goal_met' for e in events)
    assert seen[0][1] == {'Authorization': 'Bearer test-only-token'}


def test_vertex_auth_failure_is_unmeasured(monkeypatch):
    monkeypatch.setattr(settings, 'gemini_api_backend', 'vertex')
    monkeypatch.setattr(settings, 'gemini_api_key', SecretStr(''))
    def unavailable():
        raise provider.DialogueGenerationError('Authentication unavailable')
    monkeypatch.setattr(provider, '_gemini_headers', unavailable)
    turn = SimpleNamespace(id=1, order=1, question_text='질문', response_text='답변')
    assert response_judgment.analyze(turn, [], [], []) == ([], [], 'unavailable')
