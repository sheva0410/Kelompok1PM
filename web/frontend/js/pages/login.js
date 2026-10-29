(function () {
  "use strict";
  // Sudah login? Langsung ke dashboard.
  Api.profile().then(function () { location.replace("dashboard.html"); }, function () {});

  var form = document.getElementById("loginForm"), btn = document.getElementById("btnLogin"), err = document.getElementById("loginErr");

  document.querySelectorAll(".demo-list [data-u]").forEach(function (b) {
    b.addEventListener("click", function () {
      document.getElementById("username").value = b.getAttribute("data-u");
      document.getElementById("password").value = b.getAttribute("data-p");
      err.hidden = true;
    });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var u = document.getElementById("username").value, p = document.getElementById("password").value;
    if (!u.trim() || !p) { err.textContent = "Isi username dan password."; err.hidden = false; return; }
    btn.disabled = true; btn.textContent = "Memeriksa…"; err.hidden = true;
    Api.login(u, p).then(function () {
      location.href = "dashboard.html";
    }, function (e2) {
      err.textContent = e2.message; err.hidden = false;
      btn.disabled = false; btn.textContent = "Masuk";
      document.getElementById("password").select();
    });
  });
})();
