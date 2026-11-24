"""Penentuan tingkat bau dengan K-Means (issue #26).

File di ml_models/ berasal dari branch ragil (AI/model_kmeansV2.zip, dilatih dengan scikit-learn 1.9.1).
Fitur model (11): ln(nilai sensor / nilai acuan) untuk 9 sensor MQ, lalu suhu dan kelembapan apa adanya,
kemudian StandardScaler. Pada data node, nilai acuan adalah R0, jadi fitur sensor = ln(Rs/R0).
"""
import hashlib
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np

MODEL_DIR = Path(__file__).resolve().parent / 'ml_models'
LOG_FEATURES = ['mq135', 'mq136', 'mq2', 'mq3', 'mq4', 'mq5', 'mq6', 'mq8', 'mq9']  # dari rsr0, di-ln
FEATURE_NAMES = [f'lr_{s.upper()}' for s in LOG_FEATURES] + ['Temperature', 'Humidity']  # nama kolom di notebook AI
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


def features(rsr0, suhu, kelembapan):
    """Susun vektor fitur sesuai urutan FEATURE_NAMES."""
    return np.array([np.log(rsr0[s]) for s in LOG_FEATURES] + [suhu, kelembapan], dtype=float)


def predict_level(rsr0, suhu, kelembapan):
    """rsr0: dict Rs/R0 per sensor (lebih dari 0); suhu dan kelembapan wajib ada.
    Kembalikan (level 0/1/2, versi model)."""
    mean, scale, centroids, cluster_to_level, version = load_model()
    z = (features(rsr0, suhu, kelembapan) - mean) / scale  # standarisasi sama seperti saat pelatihan
    cluster = int(np.argmin(((centroids - z) ** 2).sum(axis=1)))  # centroid terdekat
    return int(cluster_to_level[cluster]), version
