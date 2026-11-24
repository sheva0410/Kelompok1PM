import csv
import io
import json
import os
import tempfile
from datetime import datetime
from zoneinfo import ZoneInfo

import numpy as np
from django.test import TestCase
from rest_framework.authtoken.models import Token

from .ai import LOG_FEATURES, load_model, predict_level
from .management.commands.run_listener import process_message
from .management.commands.run_simulator import active_nodes, build_payload, load_dataset, reference_values
from .models import SENSORS, Node, Reading, User

WIB = ZoneInfo('Asia/Jakarta')


class ExportCSVTest(TestCase):
    def setUp(self):
        n1 = Node.objects.create(node_id='N1', nama='Gerbang')
        n2 = Node.objects.create(node_id='N2', nama='Belakang')
        vals = {s: 0.5 for s in SENSORS}
        Reading.objects.create(node=n1, seq=1, waktu=datetime(2026, 11, 6, 8, 0, tzinfo=WIB),
                               suhu=31.2, kelembapan=74.5, level=2, **vals)
        Reading.objects.create(node=n1, seq=2, waktu=datetime(2026, 11, 7, 23, 59, tzinfo=WIB), **vals)
        Reading.objects.create(node=n2, seq=1, waktu=datetime(2026, 11, 8, 0, 1, tzinfo=WIB), **vals)

    def auth(self, role):
        u = User.objects.create_user(username=role, email=f'{role}@x.id', password='x', role=role)
        self.client.defaults['HTTP_AUTHORIZATION'] = f'Token {Token.objects.create(user=u).key}'

    def rows(self, url):
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        return list(csv.reader(io.StringIO(res.content.decode())))

    def test_columns_and_content(self):
        self.auth('pengelola')
        rows = self.rows('/api/export')
        self.assertEqual(rows[0], ['waktu', 'node', 'seq', *SENSORS, 'suhu', 'kelembapan', 'level'])
        self.assertEqual(rows[1][:3], ['2026-11-06 08:00:00', 'N1', '1'])
        self.assertEqual(rows[1][-3:], ['31.2', '74.5', 'Tinggi'])
        self.assertEqual(len(rows), 4)

    def test_date_and_node_filter(self):
        self.auth('admin')
        # 'to' berupa tanggal mencakup sampai 23:59:59 hari itu
        self.assertEqual(len(self.rows('/api/export?from=2026-11-06&to=2026-11-07')), 3)
        self.assertEqual(len(self.rows('/api/export?node=N2')), 2)
        self.assertEqual(self.client.get('/api/export?from=kemarin').status_code, 400)

    def test_manager_and_admin_only(self):
        self.assertEqual(self.client.get('/api/export').status_code, 401)
        self.auth('warga')
        self.assertEqual(self.client.get('/api/export').status_code, 403)


def make_message(node='N1', seq=1, **changes):
    data = {'node': node, 'seq': seq, 'ts': '2026-11-05T08:30:00+07:00',
            'rsr0': {s: 0.9 for s in SENSORS}, 'suhu': 31.2, 'kelembapan': 74.5}
    data.update(changes)
    return json.dumps(data).encode()


def rsr0_with(**changes):
    return {**{s: 0.9 for s in SENSORS}, **changes}


class ListenerTest(TestCase):
    def setUp(self):
        for n in ('N1', 'N2', 'N3', 'N4'):
            Node.objects.create(node_id=n, nama=n)
        Node.objects.create(node_id='N5', nama='Cadangan', aktif=False)

    def test_100_valid_messages_saved_per_node(self):
        for i in range(100):
            n = f'N{i % 4 + 1}'
            self.assertIsNotNone(process_message(f'smarttps/{n}/data', make_message(n, seq=i)))
        self.assertEqual(Reading.objects.count(), 100)
        self.assertEqual(Reading.objects.filter(node_id='N3').count(), 25)
        r = Reading.objects.get(node_id='N1', seq=0)
        self.assertEqual((r.mq136, r.suhu, r.kelembapan), (0.9, 31.2, 74.5))
        self.assertEqual(r.waktu, datetime(2026, 11, 5, 8, 30, tzinfo=WIB))
        self.assertIn(r.level, (0, 1, 2))
        self.assertTrue(r.model_ver.startswith('kmeans-'))

    def test_invalid_messages_rejected_and_logged(self):
        invalid = [
            ('smarttps/N1/data', b'{rusak'),
            ('smarttps/N1/data', b'[1, 2]'),
            ('smarttps/N9/data', make_message('N9')),
            ('smarttps/N5/data', make_message('N5')),
            ('smarttps/N1/data', make_message('N2')),
            ('smarttps/N1/data', make_message(seq='1')),
            ('smarttps/N1/data', make_message(seq=-1)),
            ('smarttps/N1/data', make_message(rsr0=rsr0_with(mq2='abc'))),
            ('smarttps/N1/data', make_message(rsr0=rsr0_with(mq3=True))),
            ('smarttps/N1/data', make_message(rsr0=rsr0_with(mq4=float('nan')))),
            ('smarttps/N1/data', make_message(rsr0={s: 0.9 for s in SENSORS[:-1]})),
            ('smarttps/N1/data', make_message(suhu='31')),
            ('smarttps/N1/data', make_message(ts='kemarin')),
            ('smarttps/N1/data', make_message(rsr0=rsr0_with(mq8=0))),
            ('smarttps/N1/data', make_message(rsr0=rsr0_with(mq135=-0.5))),
        ]
        with self.assertLogs('monitor.listener', 'WARNING') as log:
            for topic, payload in invalid:
                self.assertIsNone(process_message(topic, payload), payload)
        self.assertEqual(len(log.output), len(invalid))
        self.assertEqual(Reading.objects.count(), 0)

    def test_duplicates_and_optional_values(self):
        process_message('smarttps/N1/data', make_message(seq=7))
        self.assertIsNone(process_message('smarttps/N1/data', make_message(seq=7)))
        r = process_message('smarttps/N2/data', make_message('N2', seq=7, ts=None, suhu=None, kelembapan=None))
        self.assertIsNone(r.suhu)
        self.assertEqual((r.level, r.model_ver), (None, ''))  # model butuh suhu dan kelembapan
        self.assertEqual(Reading.objects.count(), 2)


class SimulatorTest(TestCase):
    def write_csv(self, content):
        f = tempfile.NamedTemporaryFile('w', suffix='.csv', delete=False, newline='', encoding='utf-8')
        f.write(content)
        f.close()
        self.addCleanup(os.remove, f.name)
        return f.name

    def test_dataset_read_by_column_name(self):
        # urutan kolom dibalik seperti TS1: Humidity sebelum Temperature
        columns = ['Humidity', 'Temperature'] + [s.upper() for s in SENSORS]
        content = ','.join(columns) + '\n' + ','.join(['70.5', '31.2'] + ['1.5'] * 9) + '\n'
        row = load_dataset(self.write_csv(content))[0]
        self.assertEqual((row['Temperature'], row['Humidity']), (31.2, 70.5))

    def test_dataset_without_sensor_columns_rejected(self):
        with self.assertRaises(ValueError):
            load_dataset(self.write_csv('MQ2,Temperature,Humidity\n1,2,3\n'))

    def test_simulator_message_accepted_by_listener(self):
        for n in ('N1', 'N2'):
            Node.objects.create(node_id=n, nama=n)
        row = {**{s.upper(): 2.5 for s in SENSORS}, 'Temperature': 31.2, 'Humidity': 74.5}
        reference = {s: 5.0 for s in SENSORS}
        message = json.dumps(build_payload('N2', 9, row, '2026-11-12T08:00:00+07:00', reference)).encode()
        r = process_message('smarttps/N2/data', message)
        self.assertEqual((r.node_id, r.seq, r.mq135, r.suhu, r.kelembapan), ('N2', 9, 0.5, 31.2, 74.5))

    def test_reference_is_median_of_minutes_1_to_60(self):
        data = [{**{s.upper(): float(m) for s in SENSORS}, 'minute': m} for m in range(1, 101)]
        self.assertEqual(reference_values(data)['mq2'], 30.5)  # median 1..60, menit 61-100 diabaikan

    def test_off_node_stops_after_n_cycles(self):
        nodes = ['N1', 'N2', 'N3', 'N4']
        self.assertEqual(active_nodes(nodes, 9, 'N3', 10), nodes)
        self.assertEqual(active_nodes(nodes, 10, 'N3', 10), ['N1', 'N2', 'N4'])
        self.assertEqual(active_nodes(nodes, 99, None, 0), nodes)


class ModelAITest(TestCase):
    def test_each_centroid_gets_level_from_label_map(self):
        mean, scale, centroids, cluster_to_level, version = load_model()
        self.assertEqual(len(centroids), 3)
        self.assertEqual(sorted(cluster_to_level.tolist()), [0, 1, 2])
        for c, level in zip(centroids, cluster_to_level):
            # balik standarisasi dan ln: titik centroid harus jatuh ke cluster itu sendiri
            values = c * scale + mean
            rsr0 = dict(zip(LOG_FEATURES, np.exp(values[:len(LOG_FEATURES)])))
            suhu, kelembapan = values[len(LOG_FEATURES):]
            self.assertEqual(predict_level(rsr0, suhu, kelembapan), (int(level), version))
        self.assertTrue(version.startswith('kmeans-'))


class AdminTest(TestCase):
    def test_admin_pages_open(self):
        su = User.objects.create_superuser(username='su', email='su@x.id', password='x')
        self.client.force_login(su)
        Node.objects.create(node_id='N1', nama='Gerbang')
        for url in ['/admin/monitor/node/', '/admin/monitor/reading/', '/admin/monitor/reading/add/',
                    '/admin/monitor/report/', '/admin/monitor/user/', '/admin/monitor/user/add/']:
            self.assertEqual(self.client.get(url).status_code, 200, url)
