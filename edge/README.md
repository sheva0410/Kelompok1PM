# Edge SMART-TPS (Pi)

Compose untuk sisi *edge* pada arsitektur Pi-lab v2. Saat ini baru **tahap 2**: Mosquitto lokal dengan *bridge* TLS ke EMQX di *cloud*.

| *Service* | *Image* | Port | Fungsi |
| --- | --- | --- | --- |
| `mosquitto` | `eclipse-mosquitto:2.0.23` | 127.0.0.1:21883 | Pusat pesan lokal untuk ESP32 N1-N4, *bridge* ke EMQX |

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

## Uji (20 November 2026)

| Uji | Hasil |
| --- | --- |
| EMQX tanpa akun / kata sandi salah | Ditolak (`Not authorized`, `Bad user name or password`) |
| TLS dengan CA sendiri / tanpa CA | Berhasil / ditolak (`CERTIFICATE_VERIFY_FAILED`) |
| Simulator #13 ke Mosquitto Pi, 4 node x 25 siklus | 100 dari 100 pesan sampai di EMQX, 25 per node |
| EMQX dimatikan, 20 pesan masuk ke Pi, EMQX dinyalakan | 20 pesan dikirim ulang ke EMQX setelah *bridge* tersambung |
| Perintah dari EMQX ke `smarttps/cmd/model` | Diterima di Mosquitto Pi |
