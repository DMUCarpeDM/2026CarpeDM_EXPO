"""Pre-render fixed workplace questions with the running, real Iris server."""
import hashlib
import json
from pathlib import Path
import shutil
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'iris-runtime/iris/assets/prepared-speech'
PACK = ROOT / 'poc/backend/app/seed/packs/workplace-conversation.json'

def request(path, data=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request('http://127.0.0.1:18765' + path, data=body, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=1800) as response:
        return json.load(response)

if __name__ == '__main__':
    health = request('/health')
    if health.get('mock_mode') is not False:
        raise SystemExit('Real Iris runtime required')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    episodes = json.loads(PACK.read_text())['episodes']
    for index, episode in enumerate(episodes, 1):
        text = episode['initial_question'].strip()
        target = OUTPUT / (hashlib.sha256(text.encode()).hexdigest() + '.wav')
        if target.exists():
            print(f'{index}/{len(episodes)} cached', flush=True)
            continue
        start = time.monotonic()
        result = request('/v1/audio/speech', {'text': text, 'voice_prompt_hash': ''})
        source = Path(result['audio_path']).resolve()
        if not source.is_relative_to((Path.home()/'.iris-light/audio').resolve()):
            raise RuntimeError('Unexpected Iris audio path')
        temporary = target.with_suffix('.tmp')
        shutil.copyfile(source, temporary)
        temporary.replace(target)
        print(f'{index}/{len(episodes)} prepared in {time.monotonic()-start:.1f}s', flush=True)
