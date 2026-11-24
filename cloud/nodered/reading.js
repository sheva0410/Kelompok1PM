// Pemeriksaan dan penyimpanan pesan smarttps/<node>/data dan smarttps/<node>/level.
// Dipakai Node-RED cloud dan Node-RED edge (Pi), supaya aturannya sama di kedua tempat.
// Aturan pemeriksaan sama dengan listener Django #12
// (web/backend/monitor/management/commands/run_listener.py).
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

// Pesan smarttps/<node>/level dari model-ai di Pi: {"node", "seq", "level", "model_ver"}
function parseLevel(topic, payload) {
  const fail = error => ({ error });
  const parts = topic.split('/');
  if (parts.length !== 3 || parts[0] !== 'smarttps' || parts[2] !== 'level') return fail('topik tidak dikenal');
  let data;
  try { data = JSON.parse(payload); } catch { return fail('JSON tidak valid'); }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return fail('payload harus objek JSON');
  if (data.node !== parts[1]) return fail('node di payload tidak sama dengan topik');
  if (!Number.isInteger(data.seq) || data.seq < 0 || data.seq > SEQ_MAX) return fail('seq harus bilangan bulat 0 atau lebih');
  if (![0, 1, 2].includes(data.level)) return fail('level harus 0, 1, atau 2');
  // panjang kolom model_ver di PostgreSQL 20
  if (typeof data.model_ver !== 'string' || !data.model_ver || data.model_ver.length > 20) return fail('model_ver tidak valid');
  return { level: { node: data.node, seq: data.seq, level: data.level, model_ver: data.model_ver } };
}

// Simpan reading hasil parseReading. Mengembalikan { log } atau { warn }.
async function saveReading(pg, r) {
  const found = await pg.query('SELECT aktif FROM monitor_node WHERE node_id = $1', [r.node]);
  if (!found.rows[0]?.aktif) return { warn: `${r.node}: node tidak terdaftar atau nonaktif` };
  // level diisi dari pesan level model-ai. QoS 1 bisa mengirim pesan yang sama dua kali,
  // jadi (node, seq) yang sudah ada dilewati.
  const columns = ['node_id', 'seq', 'waktu', ...SENSORS, 'suhu', 'kelembapan'];
  const res = await pg.query(
    `INSERT INTO monitor_reading (${columns.join(', ')})
     VALUES (${columns.map((_, i) => '$' + (i + 1)).join(', ')})
     ON CONFLICT (node_id, seq) DO NOTHING`,
    [r.node, r.seq, r.waktu, ...SENSORS.map(s => r.rsr0[s]), r.suhu, r.kelembapan]);
  return { log: `${res.rowCount ? 'Tersimpan' : 'Duplikat diabaikan'} ${r.node} seq=${r.seq}` };
}

// Simpan level hasil parseLevel ke reading (node, seq) yang sama. Level dikirim model-ai setelah
// data, tetapi INSERT data bisa belum selesai saat level tiba, jadi coba lagi tiap detik.
async function saveLevel(pg, l, tries = 10, delay = 1000) {
  for (let i = 0; i < tries; i++) {
    const res = await pg.query('UPDATE monitor_reading SET level = $3, model_ver = $4 WHERE node_id = $1 AND seq = $2',
      [l.node, l.seq, l.level, l.model_ver]);
    if (res.rowCount) return { log: `Level ${l.node} seq=${l.seq}: ${l.level} (${l.model_ver})` };
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  return { warn: `Level ${l.node} seq=${l.seq} tidak punya data di monitor_reading` };
}

module.exports = { SENSORS, parseReading, parseLevel, saveReading, saveLevel };
