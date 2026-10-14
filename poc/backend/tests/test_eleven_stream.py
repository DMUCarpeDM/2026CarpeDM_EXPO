import asyncio
import base64
import json
from pydantic import SecretStr
from app.core.config import settings
from app.services.tts import stream_elevenlabs, SpeechSynthesisError


def test_dialogue_protocol_streams_before_final_and_closes(monkeypatch):
    import websockets.asyncio.client as client
    sent=[]
    closed=[]
    class Socket:
        async def send(self, value): sent.append(json.loads(value))
        async def recv(self):
            return json.dumps(messages.pop(0))
    class Connection:
        async def __aenter__(self): return Socket()
        async def __aexit__(self,*_): closed.append(True)
    messages=[{'audio':base64.b64encode(b'\x01\x00').decode()}, {'audio':base64.b64encode(b'\x02\x00').decode()}, {'is_final':True}]
    def connect(url, **kwargs):
        assert 'model_id=eleven_v4_turbo' in url and 'output_format=pcm_24000' in url
        assert kwargs['additional_headers']['xi-api-key']=='test-key'
        return Connection()
    monkeypatch.setattr(client,'connect',connect)
    monkeypatch.setattr(settings,'elevenlabs_api_key',SecretStr('test-key'))
    monkeypatch.setattr(settings,'elevenlabs_voice_id','voice-id')
    monkeypatch.setattr(settings,'elevenlabs_model','eleven_v4_turbo')
    async def run():
        stream=stream_elevenlabs('안녕하세요')
        assert await anext(stream)==b'\x01\x00'
        assert len(messages)==2
        assert sent[0]=={'voices':['voice-id']}
        assert sent[-1]=={'close_socket':True}
        await stream.aclose()
    asyncio.run(run())
    assert closed


def test_missing_key_fails_before_connect(monkeypatch):
    monkeypatch.setattr(settings,'elevenlabs_api_key',SecretStr(''))
    async def run():
        import pytest
        with pytest.raises(SpeechSynthesisError):
            await anext(stream_elevenlabs('안녕하세요'))
    asyncio.run(run())
