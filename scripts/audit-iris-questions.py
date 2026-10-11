"""Check fixed Iris questions with local Whisper; retry only suspect clips.

Run with poc/backend/.venv/bin/python scripts/audit-iris-questions.py --repair.
ASR is a screening aid, not a substitute for listening to the final recordings.
"""
import argparse
import array
from difflib import SequenceMatcher
import hashlib
import json
from pathlib import Path
import re
import shutil
import urllib.request
import wave

from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parents[1]


def normalize(text):
    return re.sub(r'[^가-힣a-z0-9]', '', text.lower())


def inspect(model, path, text):
    segments, _ = model.transcribe(str(path), language='ko', beam_size=5,
                                   condition_on_previous_text=False, vad_filter=False)
    transcript = ''.join(segment.text for segment in segments).strip()
    expected, actual = normalize(text), normalize(transcript)
    similarity = SequenceMatcher(None, expected, actual).ratio()
    tail_similarity = SequenceMatcher(None, expected[-12:], actual[-12:]).ratio()
    with wave.open(str(path)) as audio:
        pcm = array.array('h', audio.readframes(audio.getnframes()))
        peak = max(map(abs, pcm), default=0)
        tail_peak = max(map(abs, pcm[-int(audio.getframerate() * .02):]), default=0)
    # High energy at the file boundary may mean the final syllable was cut.
    suspect = similarity < .85 or tail_similarity < .85 or peak == 0 or tail_peak > max(1000, peak * .12)
    return dict(transcript=transcript, similarity=round(similarity, 3),
                tail_similarity=round(tail_similarity, 3), tail_peak=tail_peak, suspect=suspect)


def regenerate(text, path):
    body = json.dumps(dict(text=text, force_regenerate=True)).encode()
    request = urllib.request.Request('http://127.0.0.1:18765/v1/audio/speech', data=body,
                                     headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=1800) as response:
        source = Path(json.load(response)['audio_path']).resolve()
    if not source.is_relative_to((Path.home() / '.iris-light/audio').resolve()):
        raise RuntimeError('Unexpected Iris audio path')
    shutil.copyfile(source, path)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--repair', action='store_true')
    args = parser.parse_args()
    model = WhisperModel(str(ROOT / 'poc/backend/whisper-models/small'),
                         device='cpu', compute_type='int8', cpu_threads=4)
    episodes = json.loads((ROOT / 'poc/backend/app/seed/packs/workplace-conversation.json').read_text())['episodes']
    report = []
    for index, episode in enumerate(episodes, 1):
        text = episode['initial_question'].strip()
        path = ROOT / 'iris-runtime/iris/assets/prepared-speech' / (hashlib.sha256(text.encode()).hexdigest() + '.wav')
        result = inspect(model, path, text)
        attempts = 0
        while args.repair and result['suspect'] and attempts < 3:
            candidate = path.with_suffix('.candidate.wav')
            regenerate(text, candidate)
            attempts += 1
            checked = inspect(model, candidate, text)
            if not checked['suspect']:
                candidate.replace(path)
                result = checked
            else:
                candidate.unlink()
        report.append(dict(index=index, text=text, attempts=attempts, **result))
        print(json.dumps(report[-1], ensure_ascii=False), flush=True)
    output = ROOT / '.omo/evidence/iris-question-audit.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    if any(row['suspect'] for row in report):
        raise SystemExit('Some recordings still require listening/review; see ' + str(output))
