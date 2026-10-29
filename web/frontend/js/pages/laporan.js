(function () {
  "use strict";
  var PER_PAGE = 5;
  var state = { all: [], filter: "baru", page: 1 };
  var FILTERS = [["semua", "Semua"], ["baru", "Baru"], ["diproses", "Diproses"], ["selesai", "Selesai"]];

  UI.requireAuth(["Pengelola", "Admin"]).then(function (u) {
    UI.navbar(u, "laporan");
    load();
    setInterval(load, 60000);
  }, function () {});

  var loaded = false;
  function load() {
    if (!loaded) document.getElementById("reportTable").innerHTML = '<div class="pb">' + UI.skel(44) + UI.skel(44) + UI.skel(44) + "</div>";
    Api.getReports().then(function (list) { loaded = true; state.all = list; render(); UI.refreshBadge(); }, function (err) {
      if (UI.handleAuth(err)) return;
      if (loaded) { UI.toast("Gagal memuat ulang laporan: " + err.message); return; }
      UI.errorState(document.getElementById("reportTable"), err, load);
      document.getElementById("pager").innerHTML = "";
    });
  }

  function render() {
    var counts = { semua: state.all.length };
    ["baru", "diproses", "selesai"].forEach(function (s) { counts[s] = state.all.filter(function (r) { return r.status === s; }).length; });
    document.getElementById("filterSeg").innerHTML = FILTERS.map(function (f) {
      return '<button type="button" data-f="' + f[0] + '" aria-pressed="' + (state.filter === f[0]) + '">' + f[1] + ' <span class="mono muted-in">' + counts[f[0]] + "</span></button>";
    }).join("");

    var list = state.filter === "semua" ? state.all : state.all.filter(function (r) { return r.status === state.filter; });
    var pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    state.page = Math.min(state.page, pages);
    var view = list.slice((state.page - 1) * PER_PAGE, state.page * PER_PAGE);

    document.getElementById("reportTable").innerHTML = view.length
      ? '<table class="rtable"><thead><tr><th>Waktu</th><th>Pelapor</th><th>Titik</th><th>Dirasakan</th><th>Sensor saat itu</th><th>Deskripsi</th><th>Foto</th><th>Status</th><th></th></tr></thead><tbody>' +
        view.map(row).join("") + "</tbody></table>"
      : '<p class="empty">' + (state.filter === "baru" ? "Tidak ada laporan baru." : "Tidak ada laporan di kategori ini.") + "</p>";

    document.getElementById("pager").innerHTML = list.length > PER_PAGE
      ? '<span class="muted">Halaman ' + state.page + " dari " + pages + '</span><div class="pager-btns"><button class="btn" type="button" data-page="-1"' + (state.page <= 1 ? " disabled" : "") + '>Sebelumnya</button><button class="btn" type="button" data-page="1"' + (state.page >= pages ? " disabled" : "") + ">Berikutnya</button></div>"
      : "";
  }

  function row(r) {
    var act = r.status === "baru"
      ? '<button class="btn primary" type="button" data-id="' + r.id + '" data-to="diproses">Proses</button>'
      : r.status === "diproses"
        ? '<button class="btn primary" type="button" data-id="' + r.id + '" data-to="selesai">Selesai</button>'
        : '<button class="btn ghost" type="button" data-id="' + r.id + '" data-to="diproses">Buka lagi</button>';
    return "<tr>" +
      '<td data-l="Waktu"><div>' + UI.date(r.t) + '</div><div class="muted mono small">' + UI.time(r.t) + "</div></td>" +
      '<td data-l="Pelapor">' + UI.esc(r.pelapor) + "</td>" +
      '<td data-l="Titik" class="mono">' + (r.node ? '<a href="node.html?id=' + r.node + '">' + r.node + "</a>" : '<span class="muted">tidak disebut</span>') + "</td>" +
      '<td data-l="Dirasakan"><span class="pill lv-' + r.felt + '">' + UI.FELT[r.felt].n + "</span></td>" +
      '<td data-l="Sensor saat itu">' + (r.sensorLevel != null ? UI.pill(r.sensorLevel, true) : '<span class="muted">–</span>') + "</td>" +
      '<td data-l="Deskripsi" class="desc">' + UI.esc(r.text) + "</td>" +
      '<td data-l="Foto">' + (r.photo ? '<button class="thumb" type="button" data-photo="' + r.id + '"><img src="' + r.photo + '" alt="Foto laporan #0' + r.id + '"></button>' : '<span class="muted">–</span>') + "</td>" +
      '<td data-l="Status"><span class="st st-' + r.status + '">' + UI.REPORT_STATUS[r.status] + "</span>" + (r.by ? '<div class="muted small">oleh ' + UI.esc(r.by) + "</div>" : "") + "</td>" +
      '<td data-l="">' + act + "</td></tr>";
  }

  document.getElementById("filterSeg").addEventListener("click", function (e) {
    var b = e.target.closest("[data-f]"); if (!b) return;
    state.filter = b.getAttribute("data-f"); state.page = 1; render();
  });
  document.getElementById("pager").addEventListener("click", function (e) {
    var b = e.target.closest("[data-page]"); if (!b) return;
    state.page += +b.getAttribute("data-page"); render();
  });
  document.getElementById("reportTable").addEventListener("click", function (e) {
    var b = e.target.closest("[data-to]");
    if (b) {
      var id = +b.getAttribute("data-id"), to = b.getAttribute("data-to");
      b.disabled = true;
      Api.updateReport(id, to).then(function () { UI.toast("Laporan #0" + id + " sekarang " + UI.REPORT_STATUS[to] + "."); load(); }, function (err) {
        if (UI.handleAuth(err)) return;
        b.disabled = false;
        UI.toast("Status laporan #0" + id + " belum berubah: " + err.message);
      });
      return;
    }
    var p = e.target.closest("[data-photo]");
    if (p) {
      var rep = state.all.filter(function (r) { return r.id === +p.getAttribute("data-photo"); })[0];
      var dlg = document.getElementById("photoDlg");
      document.getElementById("photoImg").src = rep.photo;
      if (dlg.showModal) dlg.showModal(); else window.open(rep.photo);
    }
  });
  document.getElementById("btnReload").addEventListener("click", function () { load(); UI.toast("Daftar laporan dimuat ulang."); });
})();
