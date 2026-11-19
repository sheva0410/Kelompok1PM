# Cloud SMART-TPS

Compose untuk sisi *cloud* pada arsitektur Pi-lab v2 (gerbang MQTT, pemroses aliran, penyimpanan, *dashboard*, model). Saat ini sampai **tahap 2**: EMQX (TLS + login) dan PostgreSQL, tujuan *bridge* dari `edge/`.

| *Service* | *Image* | Port di komputer | Fungsi |
| --- | --- | --- | --- |
| `emqx` | `emqx/emqx:6.3.3` | 8883 (MQTT TLS), 127.0.0.1:18083 (*dashboard*), 127.0.0.1:11883 (MQTT tanpa TLS, uji lokal) | Gerbang MQTT, tujuan *bridge* dari Mosquitto di Pi |
| `postgres` | `postgres:18.7-alpine` | 127.0.0.1:15432 | *Database* pusat |

EMQX 6.x berlisensi BSL 1.1 dan gratis untuk satu *node* (lisensi *community*).

## Menjalankan

Dari Ubuntu (WSL) atau VPS:

```bash
cd cloud
bash setup.sh            # .env, sertifikat, akun MQTT awal, bahan untuk edge/
docker compose up -d
docker compose ps        # tunggu sampai keduanya (healthy)
```

`setup.sh` hanya membuat yang belum ada. Untuk VPS, tambahkan alamatnya ke sertifikat: `EXTRA_SAN="DNS:nama.domain,IP:1.2.3.4" bash setup.sh` (hapus `certs/` dulu bila sertifikat sudah pernah dibuat).

## MQTT

| Akun | Dipakai oleh |
| --- | --- |
| `pi-bridge` | *Bridge* Mosquitto di Pi |
| `nodered` | Node-RED *cloud* (tahap 3) |

Akun dimuat dari `emqx/accounts.csv` saat database akun EMQX masih kosong (volume baru). Akun berikutnya ditambah lewat *dashboard* EMQX. Klien tanpa akun ditolak.

Pesan yang tiba saat tidak ada *subscriber* dibuang EMQX. Node-RED di tahap 3 perlu sesi persisten (`clean_session` false, *client id* tetap) supaya pesan disimpan EMQX selama Node-RED mati. Sesi itu hilang bila EMQX sendiri di-*restart*.

*Dashboard* EMQX: http://localhost:18083, login `admin` dengan `EMQX_DASHBOARD_PASSWORD`.

## Database

`postgres/init.sql` membuat tabel `monitor_node` dan `monitor_reading`, sama persis dengan migrasi Django #11, lalu mendaftarkan N1-N4. Skrip ini hanya berjalan saat volume `pg_data` masih kosong. Untuk mengulang dari nol: `docker compose down -v` (seluruh data ikut terhapus).

Masuk ke psql: `docker compose exec postgres psql -U smarttps -d smarttps`.

## Catatan

- Port 15432 dan 11883 dipakai karena 5432 dan 1883 sudah dipakai PostgreSQL dan Mosquitto di Windows.
- Listener TLS 8883 memakai sertifikat dari CA sendiri (`certs/`, dibuat `setup.sh`), dengan SAN `host.docker.internal`, `localhost`, `emqx`, `127.0.0.1`.
- Pemakaian memori saat diam: EMQX sekitar 370 MiB, PostgreSQL sekitar 40 MiB.
