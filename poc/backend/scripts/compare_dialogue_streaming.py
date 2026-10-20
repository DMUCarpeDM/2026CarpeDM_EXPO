"""Compare first PCM readiness using synthetic answers; requires configured OpenAI and ElevenLabs keys.
Run from poc/backend: PYTHONPATH=. .venv/bin/python scripts/compare_dialogue_streaming.py
"""
import asyncio,json,re,time,statistics
from app.services.tts import SpeechSynthesisError
from app.services.dialogue.openai_provider import DialogueGenerationError
from pathlib import Path
from types import SimpleNamespace as NS
from app.services.workplace import EXHIBITION_SCENES
from app.services.dialogue.openai_provider import OpenAIDialogueProvider
from app.services.tts import stream_elevenlabs

async def run(streaming,scene):
    started=time.perf_counter(); clock=lambda:round((time.perf_counter()-started)*1000,1)
    timings={'mode':'streaming' if streaming else 'baseline','scenario':scene['title']}
    provider=OpenAIDialogueProvider(); loop=asyncio.get_running_loop(); parts=[]; audio_future=None
    async def first_audio(text):
        audio=stream_elevenlabs(text)
        try:
            chunk=await anext(audio)
            return clock(),len(chunk)
        finally: await audio.aclose()
    def delta(text):
        nonlocal audio_future
        timings.setdefault('firstTextMs',clock());parts.append(text)
        match=re.search(r'[.!?。！？](?:\s|$)', ''.join(parts))
        if audio_future is None and match:
            timings['firstSentenceMs']=clock()
            sentence=''.join(parts)[:match.end()].strip()
            audio_future=asyncio.run_coroutine_threadsafe(first_audio(sentence),loop)
    if streaming: provider.on_text_delta=delta
    item={**scene,'episode_id':scene['order'],'character_id':'park_senior','text':scene['opening_line']}
    answer='오늘은 참석하지 않을게요.' if scene['order']==15 else '저는 민지이고 개발 업무를 맡아요.'
    turns=[NS(character_id='park_senior',episode_id=scene['order'],question_text=scene['opening_line'],response_text=answer)]
    line=await asyncio.to_thread(provider._generate_continuous_line,NS(difficulty='basic',mode=5,rapport={}),NS(world_setting={}),{'id':'park_senior'},turns,{},item)
    timings['completeTextMs']=clock();timings['text']=line
    if audio_future is None:
        first, size=await first_audio(line)
    else: first,size=await asyncio.wrap_future(audio_future)
    timings['firstPcmMs']=first;timings['firstChunkBytes']=size
    print(json.dumps(timings,ensure_ascii=False),flush=True)
    return timings

async def main():
    results=[]
    for n in range(4):
        scene=EXHIBITION_SCENES[n%len(EXHIBITION_SCENES)]
        for mode in ([False,True] if n%2==0 else [True,False]):
            started=time.perf_counter()
            try:
                results.append(await run(mode,scene))
            except (SpeechSynthesisError, DialogueGenerationError) as error:
                row={'mode':'streaming' if mode else 'baseline','scenario':scene['title'],
                     'error':str(error),'elapsedMs':round((time.perf_counter()-started)*1000,1)}
                results.append(row)
                print(json.dumps(row,ensure_ascii=False),flush=True)
            Path('../../output/streaming-comparison-extended-20261015.json').write_text(json.dumps({'results':results},ensure_ascii=False,indent=2))
    summary={}
    for mode in ['baseline','streaming']:
        values=[row['firstPcmMs'] for row in results if row['mode']==mode and 'firstPcmMs' in row]
        summary[mode]=statistics.median(values) if values else None
    Path('../../output/streaming-comparison-extended-20261015.json').write_text(json.dumps({'results':results,'medianFirstPcmMs':summary},ensure_ascii=False,indent=2))
    print(json.dumps({'medianFirstPcmMs':summary},ensure_ascii=False),flush=True)
asyncio.run(main())
