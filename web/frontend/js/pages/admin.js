(function () {
  "use strict";
  var S = Api.SENSORS;
  var state = { me: null, nodes: [], status: null, accounts: [], edit: false, backup: null, confirmR0: null, editing: null, confirmDel: null, confirmAcc: null };
  var ROLE = { Warga: "Warga", Pengelola: "Pengelola TPS", Admin: "Administrator" };

  UI.requireAuth(["Admin"]).then(function (u) {
    state.me = u;
    UI.navbar(u, "admin");
    var sel = document.getElementById("scenSel");
    sel.innerHTML = Api.mock.scenarios.map(function (n, i) { return '<option value="' + i + '"' + (i === Api.mock.getScenario() ? " selected" : "") + ">" + n + "</option>"; }).join("");
    document.getElementById("simErr").checked = Api.mock.getSimError();
    load();
    loadAccounts();
  }, function () {});

  function load() {
    document.getElementById("denahAdmin").innerHTML = '<div class="pb">' + UI.skel(300) + "</div>";
    Promise.all([Api.getNodes(), Api.getStatus()]).then(function (res) {
      state.nodes = res[0];
      state.status = res[1];
      renderDenah();
      renderTable();
      suggestId();
    }, function (err) {
      UI.errorState(document.getElementById("denahAdmin"), err, load);
      document.getElementById("posBtns").innerHTML = "";
      document.getElementById("posHint").textContent = "";
      document.getElementById("r0Table").innerHTML = '<p class="empty">Daftar node belum bisa dimuat.</p>';
    });
  }
  function loadAccounts() {
    Api.getAccounts().then(function (list) { state.accounts = list; renderAccounts(); }, function (err) {
      UI.errorState(document.getElementById("accTable"), err, loadAccounts, { title: "Daftar akun gagal dimuat" });
    });
  }

  function statusOf(id) { return state.status.nodes.filter(function (x) { return x.id === id; })[0] || { noData: true, active: false }; }
  function merged() { return state.nodes.map(function (n) { return Object.assign({}, statusOf(n.id), { x: n.x, y: n.y, nama: n.nama }); }); }
  function suggestId() {
    var max = state.nodes.reduce(function (m, n) { var k = parseInt(n.id.slice(1), 10); return isNaN(k) ? m : Math.max(m, k); }, 0);
    var f = document.getElementById("nId"); if (!f.value) f.value = "N" + (max + 1);
  }

  /* ---------- denah ---------- */
  function renderDenah() {
    document.getElementById("posBtns").innerHTML = state.edit
      ? '<button class="btn" type="button" id="posCancel">Batal</button><button class="btn primary" type="button" id="posSave">Simpan posisi</button>'
      : '<button class="btn" type="button" id="posEdit">Ubah posisi</button>';
    document.getElementById("posHint").textContent = state.edit
      ? "Geser penanda node ke posisi pemasangan. Koordinat dalam meter dari pojok barat laut pagar."
      : "Posisi disimpan sebagai pos_x dan pos_y (meter) dan dipakai di denah 2D dan 3D.";
    var host = document.getElementById("denahAdmin");
    host.innerHTML = UI.denah(merged(), { prefix: "a", edit: state.edit });
    if (state.edit) UI.enableDrag(host.querySelector("svg"), state.nodes, function () { renderTable(); });
    var e = document.getElementById("posEdit"), c = document.getElementById("posCancel"), sv = document.getElementById("posSave");
    if (e) e.onclick = function () { state.backup = state.nodes.map(function (n) { return { x: n.x, y: n.y }; }); state.edit = true; renderDenah(); };
    if (c) c.onclick = function () { state.nodes.forEach(function (n, i) { n.x = state.backup[i].x; n.y = state.backup[i].y; }); state.edit = false; renderDenah(); renderTable(); };
    if (sv) sv.onclick = function () {
      sv.disabled = true;
      Api.saveNodePositions(state.nodes.map(function (n) { return { id: n.id, x: n.x, y: n.y }; })).then(function () { state.edit = false; UI.toast("Posisi node disimpan."); load(); },
        function (err) { sv.disabled = false; if (!UI.handleAuth(err)) UI.toast("Posisi belum tersimpan: " + err.message); });
    };
  }

  /* ---------- tabel node & R0 ---------- */
  function renderTable() {
    var cols = 7 + S.length;
    var head = "<tr><th>Node</th><th>Lokasi</th><th>Posisi (m)</th><th>Status</th><th>R0 diukur</th>" + S.map(function (s) { return '<th class="num">' + s.n + "</th>"; }).join("") + "<th></th><th></th></tr>";
    var body = state.nodes.map(function (n) {
      var s = statusOf(n.id);
      var st = s.noData ? '<span class="pill lv-off">Belum ada data</span>' : '<span class="pill ' + (s.active ? "lv-0" : "lv-off") + '">' + (s.active ? "Aktif" : "Tidak aktif") + "</span>";
      var loc = state.editing === n.id
        ? '<form class="inline-edit" data-editform="' + n.id + '"><input type="text" value="' + UI.esc(n.nama) + '" aria-label="Lokasi ' + n.id + '" id="edit-' + n.id + '"><button class="btn primary" type="submit">Simpan</button><button class="btn" type="button" data-editno>Batal</button><p class="err" id="err-edit" hidden></p></form>'
        : UI.esc(n.nama);
      var r = '<tr><td class="mono"><b>' + n.id + "</b></td><td>" + loc + '</td><td class="mono">' + UI.num(n.x, 1) + " , " + UI.num(n.y, 1) + "</td><td>" + st + "</td>" +
        '<td class="mono">' + (n.r0At ? UI.dateTime(n.r0At) : '<span class="muted">Belum diukur</span>') + "</td>" +
        (n.r0 ? n.r0.map(function (v) { return '<td class="num">' + UI.num(v, 1) + "</td>"; }).join("") : S.map(function () { return '<td class="num muted">–</td>'; }).join("")) +
        '<td><button class="btn" type="button" data-r0="' + n.id + '">' + (n.r0 ? "Ukur ulang R0" : "Ukur R0") + "</button></td>" +
        '<td><div class="row-btns nowrap"><button class="btn" type="button" data-edit="' + n.id + '">Ubah lokasi</button><button class="btn danger" type="button" data-del="' + n.id + '">Hapus</button></div></td></tr>';
      if (state.confirmR0 === n.id) r += '<tr class="confirm"><td colspan="' + cols + '"><div class="confirm-bar plain"><span>Letakkan ' + n.id + " di udara bersih minimal 10 menit sebelum mengukur." + (n.r0 ? " Nilai R0 lama akan diganti." : "") + "</span>" +
        '<button class="btn primary" type="button" data-r0ok="' + n.id + '">Ukur sekarang</button><button class="btn" type="button" data-cancel>Batal</button></div></td></tr>';
      if (state.confirmDel === n.id) r += '<tr class="confirm"><td colspan="' + cols + '"><div class="confirm-bar plain"><span>Hapus ' + n.id + "? Posisi, nilai R0, dan histori node ini ikut terhapus dan tidak bisa dikembalikan.</span>" +
        '<button class="btn danger" type="button" data-delok="' + n.id + '">Hapus node</button><button class="btn" type="button" data-cancel>Batal</button></div></td></tr>';
      return r;
    }).join("");
    document.getElementById("r0Table").innerHTML = "<table><thead>" + head + "</thead><tbody>" + body + "</tbody></table>";
    if (state.editing) { var inp = document.getElementById("edit-" + state.editing); if (inp) inp.focus(); }
  }

  document.getElementById("r0Table").addEventListener("click", function (e) {
    var t = e.target;
    function attr(a) { var el = t.closest("[" + a + "]"); return el ? el.getAttribute(a) || "" : null; }
    var id;
    if ((id = attr("data-r0")) !== null) { state.confirmR0 = id; state.confirmDel = null; renderTable(); }
    else if ((id = attr("data-del")) !== null) { state.confirmDel = id; state.confirmR0 = null; renderTable(); }
    else if ((id = attr("data-edit")) !== null) { state.editing = id; renderTable(); }
    else if (attr("data-cancel") !== null) { state.confirmR0 = state.confirmDel = null; renderTable(); }
    else if (attr("data-editno") !== null) { state.editing = null; renderTable(); }
    else if ((id = attr("data-r0ok")) !== null) {
      t.closest("button").disabled = true;
      Api.measureR0(id).then(function () { state.confirmR0 = null; UI.toast("R0 " + id + " disimpan. Firmware tidak perlu diprogram ulang."); load(); }, actionFail);
    }
    else if ((id = attr("data-delok")) !== null) {
      t.closest("button").disabled = true;
      Api.deleteNode(id).then(function () { state.confirmDel = null; UI.toast("Node " + id + " dihapus."); load(); }, actionFail);
    }
  });
  document.getElementById("r0Table").addEventListener("submit", function (e) {
    var f = e.target.closest("[data-editform]"); if (!f) return;
    e.preventDefault();
    var id = f.getAttribute("data-editform"), val = document.getElementById("edit-" + id).value;
    Api.updateNode(id, { nama: val }).then(function () { state.editing = null; UI.toast("Lokasi " + id + " diperbarui."); load(); }, function (err) {
      if (UI.handleAuth(err)) return;
      var el = document.getElementById("err-edit"); el.textContent = err.message; el.hidden = false;
    });
  });
  function actionFail(err) { if (UI.handleAuth(err)) return; UI.toast("Gagal: " + err.message); renderTable(); }

  /* ---------- daftar node baru ---------- */
  function fieldErrors(map, ids) {
    Object.keys(ids).forEach(function (k) {
      var el = document.getElementById("err-" + ids[k]), inp = document.getElementById(ids[k]);
      el.textContent = map[k] || ""; el.hidden = !map[k]; inp.classList.toggle("invalid", !!map[k]);
    });
    var first = Object.keys(ids).filter(function (k) { return map[k]; })[0];
    if (first) document.getElementById(ids[first]).focus();
  }
  function numVal(id) { return parseFloat(String(document.getElementById(id).value).replace(",", ".")); }
  document.getElementById("nodeForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = document.getElementById("btnAddNode"), ids = { id: "nId", nama: "nNama", x: "nX", y: "nY" };
    btn.disabled = true;
    Api.addNode({ id: document.getElementById("nId").value, nama: document.getElementById("nNama").value, x: numVal("nX"), y: numVal("nY") }).then(function (r) {
      btn.disabled = false; fieldErrors({}, ids);
      document.getElementById("nodeForm").reset(); document.getElementById("nId").value = "";
      UI.toast("Node " + r.id + " terdaftar. Ukur R0 sebelum perangkat dipasang.");
      load();
    }, function (err) {
      btn.disabled = false;
      if (UI.handleAuth(err)) return;
      if (err.fields) fieldErrors(err.fields, ids); else UI.toast("Gagal mendaftarkan node: " + err.message);
    });
  });

  /* ---------- akun ---------- */
  function renderAccounts() {
    document.getElementById("accTable").innerHTML = "<table><thead><tr><th>Username</th><th>Peran</th><th>Email</th><th></th></tr></thead><tbody>" +
      state.accounts.map(function (a) {
        var me = a.username === state.me.username;
        var row = '<tr><td class="mono">' + UI.esc(a.username) + (me ? ' <span class="muted">(Anda)</span>' : "") + "</td><td>" + ROLE[a.role] + "</td><td>" + UI.esc(a.email) + "</td>" +
          "<td>" + (me ? "" : '<button class="btn danger" type="button" data-accdel="' + UI.esc(a.username) + '">Hapus</button>') + "</td></tr>";
        if (state.confirmAcc === a.username) row += '<tr class="confirm"><td colspan="4"><div class="confirm-bar plain"><span>Hapus akun ' + UI.esc(a.username) + "? Pemilik akun tidak bisa masuk lagi.</span>" +
          '<button class="btn danger" type="button" data-accok="' + UI.esc(a.username) + '">Hapus akun</button><button class="btn" type="button" data-accno>Batal</button></div></td></tr>';
        return row;
      }).join("") + "</tbody></table>";
  }
  document.getElementById("accTable").addEventListener("click", function (e) {
    var d = e.target.closest("[data-accdel]"), ok = e.target.closest("[data-accok]"), no = e.target.closest("[data-accno]");
    if (d) { state.confirmAcc = d.getAttribute("data-accdel"); renderAccounts(); }
    else if (no) { state.confirmAcc = null; renderAccounts(); }
    else if (ok) {
      var u = ok.getAttribute("data-accok"); ok.disabled = true;
      Api.deleteAccount(u).then(function () { state.confirmAcc = null; UI.toast("Akun " + u + " dihapus."); loadAccounts(); },
        function (err) { if (!UI.handleAuth(err)) { UI.toast("Gagal: " + err.message); ok.disabled = false; } });
    }
  });
  var accForm = document.getElementById("accForm");
  document.getElementById("btnShowAcc").addEventListener("click", function () { accForm.hidden = false; document.getElementById("aUser").focus(); });
  document.getElementById("btnHideAcc").addEventListener("click", function () { accForm.hidden = true; });
  accForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var ids = { username: "aUser", email: "aEmail", password: "aPass" }, btn = accForm.querySelector("[type=submit]");
    btn.disabled = true;
    Api.addAccount({ username: document.getElementById("aUser").value, email: document.getElementById("aEmail").value, password: document.getElementById("aPass").value, role: document.getElementById("aRole").value }).then(function () {
      btn.disabled = false; fieldErrors({}, ids); accForm.reset(); accForm.hidden = true;
      UI.toast("Akun baru disimpan."); loadAccounts();
    }, function (err) {
      btn.disabled = false;
      if (UI.handleAuth(err)) return;
      if (err.fields) fieldErrors(err.fields, ids); else UI.toast("Gagal menyimpan akun: " + err.message);
    });
  });

  /* ---------- data contoh ---------- */
  document.getElementById("btnScen").addEventListener("click", function () {
    var i = +document.getElementById("scenSel").value;
    Api.mock.setScenario(i);
    UI.toast("Skenario \"" + Api.mock.scenarios[i] + "\" diterapkan.");
    load();
  });
  document.getElementById("btnReset").addEventListener("click", function () {
    document.getElementById("resetConfirm").innerHTML = '<div class="confirm-bar"><span>Semua akun baru, node baru, laporan, dan perubahan akan hilang, dan Anda akan keluar.</span><button class="btn danger" type="button" id="rsYes">Reset</button><button class="btn" type="button" id="rsNo">Batal</button></div>';
    document.getElementById("rsNo").onclick = function () { document.getElementById("resetConfirm").innerHTML = ""; };
    document.getElementById("rsYes").onclick = function () { Api.mock.reset(); location.href = "index.html"; };
  });
  document.getElementById("simErr").addEventListener("change", function () {
    Api.mock.setSimError(this.checked);
    location.reload();
  });
})();
