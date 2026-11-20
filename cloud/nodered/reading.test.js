// Jalankan: docker compose run --rm --no-deps --entrypoint node nodered /data/reading.test.js
// Kasus diambil dari ListenerTest di web/backend/monitor/tests.py.
const assert = require('node:assert');
const { SENSORS, parseReading } = require('./reading');

const rsr0 = changes => ({ ...Object.fromEntries(SENSORS.map(s => [s, 0.9])), ...changes });
const message = (changes = {}) => JSON.stringify({
  node: 'N1', seq: 1, ts: '2026-11-05T08:30:00+07:00', rsr0: rsr0(), suhu: 31.2, kelembapan: 74.5, ...changes,
});

const ok = parseReading('smarttps/N1/data', message()).reading;
assert.strictEqual(ok.waktu.toISOString(), '2026-11-05T01:30:00.000Z');
assert.deepStrictEqual([ok.node, ok.seq, ok.rsr0.mq136, ok.suhu, ok.kelembapan], ['N1', 1, 0.9, 31.2, 74.5]);

// ts tanpa zona dianggap WIB; ts, suhu, kelembapan boleh kosong
assert.strictEqual(parseReading('smarttps/N1/data', message({ ts: '2026-11-05 08:30:00' })).reading.waktu.toISOString(),
  '2026-11-05T01:30:00.000Z');
const now = new Date();
const empty = parseReading('smarttps/N1/data', message({ ts: null, suhu: null, kelembapan: null }), now).reading;
assert.deepStrictEqual([empty.waktu, empty.suhu, empty.kelembapan], [now, null, null]);

const invalid = [
  ['smarttps/N1/data', '{rusak'],
  ['smarttps/N1/data', '[1, 2]'],
  ['smarttps/N1/status', message()],
  ['smarttps/N1/data', message({ node: 'N2' })],
  ['smarttps/N1/data', message({ seq: '1' })],
  ['smarttps/N1/data', message({ seq: -1 })],
  ['smarttps/N1/data', message({ seq: 1.5 })],
  ['smarttps/N1/data', message({ rsr0: rsr0({ mq2: 'abc' }) })],
  ['smarttps/N1/data', message({ rsr0: rsr0({ mq3: true }) })],
  ['smarttps/N1/data', message({ rsr0: rsr0({ mq4: null }) })],
  ['smarttps/N1/data', message({ rsr0: { mq2: 0.9 } })],
  ['smarttps/N1/data', message({ suhu: '31' })],
  ['smarttps/N1/data', message({ ts: 'kemarin' })],
  ['smarttps/N1/data', message({ ts: '2026-13-05T08:30:00+07:00' })],
  ['smarttps/N1/data', message({ rsr0: rsr0({ mq8: 0 }) })],
  ['smarttps/N1/data', message({ rsr0: rsr0({ mq135: -0.5 }) })],
];
for (const [topic, payload] of invalid) {
  assert.ok(parseReading(topic, payload).error, `harus ditolak: ${topic} ${payload}`);
}
console.log(`OK: 3 pesan valid, ${invalid.length} pesan ditolak`);
