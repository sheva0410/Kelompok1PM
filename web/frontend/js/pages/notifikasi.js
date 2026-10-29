(function () {
  "use strict";
  var PER_PAGE = 10;
  var state = { all: [], type: "semua", hours: 24, node: "", page: 1, loaded: false };

  UI.requireAuth(["Pengelola", "Admin"]).then(function (u) {
    UI.navbar(u, "notifikasi");
    Api.getNodes().then(function (nodes) {
      document.getElementById("nodeSel").insertAdjacentHTML("beforeend", nodes.map(function (n) { return '<option value="' + n.id + '">' + n.id + " · " + UI.esc(n.nama) + "</option>"; }).join(""));
    }, function () { /* saringan node opsional */ });
    load();
    setInterval(function () { load(true); }, 60000);
  }, function () {});

  function load(quiet) {
    if (!quiet) document.getElementById("notifTable").innerHTML = '<div class="pb">' + UI.skel(42) + UI.skel(42) + UI.skel(42) + "</div>";
    Api.getNotifications(state.hours).then(function (list) {
      state.all = list; state.loaded = true; render();
    }, function (err) {
      if (UI.handleAuth(err)) return;
      if (quiet && state.loaded) return;
      document.getElementById("stats").innerHTML = "";
      UI.errorState(document.getElementById("notifTable"), err, function () { load(); });
      document.getElementById("pager").innerHTML = "";
    });
  }

  function filtered() {
    return state.all.filter(function (n) {
      return (state.type === "semua" || n.jenis === state.type) && (!state.node || n.node === state.node);
    });
  }

  function render() {
    var all = state.all;
    var tinggi = all.filter(function (n) { return n.jenis === "tinggi"; }).length;
    var offline = all.filter(function (n) { return n.jenis === "offline"; }).length;
    var retry = all.filter(function (n) { return n.attempts > 1; }).length;
    document.getElementById("stats").innerHTML =
      stat(all.length, "notifikasi terkirim", "") + stat(tinggi, "tingkat tinggi", "lv-2") + stat(offline, "node tidak aktif", "lv-off") + stat(retry, "perlu kirim ulang", "lv-1");

    var list = filtered(), pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    state.page = Math.min(state.page, pages);
    var view = list.slice((state.page - 1) * PER_PAGE, state.page * PER_PAGE);
    var long = state.hours > 24;
    document.getElementById("notifTable").innerHTML = view.length
      ? '<table class="rtable"><thead><tr><th>Waktu</th><th>Jenis</th><th>Node</th><th>Pesan</th><th>Kanal</th><th>Status kirim</th></tr></thead><tbody>' +
        view.map(function (n) {
          var kind = n.jenis === "tinggi" ? '<span class="pill lv-2">Tingkat tinggi</span>' : '<span class="pill lv-off">Node tidak aktif</span>';
          var sent = n.attempts > 1
            ? '<span class="st st-diproses">Terkirim, percobaan ke-2</span><div class="muted small">Gagal ' + UI.time(n.failedAt) + " · dikirim ulang " + UI.time(n.sentAt) + "</div>"
            : '<span class="st st-ok">Terkirim</span><div class="muted small">' + UI.time(n.sentAt) + "</div>";
          return "<tr>" +
            '<td data-l="Waktu" class="mono">' + (long ? UI.dateTime(n.t) : UI.time(n.t)) + "</td>" +
            '<td data-l="Jenis">' + kind + "</td>" +
            '<td data-l="Node" class="mono"><a href="node.html?id=' + n.node + '">' + n.node + "</a></td>" +
            '<td data-l="Pesan" class="desc">' + UI.esc(n.pesan) + "</td>" +
            '<td data-l="Kanal" class="mono">' + UI.esc(n.kanal) + "</td>" +
            '<td data-l="Status kirim">' + sent + "</td></tr>";
        }).join("") + "</tbody></table>"
      : '<div class="state-box"><b>Tidak ada notifikasi</b><p>Tidak ada notifikasi ' + (state.type === "tinggi" ? "tingkat tinggi " : state.type === "offline" ? "node tidak aktif " : "") + (state.node ? "untuk " + state.node + " " : "") + "dalam " + hoursText() + " terakhir.</p></div>";

    document.getElementById("pager").innerHTML = list.length > PER_PAGE
      ? '<span class="muted">Halaman ' + state.page + " dari " + pages + " · " + list.length + ' notifikasi</span><div class="pager-btns"><button class="btn" type="button" data-page="-1"' + (state.page <= 1 ? " disabled" : "") + '>Sebelumnya</button><button class="btn" type="button" data-page="1"' + (state.page >= pages ? " disabled" : "") + ">Berikutnya</button></div>"
      : "";
  }
  function stat(n, label, cls) { return '<div class="stat ' + cls + '"><b>' + n + "</b><span>" + (cls ? '<i class="dot ' + cls + '"></i>' : "") + label + "</span></div>"; }
  function hoursText() { return state.hours === 24 ? "24 jam" : state.hours === 72 ? "3 hari" : "7 hari"; }

  function seg(id, attr, onPick) {
    document.getElementById(id).addEventListener("click", function (e) {
      var b = e.target.closest("[" + attr + "]"); if (!b) return;
      this.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
      onPick(b.getAttribute(attr));
    });
  }
  seg("typeSeg", "data-type", function (v) { state.type = v; state.page = 1; render(); });
  seg("hourSeg", "data-h", function (v) { state.hours = +v; state.page = 1; load(); });
  document.getElementById("nodeSel").addEventListener("change", function () { state.node = this.value; state.page = 1; render(); });
  document.getElementById("pager").addEventListener("click", function (e) {
    var b = e.target.closest("[data-page]"); if (!b) return;
    state.page += +b.getAttribute("data-page"); render();
  });
  document.getElementById("btnReload").addEventListener("click", function () { load(); });
})();
