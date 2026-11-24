"""Listener MQTT multi-node (issue #12).

Jalankan: python manage.py run_listener
Berlangganan smarttps/+/data, memeriksa tiap pesan, lalu menyimpannya ke Reading.
Format payload mengikuti dokumentasi/Format_Payload_MQTT_SMART-TPS.txt (disetujui di issue #5).
"""
import json
import logging
import math

from django.core.management.base import BaseCommand
from django.db import close_old_connections
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from monitor.ai import load_model, predict_level
from monitor.models import SENSORS, Node, Reading
from monitor.mqtt_util import client_from_env

logger = logging.getLogger('monitor.listener')

DATA_TOPIC = 'smarttps/+/data'
SEQ_MAX = 2147483647  # batas PositiveIntegerField di PostgreSQL


def is_number(v):
    """True bila v angka biasa. Teks, boolean, NaN, dan inf ditolak."""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return False
    try:
        return math.isfinite(v)
    except OverflowError:
        return False


def reject(topic, reason, payload):
    text = payload.decode('utf-8', 'replace') if isinstance(payload, bytes) else str(payload)
    logger.warning('Ditolak %s: %s | %s', topic, reason, text[:200])


def process_message(topic, payload):
    """Periksa dan simpan satu pesan. Mengembalikan Reading, atau None bila ditolak/duplikat."""
    parts = topic.split('/')
    if len(parts) != 3 or parts[0] != 'smarttps' or parts[2] != 'data':
        return reject(topic, 'topik tidak dikenal', payload)
    node_id = parts[1]

    try:
        data = json.loads(payload)
    except ValueError:
        return reject(topic, 'JSON tidak valid', payload)
    if not isinstance(data, dict):
        return reject(topic, 'payload harus objek JSON', payload)

    if data.get('node') != node_id:
        return reject(topic, 'node di payload tidak sama dengan topik', payload)
    node = Node.objects.filter(node_id=node_id, aktif=True).first()
    if node is None:
        return reject(topic, 'node tidak terdaftar atau nonaktif', payload)

    seq = data.get('seq')
    if isinstance(seq, bool) or not isinstance(seq, int) or not 0 <= seq <= SEQ_MAX:
        return reject(topic, 'seq harus bilangan bulat 0 atau lebih', payload)

    rsr0 = data.get('rsr0')
    if not isinstance(rsr0, dict):
        return reject(topic, 'rsr0 tidak ada', payload)
    for s in SENSORS:
        if not is_number(rsr0.get(s)):
            return reject(topic, f'rsr0.{s} bukan angka', payload)
        if rsr0[s] <= 0:  # rasio Rs/R0 tidak mungkin 0 atau negatif, dan model memakai ln(Rs/R0)
            return reject(topic, f'rsr0.{s} harus lebih dari 0', payload)

    # DHT22 boleh null (gagal baca); data tetap disimpan, tetapi level kosong karena model butuh keduanya.
    for k in ('suhu', 'kelembapan'):
        if data.get(k) is not None and not is_number(data[k]):
            return reject(topic, f'{k} bukan angka', payload)

    ts = data.get('ts')
    if ts is None:
        timestamp = timezone.now()  # README: ts kosong berarti waktu terima
    else:
        try:
            timestamp = parse_datetime(ts) if isinstance(ts, str) else None
        except ValueError:
            timestamp = None
        if timestamp is None:
            return reject(topic, 'ts harus ISO 8601', payload)
        if timezone.is_naive(timestamp):
            timestamp = timezone.make_aware(timestamp)

    # QoS 1 bisa mengirim pesan yang sama dua kali
    if Reading.objects.filter(node=node, seq=seq).exists():
        logger.info('Duplikat diabaikan %s seq=%s', node_id, seq)
        return None

    level, model_ver = None, ''
    if data.get('suhu') is None or data.get('kelembapan') is None:
        # model memakai suhu dan kelembapan; tanpa keduanya level dibiarkan kosong
        logger.info('Tingkat bau tidak ditentukan untuk %s seq=%s: suhu/kelembapan kosong', node_id, seq)
    else:
        try:
            level, model_ver = predict_level(rsr0, data['suhu'], data['kelembapan'])
        except Exception:
            # data tetap disimpan walau model gagal, supaya pembacaan tidak hilang
            logger.exception('Tingkat bau gagal ditentukan untuk %s seq=%s', node_id, seq)

    reading = Reading.objects.create(
        node=node, seq=seq, waktu=timestamp,
        suhu=data.get('suhu'), kelembapan=data.get('kelembapan'),
        level=level, model_ver=model_ver,
        **{s: rsr0[s] for s in SENSORS},
    )
    logger.info('Tersimpan %s seq=%s level=%s', node_id, seq, level)
    return reading


def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code.is_failure:
        logger.error('Gagal terhubung ke broker: %s', reason_code)
        return
    # Subscribe di sini supaya langganan dipasang lagi setiap kali tersambung ulang
    client.subscribe(DATA_TOPIC, qos=1)
    logger.info('Terhubung, berlangganan %s', DATA_TOPIC)


def on_disconnect(client, userdata, flags, reason_code, properties):
    logger.warning('Terputus dari broker (%s), mencoba menyambung ulang', reason_code)


def on_message(client, userdata, msg):
    close_old_connections()  # buang koneksi DB yang putus, misalnya setelah PostgreSQL restart
    try:
        process_message(msg.topic, msg.payload)
    except Exception:
        logger.exception('Gagal memproses pesan %s', msg.topic)


class Command(BaseCommand):
    help = 'Menjalankan listener MQTT untuk data sensor N1-N4'

    def handle(self, *args, **options):
        logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

        # muat model sekali di awal (sekitar 1 detik), supaya pesan pertama tidak tertunda
        logger.info('Model AI: %s', load_model()[-1])

        # clean_session=False dan client_id tetap: broker menyimpan pesan QoS 1 selama listener terputus
        client, host, port = client_from_env('smarttps-listener', clean_session=False)
        client.on_connect = on_connect
        client.on_disconnect = on_disconnect
        client.on_message = on_message
        client.reconnect_delay_set(min_delay=1, max_delay=60)

        logger.info('Menghubungkan ke %s:%s', host, port)
        client.connect_async(host, port, keepalive=60)
        try:
            client.loop_forever(retry_first_connection=True)
        except KeyboardInterrupt:
            client.disconnect()
