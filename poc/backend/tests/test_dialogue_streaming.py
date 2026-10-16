from contextlib import contextmanager

import httpx
import pytest
from pydantic import SecretStr

from app.core.config import settings
from app.services.dialogue.openai_provider import DialogueGenerationError, OpenAIDialogueProvider
from app.services.dialogue.openai_stream import stream_actor_text
from test_actor_passthrough import fixture


@pytest.fixture
def transport(monkeypatch):
    monkeypatch.setattr(settings, 'openai_api_key', SecretStr('test'))
    calls, closed = [], []
    def install(events):
        @contextmanager
        def stream(method, url, **kwargs):
            calls.append(kwargs['json'])
            response = httpx.Response(200, request=httpx.Request(method, url), content=events.encode('utf-8'))
            try:
                yield response
            finally:
                response.close()
                closed.append(True)
        monkeypatch.setattr(httpx, 'stream', stream)
    return install, calls, closed


def test_stream_yields_text_incrementally_and_ignores_role_and_usage_events(transport):
    install, calls, closed = transport
    install('data: {"choices":[{"delta":{"role":"assistant","content":""}}]}\n\n'
            'data: {"choices":[{"delta":{"content":"첫 문장. "}}]}\n\n'
            'data: {"choices":[],"usage":{"completion_tokens":5}}\n\n'
            'data: {"choices":[{"delta":{"content":"다음 문장."}}]}\n\n'
            'data: [DONE]\n\n')
    iterator = stream_actor_text('system', 'prompt', max_tokens=512, temperature=.65)
    assert next(iterator) == '첫 문장. '
    assert closed == []
    assert list(iterator) == ['다음 문장.']
    assert calls[0]['stream'] is True
    assert calls[0]['model'] == settings.openai_model
    assert closed == [True]


@pytest.mark.parametrize('events', [
    'data: {"choices":[{"delta":{"content":"부분 문장"}}]}\n\n',
    'data: {"error":{"message":"failure"}}\n\n',
    'data: broken-json\n\n',
])
def test_incomplete_or_failed_stream_is_not_returned_as_a_successful_answer(transport, events):
    install, _, closed = transport
    install(events)
    with pytest.raises(DialogueGenerationError):
        list(stream_actor_text('system', 'prompt', max_tokens=512, temperature=.65))
    assert closed == [True]


def test_provider_opt_in_preserves_text_and_calls_back_before_completion(monkeypatch):
    from app.services.dialogue import openai_stream
    monkeypatch.setattr(settings, 'openai_api_key', SecretStr('test'))
    seen = []
    def chunks(*args, **kwargs):
        yield '  AI: "첫 문장.\n'
        assert seen == ['  AI: "첫 문장.\n']
        yield '둘째 문장."  '
    monkeypatch.setattr(openai_stream, 'stream_actor_text', chunks)
    provider = OpenAIDialogueProvider()
    provider.on_text_delta = seen.append
    session, scenario, character, turns, scene = fixture()
    output = provider._generate_continuous_line(session, scenario, character, turns, {}, scene)
    assert output == '  AI: "첫 문장.\n둘째 문장."  '
    assert ''.join(seen) == output


def test_cancelled_consumer_closes_the_transport(transport):
    install, _, closed = transport
    install('data: {"choices":[{"delta":{"content":"첫 문장"}}]}\n\ndata: [DONE]\n\n')
    iterator = stream_actor_text('system', 'prompt', max_tokens=512, temperature=.65)
    assert next(iterator) == '첫 문장'
    iterator.close()
    assert closed == [True]
