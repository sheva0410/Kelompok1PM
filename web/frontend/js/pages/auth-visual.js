// Panel kiri halaman masuk/daftar: logo + denah 3D yang berputar pelan.
(function () {
  "use strict";
  var brand = document.getElementById("brand");
  if (brand) brand.insertAdjacentHTML("afterbegin", UI.LOGO);
  Api.getStatus().then(function (st) {
    UI.mountMap(document.getElementById("map"), st.nodes, { prefix: "v", autoRotate: true, toggle: false });
  });
})();
