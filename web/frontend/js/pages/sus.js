(function () {
  "use strict";
  // Lampiran E: adaptasi Bahasa Indonesia Sharfina dan Santoso (2016)
  var ITEMS = [
    "Saya berpikir akan menggunakan sistem ini lagi.",
    "Saya merasa sistem ini rumit untuk digunakan.",
    "Saya merasa sistem ini mudah untuk digunakan.",
    "Saya membutuhkan bantuan dari orang lain atau teknisi dalam menggunakan sistem ini.",
    "Saya merasa fitur-fitur sistem ini berjalan dengan semestinya.",
    "Saya merasa ada banyak hal yang tidak konsisten (tidak serasi) pada sistem ini.",
    "Saya merasa orang lain akan memahami cara menggunakan sistem ini dengan cepat.",
    "Saya merasa sistem ini membingungkan.",
    "Saya merasa tidak ada hambatan dalam menggunakan sistem ini.",
    "Saya perlu membiasakan diri terlebih dahulu sebelum menggunakan sistem ini."
  ];
  var TARGET = 68;
  var user = null, rows = [], confirmId = null;

  UI.requireAuth().then(function (u) {
    user = u;
    UI.navbar(u, "sus");
    buildForm();
    if (u.role === "Admin") {
      document.getElementById("susTabs").hidden = false;
      showTab("rekap");
    } else {
      showTab("isi");
    }
  }, function () {});

  /* ---------- tab ---------- */
  function showTab(t) {
    document.getElementById("paneIsi").hidden = t !== "isi";
    document.getElementById("paneRekap").hidden = t !== "rekap";
    document.querySelectorAll("#susTabs [data-tab]").forEach(function (b) { var on = b.getAttribute("data-tab") === t; b.setAttribute("aria-selected", on); b.setAttribute("aria-pressed", on); });
    if (t === "rekap") loadRekap();
  }
  document.getElementById("susTabs").addEventListener("click", function (e) { var b = e.target.closest("[data-tab]"); if (b) showTab(b.getAttribute("data-tab")); });

  /* ---------- formulir ---------- */
  function buildForm() {
    document.getElementById("sDate").textContent = UI.date(Date.now());
    var pre = { Warga: "Warga sekitar TPS", Pengelola: "Pengelola TPS" }[user.role];
    if (pre) document.getElementById("sPeran").value = pre;
    document.getElementById("susList").innerHTML = ITEMS.map(function (txt, i) {
      var n = i + 1;
      return '<li class="sus-item" id="q' + n + '"><fieldset><legend><span class="sus-no mono">' + n + "</span>" + UI.esc(txt) + "</legend>" +
        '<div class="likert">' + [1, 2, 3, 4, 5].map(function (v) {
          return '<label><input type="radio" name="q' + n + '" value="' + v + '"><span>' + v + "</span></label>";
        }).join("") + '</div><div class="likert-ends" aria-hidden="true"><span>Sangat tidak setuju</span><span>Sangat setuju</span></div></fieldset></li>';
    }).join("");
  }
  function answers() { return ITEMS.map(function (_, i) { var c = document.querySelector('input[name="q' + (i + 1) + '"]:checked'); return c ? +c.value : null; }); }
  var form = document.getElementById("susForm");
  form.addEventListener("change", function (e) {
    if (e.target.name && e.target.name.charAt(0) === "q") document.getElementById(e.target.name).classList.remove("missing");
    var n = answers().filter(function (v) { return v != null; }).length;
    document.getElementById("susProgress").textContent = n + " dari 10 terjawab";
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var ans = answers(), kode = document.getElementById("sKode").value, peran = document.getElementById("sPeran").value;
    var missing = ans.map(function (v, i) { return v == null ? i + 1 : null; }).filter(Boolean);
    setErr("kode", kode.trim() ? "" : "Isi nama atau kode partisipan.");
    setErr("peran", peran ? "" : "Pilih peran saat pengujian.");
    document.querySelectorAll(".sus-item").forEach(function (li, i) { li.classList.toggle("missing", ans[i] == null); });
    setErr("answers", missing.length ? "Pernyataan nomor " + missing.join(", ") + " belum dijawab." : "");
    if (!kode.trim()) return document.getElementById("sKode").focus();
    if (!peran) return document.getElementById("sPeran").focus();
    if (missing.length) { var q = document.getElementById("q" + missing[0]); q.scrollIntoView({ block: "center" }); q.querySelector("input").focus({ preventScroll: true }); return; }
    var btn = document.getElementById("btnSus"); btn.disabled = true; btn.textContent = "Mengirim…";
    Api.submitSus({ kode: kode, peran: peran, platform: document.getElementById("sPlat").value, answers: ans }).then(function (rec) {
      btn.disabled = false; btn.textContent = "Kirim jawaban";
      form.hidden = true;
      var done = document.getElementById("susDone"); done.hidden = false;
      done.innerHTML = '<span class="tag-mock">Jawaban #' + rec.id + '</span><h2>Terima kasih atas penilaian Anda</h2><p>Jawaban dari <b>' + UI.esc(rec.kode) + "</b> sudah tersimpan untuk rekap uji penerimaan pengguna.</p>" +
        '<div class="row-btns"><button class="btn primary" type="button" id="susAgain">Isi untuk partisipan lain</button><a class="btn" href="dashboard.html">Ke dashboard</a></div>';
      document.getElementById("susAgain").onclick = function () {
        form.reset(); buildForm(); document.getElementById("susProgress").textContent = "0 dari 10 terjawab";
        done.hidden = true; form.hidden = false; window.scrollTo(0, 0);
      };
      window.scrollTo(0, 0);
    }, function (err) {
      btn.disabled = false; btn.textContent = "Kirim jawaban";
      if (UI.handleAuth(err)) return;
      UI.toast("Jawaban belum terkirim: " + err.message + " Isian Anda tidak hilang.");
    });
  });
  function setErr(k, msg) { var el = document.getElementById("err-" + k); el.textContent = msg; el.hidden = !msg; }

  /* ---------- rekap (admin) ---------- */
  function loadRekap() {
    document.getElementById("susTable").innerHTML = '<div class="pb">' + UI.skel(40) + UI.skel(40) + "</div>";
    Api.getSusResponses().then(function (list) { rows = list; renderRekap(); }, function (err) {
      UI.errorState(document.getElementById("susTable"), err, loadRekap);
      document.getElementById("susStats").innerHTML = ""; document.getElementById("susItems").innerHTML = "";
    });
  }
  function mean(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : null; }
  function grade(s) {
    // kategori perkiraan untuk membaca skor; kriteria lulus proyek tetap rata-rata ≥ 68 (NFR-06)
    return s >= 85 ? "Sangat baik" : s >= 73 ? "Baik" : s >= 68 ? "Cukup baik" : s >= 51 ? "Kurang" : "Buruk";
  }
  function renderRekap() {
    var scores = rows.map(function (r) { return r.score; }), avg = mean(scores);
    var byRole = {};
    rows.forEach(function (r) { (byRole[r.peran] = byRole[r.peran] || []).push(r.score); });
    var pass = avg != null && avg >= TARGET;
    document.getElementById("susStats").innerHTML =
      stat(rows.length, "partisipan", "") +
      stat(avg == null ? "–" : UI.num(avg, 1), "rata-rata skor SUS", avg == null ? "" : pass ? "lv-0" : "lv-2") +
      stat(TARGET, "target minimal (NFR-06)", "") +
      '<div class="stat ' + (avg == null ? "" : pass ? "ok" : "bad") + '"><b>' + (avg == null ? "Belum ada data" : pass ? "Memenuhi" : "Belum memenuhi") + "</b><span>" + (avg == null ? "kesimpulan Lampiran F" : "kriteria keberhasilan · " + grade(avg)) + "</span></div>";

    if (!rows.length) {
      document.getElementById("susTable").innerHTML = '<div class="state-box"><b>Belum ada jawaban</b><p>Minta partisipan UAT membuka menu Kuesioner setelah mencoba sistem, atau isi lewat tab "Isi kuesioner" di perangkat ini.</p></div>';
      document.getElementById("susItems").innerHTML = '<p class="empty">Rata-rata per pernyataan muncul setelah ada jawaban.</p>';
      return;
    }
    document.getElementById("susTable").innerHTML = '<div class="tbl-wrap flush"><table><thead><tr><th>No</th><th>Partisipan</th><th>Peran</th><th>Sistem</th><th>Tanggal</th>' +
      ITEMS.map(function (_, i) { return '<th class="num" title="' + UI.esc(ITEMS[i]) + '">P' + (i + 1) + "</th>"; }).join("") + '<th class="num">Skor</th><th></th></tr></thead><tbody>' +
      rows.map(function (r, idx) {
        var tr = "<tr><td class=\"mono\">" + (idx + 1) + "</td><td>" + UI.esc(r.kode) + "</td><td>" + UI.esc(r.peran) + "</td><td>" + UI.esc(r.platform) + '</td><td class="mono">' + UI.dateTime(r.t) + "</td>" +
          r.answers.map(function (v) { return '<td class="num">' + v + "</td>"; }).join("") +
          '<td class="num"><b class="score ' + (r.score >= TARGET ? "ok" : "bad") + '">' + UI.num(r.score, 1) + "</b></td>" +
          '<td><button class="btn ghost" type="button" data-del="' + r.id + '">Hapus</button></td></tr>';
        if (confirmId === r.id) tr += '<tr class="confirm"><td colspan="' + (ITEMS.length + 7) + '"><div class="confirm-bar plain"><span>Hapus jawaban ' + UI.esc(r.kode) + "? Skor rata-rata akan dihitung ulang.</span>" +
          '<button class="btn danger" type="button" data-delok="' + r.id + '">Hapus jawaban</button><button class="btn" type="button" data-delno>Batal</button></div></td></tr>';
        return tr;
      }).join("") +
      '</tbody><tfoot><tr><td colspan="5"><b>Rata-rata keseluruhan</b>' + Object.keys(byRole).map(function (k) { return ' <span class="muted small">· ' + UI.esc(k) + " " + UI.num(mean(byRole[k]), 1) + "</span>"; }).join("") + "</td>" +
      ITEMS.map(function (_, i) { return '<td class="num">' + UI.num(mean(rows.map(function (r) { return r.answers[i]; })), 1) + "</td>"; }).join("") +
      '<td class="num"><b class="score ' + (pass ? "ok" : "bad") + '">' + UI.num(avg, 1) + "</b></td><td></td></tr></tfoot></table></div>";

    // kontribusi per pernyataan (0–4), sudah memperhitungkan arah pernyataan ganjil/genap
    document.getElementById("susItems").innerHTML = '<ol class="sus-bars">' + ITEMS.map(function (txt, i) {
      var c = mean(rows.map(function (r) { return i % 2 === 0 ? r.answers[i] - 1 : 5 - r.answers[i]; }));
      var cls = c >= 3 ? "lv-0" : c >= 2 ? "lv-1" : "lv-2";
      return '<li><span class="mono sus-no">' + (i + 1) + '</span><span class="sus-bar-txt">' + UI.esc(txt) + '</span><span class="sus-bar ' + cls + '"><i style="width:' + (c / 4 * 100) + '%"></i></span><b class="mono">' + UI.num(c, 2) + "</b></li>";
    }).join("") + '</ol><p class="note">Pernyataan dengan bar merah atau kuning menunjukkan bagian yang paling perlu diperbaiki sebelum pengujian ulang.</p>';
  }
  function stat(v, label, cls) { return '<div class="stat ' + cls + '"><b>' + v + "</b><span>" + (cls ? '<i class="dot ' + cls + '"></i>' : "") + label + "</span></div>"; }

  document.getElementById("susTable").addEventListener("click", function (e) {
    var d = e.target.closest("[data-del]"), ok = e.target.closest("[data-delok]"), no = e.target.closest("[data-delno]");
    if (d) { confirmId = +d.getAttribute("data-del"); renderRekap(); }
    else if (no) { confirmId = null; renderRekap(); }
    else if (ok) {
      ok.disabled = true;
      Api.deleteSus(+ok.getAttribute("data-delok")).then(function () { confirmId = null; UI.toast("Jawaban dihapus."); loadRekap(); },
        function (err) { if (!UI.handleAuth(err)) UI.toast("Gagal menghapus: " + err.message); });
    }
  });
  document.getElementById("btnSusCsv").addEventListener("click", function () {
    if (!rows.length) { UI.toast("Belum ada jawaban, berkas tidak dibuat."); return; }
    var head = ["no", "partisipan", "peran", "sistem", "waktu"].concat(ITEMS.map(function (_, i) { return "p" + (i + 1); })).concat(["skor_sus"]);
    var q = function (s) { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var lines = rows.map(function (r, i) { return [i + 1, q(r.kode), q(r.peran), q(r.platform), new Date(r.t).toISOString()].concat(r.answers).concat([r.score]).join(","); });
    lines.push(["", "rata-rata", "", "", ""].concat(ITEMS.map(function (_, i) { return mean(rows.map(function (r) { return r.answers[i]; })).toFixed(2); })).concat([mean(rows.map(function (r) { return r.score; })).toFixed(2)]).join(","));
    UI.download("rekap_sus_smarttps.csv", head.join(",") + "\n" + lines.join("\n") + "\n");
    UI.toast("rekap_sus_smarttps.csv diunduh (" + rows.length + " partisipan).");
  });
})();
