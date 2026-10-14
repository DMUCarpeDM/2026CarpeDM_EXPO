import asyncio
import io
from types import SimpleNamespace
import wave
import numpy as np
from app.ai.stt.base import WhisperProvider
from app.services import iris_tts


def test_regions_preserve_timestamps_and_exclude_other_audio(monkeypatch):
    import faster_whisper.audio
    monkeypatch.setattr(faster_whisper.audio, 'decode_audio', lambda *a, **k: np.ones(160000, dtype=np.float32))
    provider = WhisperProvider.__new__(WhisperProvider)
    sizes = []
    def decode(samples):
        sizes.append(len(samples))
        return [{'word': '확인', 'start': .1, 'end': .5, 'conf': .9}]
    monkeypatch.setattr(provider, '_transcribe_audio', decode)
    words = provider.transcribe_regions('test.wav', [(3, 4), (7, 9)])
    assert sizes == [16000, 32000]
    assert [w['start'] for w in words] == [3.1, 7.1]
    assert [w['end'] for w in words] == [3.5, 7.5]


def test_iris_stream_yields_first_sentence_before_synthesizing_second(monkeypatch):
    output = io.BytesIO()
    with wave.open(output, 'wb') as audio:
        audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(24000)
        audio.writeframes(b'\x01\x00' * 100)
    calls = []
    def synthesize(text):
        calls.append(text)
        return output.getvalue()
    monkeypatch.setattr(iris_tts, 'synthesize_iris', synthesize)
    async def check():
        stream = iris_tts.stream_iris('알겠어요. 다시 말해 주세요.')
        assert await anext(stream) == b'\x01\x00' * 100
        assert calls == ['알겠어요.']
        assert await anext(stream) == b'\x01\x00' * 100
        assert calls == ['알겠어요.', '다시 말해 주세요.']
    asyncio.run(check())
