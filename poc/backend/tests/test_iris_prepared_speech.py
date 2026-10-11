from app.services import iris_tts


def test_prepared_question_skips_runtime(tmp_path, monkeypatch):
    monkeypatch.setattr(iris_tts, 'PREPARED_SPEECH_DIR', tmp_path)
    iris_tts.prepared_speech_path('고정 질문').write_bytes(b'RIFFprepared')
    def unexpected(*args, **kwargs):
        raise AssertionError('Prepared question must not invoke synthesis')
    monkeypatch.setattr(iris_tts.httpx, 'post', unexpected)
    assert iris_tts.synthesize_iris(' 고정 질문 ') == b'RIFFprepared'


def test_prepared_questions_available_without_runtime(tmp_path, monkeypatch):
    monkeypatch.setattr(iris_tts, 'PREPARED_SPEECH_DIR', tmp_path)
    iris_tts.prepared_speech_path('질문').write_bytes(b'RIFFprepared')
    assert iris_tts.iris_female_ready() is True
