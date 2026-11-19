"""Simulator node (issue #13): memutar dataset TS5 sebagai pesan MQTT N1-N4.

Contoh:
  python manage.py run_simulator --dataset D:/data/TS5.csv --interval 1
  python manage.py run_simulator --dataset D:/data/TS5.csv --cycles 25 --interval 0.05
  python manage.py run_simulator --dataset D:/data/TS5.csv --off N3 --off-after 10
Koneksi ke broker memakai MQTT_* di .env, sama dengan listener.
"""
import csv
import json
import logging
import os
import statistics
import time
from datetime import datetime

from django.core.management.base import BaseCommand, CommandError

from monitor.models import SENSORS
from monitor.mqtt_util import client_from_env

logger = logging.getLogger('monitor.simulator')

DEFAULT_NODES = ['N1', 'N2', 'N3', 'N4']
COLUMNS = [s.upper() for s in SENSORS] + ['Temperature', 'Humidity']


def load_dataset(path):
    """Baca CSV per nama kolom, karena urutan kolom suhu dan kelembapan berbeda antar file TS."""
    with open(path, newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise ValueError('Dataset kosong')
    missing = [k for k in COLUMNS if k not in rows[0]]
    if missing:
        raise ValueError(f'Kolom tidak ada di dataset: {", ".join(missing)}')
    return [{**{k: float(r[k]) for k in COLUMNS}, 'minute': int(r.get('minute') or i + 1)}
            for i, r in enumerate(rows)]


def reference_values(data):
    """Median tiap sensor pada menit 1-60, sama seperti acuan di notebook preprocessing tim AI."""
    first_hour = [r for r in data if 1 <= r['minute'] <= 60] or data[:60]
    return {s: statistics.median(r[s.upper()] for r in first_hour) for s in SENSORS}


def build_payload(node, seq, row, ts, reference):
    """Format pesan sesuai dokumentasi/Format_Payload_MQTT_SMART-TPS.txt.
    Nilai sensor dibagi nilai acuan, jadi rsr0 berupa rasio seperti Rs/R0 dari node."""
    return {
        'node': node, 'seq': seq, 'ts': ts,
        'rsr0': {s: row[s.upper()] / reference[s] for s in SENSORS},
        'suhu': row['Temperature'], 'kelembapan': row['Humidity'],
    }


def active_nodes(nodes, cycle, off=None, off_after=0):
    """Node yang mengirim pada siklus ini (dihitung dari 0). Node `off` berhenti setelah `off_after` siklus."""
    return [n for n in nodes if not (n == off and cycle >= off_after)]


class Command(BaseCommand):
    help = 'Mengirim dataset TS5 sebagai pesan MQTT dari node N1-N4'

    def add_arguments(self, parser):
        parser.add_argument('--dataset', default=os.environ.get('SIMULATOR_DATASET') or 'TS5.csv',
                            help='path file TS5.csv (atau env SIMULATOR_DATASET)')
        parser.add_argument('--interval', type=float, default=60.0,
                            help='detik antar siklus: 1 untuk uji cepat, 60 untuk uji normal')
        parser.add_argument('--cycles', type=int, default=0, help='jumlah siklus, 0 berarti tanpa batas')
        parser.add_argument('--node', nargs='+', default=DEFAULT_NODES, help='node yang disimulasikan')
        parser.add_argument('--off', help='node yang dimatikan untuk uji node offline, misalnya N3')
        parser.add_argument('--off-after', type=int, default=5,
                            help='node --off berhenti mengirim setelah sekian siklus')
        parser.add_argument('--seq-start', type=int, default=1, help='nomor seq pertama tiap node')

    def handle(self, *args, **opts):
        logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
        nodes = opts['node']
        if opts['interval'] < 0:
            raise CommandError('--interval tidak boleh negatif')
        if opts['off'] and opts['off'] not in nodes:
            raise CommandError(f"--off {opts['off']} tidak ada di daftar node {nodes}")
        try:
            data = load_dataset(opts['dataset'])
        except (OSError, ValueError) as e:
            raise CommandError(f'Dataset tidak bisa dibaca: {e}')

        reference = reference_values(data)
        # Tiap node mulai dari baris berbeda supaya datanya tidak kembar
        start_row = {n: i * len(data) // len(nodes) for i, n in enumerate(nodes)}
        seq = {n: opts['seq_start'] for n in nodes}

        client, host, port = client_from_env('smarttps-simulator')
        try:
            client.connect(host, port, keepalive=60)
        except OSError as e:
            raise CommandError(f'Tidak bisa terhubung ke {host}:{port}: {e}')
        client.loop_start()
        logger.info('Terhubung ke %s:%s, %d baris dataset, node %s, interval %s detik',
                    host, port, len(data), ','.join(nodes), opts['interval'])

        cycle = 0
        try:
            while not opts['cycles'] or cycle < opts['cycles']:
                ts = datetime.now().astimezone().isoformat(timespec='seconds')
                active = active_nodes(nodes, cycle, opts['off'], opts['off_after'])
                for n in active:
                    row = data[(start_row[n] + cycle) % len(data)]
                    message = json.dumps(build_payload(n, seq[n], row, ts, reference))
                    info = client.publish(f'smarttps/{n}/data', message, qos=1)
                    try:
                        info.wait_for_publish(10)
                        seq[n] += 1
                    except (RuntimeError, ValueError):
                        logger.warning('Gagal mengirim %s seq=%s', n, seq[n])
                logger.info('Siklus %d: kirim %s%s', cycle + 1, ','.join(active),
                            f' (mati: {opts["off"]})' if opts['off'] and opts['off'] not in active else '')
                cycle += 1
                if not opts['cycles'] or cycle < opts['cycles']:
                    time.sleep(opts['interval'])
        except KeyboardInterrupt:
            logger.info('Dihentikan')
        finally:
            client.loop_stop()
            client.disconnect()
