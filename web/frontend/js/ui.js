/*
 * SMART-TPS — komponen bersama: format, navbar, cek login, denah, grafik, toast.
 */
(function () {
  "use strict";

  var MIN = 60000;
  var LV = ["Rendah", "Sedang", "Tinggi"];
  var FELT = [
    { n: "Sedikit bau", d: "Tercium, tapi tidak mengganggu" },
    { n: "Cukup bau", d: "Mengganggu jika lama di dekat TPS" },
    { n: "Sangat menyengat", d: "Membuat mual atau sesak" }
  ];
  var REPORT_STATUS = { baru: "Baru", diproses: "Diproses", selesai: "Selesai" };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function time(t) { return new Date(t).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }); }
  function date(t) { return new Date(t).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }); }
  function dateTime(t) { return new Date(t).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) + ", " + time(t); }
  function num(v, d) { d = d == null ? 2 : d; return Number(v).toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function ago(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + " dtk lalu";
    var m = Math.round(s / 60);
    if (m < 60) return m + " mnt lalu";
    var h = Math.floor(m / 60);
    if (h < 24) return h + " jam lalu";
    return Math.floor(h / 24) + " hari lalu";
  }
  function lvCls(level, active) { return active === false || level == null ? "lv-off" : "lv-" + level; }
  function lvName(level, active) { return active === false || level == null ? "Tidak aktif" : LV[level]; }
  function pill(level, active) { return '<span class="pill ' + lvCls(level, active) + '">' + lvName(level, active) + "</span>"; }
  function nodeName(n) { return n.noData ? "Belum ada data" : lvName(n.level, n.active); }
  function nodePill(n) { return '<span class="pill ' + lvCls(n.level, n.active) + '">' + nodeName(n) + "</span>"; }
  function pad2(v) { return String(v).padStart(2, "0"); }
  // Nilai untuk <input type="datetime-local"> (waktu lokal) dan sebaliknya
  function toInput(t) { var d = new Date(t); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }
  function fromInput(s) { var t = new Date(s).getTime(); return isNaN(t) ? null : t; }

  /* ---------- status muat & error ---------- */
  function skel(h, extra) { return '<div class="skel' + (extra ? " " + extra : "") + '" style="height:' + h + 'px" aria-hidden="true"></div>'; }
  // true jika error sudah ditangani (sesi habis → ke halaman masuk)
  function handleAuth(err) { if (err && err.auth) { location.replace("index.html"); return true; } return false; }
  function errorState(host, err, retry, opt) {
    if (handleAuth(err)) return;
    opt = opt || {};
    host.innerHTML = '<div class="state-box' + (opt.dark ? " dark" : "") + '" role="alert"><b>' + esc(opt.title || "Data gagal dimuat") + "</b><p>" + esc((err && err.message) || "Terjadi kesalahan.") + "</p>" +
      (retry ? '<button class="btn primary" type="button" data-retry>Coba lagi</button>' : "") + "</div>";
    var b = host.querySelector("[data-retry]");
    if (b) b.addEventListener("click", function () { b.disabled = true; b.textContent = "Memuat…"; retry(); });
  }
  function trendText(t) { return t === "naik" ? "↑ naik" : t === "turun" ? "↓ turun" : "→ stabil"; }
  function trend(t) { return '<span class="trend ' + t + '">' + trendText(t) + "</span>"; }
  function qs(name) { return new URLSearchParams(location.search).get(name); }

  /* ---------- toast ---------- */
  var toastTimer;
  function toast(msg) {
    var el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3600);
  }

  /* ---------- login & navbar ---------- */
  var HOME = { Warga: "dashboard.html", Pengelola: "dashboard.html", Admin: "dashboard.html" };
  function requireAuth(roles) {
    return Api.profile().then(function (user) {
      if (roles && roles.indexOf(user.role) < 0) { location.replace(HOME[user.role] || "dashboard.html"); throw new Error("redirect"); }
      return user;
    }, function () { location.replace("index.html"); throw new Error("redirect"); });
  }
  var ROLE_LABEL = { Warga: "Warga", Pengelola: "Pengelola TPS", Admin: "Administrator" };
  // Logo: titik pemantau dengan gelombang bau
  var LOGO = '<svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lgBrand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5B8DFF"/><stop offset="1" stop-color="#2246B8"/></linearGradient></defs>' +
    '<rect width="32" height="32" rx="8" fill="url(#lgBrand)"/><path d="M9 13.5a7 7 0 0 1 14 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".55"/>' +
    '<path d="M12 14a4 4 0 0 1 8 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="16" r="2.4" fill="#FFD15C"/><path d="M16 18.5V25" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>';
  function navbar(user, active) {
    var links = [["dashboard", "dashboard.html", "Dashboard"]];
    if (user.role === "Warga") links.push(["lapor", "lapor.html", "Laporkan bau"]);
    if (user.role !== "Warga") links.push(["laporan", "laporan.html", "Laporan warga"]);
    if (user.role !== "Warga") links.push(["notifikasi", "notifikasi.html", "Notifikasi"]);
    if (user.role === "Admin") links.push(["admin", "admin.html", "Kelola node"]);
    links.push(["sus", "sus.html", "Kuesioner"]);
    var host = document.getElementById("topbar");
    host.className = "top";
    host.innerHTML = '<div class="wrap">' +
      '<a class="brand" href="dashboard.html">' + LOGO + '<b>SMART-TPS</b><span>TPS Terminal Rajabasa</span></a>' +
      '<nav class="nav" aria-label="Menu utama">' + links.map(function (l) {
        return '<a href="' + l[1] + '"' + (l[0] === active ? ' aria-current="page"' : "") + ">" + l[2] + (l[0] === "laporan" ? '<span class="count" id="navBadge" hidden></span>' : "") + "</a>";
      }).join("") + "</nav>" +
      '<div class="who"><button class="icon-btn" type="button" id="btnTheme"></button>' +
      '<a class="who-link" href="profil.html" title="Profil dan pengaturan"' + (active === "profil" ? ' aria-current="page"' : "") + '><span class="avatar" aria-hidden="true">' + esc(user.username.charAt(0).toUpperCase()) + '</span><span class="who-txt"><span class="who-name">' + esc(user.username) + '</span><span class="who-role">' + ROLE_LABEL[user.role] + "</span></span></a>" +
      '<button class="btn" id="btnLogout" type="button">Keluar</button></div></div>';
    paintThemeBtn();
    document.getElementById("btnTheme").addEventListener("click", function () { setTheme(effectiveTheme() === "dark" ? "light" : "dark"); });
    document.getElementById("btnLogout").addEventListener("click", function () { Api.logout().then(function () { location.href = "index.html"; }); });
    if (user.role !== "Warga") refreshBadge();
    banners();
  }
  /* ---------- tema terang / gelap ---------- */
  var THEME_KEY = "smarttps_theme";
  var SUN = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>';
  var MOON = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg>';
  function themePref() { try { return localStorage.getItem(THEME_KEY) || "system"; } catch (e) { return "system"; } }
  function effectiveTheme() {
    var p = themePref();
    if (p !== "system") return p;
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  // pref: "light" | "dark" | "system"
  function setTheme(pref) {
    try { if (pref === "system") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, pref); } catch (e) { /* abaikan */ }
    if (pref === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", pref);
    paintThemeBtn();
    document.dispatchEvent(new CustomEvent("smarttps:theme"));
  }
  function paintThemeBtn() {
    var b = document.getElementById("btnTheme"); if (!b) return;
    var dark = effectiveTheme() === "dark";
    b.innerHTML = dark ? SUN : MOON;
    b.setAttribute("aria-label", dark ? "Ganti ke tema terang" : "Ganti ke tema gelap");
    b.title = b.getAttribute("aria-label");
  }
  if (window.matchMedia) { var mq = matchMedia("(prefers-color-scheme: dark)"); if (mq.addEventListener) mq.addEventListener("change", paintThemeBtn); }

  /* ---------- panduan pengguna baru ---------- */
  // steps: [{ sel, title, text }]. Tampil sekali per akun, atau saat ?panduan=1.
  function tour(user, steps) {
    var key = "smarttps_tour_" + user.username, force = qs("panduan") === "1";
    try { if (!force && localStorage.getItem(key)) return; } catch (e) { return; }
    steps = steps.filter(function (s) { return document.querySelector(s.sel); });
    if (!steps.length) return;
    var i = 0, card = document.createElement("div"), lastTarget = null;
    card.className = "tour"; card.setAttribute("role", "dialog"); card.setAttribute("aria-modal", "false"); card.setAttribute("aria-labelledby", "tourTtl");
    document.body.appendChild(card);
    var smooth = !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    function done() {
      try { localStorage.setItem(key, "1"); } catch (e) { /* abaikan */ }
      if (lastTarget) lastTarget.classList.remove("tour-target");
      card.remove();
      document.removeEventListener("keydown", onKey);
      if (force && history.replaceState) history.replaceState(null, "", location.pathname);
    }
    function onKey(e) { if (e.key === "Escape") done(); }
    function show() {
      var s = steps[i], el = document.querySelector(s.sel);
      if (lastTarget) lastTarget.classList.remove("tour-target");
      if (el) { el.classList.add("tour-target"); el.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" }); lastTarget = el; }
      card.innerHTML = '<div class="tour-step mono">Panduan ' + (i + 1) + " dari " + steps.length + '</div><h2 id="tourTtl" tabindex="-1">' + esc(s.title) + "</h2><p>" + esc(s.text) + "</p>" +
        '<div class="tour-dots" aria-hidden="true">' + steps.map(function (_, k) { return "<i" + (k === i ? ' class="on"' : "") + "></i>"; }).join("") + "</div>" +
        '<div class="tour-act"><button class="btn ghost" type="button" data-t="skip">Lewati</button><span></span>' +
        (i ? '<button class="btn" type="button" data-t="prev">Kembali</button>' : "") +
        '<button class="btn primary" type="button" data-t="next">' + (i === steps.length - 1 ? "Selesai" : "Berikutnya") + "</button></div>";
      card.querySelector("h2").focus({ preventScroll: true });
    }
    card.addEventListener("click", function (e) {
      var b = e.target.closest("[data-t]"); if (!b) return;
      var t = b.getAttribute("data-t");
      if (t === "skip") return done();
      if (t === "prev") { i--; return show(); }
      if (i === steps.length - 1) return done();
      i++; show();
    });
    document.addEventListener("keydown", onKey);
    show();
  }
  function resetTour(user) { try { localStorage.removeItem("smarttps_tour_" + user.username); } catch (e) { /* abaikan */ } }

  // Pita peringatan di bawah navbar: koneksi putus, atau simulasi gangguan server aktif
  function banners() {
    var host = document.getElementById("sysBanners"), top = document.getElementById("topbar");
    if (!host && top) { host = document.createElement("div"); host.id = "sysBanners"; top.parentNode.insertBefore(host, top.nextSibling); }
    if (!host) return;
    var h = "";
    if (navigator.onLine === false) h += '<div class="sys-banner warn" role="status"><div class="wrap"><span>Koneksi internet terputus. Data yang tampil adalah data terakhir yang berhasil dimuat.</span></div></div>';
    if (Api.mock.getSimError()) h += '<div class="sys-banner bad" role="status"><div class="wrap"><span>Simulasi gangguan server aktif. Semua permintaan data akan gagal.</span><button class="btn" type="button" id="simOff">Matikan simulasi</button></div></div>';
    host.innerHTML = h;
    var b = document.getElementById("simOff");
    if (b) b.addEventListener("click", function () { Api.mock.setSimError(false); location.reload(); });
  }
  window.addEventListener("offline", banners);
  window.addEventListener("online", function () { banners(); document.dispatchEvent(new CustomEvent("smarttps:online")); });
  function refreshBadge() {
    Api.getReports().then(function (list) {
      var n = list.filter(function (r) { return r.status === "baru"; }).length, b = document.getElementById("navBadge");
      if (!b) return;
      b.textContent = n; b.hidden = !n;
    }, function () { /* badge tidak wajib; abaikan jika gagal */ });
  }

  /* ---------- denah TPS (26 × 15 m, 1 m = 20 px) ---------- */
  var PX = 20, OX = 50, OY = 50;
  function mx(m) { return OX + m * PX; }
  function my(m) { return OY + m * PX; }
  function denah(nodes, opt) {
    opt = opt || {};
    var p = opt.prefix || "d", sel = opt.selected;
    var h = '<svg class="denah' + (opt.edit ? " edit" : "") + '" viewBox="0 0 640 430" role="img" aria-label="Denah TPS dengan ' + nodes.length + ' node">';
    h += '<defs><pattern id="g1' + p + '" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="var(--grid)" stroke-width="1"/></pattern>';
    h += '<pattern id="g5' + p + '" width="100" height="100" patternUnits="userSpaceOnUse" x="50" y="50"><rect width="100" height="100" fill="url(#g1' + p + ')"/><path d="M100 0H0V100" fill="none" stroke="var(--grid-major)" stroke-width="1"/></pattern>';
    h += '<pattern id="ht' + p + '" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="var(--ink-3)" stroke-width="1" opacity=".55"/></pattern>';
    h += '<pattern id="ho' + p + '" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><rect width="6" height="6" fill="var(--off-soft)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--off)" stroke-width="2"/></pattern></defs>';
    h += '<rect x="0" y="0" width="640" height="430" fill="var(--sheet)"/><rect x="50" y="50" width="520" height="300" fill="url(#g5' + p + ')"/>';
    h += '<path d="M290 350H50V50H570V350H370" fill="none" stroke="var(--ink)" stroke-width="2"/><path d="M290 350l0 -6M370 350l0 -6" stroke="var(--ink)" stroke-width="2"/>';
    h += '<path d="M290 350A80 80 0 0 1 330 281" fill="none" stroke="var(--ink-3)" stroke-width="1" stroke-dasharray="3 3"/><text class="lbl" x="330" y="364" text-anchor="middle">GERBANG</text>';
    h += '<rect x="0" y="374" width="640" height="26" fill="var(--rule-2)"/><line x1="0" y1="387" x2="640" y2="387" stroke="var(--ink-3)" stroke-width="1" stroke-dasharray="14 10" opacity=".6"/><text class="lbl" x="150" y="391" text-anchor="middle" style="font-size:10px">JALAN AKSES TERMINAL</text>';
    h += '<path d="M50 30H570M50 24V36M570 24V36" stroke="var(--ink-3)" stroke-width="1"/><rect x="290" y="21" width="60" height="18" fill="var(--sheet)"/><text class="lbl" x="320" y="34" text-anchor="middle">26 m</text>';
    h += '<path d="M28 50V350M22 50H34M22 350H34" stroke="var(--ink-3)" stroke-width="1"/><rect x="19" y="176" width="18" height="48" fill="var(--sheet)"/><text class="lbl" x="28" y="200" text-anchor="middle" transform="rotate(-90 28 200)" dominant-baseline="central">15 m</text>';
    h += '<g transform="translate(605 78)"><path d="M0 -18L8 8L0 3L-8 8Z" fill="var(--ink)"/><text class="lbl-strong" x="0" y="24" text-anchor="middle">U</text></g>';
    h += '<g transform="translate(470 416)"><path d="M0 0H100M0 -4V4M50 -3V3M100 -4V4" stroke="var(--ink-2)" stroke-width="1.2"/><rect x="0" y="-2" width="50" height="4" fill="var(--ink-2)"/><text class="lbl" x="-6" y="4" text-anchor="end">0</text><text class="lbl" x="106" y="4">5 m</text></g>';
    h += '<rect x="70" y="70" width="50" height="30" fill="var(--rule-2)" stroke="var(--ink-2)" stroke-width="1"/><text class="lbl" x="95" y="89" text-anchor="middle">POS</text>';
    h += '<rect x="410" y="80" width="100" height="60" fill="var(--sheet)" stroke="var(--ink-2)" stroke-width="1.5"/><path d="M410 80L510 140M510 80L410 140" stroke="var(--rule)" stroke-width="1"/><rect x="418" y="100" width="84" height="20" fill="var(--sheet)"/><text class="lbl-strong" x="460" y="114" text-anchor="middle">BAK 6 m³</text>';
    h += '<path d="M210 160L290 140L360 160L380 220L340 266L250 270L200 230Z" fill="url(#ht' + p + ')" stroke="var(--ink-3)" stroke-width="1.2"/><rect x="226" y="196" width="128" height="20" fill="var(--sheet)" opacity=".92"/><text class="lbl-strong" x="290" y="210" text-anchor="middle">TIMBUNAN SAMPAH</text>';
    h += '<path d="M64 150V330" stroke="var(--accent)" stroke-width="2" stroke-dasharray="6 4" opacity=".55"/><text class="lbl" x="56" y="240" text-anchor="middle" transform="rotate(-90 56 240)" style="font-size:9.5px">SALURAN</text>';
    nodes.forEach(function (n) {
      var cls = opt.plain ? "lv-plain" : lvCls(n.level, n.active), tag = opt.plain ? n.id : nodeName(n), tw = tag.length * 7 + 14;
      var link = opt.link ? opt.link(n) : null;
      h += (link ? '<a href="' + link + '" class="mk-link" aria-label="' + esc(n.id + ", " + tag + ", buka detail") + '">' : "");
      h += '<g class="mk ' + cls + '" data-node="' + n.id + '" transform="translate(' + mx(n.x) + " " + my(n.y) + ')"' + (link ? "" : ' aria-hidden="true"') + ">";
      h += '<circle class="hit" r="30"/>';
      if (!opt.plain && n.active && n.level === 2) h += '<circle class="pulse" r="15"/>';
      if (sel === n.id) h += '<circle class="sel" r="23"/>';
      h += '<circle class="core" r="15"' + (!opt.plain && !n.active ? ' style="fill:url(#ho' + p + ')"' : "") + '/><text class="mid" y="0.5">' + n.id + "</text>";
      if (!opt.plain) h += '<rect class="tagbg" x="' + (-tw / 2) + '" y="21" width="' + tw + '" height="18" rx="3"/><text class="tagtx" y="30.5">' + esc(tag) + "</text>";
      if (opt.edit) h += '<text class="lbl coord" y="-24" text-anchor="middle">' + num(n.x, 1) + " , " + num(n.y, 1) + "</text>";
      h += "</g>" + (link ? "</a>" : "");
    });
    return h + "</svg>";
  }
  function enableDrag(svg, nodes, onMove) {
    svg.querySelectorAll(".mk").forEach(function (g) {
      g.addEventListener("pointerdown", function (ev) {
        ev.preventDefault();
        g.setPointerCapture(ev.pointerId);
        var n = nodes.filter(function (x) { return x.id === g.getAttribute("data-node"); })[0];
        function move(e) {
          var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
          var p = pt.matrixTransform(svg.getScreenCTM().inverse());
          n.x = Math.round(clamp((p.x - OX) / PX, 0.5, 25.5) * 2) / 2;
          n.y = Math.round(clamp((p.y - OY) / PX, 0.5, 14.5) * 2) / 2;
          g.setAttribute("transform", "translate(" + mx(n.x) + " " + my(n.y) + ")");
          var c = g.querySelector(".coord"); if (c) c.textContent = num(n.x, 1) + " , " + num(n.y, 1);
          if (onMove) onMove(n);
        }
        function up() { g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up); }
        g.addEventListener("pointermove", move); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
      });
    });
  }

  /* ---------- grafik garis (SVG) dengan crosshair + tooltip ---------- */
  function timeTicks(tmin, tmax) {
    var H = 60 * MIN, span = tmax - tmin;
    var step = span <= 70 * MIN ? 15 * MIN : span <= 7 * H ? H : span <= 26 * H ? 4 * H : span <= 84 * H ? 12 * H : 24 * H;
    var off = new Date(tmin).getTimezoneOffset() * MIN, out = [], t = Math.ceil((tmin - off) / step) * step + off;
    for (; t <= tmax; t += step) out.push(t);
    return out;
  }
  function bucket(pts, maxN, mode) {
    if (pts.length <= maxN) return pts;
    var size = Math.ceil(pts.length / maxN), out = [];
    for (var i = 0; i < pts.length; i += size) {
      var sl = pts.slice(i, i + size);
      var v = mode === "max" ? Math.max.apply(null, sl.map(function (p) { return p.v; })) : sl.reduce(function (a, p) { return a + p.v; }, 0) / sl.length;
      out.push({ t: sl[sl.length - 1].t, v: v });
    }
    return out;
  }
  function tickLabel(t, long) {
    if (!long) return time(t);
    var d = new Date(t), day = d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    return d.getHours() === 0 && d.getMinutes() === 0 ? day : day + " " + time(t);
  }
  var chartSeq = 0;
  function UI_clampLv(v) { return Math.max(0, Math.min(2, Math.round(v))); }
  function chart(host, cfg) {
    var W = host.clientWidth;
    if (!W) return;
    var H = cfg.h, m = cfg.compact ? { l: 2, r: 6, t: 6, b: 4 } : { l: cfg.ml || 56, r: 14, t: 12, b: 26 };
    var x0 = m.l, x1 = W - m.r, y0 = m.t, y1 = H - m.b;
    var pts = bucket(cfg.pts, Math.max(20, Math.floor((x1 - x0) / (cfg.compact ? 3 : 2))), cfg.step ? "max" : "avg");
    var tmin = cfg.tmin, tmax = cfg.tmax, longSpan = tmax - tmin > 26 * 60 * MIN;
    function X(t) { return x0 + (t - tmin) / (tmax - tmin || 1) * (x1 - x0); }
    function Y(v) { return y1 - (v - cfg.yMin) / (cfg.yMax - cfg.yMin) * (y1 - y0); }
    var gid = "g" + (++chartSeq);
    var s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" aria-hidden="true"><defs>' +
      '<linearGradient id="' + gid + 'l" gradientUnits="userSpaceOnUse" x1="0" y1="' + Y(cfg.yMin) + '" x2="0" y2="' + Y(cfg.yMax) + '">' +
        '<stop offset="0" style="stop-color:var(--lv0)"/><stop offset=".5" style="stop-color:var(--lv1)"/><stop offset="1" style="stop-color:var(--lv2)"/></linearGradient>' +
      '<linearGradient id="' + gid + 'a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent);stop-opacity:.28"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/></linearGradient></defs>';
    (cfg.bands || []).forEach(function (b) { s += '<rect class="band ' + b.cls + '" x="' + x0 + '" y="' + Y(b.to) + '" width="' + (x1 - x0) + '" height="' + (Y(b.from) - Y(b.to)) + '"/>'; });
    if (!cfg.compact) {
      (cfg.ticks || []).forEach(function (tk) { var y = Y(tk.v); s += '<line class="gl" x1="' + x0 + '" x2="' + x1 + '" y1="' + y + '" y2="' + y + '"/><text x="' + (x0 - 8) + '" y="' + y + '" text-anchor="end" dominant-baseline="central">' + esc(tk.label) + "</text>"; });
      timeTicks(tmin, tmax).forEach(function (t) { var x = X(t); if (x < x0 + 14 || x > x1 - 14) return; s += '<line class="gl" x1="' + x + '" x2="' + x + '" y1="' + y1 + '" y2="' + (y1 + 4) + '"/><text x="' + x + '" y="' + (y1 + 17) + '" text-anchor="middle">' + tickLabel(t, longSpan) + "</text>"; });
      s += '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + y1 + '" y2="' + y1 + '" stroke="var(--rule)"/>';
    }
    if (cfg.baseline) { var by = Y(cfg.baseline.v); s += '<line class="base" x1="' + x0 + '" x2="' + x1 + '" y1="' + by + '" y2="' + by + '"/>'; }
    if (pts.length) {
      var d = "";
      pts.forEach(function (p, i) { var x = X(p.t), y = Y(p.v); if (i === 0) d += "M" + x + " " + y; else if (cfg.step) d += "H" + x + "V" + y; else d += "L" + x + " " + y; });
      if (cfg.area) s += '<path d="' + d + "V" + y1 + "H" + X(pts[0].t) + 'Z" fill="url(#' + gid + 'a)"/>';
      s += '<path class="ln' + (cfg.accent ? " acc" : "") + (cfg.levelGradient ? " lvg" : "") + '" d="' + d + '"' + (cfg.levelGradient ? ' style="stroke:url(#' + gid + 'l)"' : "") + "/>";
      var lp = pts[pts.length - 1];
      var endStyle = cfg.levelGradient ? ' style="fill:var(--lv' + UI_clampLv(lp.v) + ')"' : "";
      s += '<circle class="end-dot' + (cfg.accent ? " acc" : "") + '" cx="' + X(lp.t) + '" cy="' + Y(lp.v) + '" r="' + (cfg.compact ? 3 : 4.5) + '"' + endStyle + "/>";
    } else if (!cfg.compact) {
      s += '<text x="' + ((x0 + x1) / 2) + '" y="' + ((y0 + y1) / 2) + '" text-anchor="middle">Data belum tersedia untuk rentang ini</text>';
    }
    s += '<g class="hov" style="display:none"><line class="cross" y1="' + y0 + '" y2="' + y1 + '"/><circle class="hd" r="4.5"/></g>';
    s += '<rect class="ov" x="' + x0 + '" y="0" width="' + Math.max(0, x1 - x0) + '" height="' + H + '" fill="transparent"/></svg><div class="tip" hidden></div>';
    host.innerHTML = s;
    if (!pts.length) return;
    var svg = host.querySelector("svg"), hov = svg.querySelector(".hov"), ln = hov.querySelector("line"), dot = hov.querySelector("circle"), tip = host.querySelector(".tip");
    function move(ev) {
      var r = svg.getBoundingClientRect(), x = ev.clientX - r.left, best = 0, bd = Infinity;
      for (var i = 0; i < pts.length; i++) { var dd = Math.abs(X(pts[i].t) - x); if (dd < bd) { bd = dd; best = i; } }
      var p = pts[best], px = X(p.t), py = Y(p.v);
      hov.style.display = ""; ln.setAttribute("x1", px); ln.setAttribute("x2", px); dot.setAttribute("cx", px); dot.setAttribute("cy", py);
      tip.hidden = false; tip.textContent = (tmax - tmin > 23 * 60 * MIN ? dateTime(p.t) : time(p.t)) + " · " + cfg.fmt(p.v);
      tip.style.left = clamp(px, 60, W - 60) + "px"; tip.style.top = (Math.max(py, 30) - 10) + "px";
    }
    function leave() { hov.style.display = "none"; tip.hidden = true; }
    var ov = svg.querySelector(".ov");
    ov.addEventListener("pointermove", move); ov.addEventListener("pointerdown", move); ov.addEventListener("pointerleave", leave);
  }

  /* ---------- peta: denah 3D dengan pilihan 2D ---------- */
  var MAP_KEY = "smarttps_map_mode";
  function mapPref() { try { return localStorage.getItem(MAP_KEY) || "3d"; } catch (e) { return "3d"; } }
  function mapLegend() {
    return '<div class="map-legend" aria-hidden="true"><span><i class="dot lv-0"></i>Rendah</span><span><i class="dot lv-1"></i>Sedang</span><span><i class="dot lv-2"></i>Tinggi</span><span><i class="dot lv-off"></i>Tidak aktif</span></div>';
  }
  /*
   * mountMap(host, nodes, { prefix, link, onSelect, selected, focus, autoRotate, compact, legend, toggle })
   * Menampilkan denah 3D (Three.js). Jika WebGL tidak ada atau pengguna memilih 2D, memakai denah SVG.
   */
  function mountMap(host, nodes, opt) {
    opt = opt || {};
    var can3d = window.Scene3D && Scene3D.supported, mode = can3d ? mapPref() : "2d";
    var s3 = null, last = nodes, sel = opt.selected;
    host.className = "map" + (opt.compact ? " compact" : "");
    host.innerHTML = (can3d && opt.toggle !== false ? '<div class="map-switch" role="group" aria-label="Tampilan denah"><button type="button" data-m="3d">3D</button><button type="button" data-m="2d">2D</button></div>' : "") +
      (opt.legend !== false ? mapLegend() : "") + '<div class="map-body"></div>';
    var body = host.querySelector(".map-body");
    function render() {
      if (s3) { s3.destroy(); s3 = null; }
      host.querySelectorAll("[data-m]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-m") === mode); });
      if (mode === "3d" && can3d) {
        s3 = Scene3D.create(body, { nodes: last, selected: sel, focus: opt.focus, autoRotate: opt.autoRotate, onSelect: opt.onSelect || (opt.link ? function (id) { location.href = opt.link({ id: id }); } : null) });
        if (s3) { host.classList.remove("is-2d"); return; }
      }
      host.classList.add("is-2d");
      body.innerHTML = denah(last, { prefix: opt.prefix || "m", link: opt.link, selected: sel });
    }
    host.addEventListener("click", function (e) {
      var b = e.target.closest("[data-m]"); if (!b) return;
      mode = b.getAttribute("data-m");
      try { localStorage.setItem(MAP_KEY, mode); } catch (er) { /* abaikan */ }
      render();
    });
    render();
    return {
      update: function (n, s) {
        last = n; if (s !== undefined) sel = s;
        if (s3) s3.update(n, sel); else body.innerHTML = denah(last, { prefix: opt.prefix || "m", link: opt.link, selected: sel });
      }
    };
  }

  /* ---------- unduh file (CSV) ---------- */
  function download(name, text) {
    var blob = new Blob([text], { type: "text/csv;charset=utf-8" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  window.UI = {
    MIN: MIN, LV: LV, FELT: FELT, REPORT_STATUS: REPORT_STATUS,
    esc: esc, clamp: clamp, time: time, date: date, dateTime: dateTime, num: num, ago: ago,
    lvCls: lvCls, lvName: lvName, pill: pill, trend: trend, trendText: trendText, qs: qs,
    nodeName: nodeName, nodePill: nodePill, toInput: toInput, fromInput: fromInput,
    skel: skel, errorState: errorState, handleAuth: handleAuth, banners: banners,
    themePref: themePref, effectiveTheme: effectiveTheme, setTheme: setTheme, tour: tour, resetTour: resetTour,
    toast: toast, requireAuth: requireAuth, navbar: navbar, refreshBadge: refreshBadge,
    denah: denah, enableDrag: enableDrag, chart: chart, download: download, mountMap: mountMap, LOGO: LOGO
  };
})();
