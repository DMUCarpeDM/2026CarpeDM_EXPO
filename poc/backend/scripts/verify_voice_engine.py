"""Recorded-audio smoke/comparison run, not a ground-truth accuracy benchmark.

python -m scripts.verify_voice_engine /path/to/manifest.json --limit 3 --output /tmp/voice.json
"""
import argparse
from dataclasses import asdict
import json
from pathlib import Path
import time

from app.ai import voice_fit, voice_measurement as engine
from app.ai.stt import get_stt_provider


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--limit", type=int, default=3)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    entries = json.loads(args.manifest.read_text())[:args.limit]
    provider = get_stt_provider()
    rows = []
    for item in entries:
        audio = args.manifest.parent / item["audio_file"]
        samples, sr, _ = engine.load_audio(audio)
        segments = engine.speech_segments(samples, sr)
        capture = {"capture_id": "offline-same-recording", "device_id": "offline-file", "auto_gain_control": False}
        baseline = {"id": "self-reference-test", "status": "measured", "capture": capture,
                    "reference_rms": engine._rms(samples, sr, segments), "config": asdict(engine.DEFAULT)}
        words = provider.transcribe_words(str(audio)) if provider else None
        started = time.monotonic()
        new = engine.analyze(audio, session_id=0, turn_id=item["id"], words=words, calibration=baseline, capture=capture)
        old = voice_fit.analyze_audio(str(audio), item["text"])
        rows.append({"id": item["id"], "duration_sec": item["duration_sec"],
                     "measurement_elapsed_sec": round(time.monotonic() - started, 3),
                     "statuses": {field: new[field]["status"] for field in engine.FIELDS},
                     "reasons": {field: new[field]["reason"] for field in engine.FIELDS},
                     "reference_db": new["volume"]["relative_db"],
                     "speed_sps": new["speed"]["syllables_per_second"],
                     "speech_seconds": new["speed"]["speech_seconds"],
                     "pause_count": new["pauses"]["count"],
                     "old_speed_sps": old.get("speech_rate_sps"),
                     "old_pause_count": old.get("long_pause_count"),
                     "pitch_hz": new["pitch"]["median_hz"],
                     "praat_segment_count": len(new["voice_irregularity"]["segments"])})
    result = {"engine": engine.VERSION, "criteria": engine.CRITERIA_VERSION,
              "limitations": ["Self-reference checks zero dB only, not microphone calibration quality.",
                               "VAD boundaries and transcript have not been manually approved; no accuracy claim.",
                               "Old pause count uses 1.2-second policy; new count records all detected internal gaps."], "samples": rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
