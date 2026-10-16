from types import SimpleNamespace as NS
import numpy as np
from app.ai.stt.base import WhisperProvider


def test_live_dictation_has_no_prompt_and_excludes_unreliable_segments(monkeypatch):
    import faster_whisper.audio
    monkeypatch.setattr(faster_whisper.audio,'decode_audio',lambda *a,**k:np.ones(16000,dtype=np.float32)*.1)
    captured={}
    good=NS(no_speech_prob=.1,avg_logprob=-.2,compression_ratio=1,words=[NS(word=' 안녕하세요 ',start=0,end=1,probability=.9)])
    bad=NS(no_speech_prob=.9,avg_logprob=-.2,compression_ratio=3,words=[NS(word='환각',start=0,end=1)])
    def transcribe(audio,**kwargs):
        captured.update(kwargs)
        return iter([good,bad]),None
    provider=WhisperProvider.__new__(WhisperProvider);provider._model=NS(transcribe=transcribe)
    result=provider.transcribe_live('fixture')
    assert captured['initial_prompt'] is None
    assert captured['vad_filter'] is True
    assert captured['condition_on_previous_text'] is False
    assert [w['word'] for w in result]==['안녕하세요']
