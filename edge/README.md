# Edge SMART-TPS (Pi)

Compose untuk sisi *edge* pada arsitektur Pi-lab v2. Saat ini sampai **tahap 6**: Mosquitto lokal dengan *bridge* TLS ke EMQX di *cloud*, model-ai yang menentukan tingkat bau dengan K-Means (ONNX), dan penyimpanan lokal (Node-RED + PostgreSQL).

| *Service* | *Image* | Port | Fungsi |
| --- | --- | --- | --- |
| `mosquitto` | `eclipse-mosquitto:2.0.23` | 127.0.0.1:21883 | Pusat pesan lokal untuk ESP32 N1-N4, *bridge* ke EMQX |
| `model-ai` | dibangun dari `model-ai/Dockerfile` (`python:3.13-slim` + onnxruntime) | - | Tingkat bau untuk setiap pesan sensor |
| `nodered` | sama dengan Node-RED *cloud* (`../cloud/nodered/Dockerfile`) | 127.0.0.1:21880 (editor) | Menyimpan data dan level ke PostgreSQL lokal |
| `postgres` | `postgres:18.7-alpine` | 127.0.0.1:25432 | *Database* lokal Pi, skema sama dengan *cloud* |

## Menjalankan

Saat *cloud* dan *edge* ada di komputer yang sama (Pi virtual), jalankan dulu `cloud/setup.sh`. Skrip itu mengisi `edge/.env` dan `edge/certs/ca.crt`. Lalu:

```bash
cd edge
docker compose up -d
docker compose logs mosquitto     # harus ada "Connecting bridge cloud"
```

Di Pi asli: salin `ca.crt` dari *cloud* ke `edge/certs/`, lalu isi `edge/.env` dengan `BRIDGE_PASSWORD` (akun `pi-bridge`), `CLOUD_HOST` (alamat VPS), dan `POSTGRES_PASSWORD` (acak, untuk PostgreSQL lokal). Alamat VPS juga harus ada di sertifikat EMQX (`EXTRA_SAN` saat menjalankan `setup.sh`).

## *Bridge* ke *cloud*

| Topik | Arah | QoS |
| --- | --- | --- |
| `smarttps/+/data` | Pi ke *cloud* | 1 |
| `smarttps/+/status` | Pi ke *cloud* | 1 |
| `smarttps/+/level` | Pi ke *cloud* (hasil model AI) | 1 |
| `smarttps/cmd/#` | *cloud* ke Pi (perintah model) | 1 |

- TLS ke port 8883, sertifikat EMQX diperiksa dengan `ca.crt` (`bridge_insecure false`).
- Login dengan akun `pi-bridge`. EMQX menolak klien tanpa akun.
- Saat *cloud* tidak terjangkau, pesan disimpan di volume `mosquitto_data` (sampai 10.000 pesan) dan dikirim setelah *bridge* tersambung lagi.
- Mosquitto juga mengirim status *bridge* ke `$SYS/broker/connection/pi-tps-1/state` (1 tersambung, 0 terputus), disimpan sebagai *retained* di EMQX.

## model-ai

`model-ai/app.py` berlangganan `smarttps/+/data` di Mosquitto lokal. Untuk setiap pesan, ia menyusun 11 fitur (ln(Rs/R0) untuk 9 sensor MQ, lalu suhu dan kelembapan apa adanya), menjalankan `model-ai/kmeans.onnx` (StandardScaler + KMeans), lalu mengirim:

```
smarttps/<node>/level   {"node": "N1", "seq": 123, "level": 2, "model_ver": "kmeans-c3b1a99c"}
```

Level 0 Normal, 1 Sedang, 2 Tinggi. Pesan ini ikut *bridge* ke *cloud*, lalu Node-RED mengisi kolom `level` dan `model_ver` pada reading dengan `node` dan `seq` yang sama. Pesan tanpa suhu atau kelembapan (DHT22 gagal baca) tidak diberi level. Sesi MQTT model-ai persisten, jadi pesan yang masuk saat model-ai mati diproses setelah ia hidup lagi.

`kmeans.onnx` dibuat dari model di `web/backend/monitor/ml_models` dengan `model-ai/export_onnx.py` (cara menjalankan ada di awal file). Cara menyusun masukan dari pesan (`["log", "mq135"]`, `["raw", "suhu"]`, dan seterusnya), peta cluster ke level, dan versi model disimpan di metadata ONNX, jadi `app.py` tidak perlu diubah bila fitur model berubah. Versinya sama dengan di Django (`kmeans-` + 8 karakter SHA-256 file model). Skrip itu juga memeriksa bahwa ONNX memilih cluster yang sama dengan scikit-learn.

## Penyimpanan lokal

Node-RED *edge* (`nodered/flows.json`) berlangganan Mosquitto lokal dan menyimpan ke PostgreSQL di Pi dengan aturan yang sama dengan *cloud*. Kode pemeriksaan dan penyimpanannya memakai `../cloud/nodered/reading.js` (dipasang ke `/smarttps/reading.js`), jadi aturan di Pi dan *cloud* selalu sama.

- Flow `Data sensor`: `smarttps/+/data` diperiksa lalu disimpan ke `monitor_reading`. Tidak ada arsip MinIO di Pi.
- Flow `Tingkat bau`: `smarttps/+/level` dari model-ai mengisi kolom `level` dan `model_ver`.

Data tetap tersimpan di Pi walau *cloud* tidak terjangkau; *cloud* menerima pesan yang sama dari antrean *bridge* setelah tersambung lagi. Skema diambil dari `../cloud/postgres/init.sql`, termasuk daftar node N1-N4. Belum ada penghapusan data lama; sekitar 1,2 MB per hari untuk 4 node.

Masuk ke psql: `docker compose exec postgres psql -U smarttps -d smarttps`.

## Uji (20 November 2026)

| Uji | Hasil |
| --- | --- |
| EMQX tanpa akun / kata sandi salah | Ditolak (`Not authorized`, `Bad user name or password`) |
| TLS dengan CA sendiri / tanpa CA | Berhasil / ditolak (`CERTIFICATE_VERIFY_FAILED`) |
| Simulator #13 ke Mosquitto Pi, 4 node x 25 siklus | 100 dari 100 pesan sampai di EMQX, 25 per node |
| EMQX dimatikan, 20 pesan masuk ke Pi, EMQX dinyalakan | 20 pesan dikirim ulang ke EMQX setelah *bridge* tersambung |
| Perintah dari EMQX ke `smarttps/cmd/model` | Diterima di Mosquitto Pi |
| ONNX model V2 dibandingkan scikit-learn, 200.003 titik acak dan centroid (24 Nov) | 200.003 sama, 0 beda |
| Simulator 100 pesan, level V2 di PostgreSQL *cloud* dibandingkan `predict_level` Django (24 Nov) | 100 dari 100 sama (50 Normal, 50 Sedang) |
| Pesan dengan suhu dan kelembapan null (24 Nov) | Data tersimpan di Pi dan *cloud*, level kosong |
| model-ai dimatikan, 20 pesan masuk, model-ai dinyalakan | 20 level dikirim dan tersimpan |
| Simulator 100 pesan, isi PostgreSQL Pi dibandingkan *cloud* (24 Nov) | Sama: 100 reading, 100 berlevel, *checksum* sama |
| EMQX dimatikan, 20 pesan masuk, EMQX dinyalakan (24 Nov) | Pi langsung menyimpan 20 reading berlevel; *cloud* 0, lalu 20 yang sama setelah *bridge* tersambung lagi |
