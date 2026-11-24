# Cloud SMART-TPS

Compose untuk sisi *cloud* pada arsitektur Pi-lab v2 (gerbang MQTT, pemroses aliran, penyimpanan, *dashboard*, model). Saat ini sampai **tahap 4**: EMQX (TLS + login), Node-RED sebagai pemroses data, PostgreSQL untuk data panas, MinIO untuk data mentah, dan Grafana untuk *dashboard* serta *alert* Telegram.

| *Service* | *Image* | Port di komputer | Fungsi |
| --- | --- | --- | --- |
| `emqx` | `emqx/emqx:6.3.3` | 8883 (MQTT TLS), 127.0.0.1:18083 (*dashboard*), 127.0.0.1:11883 (MQTT tanpa TLS, uji lokal) | Gerbang MQTT, tujuan *bridge* dari Mosquitto di Pi |
| `postgres` | `postgres:18.7-alpine` | 127.0.0.1:15432 | *Database* pusat (data panas) |
| `nodered` | dibangun dari `nodered/Dockerfile` (`nodered/node-red:5.0.10` + `pg`, `minio`) | 127.0.0.1:11880 (editor) | Memeriksa pesan sensor, menyimpan ke PostgreSQL dan MinIO |
| `minio` | `cgr.dev/chainguard/minio` (dipatok *digest*, RELEASE.2026-11-16) | 127.0.0.1:19001 (konsol) | Arsip pesan mentah, bahan latih ulang model |
| `grafana` | `grafana/grafana:13.3.1` | 127.0.0.1:13000 | *Dashboard* dan *alert* ke Telegram |

EMQX 6.x berlisensi BSL 1.1 dan gratis untuk satu *node* (lisensi *community*). MinIO berhenti merilis *image* Docker resmi sejak Oktober 2025, jadi dipakai *image* Chainguard yang dibangun dari kode sumber MinIO; hanya tag `latest` yang gratis, sehingga dipatok dengan *digest*.

## Menjalankan

Dari Ubuntu (WSL) atau VPS:

```bash
cd cloud
bash setup.sh            # .env, sertifikat, akun MQTT awal, bahan untuk edge/
docker compose up -d
docker compose ps        # tunggu sampai emqx dan postgres (healthy)
```

`setup.sh` hanya membuat yang belum ada. Untuk VPS, tambahkan alamatnya ke sertifikat: `EXTRA_SAN="DNS:nama.domain,IP:1.2.3.4" bash setup.sh` (hapus `certs/` dulu bila sertifikat sudah pernah dibuat).

## MQTT

| Akun | Dipakai oleh |
| --- | --- |
| `pi-bridge` | *Bridge* Mosquitto di Pi |
| `nodered` | Node-RED *cloud* |

Akun dimuat dari `emqx/accounts.csv` saat database akun EMQX masih kosong (volume baru). Akun berikutnya ditambah lewat *dashboard* EMQX. Klien tanpa akun ditolak.

Pesan yang tiba saat tidak ada *subscriber* dibuang EMQX. Karena itu Node-RED memakai sesi persisten (*client id* `smarttps-nodered`, `clean_session` false), dan EMQX memakai *durable session* supaya sesi itu tetap ada walau EMQX di-*restart*. Selama Node-RED mati, EMQX menahan sampai 10.000 pesan (sekitar 41 jam untuk 4 *node*), paling lama 2 hari.

*Dashboard* EMQX: http://localhost:18083, login `admin` dengan `EMQX_DASHBOARD_PASSWORD`.

## Node-RED

Flow `Data sensor` (`nodered/flows.json`):

1. `mqtt in` berlangganan `smarttps/+/data` (QoS 1) dari EMQX dengan akun `nodered`.
2. **periksa pesan**: aturan sama dengan listener Django #12, kodenya di `nodered/reading.js`. Pesan yang ditolak dicatat di log (`Ditolak ...`).
3. **simpan ke PostgreSQL**: menolak *node* yang tidak terdaftar atau nonaktif, lalu `INSERT ... ON CONFLICT (node_id, seq) DO NOTHING` ke `monitor_reading`, jadi pesan ganda QoS 1 dilewati. Kolom `level` diisi oleh flow berikutnya.
4. **arsip mentah ke MinIO**: setiap pesan, termasuk yang ditolak, disimpan apa adanya ke *bucket* `smarttps-raw` dengan nama `<node>/<tanggal UTC>/<jam UTC>-<id pesan>.json`. *Bucket* dibuat otomatis saat pesan pertama.

Flow `Tingkat bau`: `mqtt in` berlangganan `smarttps/+/level` dari model-ai di Pi, memeriksa pesan (`parseLevel` di `reading.js`), lalu `UPDATE monitor_reading SET level, model_ver` untuk `node` dan `seq` yang sama. Bila reading-nya belum tersimpan (level tiba lebih cepat dari INSERT data), flow mencoba lagi tiap detik sampai 10 kali.

Editor: http://localhost:11880 (tanpa login, hanya bisa dibuka dari komputer ini; di VPS lewat SSH *tunnel*). Perubahan yang di-*deploy* dari editor tersimpan ke `nodered/flows.json`. Kata sandi tidak ada di repo: `flows_cred.json` hanya berisi `${NODERED_PASSWORD}`, dan `settings.js` membaca kata sandi PostgreSQL dan MinIO dari `.env`.

Uji aturan pemeriksaan pesan:

```bash
docker compose run --rm --no-deps --entrypoint node nodered /data/reading.test.js
```

Log: `docker compose logs -f nodered`.

## MinIO

Konsol: http://localhost:19001, login `smarttps` dengan `MINIO_ROOT_PASSWORD`. Node-RED juga memakai akun ini.

## Grafana

http://localhost:13000, login `admin` dengan `GRAFANA_ADMIN_PASSWORD`. Semua isi dipasang dari file (`grafana/`), jadi perubahan di tampilan Grafana tidak tersimpan; ubah file lalu `docker compose restart grafana`.

- **Data source** PostgreSQL memakai akun `grafana` yang hanya boleh `SELECT` (`postgres/02-grafana-user.sh`).
- ***Dashboard* SMART-TPS** (`grafana/dashboards/smarttps.json`): tabel status node (data terakhir, menit sejak data terakhir, tingkat bau, suhu, kelembapan), grafik tingkat bau per node, grafik Rs/R0 sembilan sensor, dan grafik suhu-kelembapan untuk node yang dipilih.
- ***Alert*** (`grafana/provisioning/alerting/telegram.yml`), dievaluasi tiap menit dan dikirim ke Telegram:

| *Alert* | Menyala bila |
| --- | --- |
| Node tidak mengirim data | data terakhir node aktif lebih dari 5 menit lalu (atau belum pernah ada) |
| Tingkat bau Tinggi | level terakhir node dalam 10 menit terakhir adalah 2 (Tinggi) |

Supaya *alert* sampai ke Telegram:

1. Buat bot lewat @BotFather, salin tokennya.
2. Kirim pesan apa saja ke bot (atau masukkan bot ke grup), lalu buka `https://api.telegram.org/bot<TOKEN>/getUpdates` dan salin `chat.id`.
3. Isi `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID` di `.env`, lalu `docker compose up -d grafana`.

Tanpa token, *alert* tetap dievaluasi dan terlihat di Grafana, tetapi pengirimannya gagal (log: `webhook response status 404`).

PostgreSQL dengan volume lama (dibuat sebelum tahap 4) belum punya akun `grafana`. Buat sekali: `docker compose up -d postgres && docker compose exec postgres sh /docker-entrypoint-initdb.d/02-grafana-user.sh`.

## Database

`postgres/init.sql` membuat tabel `monitor_node` dan `monitor_reading`, sama persis dengan migrasi Django #11, lalu mendaftarkan N1-N4. Skrip ini hanya berjalan saat volume `pg_data` masih kosong. Untuk mengulang dari nol: `docker compose down -v` (seluruh data ikut terhapus).

Masuk ke psql: `docker compose exec postgres psql -U smarttps -d smarttps`.

## Catatan

- Port 15432 dan 11883 dipakai karena 5432 dan 1883 sudah dipakai PostgreSQL dan Mosquitto di Windows.
- Listener TLS 8883 memakai sertifikat dari CA sendiri (`certs/`, dibuat `setup.sh`), dengan SAN `host.docker.internal`, `localhost`, `emqx`, `127.0.0.1`.
- Pemakaian memori setelah uji: EMQX sekitar 435 MiB, Grafana sekitar 270 MiB, Node-RED sekitar 100 MiB, MinIO sekitar 70 MiB, PostgreSQL sekitar 40 MiB (total sekitar 920 MiB).
- Di WSL, distro Ubuntu mati sendiri bila tidak ada terminal Ubuntu yang terbuka, dan semua container ikut berhenti. Biarkan satu terminal Ubuntu terbuka selama menguji. Di Pi dan VPS hal ini tidak terjadi.
