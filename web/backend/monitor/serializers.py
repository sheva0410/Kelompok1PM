from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import SENSORS, Node, Reading, Report, User


# 1. Pengguna (register dan profil)
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password', 'role']
        extra_kwargs = {'password': {'write_only': True}}
        # Pendaftar tidak boleh memilih peran sendiri; pengelola dan admin dibuat oleh admin
        read_only_fields = ['role']

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            role=User.Role.WARGA,
        )


# 2. Node (dulu Spot)
class NodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Node
        fields = ['node_id', 'nama', 'lokasi', 'pos_x', 'pos_y', 'aktif']


# 3. Pembacaan sensor (dulu SensorLog). Hanya dibaca lewat API; data masuk lewat listener MQTT.
class ReadingSerializer(serializers.ModelSerializer):
    nama_node = serializers.CharField(source='node.nama', read_only=True)
    level_label = serializers.CharField(source='get_level_display', read_only=True)

    class Meta:
        model = Reading
        fields = ['id', 'node', 'nama_node', 'seq', 'waktu', *SENSORS,
                  'suhu', 'kelembapan', 'level', 'level_label', 'model_ver']
        read_only_fields = fields


# 4. Laporan warga
class ReportSerializer(serializers.ModelSerializer):
    pelapor = serializers.CharField(source='user.username', read_only=True)
    nama_node = serializers.CharField(source='node.nama', read_only=True, default=None)
    ditangani_oleh = serializers.CharField(source='handled_by.username', read_only=True, default=None)

    class Meta:
        model = Report
        fields = ['id', 'pelapor', 'node', 'nama_node', 'tingkat_dirasakan', 'description',
                  'image', 'status', 'ditangani_oleh', 'created_at']
        # user diambil dari token login; status hanya diubah pengelola lewat ReportStatusSerializer
        read_only_fields = ['status']


# 5. Ubah status laporan (PATCH oleh pengelola)
class ReportStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Report
        fields = ['status']
