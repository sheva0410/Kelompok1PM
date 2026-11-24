# Edge SMART-TPS (Pi)

Compose untuk sisi *edge* pada arsitektur Pi-lab v2. Saat ini sampai **tahap 5**: Mosquitto lokal dengan *bridge* TLS ke EMQX di *cloud*, dan model-ai yang menentukan tingkat bau dengan K-Means (ONNX).

| *Service* | *Image* | Port | Fungsi |
| --- | --- | --- | --- |
| `mosquitto` | `eclipse-mosquitto:2.0.23` | 127.0.0.1:21883 | Pusat pesan lokal untuk ESP32 N1-N4, *bridge* ke EMQX |
| `model-ai` | dibangun dari `model-ai/Dockerfile` (`python:3.13-slim` + onnxruntime) | - | Tingkat bau untuk setiap pesan sensor |

## Menjalankan

Saat *cloud* dan *edge* ada di komputer yang sama (Pi virtual), jalankan dulu `cloud/setup.sh`. Skrip itu mengisi `edge/.env` dan `edge/certs/ca.crt`. Lalu:

```bash
cd edge
docker compose up -d
docker compose logs mosquitto     # harus ada "Connecting bridge cloud"
```

Di Pi asli: salin `ca.crt` dari *cloud* ke `edge/certs/`, lalu isi `edge/.env` dengan `BRIDGE_PASSWORD` (akun `pi-bridge`) dan `CLOUD_HOST` (alamat VPS). Alamat VPS juga harus ada di sertifikat EMQX (`EXTRA_SAN` saat menjalankan `setup.sh`).

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

`model-ai/app.py` berlangganan `smarttps/+/data` di Mosquitto lokal. Untuk setiap pesan, ia menghitung ln(Rs/R0) untuk MQ135, MQ3, MQ4, MQ8, menjalankan `model-ai/kmeans.onnx` (StandardScaler + KMeans), lalu mengirim:

```
smarttps/<node>/level   {"node": "N1", "seq": 123, "level": 2, "model_ver": "kmeans-b75cc553"}
```

Level 0 Normal, 1 Sedang, 2 Tinggi. Pesan ini ikut *bridge* ke *cloud*, lalu Node-RED mengisi kolom `level` dan `model_ver` pada reading dengan `node` dan `seq` yang sama. Sesi MQTT model-ai persisten, jadi pesan yang masuk saat model-ai mati diproses setelah ia hidup lagi.

`kmeans.onnx` dibuat dari model di `web/backend/monitor/ml_models` dengan `model-ai/export_onnx.py` (cara menjalankan ada di awal file). Urutan fitur, peta cluster ke level, dan versi model disimpan di metadata ONNX. Versinya sama dengan di Django (`kmeans-` + 8 karakter SHA-256 file model). Skrip itu juga memeriksa bahwa ONNX memilih cluster yang sama dengan scikit-learn.

## Uji (20 November 2026)

| Uji | Hasil |
| --- | --- |
| EMQX tanpa akun / kata sandi salah | Ditolak (`Not authorized`, `Bad user name or password`) |
| TLS dengan CA sendiri / tanpa CA | Berhasil / ditolak (`CERTIFICATE_VERIFY_FAILED`) |
| Simulator #13 ke Mosquitto Pi, 4 node x 25 siklus | 100 dari 100 pesan sampai di EMQX, 25 per node |
| EMQX dimatikan, 20 pesan masuk ke Pi, EMQX dinyalakan | 20 pesan dikirim ulang ke EMQX setelah *bridge* tersambung |
| Perintah dari EMQX ke `smarttps/cmd/model` | Diterima di Mosquitto Pi |
| ONNX dibandingkan scikit-learn, 200.003 titik acak dan centroid | 200.003 sama, 0 beda |
| Simulator 100 pesan, level di PostgreSQL *cloud* dibandingkan `predict_level` Django | 100 dari 100 sama (25 Normal, 50 Sedang, 25 Tinggi) |
| model-ai dimatikan, 20 pesan masuk, model-ai dinyalakan | 20 level dikirim dan tersimpan |
