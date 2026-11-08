from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import SENSORS, Node, Reading, Report, User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ('username', 'email', 'role', 'is_staff')
    list_filter = ('role', 'is_staff', 'is_superuser')
    fieldsets = UserAdmin.fieldsets + (('Peran', {'fields': ('role',)}),)
    add_fieldsets = UserAdmin.add_fieldsets + (('Peran', {'fields': ('email', 'role')}),)


@admin.register(Node)
class NodeAdmin(admin.ModelAdmin):
    list_display = ('node_id', 'nama', 'lokasi', 'aktif')
    list_filter = ('aktif',)
    search_fields = ('node_id', 'nama', 'lokasi')


@admin.register(Reading)
class ReadingAdmin(admin.ModelAdmin):
    list_display = ('node', 'seq', 'waktu', 'level', 'suhu', 'kelembapan')
    list_filter = ('node', 'level')
    date_hierarchy = 'waktu'
    fieldsets = (
        (None, {'fields': ('node', 'seq', 'waktu')}),
        ('Sensor MQ (Rs/R0)', {'fields': tuple(SENSORS)}),
        ('DHT22', {'fields': ('suhu', 'kelembapan')}),
        ('Hasil K-Means', {'fields': ('level', 'model_ver')}),
    )


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'node', 'tingkat_dirasakan', 'status', 'handled_by', 'created_at')
    list_filter = ('status', 'node', 'tingkat_dirasakan')
    search_fields = ('description', 'user__username')
