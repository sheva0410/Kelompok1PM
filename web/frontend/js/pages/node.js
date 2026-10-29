(function () {
  "use strict";
  var MIN = UI.MIN, S = Api.SENSORS, DAY = 24 * 60 * MIN;
  // preset = menit terakhir (60/360/1440); custom = rentang tanggal pilihan pengguna (UC-02, UC-08)
  var state = { id: UI.qs("id") || "N1", tab: "level", preset: 360, custom: null, page: 1, rows: null, user: null, map: null, loadedAt: 0, failedOnce: false };
  var PER_PAGE = 10;

  UI.requireAuth().then(function (u) {
    state.user = u;
    UI.navbar(u, "dashboard");
    renderActions();
    showLoading();
    load();
    setInterval(function () { if (!state.custom) load(true); }, 60000);
    document.addEventListener("smarttps:online", function () { load(true); });
  }, function () {});

  function range() {
    if (state.custom) return state.custom;
    var to = Date.now();
    return { from: to - state.preset * MIN, to: to };
  }
  function rangeText() {
    if (!state.custom) return state.preset >= 60 ? (state.preset / 60) + " jam terakhir" : state.preset + " menit terakhir";
    return UI.dateTime(state.custom.from) + " – " + UI.dateTime(state.custom.to);
  }

  function showLoading() {
    document.getElementById("nodeInfo").innerHTML = '<div class="pad">' + UI.skel(90, "dark") + UI.skel(22, "dark") + UI.skel(120, "dark") + "</div>";
    document.getElementById("chartArea").innerHTML = UI.skel(240);
    document.getElementById("histTable").innerHTML = UI.skel(200);
  }

  function load(isRefresh) {
    var r = range();
    Promise.all([Api.getStatus(), Api.getReadings(state.id, r.from, r.to)]).then(function (res) {
      state.failedOnce = false;
      state.loadedAt = Date.now();
      var n = res[0].nodes.filter(function (x) { return x.id === state.id; })[0];
      if (!n) {
        document.getElementById("nodeInfo").innerHTML = '<div class="pad"><p class="empty">Node ' + UI.esc(state.id) + ' tidak ditemukan. <a href="dashboard.html">Kembali ke dashboard</a>.</p></div>';
        document.getElementById("chartArea").innerHTML = ""; document.getElementById("histTable").innerHTML = "";
        return;
      }
      state.node = n;
      state.rows = res[1];
      document.title = n.id + " · SMART-TPS";
      renderTabs(res[0].nodes);
      renderHead(n);
      if (!state.map) state.map = UI.mountMap(document.getElementById("map"), res[0].nodes, {
        prefix: "n", focus: state.id, selected: state.id, legend: false,
        link: function (x) { return "node.html?id=" + x.id; }
      });
      else state.map.update(res[0].nodes, state.id);
      renderChart();
      renderHistory();
    }, function (err) {
      if (UI.handleAuth(err)) return;
      if (isRefresh && state.rows) {
        // data lama tetap tampil; beri tahu sekali saja
        if (!state.failedOnce) UI.toast("Gagal memperbarui data. Menampilkan data pukul " + UI.time(state.loadedAt) + ".");
        state.failedOnce = true;
        return;
      }
      UI.errorState(document.getElementById("nodeInfo"), err, function () { showLoading(); load(); }, { dark: true });
      UI.errorState(document.getElementById("chartArea"), err, null);
      document.getElementById("histTable").innerHTML = "";
      document.getElementById("pager").innerHTML = "";
    });
  }

  function renderTabs(nodes) {
    document.getElementById("nodeTabs").innerHTML = nodes.map(function (n) {
      return '<a href="node.html?id=' + n.id + '"' + (n.id === state.id ? ' aria-current="page"' : "") + '><i class="dot ' + UI.lvCls(n.level, n.active) + '"></i>' + n.id + "</a>";
    }).join("");
  }

  var DESC = [
    "Respons sensor dekat kondisi udara bersih. Bau tidak mengganggu.",
    "Respons sensor naik. Bau mulai tercium di sekitar titik ini.",
    "Respons sensor tinggi. Bau menyengat di sekitar titik ini."
  ];
  function renderHead(n) {
    var isWarga = state.user.role === "Warga", cls = UI.lvCls(n.level, n.active);
    var desc = n.noData ? "Node sudah terdaftar tetapi belum mengirim data. Periksa pemasangan perangkat dan nilai R0."
      : n.active ? DESC[n.level] : "Node tidak mengirim data lebih dari 3 menit. Periksa daya dan Wi-Fi di lokasi.";
    document.getElementById("nodeInfo").innerHTML =
      '<div class="tps-top ' + cls + '"><small>' + n.id + " · tingkat bau</small><strong>" + UI.nodeName(n) + "</strong></div>" +
      '<div class="pad">' +
        "<h1>" + UI.esc(n.nama) + "</h1>" +
        '<p class="muted" style="margin:0">' + desc + "</p>" +
        '<div class="node-facts">' +
          "<div><small>Tren</small>" + (n.active ? UI.trend(n.trend) : "<b>–</b>") + "</div>" +
          "<div><small>Data terakhir</small><b>" + (n.lastT ? UI.time(n.lastT) : "–") + "</b></div>" +
          "<div><small>Suhu</small><b>" + (n.suhu != null ? UI.num(n.suhu, 1) + " °C" : "–") + "</b></div>" +
          "<div><small>Kelembapan</small><b>" + (n.rh != null ? Math.round(n.rh) + "%" : "–") + "</b></div>" +
        "</div>" +
      "</div>" +
      (isWarga ? '<div class="node-cta"><span>Mencium bau di sekitar titik ini?</span><a class="btn primary" href="lapor.html?node=' + n.id + '">Laporkan bau</a></div>' : "");
  }

  /* ---------- grafik ---------- */
  function series(key, j) {
    return state.rows.map(function (r) { return { t: r.t, v: key === "rel" ? r.rel[j] : r[key] }; });
  }
  function renderChart() {
    if (!state.rows) return;
    var area = document.getElementById("chartArea"), r = range(), from = r.from, to = r.to, h = "";
    document.getElementById("rangeLabel").textContent = rangeText();
    if (!state.rows.length) {
      area.innerHTML = '<div class="state-box"><b>Data belum tersedia</b><p>' + (state.node && state.node.noData ? "Node ini belum pernah mengirim data." : "Tidak ada pembacaan pada rentang " + UI.esc(rangeText()) + ". Coba pilih rentang lain.") + "</p></div>";
      return;
    }
    if (state.tab === "level") {
      h = '<div class="chart" id="cLevel"></div><p class="note">Tingkat bau tiap menit dari centroid K-Means terdekat. Pada rentang panjang, satu titik grafik mewakili tingkat tertinggi dalam kelompok menit itu.</p>';
    } else if (state.tab === "mq") {
      h = '<div class="spark-grid">' + S.map(function (s, j) {
        var last = state.rows[state.rows.length - 1].rel[j];
        return '<div class="spark"><div class="sh"><span class="sn">' + s.n + '</span><span class="sv">' + UI.num(last) + '</span></div><div class="sg">' + s.g + '</div><div class="chart" data-spark="' + j + '"></div></div>';
      }).join("") + '</div><p class="note">Nilai relatif Rs/R0. Garis putus-putus = 1,00 (udara bersih). Makin jauh di bawah 1, makin kuat respons sensor terhadap gas. Skala sama untuk semua sensor.</p>';
    } else {
      h = '<div class="charts-2"><div><p class="chart-title">Suhu (°C)</p><div class="chart" id="cSuhu"></div></div><div><p class="chart-title">Kelembapan (%)</p><div class="chart" id="cRh"></div></div></div><p class="note">Data pendamping dari DHT22. Tidak dipakai untuk menentukan tingkat bau.</p>';
    }
    area.innerHTML = h;
    if (state.tab === "level") {
      UI.chart(document.getElementById("cLevel"), {
        pts: series("level"), tmin: from, tmax: to, h: 240, yMin: -0.5, yMax: 2.5, step: true, ml: 62, levelGradient: true,
        ticks: [{ v: 0, label: "Rendah" }, { v: 1, label: "Sedang" }, { v: 2, label: "Tinggi" }],
        bands: [{ from: -0.5, to: 0.5, cls: "lv-0" }, { from: 0.5, to: 1.5, cls: "lv-1" }, { from: 1.5, to: 2.5, cls: "lv-2" }],
        fmt: function (v) { return UI.LV[Math.round(v)]; }
      });
    } else if (state.tab === "mq") {
      area.querySelectorAll("[data-spark]").forEach(function (el) {
        var j = +el.getAttribute("data-spark");
        UI.chart(el, { pts: series("rel", j), tmin: from, tmax: to, h: 58, yMin: 0.1, yMax: 1.2, compact: true, baseline: { v: 1 }, fmt: function (v) { return UI.num(v); } });
      });
    } else {
      UI.chart(document.getElementById("cSuhu"), { pts: series("suhu"), tmin: from, tmax: to, h: 150, yMin: 22, yMax: 36, accent: true, area: true, ml: 44, ticks: [24, 28, 32, 36].map(function (v) { return { v: v, label: v + "°" }; }), fmt: function (v) { return UI.num(v, 1) + " °C"; } });
      UI.chart(document.getElementById("cRh"), { pts: series("rh"), tmin: from, tmax: to, h: 150, yMin: 45, yMax: 100, accent: true, area: true, ml: 44, ticks: [50, 60, 70, 80, 90, 100].map(function (v) { return { v: v, label: v + "%" }; }), fmt: function (v) { return Math.round(v) + "%"; } });
    }
  }

  /* ---------- histori & ekspor ---------- */
  function renderActions() {
    var role = state.user.role, h = "";
    if (role !== "Warga") h += '<button class="btn primary" type="button" id="btnCsv">Ekspor CSV</button>';
    if (role === "Admin") h += '<button class="btn danger" type="button" id="btnDel">Hapus histori</button>';
    document.getElementById("histActions").innerHTML = h;
    var csv = document.getElementById("btnCsv");
    if (csv) csv.addEventListener("click", function () {
      var r = range();
      csv.disabled = true;
      Api.exportCsv(state.id, r.from, r.to).then(function (f) {
        csv.disabled = false;
        if (!f.rows) { UI.toast("Tidak ada data pada " + rangeText() + ", berkas tidak dibuat."); return; }
        UI.download(f.name, f.text);
        UI.toast(f.name + " diunduh (" + f.rows + " baris).");
      }, function (err) { csv.disabled = false; if (!UI.handleAuth(err)) UI.toast("Ekspor gagal: " + err.message); });
    });
    var del = document.getElementById("btnDel");
    if (del) del.addEventListener("click", function () {
      var box = document.getElementById("histConfirm");
      box.innerHTML = '<div class="confirm-bar"><span>Hapus seluruh histori ' + state.id + "? Data yang dihapus tidak bisa dikembalikan.</span>" +
        '<button class="btn danger" type="button" id="delYes">Hapus</button><button class="btn" type="button" id="delNo">Batal</button></div>';
      document.getElementById("delNo").onclick = function () { box.innerHTML = ""; };
      document.getElementById("delYes").onclick = function () {
        Api.deleteReadings(state.id).then(function () { box.innerHTML = ""; UI.toast("Histori " + state.id + " dihapus."); state.page = 1; load(); },
          function (err) { if (!UI.handleAuth(err)) UI.toast("Gagal menghapus: " + err.message); });
      };
    });
  }
  function renderHistory() {
    if (!state.rows) return;
    var rows = state.rows.slice().reverse(), pages = Math.max(1, Math.ceil(rows.length / PER_PAGE)), r = range();
    var long = r.to - r.from > DAY;
    state.page = Math.min(state.page, pages);
    var view = rows.slice((state.page - 1) * PER_PAGE, state.page * PER_PAGE);
    document.getElementById("histSub").textContent = rows.length + " baris · " + rangeText();
    document.getElementById("histTable").innerHTML = view.length
      ? '<table><thead><tr><th>Waktu</th><th>Tingkat</th>' + S.map(function (s) { return '<th class="num">' + s.n + "</th>"; }).join("") + '<th class="num">°C</th><th class="num">RH %</th></tr></thead><tbody>' +
        view.map(function (x) {
          return '<tr><td class="mono">' + (long ? UI.dateTime(x.t) : UI.time(x.t)) + "</td><td>" + UI.pill(x.level, true) + "</td>" + x.rel.map(function (v) { return '<td class="num">' + UI.num(v) + "</td>"; }).join("") +
            '<td class="num">' + UI.num(x.suhu, 1) + '</td><td class="num">' + Math.round(x.rh) + "</td></tr>";
        }).join("") + "</tbody></table>"
      : '<p class="empty">Data belum tersedia untuk rentang ini.</p>';
    document.getElementById("pager").innerHTML = rows.length > PER_PAGE
      ? '<span class="muted">Halaman ' + state.page + " dari " + pages + '</span><div class="pager-btns"><button class="btn" type="button" data-page="-1"' + (state.page <= 1 ? " disabled" : "") + '>Sebelumnya</button><button class="btn" type="button" data-page="1"' + (state.page >= pages ? " disabled" : "") + ">Berikutnya</button></div>"
      : "";
  }

  /* ---------- kontrol ---------- */
  var form = document.getElementById("rangeForm"), rErr = document.getElementById("rErr");
  function setPressed(val) {
    document.querySelectorAll("#rangeSeg button").forEach(function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-range") === String(val)); });
  }
  document.getElementById("tabSeg").addEventListener("click", function (e) {
    var b = e.target.closest("[data-tab]"); if (!b) return;
    state.tab = b.getAttribute("data-tab");
    this.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
    renderChart();
  });
  document.getElementById("rangeSeg").addEventListener("click", function (e) {
    var b = e.target.closest("[data-range]"); if (!b) return;
    var v = b.getAttribute("data-range");
    if (v === "custom") {
      var r = range();
      document.getElementById("rFrom").value = UI.toInput(r.from);
      document.getElementById("rTo").value = UI.toInput(r.to);
      rErr.hidden = true; form.hidden = false;
      document.getElementById("rFrom").focus();
      return;
    }
    form.hidden = true; state.custom = null; state.preset = +v; state.page = 1;
    setPressed(v);
    load();
  });
  document.getElementById("rCancel").addEventListener("click", function () { form.hidden = true; });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var from = UI.fromInput(document.getElementById("rFrom").value), to = UI.fromInput(document.getElementById("rTo").value), now = Date.now(), msg = "";
    if (from == null || to == null) msg = "Isi tanggal dan jam untuk Dari dan Sampai.";
    else if (from >= now) msg = "Waktu Dari tidak boleh di masa depan.";
    else if (to <= from) msg = "Waktu Sampai harus setelah waktu Dari.";
    else if (Math.min(to, now) - from > Api.MAX_RANGE_MS) msg = "Rentang terlalu panjang. Maksimal 7 hari.";
    if (msg) { rErr.textContent = msg; rErr.hidden = false; return; }
    if (to > now) { to = now; UI.toast("Waktu Sampai disesuaikan ke sekarang."); }
    state.custom = { from: from, to: to }; state.page = 1;
    form.hidden = true; setPressed("custom");
    document.getElementById("chartArea").innerHTML = UI.skel(240);
    load();
  });
  document.getElementById("pager").addEventListener("click", function (e) {
    var b = e.target.closest("[data-page]"); if (!b) return;
    state.page += +b.getAttribute("data-page"); renderHistory();
  });
  var rz, lastW = window.innerWidth;
  window.addEventListener("resize", function () {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    cancelAnimationFrame(rz); rz = requestAnimationFrame(renderChart);
  });
})();
