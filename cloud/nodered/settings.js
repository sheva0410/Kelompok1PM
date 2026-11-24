// Pengaturan Node-RED cloud SMART-TPS. Nilai rahasia dibaca dari variabel lingkungan
// (cloud/.env lewat docker-compose.yml), jadi file ini dan flows boleh di-commit.
const { Pool } = require('pg');
const Minio = require('minio');
const { parseReading, parseLevel, saveReading, saveLevel } = require('./reading');

const env = process.env;

const pg = new Pool({ host: 'postgres', database: 'smarttps', user: 'smarttps', password: env.POSTGRES_PASSWORD });
// tanpa ini, koneksi diam yang putus (misalnya PostgreSQL restart) membuat Node-RED crash
pg.on('error', err => console.error('PostgreSQL:', err.message));

const minio = new Minio.Client({
  endPoint: 'minio', port: 9000, useSSL: false,
  accessKey: env.MINIO_ROOT_USER, secretKey: env.MINIO_ROOT_PASSWORD,
});

module.exports = {
  uiHost: '0.0.0.0',   // Node-RED 5 bawaannya hanya 127.0.0.1 di dalam container
  flowFile: 'flows.json',
  // flows_cred.json hanya berisi ${NODERED_PASSWORD}, nilai aslinya dari .env
  credentialSecret: false,
  functionGlobalContext: { pg, minio, parseReading, parseLevel, saveReading, saveLevel, rawBucket: 'smarttps-raw' },
  logging: { console: { level: 'info' } },
};
