"""Penentuan tingkat bau dengan K-Means dari tim AI (issue #26).

File di ml_models/ berasal dari branch ragil (AI/model_kmeans.zip, notebook 02_modeling).
Fitur model: ln(nilai sensor / nilai acuan) untuk MQ135, MQ3, MQ4, MQ8, lalu StandardScaler.
Pada data node, nilai acuan adalah R0, jadi fitur = ln(Rs/R0).
"""
import hashlib
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np

MODEL_DIR = Path(__file__).resolve().parent / 'ml_models'
FEATURES = ['mq135', 'mq3', 'mq4', 'mq8']
FEATURE_NAMES = ['lr_MQ135', 'lr_MQ3', 'lr_MQ4', 'lr_MQ8']  # nama kolom di notebook AI
LEVELS = {'Normal': 0, 'Sedang': 1, 'Tinggi': 2}  # nilai Reading.Level


@lru_cache(maxsize=1)
def load_model():
    """Baca scaler, model, dan label map sekali, lalu ambil parameternya."""
    scaler = joblib.load(MODEL_DIR / 'scaler.joblib')
    km = joblib.load(MODEL_DIR / 'kmeans_model.joblib')
    label_map = joblib.load(MODEL_DIR / 'label_map.joblib')
    if list(scaler.feature_names_in_) != FEATURE_NAMES:
        raise ValueError(f'Fitur scaler {list(scaler.feature_names_in_)} berbeda dengan {FEATURE_NAMES}')
    cluster_to_level = np.array([LEVELS[label_map[c]] for c in range(km.n_clusters)])
    version = 'kmeans-' + hashlib.sha256((MODEL_DIR / 'kmeans_model.joblib').read_bytes()).hexdigest()[:8]
    return scaler.mean_, scaler.scale_, km.cluster_centers_, cluster_to_level, version


def predict_level(rsr0):
    """rsr0: dict Rs/R0 per sensor (lebih dari 0). Kembalikan (level 0/1/2, versi model)."""
    mean, scale, centroids, cluster_to_level, version = load_model()
    z = (np.log([rsr0[s] for s in FEATURES]) - mean) / scale  # standarisasi sama seperti saat pelatihan
    cluster = int(np.argmin(((centroids - z) ** 2).sum(axis=1)))  # centroid terdekat
    return int(cluster_to_level[cluster]), version
