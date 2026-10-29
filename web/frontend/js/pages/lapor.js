(function () {
  "use strict";
  var photo = null;

  UI.requireAuth(["Warga"]).then(function (u) {
    UI.navbar(u, "lapor");
    init();
  }, function () {});

  function init() {
    document.getElementById("choices").innerHTML = UI.FELT.map(function (x, i) {
      return '<label class="choice lv-' + i + '"><input type="radio" name="felt" id="felt' + i + '" value="' + i + '"><span><i class="dot lv-' + i + '"></i><b>' + x.n + "</b><small>" + x.d + "</small></span></label>";
    }).join("");
    Api.getNodes().then(function (nodes) {
      var sel = document.getElementById("repNode"), pre = UI.qs("node");
      sel.insertAdjacentHTML("beforeend", nodes.map(function (n) { return '<option value="' + n.id + '"' + (n.id === pre ? " selected" : "") + ">" + n.id + " · " + UI.esc(n.nama) + "</option>"; }).join(""));
    }, function (err) { UI.handleAuth(err); /* daftar titik opsional: pilihan "Tidak tahu" tetap bisa dipakai */ });
    loadMine();
  }

  function loadMine() {
    var host = document.getElementById("myReports");
    host.innerHTML = "<li>" + UI.skel(54) + "</li>";
    Api.getReports().then(function (list) {
      host.innerHTML = list.map(function (r) {
        return '<li><div class="rmeta"><span class="pill lv-' + r.felt + '">' + UI.FELT[r.felt].n + "</span><span>#0" + r.id + "</span><span>" + (r.node || "titik tidak disebut") + "</span><span>" + UI.dateTime(r.t) + '</span><span class="st st-' + r.status + '">' + UI.REPORT_STATUS[r.status] + '</span></div><p class="rtext">' + UI.esc(r.text) + "</p></li>";
      }).join("") || '<li class="empty">Anda belum pernah mengirim laporan.</li>';
    }, function (err) {
      var li = document.createElement("li"); host.innerHTML = ""; host.appendChild(li);
      UI.errorState(li, err, loadMine, { title: "Laporan saya gagal dimuat" });
    });
  }

  // Foto diperkecil ke sisi terpanjang 800 px supaya ringan disimpan
  document.getElementById("repFoto").addEventListener("change", function () {
    var f = this.files && this.files[0], prev = document.getElementById("fotoPrev");
    photo = null; prev.hidden = true;
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, 800 / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        photo = c.toDataURL("image/jpeg", 0.75);
        prev.src = photo; prev.hidden = false;
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
  });

  document.getElementById("repForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var felt = this.querySelector("input[name=felt]:checked"), txt = document.getElementById("repText"), ok = true;
    document.getElementById("errFelt").hidden = !!felt; if (!felt) ok = false;
    var short = txt.value.trim().length < 10;
    document.getElementById("errText").hidden = !short; txt.classList.toggle("invalid", short); if (short) ok = false;
    if (!ok) { (felt ? txt : this.querySelector("input[name=felt]")).focus(); return; }
    var btn = document.getElementById("btnSend");
    btn.disabled = true; btn.textContent = "Mengirim…";
    Api.createReport({ felt: +felt.value, node: document.getElementById("repNode").value || null, text: txt.value.trim(), photo: photo }).then(function (rep) {
      var form = document.getElementById("repForm"), done = document.getElementById("done");
      form.hidden = true;
      done.hidden = false;
      done.innerHTML = '<span class="tag-mock">Laporan #0' + rep.id + '</span><h2>Laporan terkirim</h2><p>Pengelola TPS akan meninjau laporan Anda. Status sekarang: <b>Baru</b>. Perubahan status terlihat di daftar "Laporan saya".</p>' +
        '<div class="row-btns"><button class="btn primary" type="button" id="again">Kirim laporan lain</button><a class="btn" href="dashboard.html">Ke dashboard</a></div>';
      document.getElementById("again").onclick = function () {
        form.reset(); photo = null; document.getElementById("fotoPrev").hidden = true;
        btn.disabled = false; btn.textContent = "Kirim laporan";
        done.hidden = true; form.hidden = false;
      };
      loadMine();
    }, function (err) {
      if (UI.handleAuth(err)) return;
      // isian tidak dihapus, jadi warga cukup menekan kirim lagi
      UI.toast("Laporan belum terkirim: " + err.message + " Isian Anda masih tersimpan, coba kirim lagi.");
      btn.disabled = false; btn.textContent = "Kirim laporan";
    });
  });
})();
