/*
 * SMART-TPS — denah TPS 3D (Three.js r147).
 *
 * Scene3D.create(host, { nodes, selected, focus, autoRotate, onSelect })
 *   → { update(nodes, selected), destroy() }, atau null jika WebGL tidak tersedia
 *   (pemanggil lalu memakai denah 2D SVG).
 *
 * Koordinat node dalam meter dari pojok barat laut pagar (pos_x, pos_y), area 26 × 15 m.
 */
(function () {
  "use strict";

  var T = window.THREE;
  var W = 26, D = 15;
  var LV_NAME = ["Rendah", "Sedang", "Tinggi"];
  var COLORS = { 0: 0x34d17a, 1: 0xffc233, 2: 0xff5a4e, off: 0x7d8794 };

  function webglOk() {
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) { return false; }
  }
  if (!T || !T.OrbitControls || !webglOk()) {
    window.Scene3D = { supported: false, create: function () { return null; } };
    return;
  }

  // Warna hex dianggap sRGB lalu dikonversi ke linear, supaya tidak pucat saat output sRGB
  if (T.ColorManagement) T.ColorManagement.legacyMode = false;

  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  // HP atau perangkat lemah: tanpa bayangan, resolusi lebih rendah, animasi latar 20 fps
  var lowPower = coarse || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory != null && navigator.deviceMemory <= 4);
  var AMBIENT_FPS = lowPower ? 20 : 30;
  var AUTO_ROTATE_MS = 25000; // putaran otomatis berhenti sendiri supaya tidak menguras baterai
  function X(m) { return m - W / 2; }
  function Z(m) { return m - D / 2; }
  function mat(color, extra) { return new T.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.85, metalness: 0.05 }, extra || {})); }
  function rand(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

  /* ---------- dunia statis ---------- */
  function buildWorld(scene) {
    var PAD_Y = 0.12;

    // tanah luar + grid survei
    var ground = new T.Mesh(new T.PlaneGeometry(200, 200), mat(0x16243a, { roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    var g = new T.GridHelper(200, 100, 0x2a4366, 0x1d3150);
    g.position.y = 0.006; g.material.transparent = true; g.material.opacity = 0.55; scene.add(g);

    // lantai TPS (beton) + grid 1 m / 5 m
    var pad = new T.Mesh(new T.BoxGeometry(W, PAD_Y, D), mat(0xd7dde5, { roughness: 0.95 }));
    pad.position.y = PAD_Y / 2; pad.receiveShadow = true; scene.add(pad);
    var minor = [], major = [];
    for (var i = 0; i <= W; i++) (i % 5 ? minor : major).push(X(i), PAD_Y + 0.004, Z(0), X(i), PAD_Y + 0.004, Z(D));
    for (var j = 0; j <= D; j++) (j % 5 ? minor : major).push(X(0), PAD_Y + 0.004, Z(j), X(W), PAD_Y + 0.004, Z(j));
    [[minor, 0.22], [major, 0.5]].forEach(function (s) {
      var geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(s[0], 3));
      scene.add(new T.LineSegments(geo, new T.LineBasicMaterial({ color: 0x7f8da0, transparent: true, opacity: s[1] })));
    });

    // jalan akses di selatan
    var road = new T.Mesh(new T.BoxGeometry(80, 0.05, 2.8), mat(0x252a32, { roughness: 1 }));
    road.position.set(0, 0.025, Z(D) + 2.6); road.receiveShadow = true; scene.add(road);
    var dashM = mat(0xe9e2c9, { roughness: 0.6 });
    for (var dx = -39; dx < 40; dx += 3) { var dsh = new T.Mesh(new T.BoxGeometry(1.4, 0.012, 0.12), dashM); dsh.position.set(dx, 0.056, Z(D) + 2.6); scene.add(dsh); }

    // pagar BRC dengan gerbang 12–16 m di sisi selatan
    var postM = mat(0x93a0b2, { metalness: 0.5, roughness: 0.45 });
    var meshM = new T.MeshStandardMaterial({ color: 0xb5c3d6, transparent: true, opacity: 0.16, side: T.DoubleSide, depthWrite: false });
    function fence(x1, z1, x2, z2) {
      var len = Math.hypot(x2 - x1, z2 - z1), ang = Math.atan2(z2 - z1, x2 - x1), mxp = (x1 + x2) / 2, mzp = (z1 + z2) / 2;
      [0.25, 1.7].forEach(function (h) {
        var rail = new T.Mesh(new T.BoxGeometry(len, 0.05, 0.05), postM);
        rail.position.set(mxp, PAD_Y + h, mzp); rail.rotation.y = -ang; scene.add(rail);
      });
      var panel = new T.Mesh(new T.PlaneGeometry(len, 1.45), meshM);
      panel.position.set(mxp, PAD_Y + 0.98, mzp); panel.rotation.y = -ang; scene.add(panel);
      var n = Math.max(1, Math.round(len / 2));
      for (var k = 0; k <= n; k++) {
        var p = new T.Mesh(new T.BoxGeometry(0.09, 1.85, 0.09), postM);
        p.position.set(x1 + (x2 - x1) * k / n, PAD_Y + 0.92, z1 + (z2 - z1) * k / n); p.castShadow = true; scene.add(p);
      }
    }
    fence(X(0), Z(0), X(W), Z(0));
    fence(X(0), Z(0), X(0), Z(D));
    fence(X(W), Z(0), X(W), Z(D));
    fence(X(0), Z(D), X(12), Z(D));
    fence(X(16), Z(D), X(W), Z(D));
    [[12, -1], [16, 1]].forEach(function (gt) {
      var leaf = new T.Group(), pl = new T.Mesh(new T.PlaneGeometry(2, 1.45), meshM), fr = new T.Mesh(new T.BoxGeometry(2, 0.05, 0.05), postM);
      pl.position.x = gt[1] * 1; fr.position.set(gt[1] * 1, 0.72, 0); leaf.add(pl); leaf.add(fr);
      leaf.position.set(X(gt[0]), PAD_Y + 0.98, Z(D)); leaf.rotation.y = gt[1] * -0.9; scene.add(leaf);
    });

    // timbunan sampah (gundukan + kantong sampah)
    function moundH(x, z) {
      var r = Math.sqrt((x / 4.6) * (x / 4.6) + (z / 3.1) * (z / 3.1));
      if (r >= 1) return -0.06;
      var n = 0.16 * Math.sin(x * 2.1 + z * 1.3) + 0.1 * Math.sin(x * 4.7 - z * 3.1) + 0.06 * Math.cos(z * 6.3);
      return 1.7 * Math.pow(1 - r * r, 0.75) * (1 + n);
    }
    var mg = new T.PlaneGeometry(10, 7, 48, 34); mg.rotateX(-Math.PI / 2);
    var pos = mg.attributes.position;
    for (var v = 0; v < pos.count; v++) pos.setY(v, moundH(pos.getX(v), pos.getZ(v)));
    mg.computeVertexNormals();
    var mound = new T.Mesh(mg, mat(0x6f5b40, { flatShading: true, roughness: 1 }));
    var MX = X(12), MZ = Z(7.8);
    mound.position.set(MX, PAD_Y, MZ); mound.castShadow = true; mound.receiveShadow = true; scene.add(mound);
    var r = rand(42), BAG = [0x2b2f36, 0x1f6f4a, 0x2a5ea8, 0x8c2f2f, 0xdad3c4, 0x3f3a33, 0x6a7d2a];
    var bags = new T.InstancedMesh(new T.IcosahedronGeometry(0.24, 0), mat(0xffffff, { flatShading: true, roughness: 0.7 }), 70);
    var m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), c = new T.Color();
    for (var b = 0; b < 70; b++) {
      var rr = Math.sqrt(r()) * 0.9, aa = r() * Math.PI * 2, bx = 4.6 * rr * Math.cos(aa), bz = 3.1 * rr * Math.sin(aa);
      e.set(r() * 3, r() * 3, r() * 3); q.setFromEuler(e); var sc = 0.7 + r() * 0.9; s.set(sc, sc * (0.7 + r() * 0.4), sc);
      m4.compose(new T.Vector3(MX + bx, PAD_Y + moundH(bx, bz) + 0.08, MZ + bz), q, s);
      bags.setMatrixAt(b, m4); bags.setColorAt(b, c.setHex(BAG[Math.floor(r() * BAG.length)]));
    }
    bags.castShadow = true; scene.add(bags);

    // bak kontainer 6 m³ (18–23 m, 1,5–4,5 m)
    var bak = new T.Group();
    var shell = new T.Mesh(new T.BoxGeometry(5, 1.7, 3), mat(0x2f7a57, { metalness: 0.35, roughness: 0.55 }));
    shell.position.y = 0.85; shell.castShadow = true; shell.receiveShadow = true; bak.add(shell);
    var fill = new T.Mesh(new T.BoxGeometry(4.8, 0.1, 2.8), mat(0x4b3d2b, { flatShading: true }));
    fill.position.y = 1.72; bak.add(fill);
    [-1.6, 0, 1.6].forEach(function (rx) { var rib = new T.Mesh(new T.BoxGeometry(0.08, 1.72, 3.04), mat(0x266447, { metalness: 0.35 })); rib.position.set(rx, 0.86, 0); bak.add(rib); });
    bak.position.set(X(20.5), PAD_Y, Z(3)); scene.add(bak);

    // pos jaga
    var pos2 = new T.Group();
    var wall = new T.Mesh(new T.BoxGeometry(2.5, 2.3, 1.5), mat(0xe8ecf1)); wall.position.y = 1.15; wall.castShadow = true; pos2.add(wall);
    var roof = new T.Mesh(new T.BoxGeometry(2.9, 0.16, 1.9), mat(0x34506e)); roof.position.y = 2.38; roof.castShadow = true; pos2.add(roof);
    var win = new T.Mesh(new T.PlaneGeometry(0.9, 0.55), mat(0x8fd3ff, { emissive: 0x1d4f7a, emissiveIntensity: 0.6, roughness: 0.2 })); win.position.set(0.5, 1.45, 0.751); pos2.add(win);
    var door = new T.Mesh(new T.PlaneGeometry(0.6, 1.5), mat(0x5a6b80)); door.position.set(-0.6, 0.75, 0.751); pos2.add(door);
    pos2.position.set(X(2.25), PAD_Y, Z(1.75)); scene.add(pos2);

    // saluran air sisi barat
    var ch = new T.Mesh(new T.BoxGeometry(0.5, 0.04, 9), mat(0x2f7fd8, { emissive: 0x0c3a73, emissiveIntensity: 0.7, roughness: 0.25, metalness: 0.2 }));
    ch.position.set(X(1.2), PAD_Y + 0.02, Z(9.5)); scene.add(ch);

    // pepohonan
    var trunkM = mat(0x5b4632), leafM = mat(0x2e6b48, { flatShading: true });
    [[-17, -10, 1.3], [17.5, -9, 1.1], [-18, 4, 1.4], [18.5, 3, 1.2], [6, -11, 1.0], [-6, -11.5, 1.2]].forEach(function (t) {
      var tr = new T.Group(), tk = new T.Mesh(new T.CylinderGeometry(0.12, 0.16, 1.4, 6), trunkM), lf = new T.Mesh(new T.IcosahedronGeometry(t[2], 0), leafM);
      tk.position.y = 0.7; lf.position.y = 1.4 + t[2] * 0.75; tk.castShadow = lf.castShadow = true;
      tr.add(tk); tr.add(lf); tr.position.set(t[0], 0, t[1]); scene.add(tr);
    });
  }

  /* ---------- node ---------- */
  function buildNode(scene, n) {
    var g = new T.Group(), PAD_Y = 0.12;
    var poleM = mat(0x9aa3ae, { metalness: 0.6, roughness: 0.35 });
    var base = new T.Mesh(new T.CylinderGeometry(0.28, 0.32, 0.08, 20), poleM); base.position.y = PAD_Y + 0.04; g.add(base);
    var pole = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 1.45, 10), poleM); pole.position.y = PAD_Y + 0.8; pole.castShadow = true; g.add(pole);
    var box = new T.Mesh(new T.BoxGeometry(0.58, 0.4, 0.44), new T.MeshStandardMaterial({ color: 0xeef3f8, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.92 }));
    box.position.y = PAD_Y + 1.62; box.castShadow = true; g.add(box);
    for (var i = 0; i < 3; i++) { var cap = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.08, 12), mat(0x9aa6b4, { metalness: 0.7 })); cap.position.set(-0.17 + i * 0.17, PAD_Y + 1.86, 0); g.add(cap); }
    var orbM = new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.4, roughness: 0.3 });
    var orb = new T.Mesh(new T.SphereGeometry(0.2, 24, 16), orbM); orb.position.y = PAD_Y + 2.12; g.add(orb);
    var light = new T.PointLight(0xffffff, 0.9, 7, 2); light.position.y = PAD_Y + 2.12; g.add(light);
    var ringM = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false });
    var ring = new T.Mesh(new T.RingGeometry(0.62, 0.78, 48), ringM); ring.rotation.x = -Math.PI / 2; ring.position.y = PAD_Y + 0.012; g.add(ring);
    var pulseM = ringM.clone(), pulse = new T.Mesh(new T.RingGeometry(0.7, 0.8, 48), pulseM); pulse.rotation.x = -Math.PI / 2; pulse.position.y = PAD_Y + 0.014; g.add(pulse);
    var selM = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: T.DoubleSide, depthWrite: false });
    var sel = new T.Mesh(new T.RingGeometry(1.05, 1.17, 64), selM); sel.rotation.x = -Math.PI / 2; sel.position.y = PAD_Y + 0.016; g.add(sel);
    var puffs = [];
    for (var p = 0; p < 5; p++) {
      var pm = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      var pf = new T.Mesh(new T.SphereGeometry(0.55, 16, 12), pm); g.add(pf); puffs.push(pf);
    }
    var hit = new T.Mesh(new T.CylinderGeometry(1, 1, 3, 10), new T.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1.5; hit.userData.id = n.id; g.add(hit);
    g.position.set(X(n.x), 0, Z(n.y));
    scene.add(g);
    return { id: n.id, g: g, orb: orb, orbM: orbM, light: light, ring: ring, ringM: ringM, pulse: pulse, pulseM: pulseM, sel: sel, puffs: puffs, hit: hit, level: null, active: true, phase: Math.random() * 10 };
  }
  function paintNode(o, n, selected) {
    o.level = n.level; o.active = n.active;
    var hex = n.active && n.level != null ? COLORS[n.level] : COLORS.off;
    o.orbM.color.setHex(hex); o.orbM.emissive.setHex(hex); o.orbM.emissiveIntensity = n.active ? 1.4 : 0.05;
    o.light.color.setHex(hex); o.light.intensity = n.active ? (n.level === 2 ? 1.6 : 0.9) : 0;
    o.ringM.color.setHex(hex); o.ringM.opacity = n.active ? 0.85 : 0.4;
    o.pulseM.color.setHex(hex);
    o.puffs.forEach(function (p) { p.material.color.setHex(hex); });
    o.sel.visible = selected === n.id;
    o.g.position.set(X(n.x), 0, Z(n.y));
  }
  function animateNode(o, t) {
    var lv = o.active ? o.level : -1, k;
    // denyut cincin
    var speed = lv === 2 ? 1.1 : lv === 1 ? 0.6 : 0;
    if (speed && !reduceMotion) {
      k = ((t + o.phase) * speed) % 1;
      o.pulse.visible = true; o.pulse.scale.setScalar(1 + k * 2.6); o.pulseM.opacity = 0.7 * (1 - k);
    } else { o.pulse.visible = false; }
    // kepulan bau naik dari node
    var count = lv === 2 ? 5 : lv === 1 ? 3 : 0;
    o.puffs.forEach(function (p, i) {
      if (i >= count) { p.visible = false; return; }
      p.visible = true;
      var u = reduceMotion ? (i + 0.5) / count : (((t + o.phase) * (lv === 2 ? 0.28 : 0.18)) + i / count) % 1;
      p.position.set(Math.sin(i * 2.3 + u * 3) * 0.35 * u, 2.2 + u * (lv === 2 ? 3.2 : 2.2), Math.cos(i * 1.7 + u * 2) * 0.35 * u);
      p.scale.setScalar((lv === 2 ? 0.7 : 0.5) + u * (lv === 2 ? 1.9 : 1.2));
      p.material.opacity = (lv === 2 ? 0.2 : 0.14) * Math.sin(Math.PI * u);
    });
    if (!reduceMotion && o.active) o.orbM.emissiveIntensity = 1.2 + 0.35 * Math.sin((t + o.phase) * (lv === 2 ? 5 : 2));
  }

  /* ---------- create ---------- */
  function create(host, opt) {
    opt = opt || {};
    var renderer;
    try { renderer = new T.WebGLRenderer({ antialias: !lowPower, alpha: true, powerPreference: lowPower ? "low-power" : "high-performance" }); }
    catch (e) { return null; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = !lowPower;
    renderer.shadowMap.type = T.PCFSoftShadowMap;

    host.innerHTML = "";
    var stage = document.createElement("div"); stage.className = "s3-stage";
    var labels = document.createElement("div"); labels.className = "s3-labels";
    var tools = document.createElement("div"); tools.className = "s3-tools";
    tools.innerHTML = '<button type="button" data-z="-1" aria-label="Perbesar">+</button><button type="button" data-z="1" aria-label="Perkecil">−</button><button type="button" data-z="0" aria-label="Kembalikan sudut pandang">Reset</button>';
    var hint = document.createElement("div"); hint.className = "s3-hint";
    hint.textContent = coarse ? "Geser dengan dua jari untuk memutar" : "Seret untuk memutar · klik node untuk detail";
    stage.appendChild(renderer.domElement); stage.appendChild(labels); stage.appendChild(tools); stage.appendChild(hint);
    host.appendChild(stage);

    var scene = new T.Scene();
    scene.fog = new T.Fog(0x101d31, 55, 120);
    var camera = new T.PerspectiveCamera(34, 1, 0.1, 400);

    scene.add(new T.HemisphereLight(0xcfe2ff, 0x1a2433, 0.75));
    var sun = new T.DirectionalLight(0xfff1dc, 1.25);
    sun.position.set(14, 24, 10); sun.castShadow = !lowPower;
    sun.shadow.mapSize.set(2048, 2048);
    var sc = sun.shadow.camera; sc.left = -22; sc.right = 22; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 70;
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    var rim = new T.DirectionalLight(0x6fa8ff, 0.35); rim.position.set(-18, 10, -14); scene.add(rim);

    buildWorld(scene);

    var nodeObjs = {}, hits = [];
    (opt.nodes || []).forEach(function (n) { var o = buildNode(scene, n); nodeObjs[n.id] = o; hits.push(o.hit); });

    var labelEls = {};
    function makeLabels(nodes) {
      labels.innerHTML = "";
      nodes.forEach(function (n) {
        var b = document.createElement(opt.onSelect ? "button" : "div");
        if (opt.onSelect) { b.type = "button"; b.addEventListener("click", function () { opt.onSelect(n.id); }); }
        b.className = "s3-label";
        labels.appendChild(b); labelEls[n.id] = b;
      });
    }
    function paintLabel(n, selected) {
      var b = labelEls[n.id]; if (!b) return;
      var name = n.noData ? "Belum ada data" : n.active && n.level != null ? LV_NAME[n.level] : "Tidak aktif";
      b.className = "s3-label " + (n.active && n.level != null ? "lv-" + n.level : "lv-off") + (selected === n.id ? " is-sel" : "");
      b.innerHTML = "<b>" + n.id + "</b><span>" + name + "</span>";
      b.setAttribute("aria-label", n.id + ", " + name + (opt.onSelect ? ", buka detail" : ""));
    }

    var current = opt.nodes || [], selected = opt.selected || null;
    function update(nodes, sel) {
      current = nodes; if (sel !== undefined) selected = sel;
      nodes.forEach(function (n) { if (nodeObjs[n.id]) { paintNode(nodeObjs[n.id], n, selected); paintLabel(n, selected); } });
      wake();
    }
    makeLabels(current);
    update(current, selected);

    // kamera & kontrol
    var focus = opt.focus ? current.filter(function (n) { return n.id === opt.focus; })[0] : null;
    var target = focus ? new T.Vector3(X(focus.x), 1, Z(focus.y)) : new T.Vector3(0, 0.6, -0.5);
    var controls = new T.OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.enablePan = false; controls.enableZoom = false;
    controls.minPolarAngle = 0.35; controls.maxPolarAngle = 1.32;
    controls.rotateSpeed = 0.7;
    controls.autoRotate = !!opt.autoRotate && !reduceMotion; controls.autoRotateSpeed = 0.55;
    var autoUntil = 0, interacting = false;
    if (coarse) { controls.touches = { ONE: -1, TWO: T.TOUCH.DOLLY_ROTATE }; renderer.domElement.style.touchAction = "pan-y"; }
    controls.addEventListener("start", function () { controls.autoRotate = false; interacting = true; stage.classList.add("used"); wake(); });
    controls.addEventListener("end", function () { interacting = false; wake(); });
    controls.addEventListener("change", function () { dirty = true; });

    var baseDist = 40;
    function fitDistance() {
      var a = camera.aspect;
      if (focus) return a < 0.9 ? 26 : 21;
      return a >= 1.6 ? 37 : a >= 1.2 ? 41 : a >= 0.9 ? 48 : 58;
    }
    function placeCamera(dist) {
      var theta = focus ? 0.5 : 0.62, phi = 0.92;
      camera.position.set(target.x + dist * Math.sin(phi) * Math.sin(theta), target.y + dist * Math.cos(phi), target.z + dist * Math.sin(phi) * Math.cos(theta));
      controls.target.copy(target); controls.update();
    }
    function zoom(dir) {
      if (dir === 0) { baseDist = fitDistance(); placeCamera(baseDist); return; }
      var v = camera.position.clone().sub(controls.target), len = T.MathUtils.clamp(v.length() * (dir < 0 ? 0.82 : 1.22), 9, 90);
      camera.position.copy(controls.target).add(v.setLength(len));
      stage.classList.add("used");
      wake();
    }
    tools.addEventListener("click", function (e) { var b = e.target.closest("[data-z]"); if (b) zoom(+b.getAttribute("data-z")); });

    // klik / hover node di kanvas
    var ray = new T.Raycaster(), ptr = new T.Vector2(), downAt = null;
    function pick(ev) {
      var r = renderer.domElement.getBoundingClientRect();
      ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, camera);
      var hitObj = ray.intersectObjects(hits, false)[0];
      return hitObj ? hitObj.object.userData.id : null;
    }
    renderer.domElement.addEventListener("pointerdown", function (e) { downAt = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener("pointerup", function (e) {
      if (!opt.onSelect || !downAt) return;
      if (Math.abs(e.clientX - downAt[0]) + Math.abs(e.clientY - downAt[1]) > 6) return;
      var id = pick(e); if (id) opt.onSelect(id);
    });
    if (opt.onSelect && !coarse) renderer.domElement.addEventListener("pointermove", function (e) {
      if (e.buttons) return;
      renderer.domElement.style.cursor = pick(e) ? "pointer" : "grab";
    });

    // ukuran
    var sized = false, lastW = 0, lastH = 0;
    function resize() {
      var w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h || (w === lastW && h === lastH)) return; // abaikan jika ukuran tidak berubah
      lastW = w; lastH = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      if (!sized || !stage.classList.contains("used")) { baseDist = fitDistance(); placeCamera(baseDist); sized = true; }
      wake();
    }
    var ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(stage); else window.addEventListener("resize", resize);
    resize();

    // label HTML mengikuti posisi node di layar
    var tmp = new T.Vector3();
    function placeLabels() {
      var w = stage.clientWidth, h = stage.clientHeight;
      current.forEach(function (n) {
        var o = nodeObjs[n.id], el = labelEls[n.id]; if (!o || !el) return;
        tmp.set(o.g.position.x, 2.75, o.g.position.z).project(camera);
        var vis = tmp.z < 1;
        el.style.transform = "translate(" + ((tmp.x * 0.5 + 0.5) * w) + "px," + ((-tmp.y * 0.5 + 0.5) * h) + "px) translate(-50%,-100%)";
        el.style.visibility = vis ? "visible" : "hidden";
      });
    }

    /*
     * Loop render hemat daya:
     * - diputar / sisa gerak damping: 60 fps
     * - animasi latar (node Sedang/Tinggi, putaran otomatis): 30 fps, HP 20 fps
     * - diam: loop berhenti total, bangun lagi saat ada interaksi, data baru, atau ukuran berubah
     * - tidak terlihat di layar atau tab disembunyikan: berhenti
     */
    var visible = true, alive = true, running = false, dirty = true, raf = 0, lastRender = 0, clock = new T.Clock();
    function hasAmbient() {
      if (reduceMotion) return false;
      for (var id in nodeObjs) { var o = nodeObjs[id]; if (o.active && (o.level === 1 || o.level === 2)) return true; }
      return false;
    }
    function wake() {
      dirty = true;
      if (!running && alive && visible && !document.hidden) { running = true; raf = requestAnimationFrame(frame); }
    }
    function frame(now) {
      if (!alive || !visible || document.hidden) { running = false; return; }
      if (controls.autoRotate) {
        if (!autoUntil) autoUntil = now + AUTO_ROTATE_MS;
        else if (now > autoUntil) controls.autoRotate = false;
      }
      var moving = controls.update(), spinning = controls.autoRotate;
      var fps = interacting || (moving && !spinning) ? 60 : (hasAmbient() || spinning) ? AMBIENT_FPS : 0;
      if (!fps && !dirty) { running = false; return; }
      raf = requestAnimationFrame(frame);
      if (!dirty && fps < 60 && now - lastRender < 1000 / fps - 2) return;
      lastRender = now; dirty = false;
      var t = clock.getElapsedTime();
      for (var id in nodeObjs) animateNode(nodeObjs[id], t);
      renderer.render(scene, camera);
      placeLabels();
    }
    var io = window.IntersectionObserver ? new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) wake(); }) : null;
    if (io) io.observe(stage);
    function onVis() { if (!document.hidden) wake(); }
    document.addEventListener("visibilitychange", onVis);
    wake();

    return {
      update: update,
      destroy: function () {
        alive = false; cancelAnimationFrame(raf);
        if (ro) ro.disconnect(); if (io) io.disconnect();
        document.removeEventListener("visibilitychange", onVis);
        controls.dispose(); renderer.dispose();
        scene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(function (m) { m.dispose(); }); });
        host.innerHTML = "";
      }
    };
  }

  window.Scene3D = { supported: true, create: create };
})();
