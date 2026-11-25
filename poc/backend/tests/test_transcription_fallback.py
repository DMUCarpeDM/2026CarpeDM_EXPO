from pathlib import Path
from types import SimpleNamespace
from fastapi.testclient import TestClient
from app.main import app
from test_voice_api_v2 import start, wav


def test_local_transcription_requires_session_and_cleans_audio(monkeypatch, ready_ollama):
    client=TestClient(app); data, headers=start(client); paths=[]
    def transcribe(path):
        paths.append(path)
        assert Path(path).exists()
        return [{'word':'확인했습니다.'}]
    monkeypatch.setattr('app.ai.stt.get_stt_provider',lambda:SimpleNamespace(name='whisper',transcribe_live=transcribe))
    url=f"/api/sessions/{data['id']}/transcribe"
    assert client.post(url,files={'file':('test.wav',wav())}).status_code in (401,403)
    result=client.post(url,headers=headers,files={'file':('test.wav',wav())})
    assert result.status_code==200
    assert result.json()=={'text':'확인했습니다.','source':'whisper'}
    assert all(not Path(p).exists() for p in paths)
    assert client.post(url,headers=headers,files={'file':('test.wav',b'')}).status_code==422


def test_local_transcription_failure_cleans_audio(monkeypatch,ready_ollama):
    client=TestClient(app);data,headers=start(client);paths=[]
    def fail(path):
        paths.append(path)
        raise ValueError('decode failed')
    monkeypatch.setattr('app.ai.stt.get_stt_provider',lambda:SimpleNamespace(name='whisper',transcribe_live=fail))
    result=client.post(f"/api/sessions/{data['id']}/transcribe",headers=headers,files={'file':('test.wav',wav())})
    assert result.status_code==503
    assert all(not Path(p).exists() for p in paths)
