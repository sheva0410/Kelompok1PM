from django.db import models
from django.contrib.auth.models import AbstractUser

# Urutan 9 sensor MQ. Dipakai ulang oleh serializer, export CSV, dan listener.
SENSORS = ["mq2", "mq3", "mq4", "mq5", "mq6", "mq8", "mq9", "mq135", "mq136"]


# 1. Pengguna
class User(AbstractUser):
    class Role(models.TextChoices):
        WARGA = "warga", "Warga"
        PENGELOLA = "pengelola", "Pengelola"
        ADMIN = "admin", "Admin"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.WARGA)
    email = models.EmailField(unique=True)

    def __str__(self):
        return f"{self.username} ({self.role})"


# 2. Node pemantau di lapangan (dulu Spot)
class Node(models.Model):
    node_id = models.CharField(max_length=4, primary_key=True)  # "N1".."N4"
    nama = models.CharField(max_length=100)
    lokasi = models.CharField(max_length=200, blank=True)
    pos_x = models.FloatField(default=0)  # posisi pada denah
    pos_y = models.FloatField(default=0)
    aktif = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.node_id} - {self.nama}"


# 3. Satu pembacaan dari satu node (dulu SensorLog)
class Reading(models.Model):
    class Level(models.IntegerChoices):
        # Disimpan sebagai angka; teks label menunggu keputusan tim
        # (issue #11: Normal/Sedang/Tinggi, proposal: rendah/sedang/tinggi).
        RENDAH = 0, "Rendah"
        SEDANG = 1, "Sedang"
        TINGGI = 2, "Tinggi"

    node = models.ForeignKey(Node, on_delete=models.CASCADE, related_name="readings")
    seq = models.PositiveIntegerField()  # nomor urut pesan, untuk packet loss
    waktu = models.DateTimeField()  # waktu pembacaan dari alat (NTP)

    # 9 sensor MQ, resistance ratio (Rs/R0)
    mq2 = models.FloatField()
    mq3 = models.FloatField()
    mq4 = models.FloatField()
    mq5 = models.FloatField()
    mq6 = models.FloatField()
    mq8 = models.FloatField()
    mq9 = models.FloatField()
    mq135 = models.FloatField()
    mq136 = models.FloatField()

    # DHT22
    suhu = models.FloatField(null=True, blank=True)  # °C
    kelembapan = models.FloatField(null=True, blank=True)  # %RH

    # Hasil K-Means, diisi listener (issue #26)
    level = models.IntegerField(choices=Level.choices, null=True, blank=True)
    model_ver = models.CharField(max_length=20, blank=True)

    class Meta:
        ordering = ["-waktu"]
        constraints = [
            models.UniqueConstraint(fields=["node", "seq"], name="uniq_reading_node_seq"),
        ]
        indexes = [models.Index(fields=["node", "waktu"])]

    def __str__(self):
        return f"{self.node_id} #{self.seq} - {self.waktu}"


# 4. Laporan bau dari warga
class Report(models.Model):
    class Status(models.TextChoices):
        BARU = "baru", "Baru"
        DIPROSES = "diproses", "Diproses"
        SELESAI = "selesai", "Selesai"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reports")
    node = models.ForeignKey(Node, on_delete=models.SET_NULL, null=True, blank=True, related_name="reports")
    tingkat_dirasakan = models.IntegerField(choices=Reading.Level.choices)
    description = models.TextField()
    image = models.ImageField(upload_to="laporan_img/", null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.BARU)
    handled_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="handled_reports"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Laporan {self.user.username} - {self.node_id or 'tanpa node'}"
