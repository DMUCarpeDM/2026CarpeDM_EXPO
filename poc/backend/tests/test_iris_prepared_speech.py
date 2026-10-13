import io
import wave
from app.services import iris_tts

def sample_wav():
    output = io.BytesIO()
    with wave.open(output, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000)
        w.writeframes(b"\x01\x02" * 2400)
    return output.getvalue()


def test_prepared_question_skips_runtime(tmp_path, monkeypatch):
    monkeypatch.setattr(iris_tts, 'PREPARED_SPEECH_DIR', tmp_path)
    iris_tts.prepared_speech_path('고정 질문').write_bytes(sample_wav())
    def unexpected(*args, **kwargs):
        raise AssertionError('Prepared question must not invoke synthesis')
    monkeypatch.setattr(iris_tts.httpx, 'post', unexpected)
    assert iris_tts.synthesize_iris(' 고정 질문 ') == iris_tts.with_playback_tail(sample_wav())


def test_prepared_questions_available_without_runtime(tmp_path, monkeypatch):
    monkeypatch.setattr(iris_tts, 'PREPARED_SPEECH_DIR', tmp_path)
    iris_tts.prepared_speech_path('질문').write_bytes(sample_wav())
    assert iris_tts.iris_female_ready() is True


def test_tail_keeps_every_original_sample_and_adds_silence():
    data=iris_tts.with_playback_tail(sample_wav())
    with wave.open(io.BytesIO(data)) as w:
        assert w.getnframes() == 2400 + 14400
        assert w.readframes(2400) == b"\x01\x02" * 2400
        assert w.readframes(14400) == b"\x00\x00" * 14400
