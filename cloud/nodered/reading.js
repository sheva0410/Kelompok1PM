// Pemeriksaan pesan smarttps/<node>/data. Aturannya sama dengan listener Django #12
// (web/backend/monitor/management/commands/run_listener.py), kecuali cek node aktif
// dan duplikat yang butuh database (dikerjakan di flow "simpan ke PostgreSQL").
const SENSORS = ['mq2', 'mq3', 'mq4', 'mq5', 'mq6', 'mq8', 'mq9', 'mq135', 'mq136'];
const SEQ_MAX = 2147483647; // batas kolom integer PostgreSQL
const ISO = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?$/;

const isNumber = v => typeof v === 'number' && Number.isFinite(v);

// ts tanpa zona waktu dianggap WIB, sama dengan TIME_ZONE Django
function parseTimestamp(ts) {
  const m = typeof ts === 'string' && ts.match(ISO);
  if (!m) return null;
  let zone = m[3] || '+07:00';
  if (zone !== 'Z' && !zone.includes(':')) zone = zone.slice(0, 3) + ':' + zone.slice(3);
  const d = new Date(`${m[1]}T${m[2]}${zone}`);
  return isNaN(d) ? null : d;
}

function parseReading(topic, payload, now = new Date()) {
  const fail = error => ({ error });
  const parts = topic.split('/');
  if (parts.length !== 3 || parts[0] !== 'smarttps' || parts[2] !== 'data') return fail('topik tidak dikenal');
  const node = parts[1];

  let data;
  try { data = JSON.parse(payload); } catch { return fail('JSON tidak valid'); }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return fail('payload harus objek JSON');
  if (data.node !== node) return fail('node di payload tidak sama dengan topik');

  const seq = data.seq;
  if (!Number.isInteger(seq) || seq < 0 || seq > SEQ_MAX) return fail('seq harus bilangan bulat 0 atau lebih');

  const rsr0 = data.rsr0;
  if (rsr0 === null || typeof rsr0 !== 'object' || Array.isArray(rsr0)) return fail('rsr0 tidak ada');
  for (const s of SENSORS) {
    if (!isNumber(rsr0[s])) return fail(`rsr0.${s} bukan angka`);
    if (rsr0[s] <= 0) return fail(`rsr0.${s} harus lebih dari 0`); // model memakai ln(Rs/R0)
  }

  // DHT22 boleh null (gagal baca)
  for (const k of ['suhu', 'kelembapan']) {
    if (data[k] != null && !isNumber(data[k])) return fail(`${k} bukan angka`);
  }

  let waktu = now; // ts kosong berarti waktu terima
  if (data.ts != null) {
    waktu = parseTimestamp(data.ts);
    if (!waktu) return fail('ts harus ISO 8601');
  }

  return {
    reading: {
      node, seq, waktu,
      rsr0: Object.fromEntries(SENSORS.map(s => [s, rsr0[s]])),
      suhu: data.suhu ?? null, kelembapan: data.kelembapan ?? null,
    },
  };
}

module.exports = { SENSORS, parseReading };
