(function () {
  "use strict";
  var MIN = UI.MIN;
  var page = document.getElementById("page"), user = null, lastUpdate = 0, map = null, built = false, failedOnce = false, lastData = null;

  UI.requireAuth().then(function (u) {
    user = u;
    UI.navbar(user, "dashboard");
    buildLayout(); built = true;
    showSkeleton();
    load();
    setInterval(load, 60000); // Tabel 5.5: data diperbarui otomatis tiap 60 detik
    setInterval(tickAgo, 1000);
    document.addEventListener("smarttps:online", load);
  }, function () {});

  function showSkeleton() {
    document.getElementById("statusSlot").innerHTML = '<div class="glass tps-card"><div class="pad-skel">' + UI.skel(110, "dark") + UI.skel(20, "dark") + UI.skel(64, "dark") + UI.skel(44, "dark") + "</div></div>";
    document.getElementById("map").innerHTML = '<div class="map-skel">' + UI.skel(420, "dark") + "</div>";
    document.getElementById("cards").innerHTML = [0, 1, 2, 3].map(function () { return '<div class="ncard">' + UI.skel(18) + UI.skel(34) + UI.skel(54) + "</div>"; }).join("");
    document.getElementById("reports").innerHTML = "<li>" + UI.skel(60) + "</li>";
  }
  function showError(err) {
    var slot = document.getElementById("statusSlot");
    slot.style.gridColumn = "1 / -1"; // kotak error memakai lebar penuh band
    UI.errorState(slot, err, function () { slot.style.gridColumn = ""; showSkeleton(); load(); }, { dark: true });
    document.getElementById("map").innerHTML = "";
    document.getElementById("cards").innerHTML = "";
    document.getElementById("reports").innerHTML = '<li class="empty">Laporan belum bisa dimuat.</li>';
    page.querySelectorAll("[data-ago]").forEach(function (el) { el.textContent = "–"; });
  }

  function load() {
    Api.getStatus().then(function (st) {
      var to = Date.now();
      return Promise.all([
        st, Api.getNotifications(), Api.getReports(),
        Promise.all(st.nodes.map(function (n) { return Api.getReadings(n.id, to - 60 * MIN, to); }))
      ]);
    }).then(function (res) {
      var st = res[0], notifs = res[1], reports = res[2], series = res[3];
      lastUpdate = st.updatedAt; failedOnce = false;
      if (user.role === "Warga") fillWarga(st, notifs, reports);
      else fillPengelola(st, notifs, reports);
      fillCards(st, series);
      lastData = { st: st, series: series };
      if (!map) map = UI.mountMap(document.getElementById("map"), st.nodes, { prefix: "m", link: function (n) { return "node.html?id=" + n.id; }, autoRotate: true });
      else map.update(st.nodes);
      tickAgo();
      if (!tourDone) { tourDone = true; setTimeout(startTour, 500); }
    }, function (err) {
      if (UI.handleAuth(err)) return;
      if (lastData) {
        // pembaruan otomatis gagal: data lama tetap tampil
        if (!failedOnce) UI.toast("Gagal memperbarui data. Menampilkan data pukul " + UI.time(lastUpdate) + ". Mencoba lagi tiap 60 detik.");
        failedOnce = true;
        return;
      }
      if (map) { map = null; }
      showError(err);
    });
  }
  function tickAgo() { page.querySelectorAll("[data-ago]").forEach(function (el) { el.textContent = lastUpdate ? UI.ago(Date.now() - lastUpdate) : "–"; }); }
  function byId(st, id) { return st.nodes.filter(function (n) { return n.id === id; })[0]; }

  /* ---------- kerangka ---------- */
  function buildLayout() {
    var warga = user.role === "Warga";
    page.innerHTML =
      '<section class="deck"><div class="wrap deck-inner">' +
        '<div class="page-head"><p class="eyebrow">TPS Terminal Rajabasa · 4 node · 9 sensor gas</p>' +
          "<h1>" + (warga ? "Halo, " + UI.esc(user.username) : "Dashboard pemantauan") + "</h1>" +
          "<p>Diperbarui <span data-ago></span> · otomatis tiap 60 detik</p></div>" +
        '<div class="deck-grid"><div id="statusSlot"></div><div id="map"></div></div>' +
      "</div></section>" +
      '<div class="wrap page">' +
        '<div class="sec-head"><div><h2>' + (warga ? "Titik pemantau" : "Kondisi tiap node") + "</h2><p>Grafik tingkat bau 60 menit terakhir · tren dari 15 pembacaan terakhir</p></div></div>" +
        '<div class="node-cards" id="cards"></div>' +
        (warga
          ? '<div class="grid2"><section class="panel"><div class="ph"><h2>Laporan saya</h2><div class="end"><a class="btn" href="lapor.html">Lihat semua</a></div></div><ul class="rlist" id="reports"></ul></section>' +
            '<section class="panel"><div class="ph"><h2>Pemberitahuan</h2></div><ul class="notifs pb" id="notifs"></ul></section></div>'
          : '<section class="panel"><div class="ph"><h2>Laporan warga terbaru</h2><span class="sub" id="repSub"></span><div class="end"><a class="btn" href="laporan.html">Buka semua laporan</a></div></div><ul class="rlist" id="reports"></ul></section>') +
      "</div>";
  }

  /* ---------- pengelola & admin ---------- */
  function fillPengelola(st, notifs, reports) {
    var head;
    if (st.level === 2) head = st.worst.join(", ") + " butuh tindakan. Tingkat bau tinggi di " + byId(st, st.worst[0]).nama.toLowerCase() + ".";
    else if (st.level === 1) head = "Bau mulai terasa di " + st.worst.join(", ") + ". Pantau tren dalam 15 menit ke depan.";
    else if (st.level === 0) head = "Semua node aktif mencatat tingkat bau rendah.";
    else head = "Tidak ada node yang mengirim data.";
    var cls = UI.lvCls(st.level, st.level != null);
    document.getElementById("statusSlot").innerHTML =
      '<aside class="glass tps-card ' + cls + '">' +
        '<div class="tps-top ' + cls + '"><small>Status TPS</small><strong>' + UI.lvName(st.level, st.level != null) + "</strong></div>" +
        '<div class="tps-body"><div class="tps-head">' + UI.esc(head) + "</div>" +
          '<div class="tps-counts">' +
            countBox(st.counts[2], "tinggi", "lv-2") + countBox(st.counts[1], "sedang", "lv-1") + countBox(st.counts[0], "rendah", "lv-0") + countBox(st.offline, "nonaktif", "lv-off") +
          "</div>" +
          (notifs.length ? '<div class="tps-alerts">' + notifs.slice(0, 2).map(function (n) {
            return '<div class="al ' + UI.lvCls(n.level, n.level != null) + '"><time>' + UI.time(n.t) + "</time><span>" + UI.esc(n.pesan) + "</span></div>";
          }).join("") + "</div>" : "") +
          '<div class="tps-foot"><span class="live-dot"></span><span>Status TPS = node aktif dengan tingkat bau tertinggi</span><a class="tps-more" href="notifikasi.html">Semua notifikasi</a></div>' +
        "</div></aside>";
    var baru = reports.filter(function (r) { return r.status === "baru"; }).length;
    document.getElementById("repSub").textContent = baru + " baru";
    document.getElementById("reports").innerHTML = reports.slice(0, 4).map(reportRow).join("") || '<li class="empty">Belum ada laporan.</li>';
  }
  function countBox(n, label, cls) { return "<div><b>" + n + '</b><span><i class="dot ' + cls + '"></i>' + label + "</span></div>"; }

  /* ---------- warga ---------- */
  function fillWarga(st, notifs, reports) {
    var w = st.worst.length ? byId(st, st.worst[0]) : null, msg;
    if (st.level === 2) msg = "Bau menyengat di " + w.nama.toLowerCase() + ". Kurangi waktu di dekat sisi itu dan tutup jendela jika rumah Anda dekat TPS.";
    else if (st.level === 1) msg = "Bau mulai tercium di " + w.nama.toLowerCase() + ". Belum parah, tetapi bisa mengganggu.";
    else if (st.level === 0) msg = "Bau di sekitar TPS tidak mengganggu saat ini.";
    else msg = "Alat pemantau belum mengirim data. Coba lagi beberapa menit lagi.";
    document.getElementById("statusSlot").innerHTML =
      '<section class="hero ' + UI.lvCls(st.level, st.level != null) + '"><small>Kondisi sekarang</small><strong>' + (st.level == null ? "Tidak ada data" : "Bau " + UI.LV[st.level]) + "</strong><p>" + UI.esc(msg) + '</p><a class="btn hero-cta" href="lapor.html">Laporkan bau</a></section>';
    document.getElementById("notifs").innerHTML = notifs.slice(0, 4).map(function (n) {
      return '<li><i class="dot ' + UI.lvCls(n.level, n.level != null) + '"></i><div><div>' + UI.esc(n.pesan) + '</div><div class="muted mono small">' + UI.time(n.t) + "</div></div></li>";
    }).join("") || '<li class="muted">Belum ada pemberitahuan.</li>';
    document.getElementById("reports").innerHTML = reports.slice(0, 3).map(reportRow).join("") || '<li class="empty">Anda belum pernah mengirim laporan.</li>';
  }

  /* ---------- kartu node ---------- */
  function fillCards(st, series) {
    var host = document.getElementById("cards"), to = Date.now();
    host.innerHTML = st.nodes.map(function (n) {
      var cls = UI.lvCls(n.level, n.active);
      var facts = n.noData ? "<span>Belum mengirim data</span>"
        : n.active ? "<span>" + UI.num(n.suhu, 1) + " °C</span><span>" + Math.round(n.rh) + "% RH</span>"
        : "<span>Data terakhir " + (n.lastT ? UI.time(n.lastT) : "–") + "</span>";
      return '<a class="ncard ' + cls + '" href="node.html?id=' + n.id + '">' +
        '<div class="ncard-top"><span class="ncard-id">' + n.id + '</span><span class="ncard-loc">' + UI.esc(n.nama) + "</span></div>" +
        '<div class="ncard-lv"><strong>' + UI.nodeName(n) + "</strong>" + (n.active ? UI.trend(n.trend) : "") + "</div>" +
        '<div class="chart" data-card="' + n.id + '"></div>' +
        '<div class="ncard-facts">' + facts + "</div></a>";
    }).join("");
    st.nodes.forEach(function (n, i) {
      var el = host.querySelector('[data-card="' + n.id + '"]');
      UI.chart(el, {
        pts: series[i].map(function (r) { return { t: r.t, v: r.level }; }), tmin: to - 60 * MIN, tmax: to, h: 54,
        yMin: -0.4, yMax: 2.4, step: true, compact: true, levelGradient: true, fmt: function (v) { return UI.LV[Math.round(v)]; }
      });
    });
  }

  function reportRow(r) {
    return '<li><div class="rmeta"><span class="pill lv-' + r.felt + '">' + UI.FELT[r.felt].n + "</span><span>#0" + r.id + "</span><span>" + (r.node || "titik tidak disebut") + "</span><span>" + UI.ago(Date.now() - r.t) + '</span><span class="st st-' + r.status + '">' + UI.REPORT_STATUS[r.status] + '</span></div><p class="rtext">' + UI.esc(r.text) + "</p></li>";
  }

  /* ---------- panduan pengguna baru ---------- */
  var tourDone = false;
  function startTour() {
    var steps = user.role === "Warga" ? [
      { sel: "#statusSlot", title: "Kondisi bau sekarang", text: "Kotak berwarna ini menunjukkan kondisi bau di TPS saat ini. Hijau berarti rendah, kuning sedang, merah tinggi. Data diperbarui tiap menit." },
      { sel: "#map", title: "Denah TPS", text: "Ada empat titik pemantau di sekitar TPS. Seret denah untuk memutar, lalu klik titik untuk melihat detailnya." },
      { sel: ".hero-cta", title: "Laporkan bau", text: "Mencium bau menyengat? Tekan tombol ini, pilih seberapa bau, lalu ceritakan singkat. Laporan langsung masuk ke pengelola TPS." },
      { sel: "#reports", title: "Pantau laporan Anda", text: "Laporan yang Anda kirim muncul di sini beserta statusnya: Baru, Diproses, atau Selesai." }
    ] : [
      { sel: "#statusSlot", title: "Status TPS", text: "Status TPS diambil dari node aktif yang tingkat baunya paling tinggi. Di bawahnya ada jumlah node per tingkat dan notifikasi terbaru." },
      { sel: "#map", title: "Denah 3D", text: "Seret untuk memutar, pakai + dan − untuk zoom, dan klik node untuk membuka detailnya. Tombol 2D mengganti ke denah datar." },
      { sel: "#cards", title: "Kondisi tiap node", text: "Setiap kartu menunjukkan tingkat bau, tren 15 pembacaan terakhir, suhu, kelembapan, dan grafik 60 menit. Klik kartu untuk melihat riwayat dan mengekspor CSV." },
      { sel: ".nav", title: "Laporan dan notifikasi", text: "Buka Laporan warga untuk menindaklanjuti keluhan, dan Notifikasi untuk melihat riwayat peringatan yang dikirim." + (user.role === "Admin" ? " Menu Kelola node untuk mendaftarkan node dan mengukur R0." : "") }
    ];
    UI.tour(user, steps);
  }

  var rz, lastW = window.innerWidth;
  window.addEventListener("resize", function () {
    if (window.innerWidth === lastW) return; // abaikan perubahan tinggi (bilah alamat HP)
    lastW = window.innerWidth;
    cancelAnimationFrame(rz);
    rz = requestAnimationFrame(function () { if (lastData) fillCards(lastData.st, lastData.series); });
  });
})();
