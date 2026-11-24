// Pengaturan Node-RED edge (Pi): simpan data sensor dan level ke PostgreSQL lokal.
// Pemeriksaan dan penyimpanan memakai reading.js milik Node-RED cloud (dipasang di /smarttps).
const { Pool } = require('pg');
const { parseReading, parseLevel, saveReading, saveLevel } = require('/smarttps/reading');

const pg = new Pool({ host: 'postgres', database: 'smarttps', user: 'smarttps', password: process.env.POSTGRES_PASSWORD });
// tanpa ini, koneksi diam yang putus (misalnya PostgreSQL restart) membuat Node-RED crash
pg.on('error', err => console.error('PostgreSQL:', err.message));

module.exports = {
  uiHost: '0.0.0.0',   // Node-RED 5 bawaannya hanya 127.0.0.1 di dalam container
  flowFile: 'flows.json',
  credentialSecret: false,   // Mosquitto lokal tanpa login, jadi tidak ada kredensial
  functionGlobalContext: { pg, parseReading, parseLevel, saveReading, saveLevel },
  logging: { console: { level: 'info' } },
};
