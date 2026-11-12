"""Simulator node (issue #13): memutar dataset TS5 sebagai pesan MQTT N1-N4.

Contoh:
  python manage.py run_simulator --dataset D:/data/TS5.csv --interval 1
  python manage.py run_simulator --dataset D:/data/TS5.csv --siklus 25 --interval 0.05
  python manage.py run_simulator --dataset D:/data/TS5.csv --mati N3 --mati-setelah 10
Koneksi ke broker memakai MQTT_* di .env, sama dengan listener.
"""
import csv
import json
import logging
import os
import time
from datetime import datetime

from django.core.management.base import BaseCommand, CommandError

from monitor.models import SENSORS
from monitor.mqtt_util import client_dari_env

logger = logging.getLogger('monitor.simulator')

NODE_BAWAAN = ['N1', 'N2', 'N3', 'N4']
KOLOM = [s.upper() for s in SENSORS] + ['Temperature', 'Humidity']


def muat_dataset(path):
    """Baca CSV per nama kolom, karena urutan kolom suhu dan kelembapan berbeda antar file TS."""
    with open(path, newline='', encoding='utf-8') as f:
        baris = list(csv.DictReader(f))
    if not baris:
        raise ValueError('Dataset kosong')
    kurang = [k for k in KOLOM if k not in baris[0]]
    if kurang:
        raise ValueError(f'Kolom tidak ada di dataset: {", ".join(kurang)}')
    return [{k: float(b[k]) for k in KOLOM} for b in baris]


def buat_payload(node, seq, baris, ts):
    """Format pesan sesuai dokumentasi/Format_Payload_MQTT_SMART-TPS.txt."""
    return {
        'node': node, 'seq': seq, 'ts': ts,
        'rsr0': {s: baris[s.upper()] for s in SENSORS},
        'suhu': baris['Temperature'], 'kelembapan': baris['Humidity'],
    }


def node_kirim(nodes, siklus, mati=None, mati_setelah=0):
    """Node yang mengirim pada siklus ini (dihitung dari 0). Node 'mati' berhenti setelah mati_setelah siklus."""
    return [n for n in nodes if not (n == mati and siklus >= mati_setelah)]


class Command(BaseCommand):
    help = 'Mengirim dataset TS5 sebagai pesan MQTT dari node N1-N4'

    def add_arguments(self, parser):
        parser.add_argument('--dataset', default=os.environ.get('SIMULATOR_DATASET') or 'TS5.csv',
                            help='path file TS5.csv (atau env SIMULATOR_DATASET)')
        parser.add_argument('--interval', type=float, default=60.0,
                            help='detik antar siklus: 1 untuk uji cepat, 60 untuk uji normal')
        parser.add_argument('--siklus', type=int, default=0, help='jumlah siklus, 0 berarti tanpa batas')
        parser.add_argument('--node', nargs='+', default=NODE_BAWAAN, help='node yang disimulasikan')
        parser.add_argument('--mati', help='node yang dimatikan untuk uji node offline, misalnya N3')
        parser.add_argument('--mati-setelah', type=int, default=5,
                            help='node --mati berhenti mengirim setelah sekian siklus')
        parser.add_argument('--seq-awal', type=int, default=1, help='nomor seq pertama tiap node')

    def handle(self, *args, **o):
        logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
        nodes = o['node']
        if o['interval'] < 0:
            raise CommandError('--interval tidak boleh negatif')
        if o['mati'] and o['mati'] not in nodes:
            raise CommandError(f"--mati {o['mati']} tidak ada di daftar node {nodes}")
        try:
            data = muat_dataset(o['dataset'])
        except (OSError, ValueError) as e:
            raise CommandError(f'Dataset tidak bisa dibaca: {e}')

        # Tiap node mulai dari baris berbeda supaya datanya tidak kembar
        awal = {n: i * len(data) // len(nodes) for i, n in enumerate(nodes)}
        seq = {n: o['seq_awal'] for n in nodes}

        client, host, port = client_dari_env('smarttps-simulator')
        try:
            client.connect(host, port, keepalive=60)
        except OSError as e:
            raise CommandError(f'Tidak bisa terhubung ke {host}:{port}: {e}')
        client.loop_start()
        logger.info('Terhubung ke %s:%s, %d baris dataset, node %s, interval %s detik',
                    host, port, len(data), ','.join(nodes), o['interval'])

        siklus = 0
        try:
            while not o['siklus'] or siklus < o['siklus']:
                ts = datetime.now().astimezone().isoformat(timespec='seconds')
                aktif = node_kirim(nodes, siklus, o['mati'], o['mati_setelah'])
                for n in aktif:
                    baris = data[(awal[n] + siklus) % len(data)]
                    pesan = json.dumps(buat_payload(n, seq[n], baris, ts))
                    info = client.publish(f'smarttps/{n}/data', pesan, qos=1)
                    try:
                        info.wait_for_publish(10)
                        seq[n] += 1
                    except (RuntimeError, ValueError):
                        logger.warning('Gagal mengirim %s seq=%s', n, seq[n])
                logger.info('Siklus %d: kirim %s%s', siklus + 1, ','.join(aktif),
                            f' (mati: {o["mati"]})' if o['mati'] and o['mati'] not in aktif else '')
                siklus += 1
                if not o['siklus'] or siklus < o['siklus']:
                    time.sleep(o['interval'])
        except KeyboardInterrupt:
            logger.info('Dihentikan')
        finally:
            client.loop_stop()
            client.disconnect()
