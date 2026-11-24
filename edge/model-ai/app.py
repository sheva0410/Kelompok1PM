"""model-ai di Pi: tingkat bau K-Means (ONNX) untuk setiap pesan sensor.

Berlangganan smarttps/+/data di Mosquitto lokal, lalu mengirim
smarttps/<node>/level berisi {"node", "seq", "level", "model_ver"}.
Pesan level ikut bridge ke cloud dan disimpan Node-RED ke kolom level.
Pemeriksaan pesan lengkap tetap dilakukan di cloud; di sini cukup yang dibutuhkan model.
"""
import json
import logging
import math
import os

import numpy as np
import onnxruntime as ort
import paho.mqtt.client as mqtt

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('model-ai')

session = ort.InferenceSession(os.environ.get('MODEL_PATH', 'kmeans.onnx'), providers=['CPUExecutionProvider'])
meta = session.get_modelmeta().custom_metadata_map
FEATURES = json.loads(meta['features'])
CLUSTER_TO_LEVEL = json.loads(meta['cluster_to_level'])
VERSION = meta['version']
INPUT = session.get_inputs()[0].name


def predict(topic, payload):
    """Kembalikan (topik level, payload level), atau None bila pesan tidak bisa dipakai."""
    parts = topic.split('/')
    try:
        data = json.loads(payload)
        node, seq, rsr0 = data['node'], data['seq'], data['rsr0']
        values = [rsr0[s] for s in FEATURES]
    except (ValueError, TypeError, KeyError) as e:
        log.warning('Dilewati %s: %r', topic, e)
        return None
    if node != parts[1] or isinstance(seq, bool) or not isinstance(seq, int) or not all(
            isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and v > 0 for v in values):
        log.warning('Dilewati %s: node, seq, atau rsr0 tidak valid', topic)
        return None
    cluster = int(session.run(None, {INPUT: np.log([values], dtype=np.float64)})[0][0])
    level = CLUSTER_TO_LEVEL[cluster]
    return f'smarttps/{node}/level', json.dumps({'node': node, 'seq': seq, 'level': level, 'model_ver': VERSION})


def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code.is_failure:
        log.error('Gagal terhubung ke broker: %s', reason_code)
        return
    client.subscribe('smarttps/+/data', qos=1)
    log.info('Terhubung, berlangganan smarttps/+/data')


def on_message(client, userdata, msg):
    result = predict(msg.topic, msg.payload)
    if result:
        client.publish(*result, qos=1)
        log.info('%s %s', *result)


def main():
    log.info('Model %s, fitur %s', VERSION, FEATURES)
    # client id tetap dan clean_session False: Mosquitto menahan pesan selama model-ai mati
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id='smarttps-model-ai', clean_session=False)
    client.on_connect = on_connect
    client.on_message = on_message
    client.reconnect_delay_set(min_delay=1, max_delay=30)
    client.connect_async(os.environ.get('MQTT_HOST', 'mosquitto'), int(os.environ.get('MQTT_PORT', '1883')))
    client.loop_forever(retry_first_connection=True)


if __name__ == '__main__':
    main()
