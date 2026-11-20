#!/bin/sh
# Akun baca-saja untuk Grafana. Dijalankan otomatis sekali saat volume PostgreSQL masih kosong.
# Volume lama: docker compose exec postgres sh /docker-entrypoint-initdb.d/02-grafana-user.sh
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v pw="$GRAFANA_DB_PASSWORD" <<'SQL'
CREATE ROLE grafana LOGIN PASSWORD :'pw';
GRANT SELECT ON monitor_node, monitor_reading TO grafana;
SQL
