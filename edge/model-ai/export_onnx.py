"""Ubah model K-Means hasil pelatihan (web/backend/monitor/ml_models) ke ONNX untuk model-ai di Pi.

Jalankan dari folder Kelompok1PM (butuh Docker):
  docker run --rm -v "$PWD:/repo" -w /repo python:3.13-slim sh -c "pip install -q \
    scikit-learn==1.6.1 joblib==1.5.2 skl2onnx==1.20.0 onnx==1.23.2 onnxruntime==1.32.0 \
    && python edge/model-ai/export_onnx.py"

Hasil: edge/model-ai/kmeans.onnx. Isinya StandardScaler + KMeans dengan masukan ln(Rs/R0)
untuk FEATURES. Urutan fitur, peta cluster ke level, dan versi model disimpan di metadata ONNX.
"""
import hashlib
import json
from pathlib import Path

import joblib
import numpy as np
import onnxruntime as ort
from skl2onnx import to_onnx
from skl2onnx.common.data_types import DoubleTensorType
from sklearn.pipeline import Pipeline

ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / 'web/backend/monitor/ml_models'
OUTPUT = Path(__file__).resolve().parent / 'kmeans.onnx'
FEATURES = ['mq135', 'mq3', 'mq4', 'mq8']
FEATURE_NAMES = ['lr_MQ135', 'lr_MQ3', 'lr_MQ4', 'lr_MQ8']  # nama kolom di notebook pelatihan
LEVELS = {'Normal': 0, 'Sedang': 1, 'Tinggi': 2}  # nilai kolom level

scaler = joblib.load(MODEL_DIR / 'scaler.joblib')
km = joblib.load(MODEL_DIR / 'kmeans_model.joblib')
label_map = joblib.load(MODEL_DIR / 'label_map.joblib')
assert list(scaler.feature_names_in_) == FEATURE_NAMES, scaler.feature_names_in_
cluster_to_level = [LEVELS[label_map[c]] for c in range(km.n_clusters)]
# versi sama dengan monitor/ai.py di Django, supaya hasil Pi dan backend bisa dibandingkan
version = 'kmeans-' + hashlib.sha256((MODEL_DIR / 'kmeans_model.joblib').read_bytes()).hexdigest()[:8]

pipeline = Pipeline([('scaler', scaler), ('kmeans', km)])
# double, bukan float32, supaya titik di dekat batas cluster tidak berpindah cluster
onx = to_onnx(pipeline, initial_types=[('ln_rsr0', DoubleTensorType([None, len(FEATURES)]))])
for key, value in {'features': json.dumps(FEATURES), 'cluster_to_level': json.dumps(cluster_to_level),
                   'version': version}.items():
    onx.metadata_props.add(key=key, value=value)
OUTPUT.write_bytes(onx.SerializeToString())

# cek: ONNX harus memilih cluster yang sama dengan scikit-learn
rng = np.random.default_rng(0)
x = scaler.mean_ + scaler.scale_ * rng.normal(0, 2, (200_000, len(FEATURES)))
x = np.vstack([x, scaler.inverse_transform(km.cluster_centers_)])
expected = km.predict(scaler.transform(x))
session = ort.InferenceSession(str(OUTPUT), providers=['CPUExecutionProvider'])
got = session.run(None, {'ln_rsr0': x})[0]
mismatch = int((got != expected).sum())
print(f'{OUTPUT.name}: {OUTPUT.stat().st_size} byte, versi {version}, cluster ke level {cluster_to_level}')
print(f'cek {len(x)} titik: {len(x) - mismatch} sama, {mismatch} beda')
assert mismatch == 0
