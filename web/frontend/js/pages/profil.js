(function () {
  "use strict";
  var ROLE = { Warga: "Warga", Pengelola: "Pengelola TPS", Admin: "Administrator" };
  var user = null;

  UI.requireAuth().then(function (u) {
    user = u;
    UI.navbar(u, "profil");
    renderHead();
    document.getElementById("pMail").value = u.email || "";
    paintTheme();
  }, function () {});

  function renderHead() {
    document.getElementById("profHead").innerHTML =
      '<span class="avatar big" aria-hidden="true">' + UI.esc(user.username.charAt(0).toUpperCase()) + "</span>" +
      '<div class="page-head"><p class="eyebrow">Profil</p><h1>' + UI.esc(user.username) + "</h1><p>" + ROLE[user.role] + " · " + UI.esc(user.email || "") + "</p></div>";
  }
  function setErr(id, msg) {
    var el = document.getElementById("err-" + id), inp = document.getElementById(id);
    el.textContent = msg || ""; el.hidden = !msg; inp.classList.toggle("invalid", !!msg);
  }

  /* ---------- password ---------- */
  document.getElementById("pShow").addEventListener("change", function () {
    var type = this.checked ? "text" : "password";
    ["pOld", "pNew", "pNew2"].forEach(function (id) { document.getElementById(id).type = type; });
  });
  document.getElementById("pwForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var o = document.getElementById("pOld").value, n = document.getElementById("pNew").value, n2 = document.getElementById("pNew2").value;
    setErr("pOld", o ? "" : "Isi password lama.");
    setErr("pNew", "");
    setErr("pNew2", n2 === n ? "" : "Ulangan password baru tidak sama.");
    if (!o) return document.getElementById("pOld").focus();
    if (n2 !== n) return document.getElementById("pNew2").focus();
    var btn = document.getElementById("btnPw"); btn.disabled = true;
    Api.changePassword(o, n).then(function () {
      btn.disabled = false; document.getElementById("pwForm").reset();
      UI.toast("Password diganti. Pakai password baru saat masuk berikutnya.");
    }, function (err) {
      btn.disabled = false;
      if (UI.handleAuth(err)) return;
      if (err.fields) { setErr("pOld", err.fields.old); setErr("pNew", err.fields.new); document.getElementById(err.fields.old ? "pOld" : "pNew").focus(); }
      else UI.toast("Password belum diganti: " + err.message);
    });
  });

  /* ---------- email ---------- */
  document.getElementById("mailForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = document.getElementById("pMail").value, btn = document.getElementById("btnMail");
    btn.disabled = true;
    Api.updateEmail(v).then(function () {
      btn.disabled = false; setErr("pMail", ""); user.email = v.trim(); renderHead();
      UI.toast("Email disimpan.");
    }, function (err) {
      btn.disabled = false;
      if (UI.handleAuth(err)) return;
      if (err.fields) setErr("pMail", err.fields.email); else UI.toast("Email belum disimpan: " + err.message);
    });
  });

  /* ---------- tema & panduan ---------- */
  function paintTheme() {
    var p = UI.themePref();
    document.querySelectorAll("#themeSeg [data-th]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-th") === p); });
  }
  document.getElementById("themeSeg").addEventListener("click", function (e) {
    var b = e.target.closest("[data-th]"); if (!b) return;
    UI.setTheme(b.getAttribute("data-th")); paintTheme();
  });
  document.addEventListener("smarttps:theme", paintTheme);
  document.getElementById("btnTour").addEventListener("click", function () {
    UI.resetTour(user);
    location.href = "dashboard.html?panduan=1";
  });
})();
