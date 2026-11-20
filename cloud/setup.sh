#!/usr/bin/env bash
# Menyiapkan rahasia untuk cloud dan edge (jalankan di Ubuntu/WSL atau VPS, dari folder cloud):
#   bash setup.sh                          # SAN bawaan: host.docker.internal, localhost, emqx, 127.0.0.1
#   EXTRA_SAN="DNS:smarttps.example.com,IP:20.1.2.3" bash setup.sh   # tambah alamat VPS
# Membuat (bila belum ada): .env, sertifikat CA dan server EMQX, akun MQTT awal EMQX,
# lalu menyalin ca.crt dan kata sandi bridge ke ../edge. Semua hasil diabaikan git.
set -euo pipefail
cd "$(dirname "$0")"

random_secret() { openssl rand -base64 24 | tr -d '/+=' | cut -c1-24; }

# 1. kata sandi di .env (hanya menambah yang belum ada)
touch .env
for v in EMQX_DASHBOARD_PASSWORD POSTGRES_PASSWORD BRIDGE_PASSWORD NODERED_PASSWORD MINIO_ROOT_PASSWORD GRAFANA_ADMIN_PASSWORD GRAFANA_DB_PASSWORD; do
  grep -q "^$v=." .env || { sed -i "/^$v=/d" .env; echo "$v=$(random_secret)" >> .env; echo "dibuat: $v"; }
done
set -a; . ./.env; set +a

# 2. sertifikat: CA sendiri, lalu sertifikat server EMQX
mkdir -p certs
if [ ! -f certs/server.crt ]; then
  san="DNS:host.docker.internal,DNS:localhost,DNS:emqx,IP:127.0.0.1${EXTRA_SAN:+,$EXTRA_SAN}"
  openssl req -x509 -newkey rsa:2048 -nodes -days 825 -subj "/CN=SMART-TPS CA" \
    -keyout certs/ca.key -out certs/ca.crt 2>/dev/null
  openssl req -newkey rsa:2048 -nodes -subj "/CN=emqx.smarttps" \
    -keyout certs/server.key -out certs/server.csr 2>/dev/null
  printf 'subjectAltName=%s\nextendedKeyUsage=serverAuth\n' "$san" > certs/san.ext
  openssl x509 -req -days 825 -in certs/server.csr -CA certs/ca.crt -CAkey certs/ca.key \
    -CAcreateserial -extfile certs/san.ext -out certs/server.crt 2>/dev/null
  rm -f certs/server.csr certs/san.ext certs/ca.srl
  chmod 644 certs/server.key   # dibaca user emqx di dalam container
  echo "dibuat: sertifikat ($san)"
fi

# 3. akun MQTT awal EMQX, dimuat saat database akun EMQX masih kosong
mkdir -p emqx
printf 'user_id,password,is_superuser\npi-bridge,%s,false\nnodered,%s,false\n' \
  "$BRIDGE_PASSWORD" "$NODERED_PASSWORD" > emqx/accounts.csv
chmod 644 emqx/accounts.csv

# 4. bahan untuk edge (Pi): CA untuk memeriksa sertifikat EMQX, dan kata sandi bridge
mkdir -p ../edge/certs
cp certs/ca.crt ../edge/certs/ca.crt
touch ../edge/.env
sed -i '/^BRIDGE_PASSWORD=/d' ../edge/.env
echo "BRIDGE_PASSWORD=$BRIDGE_PASSWORD" >> ../edge/.env
echo "siap: cloud/.env, cloud/certs, cloud/emqx/accounts.csv, edge/.env, edge/certs/ca.crt"
