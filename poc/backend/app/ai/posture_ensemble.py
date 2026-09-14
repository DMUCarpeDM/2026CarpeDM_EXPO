"""Carpediem RF + LightGBM inference. Classification only; scoring stays separate."""
from functools import lru_cache
import json
import logging
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent / 'assets' / 'posture_ensemble_v1'
VERSION = 'posture-ensemble-v1'

@lru_cache(maxsize=1)
def load():
    import onnxruntime as ort
    metadata = json.loads((ROOT / 'metadata.json').read_text())
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    sessions = {label: [ort.InferenceSession(str(ROOT / f'{label}_{kind}.onnx'), options,
        providers=['CPUExecutionProvider']) for kind in ('rf','lgb')] for label in metadata['labels']}
    return metadata, sessions


def probabilities(features):
    data = np.asarray(features, dtype=np.float32)
    if data.ndim != 2 or data.shape[1] != 27 or not np.isfinite(data).all():
        raise ValueError('Expected finite 27-feature rows')
    metadata, sessions = load()
    return {label: sum(s.run(None, {'features': data})[1][:,1] for s in models) / 2
            for label, models in sessions.items()}


def analyze(payload, duration_ms):
    if payload.get('version') != VERSION:
        return {'status':'unavailable', 'version':VERSION}
    rows = payload.get('features') or []
    sample_ms = payload.get('sample_ms', 0)
    if len(rows) < 15 or not 40 <= sample_ms <= 1000 or min(len(rows)*sample_ms, duration_ms) < 3000:
        return {'status':'insufficient', 'version':VERSION}
    try:
        probs = probabilities(rows)
        metadata, _ = load()
    except Exception:
        logging.getLogger(__name__).exception('Posture ensemble unavailable')
        return {'status':'unavailable', 'version':VERSION}
    return {'status':'measured', 'version':VERSION, 'samples':len(rows),
        'valid_ms':min(len(rows)*sample_ms, duration_ms),
        'labels': {label: {'ratio':float(np.mean(values >= metadata['thresholds'][label])),
                          'mean_probability':float(np.mean(values)),
                          'threshold':metadata['thresholds'][label]} for label, values in probs.items()}}
