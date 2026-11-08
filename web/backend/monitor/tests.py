import csv
import io
from datetime import datetime
from zoneinfo import ZoneInfo

from django.test import TestCase
from rest_framework.authtoken.models import Token

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


class AdminTest(TestCase):
    def test_halaman_admin_terbuka(self):
        su = User.objects.create_superuser(username='su', email='su@x.id', password='x')
        self.client.force_login(su)
        Node.objects.create(node_id='N1', nama='Gerbang')
        for url in ['/admin/monitor/node/', '/admin/monitor/reading/', '/admin/monitor/reading/add/',
                    '/admin/monitor/report/', '/admin/monitor/user/', '/admin/monitor/user/add/']:
            self.assertEqual(self.client.get(url).status_code, 200, url)
