"""Prepare actual Anna Kim/v4 Turbo recordings through the running local TTS API."""
import asyncio
import json
from pathlib import Path
import sys
import wave
import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'poc/backend'))
from app.core.config import settings

async def main():
    if settings.elevenlabs_voice_id != 'uyVNoMrnUku1dZyVEXwD' or settings.elevenlabs_model != 'eleven_v4_turbo':
        raise RuntimeError('Set the backend to Anna Kim / eleven_v4_turbo before preparing recordings')
    scenes = json.loads((ROOT / 'poc/backend/app/seed/workplace-exhibition.json').read_text(encoding='utf-8'))
    destination = ROOT / 'mvp/public/audio/workplace-openings/anna-kim-v4-turbo'
    destination.mkdir(parents=True, exist_ok=True)
    semaphore = asyncio.Semaphore(2)
    async with httpx.AsyncClient(timeout=90) as client:
        async def prepare(episode):
            text = episode['opening_line'].strip()
            name = f"exhibition-{episode['order']}.wav"
            output = destination / name
            async with semaphore:
                response = await client.post('http://127.0.0.1:8001/api/tts', json={'text': text, 'voice': 'female'})
                response.raise_for_status()
                if (response.headers.get('x-tts-provider') != 'elevenlabs'
                        or not response.headers.get('content-type', '').startswith('audio/pcm')
                        or len(response.content) < 9600 or not any(response.content)):
                    raise RuntimeError(f'Invalid ElevenLabs audio for {name}')
                with wave.open(str(output), 'wb') as audio:
                    audio.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
                    audio.writeframes(response.content)
                print(f"Prepared {name}: {len(response.content)} bytes", flush=True)
            return {'text': text, 'url': f'/audio/workplace-openings/anna-kim-v4-turbo/{name}',
                    'provider': 'elevenlabs', 'voice_id': 'uyVNoMrnUku1dZyVEXwD', 'model_id': 'eleven_v4_turbo'}
        rows = await asyncio.gather(*(prepare(episode) for episode in scenes))
    manifest = ROOT / 'mvp/src/lib/preparedWorkplaceSpeech.json'
    manifest.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Prepared {len(rows)} openings', flush=True)

if __name__ == '__main__':
    asyncio.run(main())
