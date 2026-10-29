(function () {
  "use strict";
  var form = document.getElementById("regForm"), btn = document.getElementById("btnReg");
  var fields = ["username", "email", "password"];

  function showErrors(map) {
    fields.forEach(function (f) {
      var el = document.getElementById("err-" + f), inp = document.getElementById(f);
      el.textContent = map[f] || ""; el.hidden = !map[f];
      inp.classList.toggle("invalid", !!map[f]);
    });
    var first = fields.filter(function (f) { return map[f]; })[0];
    if (first) document.getElementById(first).focus();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    btn.disabled = true; btn.textContent = "Mendaftarkan…";
    Api.register({
      username: document.getElementById("username").value,
      email: document.getElementById("email").value,
      password: document.getElementById("password").value
    }).then(function () {
      form.hidden = true;
      document.getElementById("regDone").hidden = false;
    }, function (err) {
      showErrors(err.fields || {});
      if (!err.fields) UI.toast("Pendaftaran gagal: " + err.message);
      btn.disabled = false; btn.textContent = "Daftar";
    });
  });
})();
