"""Export the trusted Carpediem joblib bundle using sklearn 1.6.1 + LightGBM 4.6.0."""
import argparse, hashlib, json
from pathlib import Path
import joblib
import numpy as np
import onnxruntime as ort
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
from onnxmltools import convert_lightgbm
from onnxmltools.convert.common.data_types import FloatTensorType as LgbFloat

p = argparse.ArgumentParser()
p.add_argument('source', type=Path)
p.add_argument('output', type=Path)
a = p.parse_args()
m = joblib.load(a.source)
a.output.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(42)
x = rng.normal(0, 2, (1024, 27)).astype(np.float32)
x[0] = m['imputer'].statistics_
x = m['imputer'].transform(x).astype(np.float32)
metadata = {'version': 'posture-ensemble-v1', 'source_sha256': hashlib.sha256(a.source.read_bytes()).hexdigest(),
 'indices': [0,11,12,13,14,15,16,23,24], 'labels': m['label_keys'], 'thresholds': {}, 'max_error': {}}
expected = {}
for label in m['label_keys']:
    parts = []
    for kind in ('rf', 'lgb'):
        model = m[kind+'_models'][label]
        assert list(model.classes_) == [0, 1] and model.n_features_in_ == 27
        if kind == 'rf':
            converted = convert_sklearn(model, initial_types=[('features', FloatTensorType([None,27]))], options={id(model): {'zipmap': False}}, target_opset=15)
        else:
            converted = convert_lightgbm(model, initial_types=[('features', LgbFloat([None,27]))], zipmap=False, target_opset=15)
        data = converted.SerializeToString()
        (a.output/f'{label}_{kind}.onnx').write_bytes(data)
        options=ort.SessionOptions(); options.intra_op_num_threads=1
        session=ort.InferenceSession(data, options, providers=['CPUExecutionProvider'])
        actual=session.run(None, {'features':x})[1][:,1]
        reference=model.predict_proba(x)[:,1]
        error=float(np.max(np.abs(actual-reference)))
        assert error < 1e-5, (label, kind, error)
        metadata['max_error'][label+'_'+kind]=error
        parts.append(reference)
    threshold=.45 if label in ('head_down','torso_forward_lean') else .5
    metadata['thresholds'][label]=threshold
    expected[label]=((parts[0]+parts[1])/2).tolist()
(a.output/'metadata.json').write_text(json.dumps(metadata,indent=2))
(a.output/'golden.json').write_text(json.dumps({'features': x[:16].tolist(), 'probabilities':{k:v[:16] for k,v in expected.items()}}))
print(json.dumps(metadata,indent=2))
