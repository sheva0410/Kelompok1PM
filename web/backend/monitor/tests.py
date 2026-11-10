import csv
import io
import json
from datetime import datetime
from zoneinfo import ZoneInfo

from django.test import TestCase
from rest_framework.authtoken.models import Token

from .management.commands.run_listener import process_message
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

    def test_kolom_dan_isi(self):
        self.auth('pengelola')
        rows = self.rows('/api/export')
        self.assertEqual(rows[0], ['waktu', 'node', 'seq', *SENSORS, 'suhu', 'kelembapan', 'level'])
        self.assertEqual(rows[1][:3], ['2026-11-06 08:00:00', 'N1', '1'])
        self.assertEqual(rows[1][-3:], ['31.2', '74.5', 'Tinggi'])
        self.assertEqual(len(rows), 4)

    def test_filter_tanggal_dan_node(self):
        self.auth('admin')
        # 'to' berupa tanggal mencakup sampai 23:59:59 hari itu
        self.assertEqual(len(self.rows('/api/export?from=2026-11-06&to=2026-11-07')), 3)
        self.assertEqual(len(self.rows('/api/export?node=N2')), 2)
        self.assertEqual(self.client.get('/api/export?from=kemarin').status_code, 400)

    def test_hanya_pengelola_dan_admin(self):
        self.assertEqual(self.client.get('/api/export').status_code, 401)
        self.auth('warga')
        self.assertEqual(self.client.get('/api/export').status_code, 403)


def pesan(node='N1', seq=1, **ubah):
    data = {'node': node, 'seq': seq, 'ts': '2026-11-05T08:30:00+07:00',
            'rsr0': {s: 0.9 for s in SENSORS}, 'suhu': 31.2, 'kelembapan': 74.5}
    data.update(ubah)
    return json.dumps(data).encode()


def rsr0_dengan(**ubah):
    return {**{s: 0.9 for s in SENSORS}, **ubah}


class ListenerTest(TestCase):
    def setUp(self):
        for n in ('N1', 'N2', 'N3', 'N4'):
            Node.objects.create(node_id=n, nama=n)
        Node.objects.create(node_id='N5', nama='Cadangan', aktif=False)

    def test_100_pesan_valid_tersimpan_per_node(self):
        for i in range(100):
            n = f'N{i % 4 + 1}'
            self.assertIsNotNone(process_message(f'smarttps/{n}/data', pesan(n, seq=i)))
        self.assertEqual(Reading.objects.count(), 100)
        self.assertEqual(Reading.objects.filter(node_id='N3').count(), 25)
        r = Reading.objects.get(node_id='N1', seq=0)
        self.assertEqual((r.mq136, r.suhu, r.kelembapan), (0.9, 31.2, 74.5))
        self.assertEqual(r.waktu, datetime(2026, 11, 5, 8, 30, tzinfo=WIB))

    def test_pesan_tidak_valid_ditolak_dan_dicatat(self):
        salah = [
            ('smarttps/N1/data', b'{rusak'),
            ('smarttps/N1/data', b'[1, 2]'),
            ('smarttps/N9/data', pesan('N9')),
            ('smarttps/N5/data', pesan('N5')),
            ('smarttps/N1/data', pesan('N2')),
            ('smarttps/N1/data', pesan(seq='1')),
            ('smarttps/N1/data', pesan(seq=-1)),
            ('smarttps/N1/data', pesan(rsr0=rsr0_dengan(mq2='abc'))),
            ('smarttps/N1/data', pesan(rsr0=rsr0_dengan(mq3=True))),
            ('smarttps/N1/data', pesan(rsr0=rsr0_dengan(mq4=float('nan')))),
            ('smarttps/N1/data', pesan(rsr0={s: 0.9 for s in SENSORS[:-1]})),
            ('smarttps/N1/data', pesan(suhu='31')),
            ('smarttps/N1/data', pesan(ts='kemarin')),
        ]
        with self.assertLogs('monitor.listener', 'WARNING') as log:
            for topic, payload in salah:
                self.assertIsNone(process_message(topic, payload), payload)
        self.assertEqual(len(log.output), len(salah))
        self.assertEqual(Reading.objects.count(), 0)

    def test_duplikat_dan_nilai_opsional(self):
        process_message('smarttps/N1/data', pesan(seq=7))
        self.assertIsNone(process_message('smarttps/N1/data', pesan(seq=7)))
        r = process_message('smarttps/N2/data', pesan('N2', seq=7, ts=None, suhu=None, kelembapan=None))
        self.assertIsNone(r.suhu)
        self.assertEqual(Reading.objects.count(), 2)


class AdminTest(TestCase):
    def test_halaman_admin_terbuka(self):
        su = User.objects.create_superuser(username='su', email='su@x.id', password='x')
        self.client.force_login(su)
        Node.objects.create(node_id='N1', nama='Gerbang')
        for url in ['/admin/monitor/node/', '/admin/monitor/reading/', '/admin/monitor/reading/add/',
                    '/admin/monitor/report/', '/admin/monitor/user/', '/admin/monitor/user/add/']:
            self.assertEqual(self.client.get(url).status_code, 200, url)
