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

from monitor.models import SENSORS, Node, Reading
from monitor.mqtt_util import client_dari_env

logger = logging.getLogger('monitor.listener')

TOPIK_DATA = 'smarttps/+/data'
SEQ_MAKS = 2147483647  # batas PositiveIntegerField di PostgreSQL


def angka(v):
    """True bila v angka biasa. Teks, boolean, NaN, dan inf ditolak."""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return False
    try:
        return math.isfinite(v)
    except OverflowError:
        return False


def tolak(topic, alasan, payload):
    teks = payload.decode('utf-8', 'replace') if isinstance(payload, bytes) else str(payload)
    logger.warning('Ditolak %s: %s | %s', topic, alasan, teks[:200])


def process_message(topic, payload):
    """Periksa dan simpan satu pesan. Mengembalikan Reading, atau None bila ditolak/duplikat."""
    bagian = topic.split('/')
    if len(bagian) != 3 or bagian[0] != 'smarttps' or bagian[2] != 'data':
        return tolak(topic, 'topik tidak dikenal', payload)
    node_id = bagian[1]

    try:
        data = json.loads(payload)
    except ValueError:
        return tolak(topic, 'JSON tidak valid', payload)
    if not isinstance(data, dict):
        return tolak(topic, 'payload harus objek JSON', payload)

    if data.get('node') != node_id:
        return tolak(topic, 'node di payload tidak sama dengan topik', payload)
    node = Node.objects.filter(node_id=node_id, aktif=True).first()
    if node is None:
        return tolak(topic, 'node tidak terdaftar atau nonaktif', payload)

    seq = data.get('seq')
    if isinstance(seq, bool) or not isinstance(seq, int) or not 0 <= seq <= SEQ_MAKS:
        return tolak(topic, 'seq harus bilangan bulat 0 atau lebih', payload)

    rsr0 = data.get('rsr0')
    if not isinstance(rsr0, dict):
        return tolak(topic, 'rsr0 tidak ada', payload)
    for s in SENSORS:
        if not angka(rsr0.get(s)):
            return tolak(topic, f'rsr0.{s} bukan angka', payload)

    # DHT22 boleh null (gagal baca). Keputusan akhirnya di issue #26.
    for k in ('suhu', 'kelembapan'):
        if data.get(k) is not None and not angka(data[k]):
            return tolak(topic, f'{k} bukan angka', payload)

    ts = data.get('ts')
    if ts is None:
        waktu = timezone.now()  # README: ts kosong berarti waktu terima
    else:
        try:
            waktu = parse_datetime(ts) if isinstance(ts, str) else None
        except ValueError:
            waktu = None
        if waktu is None:
            return tolak(topic, 'ts harus ISO 8601', payload)
        if timezone.is_naive(waktu):
            waktu = timezone.make_aware(waktu)

    # QoS 1 bisa mengirim pesan yang sama dua kali
    if Reading.objects.filter(node=node, seq=seq).exists():
        logger.info('Duplikat diabaikan %s seq=%s', node_id, seq)
        return None

    reading = Reading.objects.create(
        node=node, seq=seq, waktu=waktu,
        suhu=data.get('suhu'), kelembapan=data.get('kelembapan'),
        **{s: rsr0[s] for s in SENSORS},
    )
    logger.info('Tersimpan %s seq=%s', node_id, seq)
    return reading


def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code.is_failure:
        logger.error('Gagal terhubung ke broker: %s', reason_code)
        return
    # Subscribe di sini supaya langganan dipasang lagi setiap kali tersambung ulang
    client.subscribe(TOPIK_DATA, qos=1)
    logger.info('Terhubung, berlangganan %s', TOPIK_DATA)


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

        # clean_session=False dan client_id tetap: broker menyimpan pesan QoS 1 selama listener terputus
        client, host, port = client_dari_env('smarttps-listener', clean_session=False)
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
