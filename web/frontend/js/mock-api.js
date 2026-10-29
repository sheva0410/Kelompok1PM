/*
 * SMART-TPS — lapisan data contoh (mock API).
 *
 * Setiap fungsi di objek `Api` meniru satu endpoint REST di proposal (Tabel 5.2).
 * Saat backend siap, ganti isi fungsi dengan fetch() ke endpoint yang tertulis di
 * komentarnya. Halaman lain hanya memanggil `Api.*`, jadi tidak perlu diubah.
 *
 * Data contoh disimpan di localStorage browser supaya sama di semua halaman.
 */
(function () {
  "use strict";

  var MIN = 60000;
  var OFFLINE_MS = 180000; // NFR-05: node tanpa data > 180 detik = tidak aktif
  var MAX_RANGE_MS = 7 * 24 * 60 * MIN; // batas rentang riwayat per permintaan
  var DB_KEY = "smarttps_mock_v1";
  var SESSION_KEY = "smarttps_session";
  var SIM_KEY = "smarttps_sim_error";

  var SENSORS = [
    { k: "mq2", n: "MQ-2", g: "LPG, asap", a: 0.45, r0: 9.8 },
    { k: "mq3", n: "MQ-3", g: "Alkohol", a: 0.30, r0: 61.2 },
    { k: "mq4", n: "MQ-4", g: "Metana (CH₄)", a: 0.55, r0: 20.4 },
    { k: "mq5", n: "MQ-5", g: "LPG, gas alam", a: 0.20, r0: 6.6 },
    { k: "mq6", n: "MQ-6", g: "LPG, butana", a: 0.22, r0: 10.1 },
    { k: "mq8", n: "MQ-8", g: "Hidrogen (H₂)", a: 0.25, r0: 70.3 },
    { k: "mq9", n: "MQ-9", g: "CO", a: 0.40, r0: 9.6 },
    { k: "mq135", n: "MQ-135", g: "NH₃, CO₂", a: 0.70, r0: 76.5 },
    { k: "mq136", n: "MQ-136", g: "H₂S", a: 0.65, r0: 34.8 }
  ];

  // Empat node bawaan punya sinyal contoh. Node yang didaftarkan admin belum punya data.
  var DEFAULT_NODES = [
    { id: "N1", nama: "Pojok barat laut, dekat pos jaga", x: 4, y: 3.5 },
    { id: "N2", nama: "Sisi selatan, dekat gerbang", x: 13.5, y: 13 },
    { id: "N3", nama: "Sisi barat, dekat saluran air", x: 3.5, y: 11.5 },
    { id: "N4", nama: "Sisi timur, dekat bak kontainer", x: 21, y: 7 }
  ];

  // f = nilai awal, t = nilai saat data contoh dibuat, d = perubahan per menit setelahnya, off = menit sejak node terputus
  var SCENARIOS = [
    { name: "Siang ramai", nodes: { N1: { f: .20, t: .22, d: 0 }, N2: { f: .30, t: .48, d: .002 }, N3: { f: .28, t: .30, d: 0, off: 9 }, N4: { f: .50, t: .84, d: .001 } } },
    { name: "Pagi normal", nodes: { N1: { f: .15, t: .16, d: 0 }, N2: { f: .22, t: .24, d: 0 }, N3: { f: .20, t: .19, d: 0 }, N4: { f: .30, t: .31, d: 0 } } },
    { name: "Setelah pengangkutan", nodes: { N1: { f: .30, t: .18, d: 0 }, N2: { f: .55, t: .30, d: -.001 }, N3: { f: .35, t: .22, d: 0 }, N4: { f: .82, t: .33, d: -.002 } } }
  ];

  var DEFAULT_ACCOUNTS = [
    { username: "pengelola", password: "pengelola123", role: "Pengelola", email: "pengelola@contoh.id" },
    { username: "admin", password: "admin123", role: "Admin", email: "admin@contoh.id" },
    { username: "warga", password: "warga123", role: "Warga", email: "warga@contoh.id" }
  ];

  /* ---------- penyimpanan ---------- */
  var mem = null;

  function freshDb(scen) {
    var T0 = Math.floor(Date.now() / MIN) * MIN;
    var r0 = {}, r0At = {};
    DEFAULT_NODES.forEach(function (n, i) {
      r0[n.id] = SENSORS.map(function (s, j) { return round1(s.r0 * (1 + 0.18 * (h32(i + 1, j + 1, 7) - 0.5))); });
      r0At[n.id] = T0 - (2 * 24 + i * 3) * 60 * MIN;
    });
    return {
      createdAt: T0,
      scen: scen || 0,
      nodes: DEFAULT_NODES.map(function (n) { return { id: n.id, nama: n.nama, x: n.x, y: n.y }; }),
      accounts: DEFAULT_ACCOUNTS.map(function (a) { return Object.assign({}, a); }),
      r0: r0,
      r0At: r0At,
      deletedBefore: {},
      sus: [],
      reports: [
        { id: 147, t: T0 - 12 * MIN, node: "N4", felt: 2, text: "Bau busuk sampai ke halte angkot di depan terminal, sudah dari jam satu siang.", status: "baru", by: null, pelapor: "warga", photo: null },
        { id: 146, t: T0 - 38 * MIN, node: "N2", felt: 1, text: "Air lindi menggenang di dekat gerbang, baunya terbawa angin ke warung.", status: "baru", by: null, pelapor: "warga2", photo: null },
        { id: 145, t: T0 - 132 * MIN, node: null, felt: 2, text: "Ada pembakaran sampah plastik di belakang TPS, asapnya masuk ke rumah.", status: "diproses", by: "pengelola", pelapor: "warga3", photo: null },
        { id: 144, t: T0 - 300 * MIN, node: "N4", felt: 1, text: "Bak kontainer penuh dan belum diangkut sejak Senin.", status: "diproses", by: "pengelola", pelapor: "warga", photo: null },
        { id: 143, t: T0 - 1200 * MIN, node: "N1", felt: 0, text: "Bau mulai tercium sejak pagi, belum terlalu parah.", status: "selesai", by: "pengelola", pelapor: "warga2", photo: null },
        { id: 142, t: T0 - 1500 * MIN, node: "N3", felt: 1, text: "Saluran air di sisi barat mampet, bau saat sore hari.", status: "selesai", by: "pengelola", pelapor: "warga3", photo: null }
      ]
    };
  }

  function db() {
    if (mem) return mem;
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (raw) { mem = JSON.parse(raw); return mem; }
    } catch (e) { /* localStorage tidak tersedia: pakai memori saja */ }
    mem = freshDb(0);
    save();
    return mem;
  }
  function save() { try { localStorage.setItem(DB_KEY, JSON.stringify(mem)); } catch (e) { /* abaikan */ } }

  function getSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) { return null; } }
  function setSession(s) { try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch (e) { /* abaikan */ } }
  function simError() { try { return sessionStorage.getItem(SIM_KEY) === "1"; } catch (e) { return false; } }

  /* ---------- util ---------- */
  function round1(v) { return Math.round(v * 10) / 10; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function h32(a, b, c) {
    var x = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x1b873593);
    x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }
  function hn(a, b, c) { var u = h32(a, b, c * 2 + 1) + 1e-9, v = h32(a, b, c * 2 + 2); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function hourOf(t) { var d = new Date(t); return d.getHours() + d.getMinutes() / 60; }
  function lvOf(s) { return s < 0.40 ? 0 : s < 0.68 ? 1 : 2; }
  function hhmm(t) { return new Date(t).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }); }
  function delay(v) { return new Promise(function (res) { setTimeout(function () { res(v); }, 150); }); }
  function fail(msg, extra) {
    var err = new Error(msg); if (extra) Object.assign(err, extra);
    return new Promise(function (res, rej) { setTimeout(function () { rej(err); }, 150); });
  }
  // Simulasi server mati (diatur dari halaman Kelola node) untuk menguji tampilan error
  function guard() { return simError() ? fail("Server tidak merespons. Periksa koneksi, lalu coba lagi.", { network: true }) : null; }
  function signalIndex(id) { for (var i = 0; i < DEFAULT_NODES.length; i++) if (DEFAULT_NODES[i].id === id) return i; return -1; }
  function findNode(id) { return db().nodes.filter(function (n) { return n.id === id; })[0] || null; }

  /* ---------- sinyal sensor contoh (fungsi murni dari waktu) ---------- */
  var RAMP = 25, BLEND = 60;
  function intensity(ni, k) {
    var d = db(), id = DEFAULT_NODES[ni].id, c = SCENARIOS[d.scen].nodes[id];
    var h = hourOf(k * MIN), ph = ni * 1.7;
    var e = 0.055 * Math.sin(k / 37 + ph) + 0.035 * Math.sin(k / 11.3 + ph * 2) + 0.02 * hn(ni + 1, k, 1);
    var off = [-0.08, 0, -0.05, 0.18][ni];
    var v = 0.2 + 0.28 * Math.max(0, Math.sin((h - 7) / 12 * Math.PI)) + off + e;
    var kEnd = Math.floor(d.createdAt / MIN) - (c.off || 0);
    var fe = kEnd - k, target, w;
    if (fe < 0) { target = c.t + c.d * (-fe); w = 1; }
    else {
      target = fe < RAMP ? c.t + (c.f - c.t) * (fe / (RAMP - 1)) : c.f;
      w = fe < RAMP ? 1 : fe < RAMP + BLEND ? 1 - (fe - RAMP) / BLEND : 0;
      w = w * w * (3 - 2 * w);
    }
    return clamp(v * (1 - w) + (target + e * 0.1) * w, 0.05, 0.98);
  }
  function lastMinute(ni) {
    var d = db(), c = SCENARIOS[d.scen].nodes[DEFAULT_NODES[ni].id];
    if (c.off) return Math.floor(d.createdAt / MIN) - c.off;
    return Math.floor(Date.now() / MIN);
  }
  function firstMinute(ni) {
    var del = db().deletedBefore[DEFAULT_NODES[ni].id];
    return del ? Math.floor(del / MIN) + 1 : -Infinity;
  }
  function reading(ni, k) {
    var s = intensity(ni, k), h = hourOf(k * MIN), ph = Math.sin(2 * Math.PI * (h - 9) / 24);
    var rel = SENSORS.map(function (sn, j) { return clamp(1 - sn.a * s * (1 + 0.06 * hn(ni + 11, k, j)) + 0.012 * hn(ni + 21, k, j), 0.12, 1.2); });
    return {
      t: k * MIN,
      level: lvOf(s),
      rel: rel,
      suhu: 28.6 + 3.4 * ph + [0, 0.6, -0.4, 0.9][ni] + 0.12 * hn(ni + 31, k, 0),
      rh: clamp(76 - 11 * ph + [0, -1.5, 2.5, -2][ni] + 0.5 * hn(ni + 41, k, 0), 35, 99)
    };
  }
  function levels(ni, k0, k1) { var out = []; for (var k = k0; k <= k1; k++) out.push(lvOf(intensity(ni, k))); return out; }
  function trendOf(arr) {
    // FR-07 / SDD M6: kemiringan regresi linear 15 prediksi terakhir, ambang ±0,05
    var a = arr.slice(-15), m = a.length, mx = (m - 1) / 2, my = 0, i;
    if (m < 2) return "stabil";
    for (i = 0; i < m; i++) my += a[i];
    my /= m;
    var cov = 0, vr = 0;
    for (i = 0; i < m; i++) { cov += (i - mx) * (a[i] - my); vr += (i - mx) * (i - mx); }
    var sl = cov / vr;
    return sl > 0.05 ? "naik" : sl < -0.05 ? "turun" : "stabil";
  }
  function nodeStatus(n) {
    var ni = signalIndex(n.id);
    if (ni < 0) return { id: n.id, nama: n.nama, x: n.x, y: n.y, active: false, noData: true, level: null, lastT: null, trend: "stabil", suhu: null, rh: null };
    var kl = lastMinute(ni), kf = firstMinute(ni), hasData = kl >= kf;
    var lastT = kl * MIN, r = hasData ? reading(ni, kl) : null;
    return {
      id: n.id, nama: n.nama, x: n.x, y: n.y,
      active: hasData && Date.now() - lastT <= OFFLINE_MS, noData: !hasData,
      level: r ? r.level : null, lastT: hasData ? lastT : null,
      trend: hasData ? trendOf(levels(ni, Math.max(kf, kl - 14), kl)) : "stabil",
      suhu: r ? r.suhu : null, rh: r ? r.rh : null
    };
  }
  function computeStatus() {
    var nodes = db().nodes.map(nodeStatus);
    var act = nodes.filter(function (n) { return n.active; });
    var level = act.length ? Math.max.apply(null, act.map(function (n) { return n.level; })) : null;
    var counts = [0, 0, 0], off = 0;
    nodes.forEach(function (n) { if (n.active) counts[n.level]++; else off++; });
    return {
      level: level, // FR-06: status TPS = tingkat tertinggi di antara node aktif
      counts: counts, offline: off,
      worst: act.filter(function (n) { return n.level === level; }).map(function (n) { return n.id; }),
      nodes: nodes, updatedAt: Date.now()
    };
  }
  function delivery(ni, k, salt) {
    // UC-03: sebagian pengiriman gagal lalu dicoba ulang 1 menit kemudian
    return h32(ni + 1, k, salt) < 0.15 ? { status: "terkirim", attempts: 2, failedAt: k * MIN, sentAt: k * MIN + MIN } : { status: "terkirim", attempts: 1, sentAt: k * MIN };
  }
  function computeNotifications(hours) {
    // FR-10: Tinggi 3x berturut-turut (tidak diulang 30 menit) atau node berhenti mengirim data
    var out = [], span = Math.round((hours || 6) * 60);
    db().nodes.forEach(function (n) {
      var ni = signalIndex(n.id);
      if (ni < 0) return;
      var kl = lastMinute(ni), k0 = Math.max(firstMinute(ni), kl - span), run = 0, last = -Infinity;
      for (var k = k0; k <= kl; k++) {
        var t = k * MIN;
        if (lvOf(intensity(ni, k)) === 2) run++; else run = 0;
        if (run >= 3 && t - last >= 30 * MIN) {
          out.push(Object.assign({ id: n.id + "-t-" + k, node: n.id, level: 2, t: t, jenis: "tinggi", kanal: "n8n", pesan: n.id + " berstatus Tinggi 3 kali berturut-turut" }, delivery(ni, k, 5)));
          last = t;
        }
      }
      if (kl >= firstMinute(ni) && Date.now() - kl * MIN > OFFLINE_MS) {
        var ko = kl + 3;
        out.push(Object.assign({ id: n.id + "-o-" + kl, node: n.id, level: null, t: ko * MIN, jenis: "offline", kanal: "n8n", pesan: n.id + " tidak mengirim data sejak " + hhmm(kl * MIN) }, delivery(ni, ko, 6)));
      }
    });
    out.sort(function (a, b) { return b.t - a.t; });
    return out;
  }
  function currentUser() {
    var s = getSession();
    if (!s) return null;
    var acc = db().accounts.filter(function (a) { return a.username === s.username; })[0];
    return acc ? { username: acc.username, role: acc.role, email: acc.email } : null;
  }
  function needUser(roles) {
    var u = currentUser();
    if (!u) return { err: fail("Sesi berakhir. Silakan masuk lagi.", { auth: true }) };
    if (roles && roles.indexOf(u.role) < 0) return { err: fail("Anda tidak punya akses untuk tindakan ini.", { forbidden: true }) };
    return { user: u };
  }
  function validEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }

  /* ---------- API ---------- */
  var Api = {
    SENSORS: SENSORS,
    OFFLINE_MS: OFFLINE_MS,
    MAX_RANGE_MS: MAX_RANGE_MS,

    // POST /api/auth/login → { token }
    login: function (username, password) {
      var acc = db().accounts.filter(function (a) { return a.username === username.trim(); })[0];
      if (!acc || acc.password !== password) return fail("Username atau password salah.");
      setSession({ token: "mock-" + acc.username + "-" + Date.now(), username: acc.username });
      return delay({ username: acc.username, role: acc.role });
    },
    // POST /api/auth/register → akun Warga baru
    register: function (data) {
      var g = guard(); if (g) return g;
      var errors = checkAccount(data);
      if (Object.keys(errors).length) return Promise.reject(Object.assign(new Error("Data belum valid."), { fields: errors }));
      db().accounts.push({ username: data.username.trim(), password: data.password, role: "Warga", email: data.email.trim() });
      save();
      return delay({ username: data.username.trim(), role: "Warga" });
    },
    // GET /api/auth/profile
    profile: function () { var u = currentUser(); return u ? delay(u) : fail("Sesi berakhir. Silakan masuk lagi.", { auth: true }); },
    logout: function () { setSession(null); return Promise.resolve(); },

    // GET /api/status → status TPS gabungan dan tingkat tiap node
    getStatus: function () { var g = guard(); return g || delay(computeStatus()); },

    // GET /api/nodes/{id}/readings?from=&to=
    getReadings: function (id, fromT, toT) {
      var g = guard(); if (g) return g;
      var node = findNode(id);
      if (!node) return fail("Node " + id + " tidak ditemukan.", { notFound: true });
      if (!(toT > fromT)) return fail("Waktu akhir harus setelah waktu awal.");
      if (toT - fromT > MAX_RANGE_MS + MIN) return fail("Rentang maksimal 7 hari.");
      var ni = signalIndex(id);
      if (ni < 0) return delay([]);
      var kl = Math.min(lastMinute(ni), Math.floor(toT / MIN)), k0 = Math.max(firstMinute(ni), Math.ceil(fromT / MIN)), out = [];
      for (var k = k0; k <= kl; k++) out.push(reading(ni, k));
      return delay(out);
    },

    // GET /api/notifications?hours= (riwayat tabel NOTIFICATION)
    getNotifications: function (hours) {
      var g = guard(); if (g) return g;
      var c = needUser(); if (c.err) return c.err;
      return delay(computeNotifications(hours));
    },

    // GET /api/reports (pengelola: semua, warga: miliknya)
    getReports: function () {
      var g = guard(); if (g) return g;
      var c = needUser(); if (c.err) return c.err;
      var list = db().reports.slice().sort(function (a, b) { return b.t - a.t; });
      if (c.user.role === "Warga") list = list.filter(function (r) { return r.pelapor === c.user.username; });
      return delay(list.map(function (r) { return Object.assign({ sensorLevel: sensorLevelAt(r.node, r.t) }, r); }));
    },
    // POST /api/reports
    createReport: function (data) {
      var g = guard(); if (g) return g;
      var c = needUser(["Warga"]); if (c.err) return c.err;
      var id = Math.max.apply(null, db().reports.map(function (r) { return r.id; }).concat([141])) + 1;
      var rep = { id: id, t: Date.now(), node: data.node || null, felt: data.felt, text: data.text, status: "baru", by: null, pelapor: c.user.username, photo: data.photo || null };
      db().reports.push(rep);
      save();
      return delay(rep);
    },
    // PATCH /api/reports/{id}
    updateReport: function (id, status) {
      var g = guard(); if (g) return g;
      var c = needUser(["Pengelola", "Admin"]); if (c.err) return c.err;
      var rep = db().reports.filter(function (r) { return r.id === id; })[0];
      if (!rep) return fail("Laporan tidak ditemukan.");
      rep.status = status;
      rep.by = status === "baru" ? null : c.user.username;
      save();
      return delay(rep);
    },

    // GET /api/nodes
    getNodes: function () {
      var g = guard(); if (g) return g;
      var d = db();
      return delay(d.nodes.map(function (n) {
        return Object.assign({ r0: d.r0[n.id] ? d.r0[n.id].slice() : null, r0At: d.r0At[n.id] || null, hasSignal: signalIndex(n.id) >= 0 }, n);
      }));
    },
    // POST /api/nodes → daftarkan node baru (NFR-07: tanpa mengubah kode server)
    addNode: function (data) {
      var g = guard(); if (g) return g;
      var c = needUser(["Admin"]); if (c.err) return c.err;
      var id = (data.id || "").trim().toUpperCase(), nama = (data.nama || "").trim(), errors = {};
      if (!/^N\d{1,3}$/.test(id)) errors.id = "ID node berformat N diikuti angka, misalnya N5.";
      else if (findNode(id)) errors.id = "ID " + id + " sudah dipakai.";
      if (nama.length < 3) errors.nama = "Tulis lokasi node minimal 3 karakter.";
      var x = Number(data.x), y = Number(data.y);
      if (!(x >= 0 && x <= 26)) errors.x = "Posisi x antara 0 dan 26 m.";
      if (!(y >= 0 && y <= 15)) errors.y = "Posisi y antara 0 dan 15 m.";
      if (Object.keys(errors).length) return Promise.reject(Object.assign(new Error("Data node belum valid."), { fields: errors }));
      db().nodes.push({ id: id, nama: nama, x: x, y: y });
      db().r0[id] = null; db().r0At[id] = null;
      save();
      return delay({ id: id });
    },
    // PUT /api/nodes/{id} → ubah nama lokasi
    updateNode: function (id, data) {
      var g = guard(); if (g) return g;
      var c = needUser(["Admin"]); if (c.err) return c.err;
      var n = findNode(id), nama = (data.nama || "").trim();
      if (!n) return fail("Node tidak ditemukan.");
      if (nama.length < 3) return Promise.reject(Object.assign(new Error("Tulis lokasi node minimal 3 karakter."), { fields: { nama: "Tulis lokasi node minimal 3 karakter." } }));
      n.nama = nama; save();
      return delay(true);
    },
    // DELETE /api/nodes/{id}
    deleteNode: function (id) {
      var g = guard(); if (g) return g;
      var c = needUser(["Admin"]); if (c.err) return c.err;
      if (db().nodes.length <= 1) return fail("Minimal harus ada satu node.");
      db().nodes = db().nodes.filter(function (n) { return n.id !== id; });
      delete db().r0[id]; delete db().r0At[id];
      save();
      return delay(true);
    },
    // PUT /api/nodes/{id} → posisi pada denah
    saveNodePositions: function (list) {
      var g = guard(); if (g) return g;
      list.forEach(function (p) { var n = findNode(p.id); if (n) { n.x = p.x; n.y = p.y; } });
      save();
      return delay(true);
    },
    // PUT /api/nodes/{id}/r0 → hasil ukur ulang udara bersih (NFR-09)
    measureR0: function (id) {
      var g = guard(); if (g) return g;
      var d = db(), seed = Date.now() % 100000;
      d.r0[id] = SENSORS.map(function (s, j) { return round1(s.r0 * (1 + 0.18 * (h32(seed, j + 1, 3) - 0.5))); });
      d.r0At[id] = Date.now();
      save();
      return delay(true);
    },
    // DELETE /api/nodes/{id}/readings (hapus histori, khusus admin)
    deleteReadings: function (id) { var g = guard(); if (g) return g; db().deletedBefore[id] = Date.now(); save(); return delay(true); },

    // GET /api/export?node=&from=&to= → teks CSV
    exportCsv: function (id, fromT, toT) {
      return Api.getReadings(id, fromT, toT).then(function (rows) {
        var LV = ["rendah", "sedang", "tinggi"];
        var head = ["waktu", "node"].concat(SENSORS.map(function (s) { return s.k; })).concat(["suhu", "kelembapan", "tingkat_bau"]);
        var lines = rows.map(function (r) {
          return [new Date(r.t).toISOString(), id].concat(r.rel.map(function (v) { return v.toFixed(3); })).concat([r.suhu.toFixed(1), r.rh.toFixed(0), LV[r.level]]).join(",");
        });
        var stamp = function (t) { var d = new Date(t); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") + "-" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0"); };
        return { name: "histori_" + id + "_" + stamp(fromT) + "_" + stamp(toT) + ".csv", text: head.join(",") + "\n" + lines.join("\n") + "\n", rows: rows.length };
      });
    },

    // GET /api/accounts
    getAccounts: function () {
      var g = guard(); if (g) return g;
      return delay(db().accounts.map(function (a) { return { username: a.username, role: a.role, email: a.email }; }));
    },
    // POST /api/accounts → akun pengelola/admin baru
    addAccount: function (data) {
      var g = guard(); if (g) return g;
      var c = needUser(["Admin"]); if (c.err) return c.err;
      var errors = checkAccount(data);
      if (["Pengelola", "Admin", "Warga"].indexOf(data.role) < 0) errors.role = "Pilih peran.";
      if (Object.keys(errors).length) return Promise.reject(Object.assign(new Error("Data akun belum valid."), { fields: errors }));
      db().accounts.push({ username: data.username.trim(), password: data.password, role: data.role, email: data.email.trim() });
      save();
      return delay(true);
    },
    // DELETE /api/accounts/{username}
    deleteAccount: function (username) {
      var g = guard(); if (g) return g;
      var c = needUser(["Admin"]); if (c.err) return c.err;
      if (username === c.user.username) return fail("Akun yang sedang dipakai tidak bisa dihapus.");
      db().accounts = db().accounts.filter(function (a) { return a.username !== username; });
      save();
      return delay(true);
    },

    // PUT /api/auth/password
    changePassword: function (oldP, newP) {
      var g = guard(); if (g) return g;
      var c = needUser(); if (c.err) return c.err;
      var acc = db().accounts.filter(function (a) { return a.username === c.user.username; })[0], errors = {};
      if (acc.password !== oldP) errors.old = "Password lama tidak cocok.";
      if ((newP || "").length < 8) errors.new = "Password baru minimal 8 karakter.";
      else if (newP === oldP) errors.new = "Password baru harus berbeda dari password lama.";
      if (Object.keys(errors).length) return Promise.reject(Object.assign(new Error("Password belum diganti."), { fields: errors }));
      acc.password = newP; save();
      return delay(true);
    },
    // PUT /api/auth/profile → ubah email
    updateEmail: function (email) {
      var g = guard(); if (g) return g;
      var c = needUser(); if (c.err) return c.err;
      var e = (email || "").trim(), msg = "";
      if (!validEmail(e)) msg = "Format email belum benar.";
      else if (db().accounts.some(function (a) { return a.username !== c.user.username && a.email.toLowerCase() === e.toLowerCase(); })) msg = "Email sudah dipakai akun lain.";
      if (msg) return Promise.reject(Object.assign(new Error(msg), { fields: { email: msg } }));
      db().accounts.forEach(function (a) { if (a.username === c.user.username) a.email = e; });
      save();
      return delay(true);
    },

    // POST /api/sus → satu jawaban kuesioner SUS (Lampiran E)
    submitSus: function (data) {
      var g = guard(); if (g) return g;
      var c = needUser(); if (c.err) return c.err;
      var ans = data.answers || [], errors = {};
      if (!(data.kode || "").trim()) errors.kode = "Isi nama atau kode partisipan.";
      if (!data.peran) errors.peran = "Pilih peran saat pengujian.";
      if (ans.length !== 10 || ans.some(function (v) { return !(v >= 1 && v <= 5); })) errors.answers = "Jawab kesepuluh pernyataan.";
      if (Object.keys(errors).length) return Promise.reject(Object.assign(new Error("Kuesioner belum lengkap."), { fields: errors }));
      var list = db().sus || (db().sus = []);
      var rec = { id: (list.length ? Math.max.apply(null, list.map(function (r) { return r.id; })) : 0) + 1, t: Date.now(), kode: data.kode.trim(), peran: data.peran, platform: data.platform || "Dashboard web", answers: ans.slice(), score: susScore(ans), by: c.user.username };
      list.push(rec); save();
      return delay(rec);
    },
    // GET /api/sus (rekap, khusus admin)
    getSusResponses: function () {
      var g = guard(); if (g) return g;
      var c = needUser(["Admin"]); if (c.err) return c.err;
      return delay((db().sus || []).slice().sort(function (a, b) { return a.t - b.t; }));
    },
    // DELETE /api/sus/{id}
    deleteSus: function (id) {
      var g = guard(); if (g) return g;
      var c = needUser(["Admin"]); if (c.err) return c.err;
      db().sus = (db().sus || []).filter(function (r) { return r.id !== id; }); save();
      return delay(true);
    },
    susScore: function (ans) { return susScore(ans); },

    // Khusus mockup: atur data contoh
    mock: {
      scenarios: SCENARIOS.map(function (s) { return s.name; }),
      getScenario: function () { return db().scen; },
      setScenario: function (i) { var keep = db().accounts, sus = db().sus; mem = freshDb(i); mem.accounts = keep; mem.sus = sus || []; save(); },
      reset: function () { mem = freshDb(0); save(); setSession(null); },
      getSimError: simError,
      setSimError: function (on) { try { if (on) sessionStorage.setItem(SIM_KEY, "1"); else sessionStorage.removeItem(SIM_KEY); } catch (e) { /* abaikan */ } }
    }
  };

  // Lampiran F: ganjil (skor − 1), genap (5 − skor), jumlah × 2,5 → 0–100
  function susScore(ans) {
    var sum = 0;
    for (var i = 0; i < 10; i++) sum += i % 2 === 0 ? ans[i] - 1 : 5 - ans[i];
    return sum * 2.5;
  }
  function checkAccount(data) {
    var u = (data.username || "").trim(), e = (data.email || "").trim(), p = data.password || "", errors = {};
    if (!/^[a-z0-9._]{3,30}$/i.test(u)) errors.username = "Username 3–30 karakter: huruf, angka, titik, atau garis bawah.";
    else if (db().accounts.some(function (a) { return a.username.toLowerCase() === u.toLowerCase(); })) errors.username = "Username sudah dipakai.";
    if (!validEmail(e)) errors.email = "Format email belum benar.";
    else if (db().accounts.some(function (a) { return a.email.toLowerCase() === e.toLowerCase(); })) errors.email = "Email sudah terdaftar.";
    if (p.length < 8) errors.password = "Password minimal 8 karakter.";
    return errors;
  }
  function sensorLevelAt(id, t) {
    if (!id) return null;
    var ni = signalIndex(id), k = Math.floor(t / MIN);
    if (ni < 0 || k > lastMinute(ni) || k < firstMinute(ni)) return null;
    return lvOf(intensity(ni, k));
  }

  window.Api = Api;
})();
