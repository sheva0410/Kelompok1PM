import csv
from datetime import datetime, time

from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import permissions
from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView

from .models import SENSORS, Reading, User


class IsPengelolaOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and (u.is_superuser or u.role in (User.Role.PENGELOLA, User.Role.ADMIN)))


def parse_waktu(value, name, akhir=False):
    """Terima YYYY-MM-DD atau datetime ISO 8601. Tanggal saja pada 'to' berarti sampai akhir hari itu."""
    if not value:
        return None
    # Cek tanggal dulu: parse_datetime juga menerima "YYYY-MM-DD" sebagai jam 00:00
    d = parse_date(value)
    dt = datetime.combine(d, time.max if akhir else time.min) if d else parse_datetime(value)
    if dt is None:
        raise ValidationError({name: 'Format waktu harus YYYY-MM-DD atau ISO 8601.'})
    return timezone.make_aware(dt) if timezone.is_naive(dt) else dt


# GET /api/export?from=&to=&node=  (Tabel 5.2, FR-12)
class ExportCSVView(APIView):
    permission_classes = [IsPengelolaOrAdmin]

    def get(self, request):
        qs = Reading.objects.select_related('node').order_by('waktu')
        mulai = parse_waktu(request.query_params.get('from'), 'from')
        sampai = parse_waktu(request.query_params.get('to'), 'to', akhir=True)
        node = request.query_params.get('node')
        if mulai:
            qs = qs.filter(waktu__gte=mulai)
        if sampai:
            qs = qs.filter(waktu__lte=sampai)
        if node:
            qs = qs.filter(node_id=node)

        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="smarttps_{node or "semua"}.csv"'
        writer = csv.writer(response)
        writer.writerow(['waktu', 'node', 'seq', *SENSORS, 'suhu', 'kelembapan', 'level'])
        for r in qs.iterator():
            writer.writerow([
                timezone.localtime(r.waktu).strftime('%Y-%m-%d %H:%M:%S'), r.node_id, r.seq,
                *(getattr(r, s) for s in SENSORS), r.suhu, r.kelembapan,
                r.get_level_display() if r.level is not None else '',
            ])
        return response
