/* Royal Casino · Tragaperras 3D (capa visual: NO decide resultados ni pagos).
   El juego (trGirar/trPremio) calcula todo; aquí solo se anima hasta mostrar lo ya calculado. */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Vector3, Vector2, Color, Object3D,
  PlaneGeometry, BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, ExtrudeGeometry,
  Shape, Path, MeshStandardMaterial, MeshBasicMaterial, CanvasTexture, SRGBColorSpace,
  HemisphereLight, DirectionalLight, PMREMGenerator, InstancedMesh, Raycaster,
  BackSide, ACESFilmicToneMapping, PCFShadowMap, AdditiveBlending
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const SYMS = ['cereza', 'limon', 'naranja', 'sandia', 'uva', 'diamante', 'siete', 'estrella'];
const EMO = { cereza: '🍒', limon: '🍋', naranja: '🍊', sandia: '🍉', uva: '🍇', diamante: '💎', siete: '7️⃣', estrella: '⭐' };
const N = 12, STEP = Math.PI * 2 / N, R = 0.62, RW = 0.5, GAP = 0.07;   // rodillo: 12 caras, radio, ancho
const REEL_X = [-(RW + GAP), 0, RW + GAP], REEL_Z = -0.36;
const WIN_W = 1.78, WIN_H = 0.98;                                      // ventana de los rodillos
const THEMES = {
  verde: { paint: 0x0d6b3a }, azul: { paint: 0x1747b0 }, roja: { paint: 0xa3122a }, oro: { paint: 0xa8780c }
};

let S = null, broken = false;
// estado lógico (sobrevive a destroy/init): tiras y posición de cada rodillo
const L = { reels: [0, 1, 2].map(c => ({ st: [], p: 0, from: 0, to: 0, t0: 0, dur: 0, spin: false, landed: true })), hit: null };

const now = () => performance.now();
const rm = () => { try { return (typeof fxRM === 'function') ? fxRM() : document.body.classList.contains('no-anim'); } catch (e) { return false; } };
const vip = () => document.body.classList.contains('vip-on');
const fmt = n => Number(n).toLocaleString('de-DE');
function webglOK() { try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; } }
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, srgb = true) { const t = new CanvasTexture(c); if (srgb) t.colorSpace = SRGBColorSpace; t.anisotropy = 4; S.tex.push(t); return t; }
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function rrShape(w, h, r, P = Shape) { const s = new P(), x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; }
function hash(k, c) { let x = (k * 374761393 + c * 668265263) | 0; x = (x ^ (x >>> 13)) * 1274126177; return Math.abs(x ^ (x >>> 16)); }

/* ---------- texturas de símbolos (mismos iconos SVG que la versión 2D) ---------- */
const TW = 256, TH = 176;
function symbolSVG(name) {
  const sp = document.querySelector('#cn-sprite svg'); if (!sp) return null;
  let src = sp.outerHTML.replace(/\sstyle="[^"]*"/, '').replace(/<svg\b/, '<svg width="256" height="256" viewBox="0 0 64 64"');
  if (!/xmlns=/.test(src)) src = src.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  src = src.replace(/<\/svg>\s*$/, '<use href="#cn-' + name + '" width="64" height="64"/></svg>');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
}
function paintSym(g, name, img, blur) {
  g.clearRect(0, 0, TW, TH);
  const bg = g.createLinearGradient(0, 0, 0, TH);
  bg.addColorStop(0, '#e9e2d0'); bg.addColorStop(.5, '#fbf8ef'); bg.addColorStop(1, '#e9e2d0');
  g.fillStyle = bg; g.fillRect(0, 0, TW, TH);
  g.fillStyle = 'rgba(0,0,0,.05)'; for (let i = 0; i < 160; i++) g.fillRect((hash(i, 7) % TW), (hash(i, 9) % TH), 1, 1);
  g.fillStyle = 'rgba(120,100,60,.25)'; g.fillRect(0, 0, TW, 2); g.fillRect(0, TH - 2, TW, 2);
  const sz = 132, x = (TW - sz) / 2, y = (TH - sz) / 2;
  const draw = (dy, a) => {
    g.globalAlpha = a;
    if (img) g.drawImage(img, x, y + dy, sz, sz);
    else { g.font = '110px system-ui,"Apple Color Emoji","Segoe UI Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(EMO[name], TW / 2, TH / 2 + 6 + dy); }
  };
  if (blur) { for (let i = -6; i <= 6; i++) draw(i * 9, 0.16); g.globalAlpha = 1; g.fillStyle = 'rgba(251,248,239,.25)'; g.fillRect(0, 0, TW, TH); }
  else { g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 6; g.shadowOffsetY = 3; draw(0, 1); g.shadowColor = 'transparent'; }
  g.globalAlpha = 1;
}
function buildSymbolMats() {
  S.sym = {};
  SYMS.forEach(name => {
    const [c1, g1] = cv(TW, TH), [c2, g2] = cv(TW, TH);
    paintSym(g1, name, null, false); paintSym(g2, name, null, true);
    const t1 = tex(c1), t2 = tex(c2);
    const m1 = new MeshStandardMaterial({ map: t1, roughness: 0.42, metalness: 0.0, envMapIntensity: 0.6 });
    const m2 = new MeshStandardMaterial({ map: t2, roughness: 0.5, metalness: 0.0, envMapIntensity: 0.6 });
    S.sym[name] = { sharp: m1, blur: m2 };
    const url = symbolSVG(name); if (!url) return;
    const img = new Image();
    img.onload = () => { if (!S || S.sym[name].sharp !== m1) return; paintSym(g1, name, img, false); paintSym(g2, name, img, true); t1.needsUpdate = true; t2.needsUpdate = true; S.dirty = true; kick(); };
    img.src = url;
  });
}

/* ---------- fondos y carteles ---------- */
function bgTex() {
  const [c, g] = cv(512, 512);
  const gr = g.createRadialGradient(256, 200, 20, 256, 256, 380);
  gr.addColorStop(0, '#3a1430'); gr.addColorStop(.6, '#160814'); gr.addColorStop(1, '#07030a');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 46; i++) {
    const x = hash(i, 1) % 512, y = hash(i, 2) % 330, r = 6 + hash(i, 3) % 22;
    const col = ['255,190,90', '255,80,160', '120,170,255', '255,230,150'][i % 4];
    const b = g.createRadialGradient(x, y, 0, x, y, r); b.addColorStop(0, 'rgba(' + col + ',.35)'); b.addColorStop(1, 'rgba(' + col + ',0)');
    g.fillStyle = b; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  return tex(c);
}
function marqueePaint() {
  const g = S.mq.g, W = 1024, H = 256, v = vip();
  g.clearRect(0, 0, W, H);
  const bg = g.createLinearGradient(0, 0, 0, H);
  if (v) { bg.addColorStop(0, '#1a1406'); bg.addColorStop(1, '#050403'); } else { bg.addColorStop(0, '#2a0619'); bg.addColorStop(1, '#0b0208'); }
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = v ? '#f3c75a' : '#ffd36b'; g.lineWidth = 6; rr(g, 14, 14, W - 28, H - 28, 26); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const gold = g.createLinearGradient(0, 50, 0, 170); gold.addColorStop(0, '#fff6c8'); gold.addColorStop(.5, '#f4c542'); gold.addColorStop(1, '#a8740e');
  g.font = '900 108px Georgia,"Times New Roman",serif'; g.shadowColor = v ? 'rgba(255,205,90,.9)' : 'rgba(255,60,140,.9)'; g.shadowBlur = 24;
  g.fillStyle = gold; g.fillText(v ? 'ROYAL VIP' : 'ROYAL 777', W / 2, 112);
  g.shadowBlur = 10; g.font = '700 40px system-ui,Arial,sans-serif'; g.fillStyle = v ? '#ffe7a3' : '#ffd0ea';
  const m = (typeof TR_MAQ !== 'undefined' && typeof trMaq !== 'undefined' && TR_MAQ[trMaq]) || null;
  g.fillText(v ? 'ZONA VIP · BOTE VIP' : m ? ('MÁQUINA ' + m.name.toUpperCase() + ' · ' + fmt(m.min) + '–' + fmt(m.max)) : 'TRAGAPERRAS', W / 2, 200);
  g.shadowBlur = 0; S.mq.t.needsUpdate = true;
}
function bellyTex() {
  const [c, g] = cv(1024, 256);
  const bg = g.createLinearGradient(0, 0, 1024, 0); bg.addColorStop(0, '#12051f'); bg.addColorStop(.5, '#2a0b3d'); bg.addColorStop(1, '#12051f');
  g.fillStyle = bg; g.fillRect(0, 0, 1024, 256);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 92px Georgia,serif'; g.shadowColor = 'rgba(255,200,80,.9)'; g.shadowBlur = 18; g.fillStyle = '#ffd86b';
  g.fillText('★ ★ ★  BOTE  ★ ★ ★', 512, 118);
  g.shadowBlur = 6; g.font = '600 34px system-ui,Arial,sans-serif'; g.fillStyle = '#e9d7ff';
  g.fillText('3 estrellas en la línea central', 512, 206);
  S.belly = { g, c };
  return tex(c);
}

/* ---------- construcción de la máquina ---------- */
function mats() {
  const M = S.m = {};
  M.paint = new MeshStandardMaterial({ color: 0x0d6b3a, metalness: 0.55, roughness: 0.28 });
  M.chrome = new MeshStandardMaterial({ color: 0xeef0f6, metalness: 1, roughness: 0.12 });
  M.dark = new MeshStandardMaterial({ color: 0x0b0a10, metalness: 0.3, roughness: 0.55 });
  M.inner = new MeshStandardMaterial({ color: 0x07060a, metalness: 0.1, roughness: 0.85, side: BackSide });
  M.rubber = new MeshStandardMaterial({ color: 0x141418, metalness: 0, roughness: 0.9 });
  M.ball = new MeshStandardMaterial({ color: 0xc8102e, metalness: 0.15, roughness: 0.14 });
  M.glass = new MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.07, depthWrite: false });
  M.pay = new MeshBasicMaterial({ color: 0xff2a4a, transparent: true, opacity: 0.85 });
  M.coin = new MeshStandardMaterial({ color: 0xf2c14e, metalness: 1, roughness: 0.22 });
  M.bulbs = [0, 1, 2].map(() => new MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffc860, emissiveIntensity: 2, roughness: 0.3 }));
  M.btn = new MeshStandardMaterial({ color: 0xff3048, emissive: 0xff2040, emissiveIntensity: 0.9, roughness: 0.25 });
  M.hit = new MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
}
function add(parent, geo, mat, x = 0, y = 0, z = 0, cast = true, recv = true) {
  const m = new Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = recv; parent.add(m); return m;
}
function reelPanelGeo() {
  const g = new CylinderGeometry(R, R, RW, 6, 1, true, -STEP / 2, STEP);
  g.rotateZ(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    uv.setXY(i, (x + RW / 2) / RW, 0.5 + Math.atan2(y, z) / STEP);
  }
  uv.needsUpdate = true; return g;
}
function buildMachine(scene) {
  const M = S.m, root = new Group(); scene.add(root); S.root = root;
  const FW = 2.3, FH = 2.36, FY = -0.14, FZ = 0.24, FD = 0.1;
  // carcasa: caja sin cara frontal (la tapa el panel con el hueco de la ventana)
  const bodyMats = [M.paint, M.paint, M.paint, M.paint, new MeshBasicMaterial({ visible: false }), M.dark];
  add(root, new BoxGeometry(FW, FH, 1.5), bodyMats, 0, FY, FZ - 0.75);
  // panel frontal con hueco
  const sh = rrShape(FW, FH, 0.12);
  const hp = new Path(); hp.setFromPoints(rrShape(WIN_W, WIN_H, 0.08, Path).getPoints(8).map(p => new Vector2(p.x, p.y - FY))); sh.holes = [hp];
  const fg = new ExtrudeGeometry(sh, { depth: FD, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 8 });
  add(root, fg, M.paint, 0, FY, FZ);
  // marco cromado de la ventana
  const fr = rrShape(WIN_W + 0.16, WIN_H + 0.16, 0.12); fr.holes.push(rrShape(WIN_W, WIN_H, 0.08, Path));
  S.frame = add(root, new ExtrudeGeometry(fr, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 4, curveSegments: 10 }), M.chrome, 0, 0, FZ + FD + 0.02);
  // hueco interior oscuro
  add(root, new BoxGeometry(WIN_W + 0.02, WIN_H + 0.02, 1.25), M.inner, 0, 0, FZ - 0.62, false, true);
  // rodillos
  S.reels = []; const pg = reelPanelGeo();
  const rimG = new CylinderGeometry(R + 0.012, R + 0.012, 0.018, 48); rimG.rotateZ(Math.PI / 2);
  REEL_X.forEach((x, c) => {
    const g = new Group(); g.position.set(x, 0, REEL_Z); root.add(g);
    const panels = [];
    for (let j = 0; j < N; j++) { const m = new Mesh(pg, S.sym.cereza.sharp); m.rotation.x = -j * STEP; m.receiveShadow = true; g.add(m); panels.push(m); }
    [-1, 1].forEach(s => { const r = new Mesh(rimG, M.chrome); r.position.x = s * (RW / 2 + 0.009); r.receiveShadow = true; g.add(r); });
    // brillo de premio delante del símbolo central
    const hl = add(root, new PlaneGeometry(RW - 0.02, 0.34), M.hit.clone(), x, 0, REEL_Z + R + 0.015, false, false);
    S.reels.push({ g, panels, cur: [], hl });
  });
  // separadores entre rodillos
  [-1, 1].forEach(s => add(root, new BoxGeometry(0.03, WIN_H, 0.5), M.dark, s * (RW + GAP) / 2, 0, REEL_Z + R - 0.22));
  // línea de pago y flechas
  add(root, new BoxGeometry(WIN_W - 0.06, 0.012, 0.004), M.pay, 0, 0, REEL_Z + R + 0.03, false, false);
  [-1, 1].forEach(s => { const t = add(root, new ConeLike(), M.pay, s * (WIN_W / 2 - 0.01), 0, FZ + FD + 0.07, false, false); t.rotation.z = s * Math.PI / 2; });
  // cristal
  add(root, new PlaneGeometry(WIN_W, WIN_H), M.glass, 0, 0, FZ + FD - 0.02, false, false);
  // cartel superior
  const [mc, mg] = cv(1024, 256); S.mq = { g: mg, t: tex(mc) };
  const mqMat = new MeshStandardMaterial({ map: S.mq.t, emissiveMap: S.mq.t, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.35 });
  const top = new Group(); top.position.set(0, 1.42, -0.2); root.add(top);
  add(top, new BoxGeometry(FW + 0.1, 0.78, 1.0), [M.paint, M.paint, M.chrome, M.paint, mqMat, M.dark], 0, 0, 0);
  add(top, new BoxGeometry(FW + 0.16, 0.05, 1.06), M.chrome, 0, 0.415, 0);
  // panel de la barriga, repisa de botones y bandeja
  const bt = bellyTex();
  add(root, new PlaneGeometry(1.64, 0.34), new MeshStandardMaterial({ map: bt, emissiveMap: bt, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.2 }), 0, -0.83, FZ + FD + 0.035, false, false);
  const deck = add(root, new BoxGeometry(FW + 0.04, 0.1, 0.5), M.dark, 0, -0.6, FZ + 0.25); deck.rotation.x = 0.18;
  add(root, new BoxGeometry(FW + 0.06, 0.03, 0.52), M.chrome, 0, -0.545, FZ + 0.25).rotation.x = 0.18;
  S.btn = add(root, new CylinderGeometry(0.11, 0.12, 0.06, 32), M.btn, 0.62, -0.51, FZ + 0.33); S.btn.rotation.x = 0.18;
  [-0.62, -0.25, 0.12].forEach(x => { add(root, new CylinderGeometry(0.075, 0.08, 0.05, 24), M.chrome, x, -0.52, FZ + 0.31).rotation.x = 0.18; });
  // bandeja de monedas
  const trayY = -1.2; S.trayY = trayY + 0.04;
  add(root, new BoxGeometry(1.7, 0.04, 0.5), M.chrome, 0, trayY, FZ + 0.4);
  add(root, new BoxGeometry(1.7, 0.16, 0.03), M.chrome, 0, trayY + 0.08, FZ + 0.64);
  [-1, 1].forEach(s => add(root, new BoxGeometry(0.03, 0.16, 0.5), M.chrome, s * 0.85, trayY + 0.08, FZ + 0.4));
  add(root, new PlaneGeometry(0.42, 0.07), new MeshBasicMaterial({ color: 0x030205 }), 0, trayY + 0.115, FZ + FD + 0.036, false, false);
  // bombillas: marco de la ventana y cartel
  // bombillas: 3 InstancedMesh (una por grupo de la persecución) → 3 draw calls, sin luces reales
  const bulbG = new SphereGeometry(0.035, 10, 8), bp = [];
  const ring = (pts, z) => pts.forEach(p => bp.push([p[0], p[1], z]));
  const bx = [], hw = WIN_W / 2 + 0.17, hh = WIN_H / 2 + 0.17;
  for (let k = 0; k <= 10; k++) { const x = -hw + 2 * hw * k / 10; bx.push([x, hh], [x, -hh]); }
  for (let k = 1; k < 5; k++) { const y = -hh + 2 * hh * k / 5; bx.push([-hw, y], [hw, y]); }
  ring(bx, FZ + FD + 0.06);
  const mb = []; for (let k = 0; k <= 13; k++) { const x = -1.12 + 2.24 * k / 13; mb.push([x, 1.42 + 0.35], [x, 1.42 - 0.35]); }
  ring(mb, 0.32);
  const o = new Object3D();
  S.bulbs = M.bulbs.map((m, gi) => {
    const list = bp.filter((_, k) => k % 3 === gi), im = new InstancedMesh(bulbG, m, list.length);
    list.forEach((q, k) => { o.position.set(q[0], q[1], q[2]); o.updateMatrix(); im.setMatrixAt(k, o.matrix); });
    im.instanceMatrix.needsUpdate = true; root.add(im); return im;
  });
  // palanca
  const lv = new Group(); lv.position.set(FW / 2 + 0.07, -0.05, -0.25); root.add(lv); S.lever = lv;
  const base = add(lv, new CylinderGeometry(0.13, 0.13, 0.08, 32), M.chrome, 0.02, 0, 0); base.rotation.z = Math.PI / 2;
  const arm = new Group(); lv.add(arm); S.arm = arm;
  add(arm, new CylinderGeometry(0.03, 0.035, 0.95, 20), M.chrome, 0.08, 0.47, 0, false);
  add(arm, new SphereGeometry(0.11, 32, 20), M.ball, 0.08, 0.98, 0, false);
  S.pick = [S.btn, ...arm.children];
}
function ConeLike() { const g = new CylinderGeometry(0, 0.05, 0.06, 3); return g; }

/* ---------- monedas ---------- */
function buildCoins(scene) {
  const g = new CylinderGeometry(0.075, 0.075, 0.016, 28);
  const im = new InstancedMesh(g, S.m.coin, 70); im.castShadow = false; im.count = 0; im.frustumCulled = false;
  scene.add(im); S.coins = { im, list: [], o: new Object3D() };
}
function spawnCoins(n) {
  if (!S || rm()) return;
  const C = S.coins; n = Math.min(n, 70 - C.list.length);
  for (let i = 0; i < n; i++) C.list.push({
    p: new Vector3((Math.random() - .5) * 1.2, (Math.random() - .5) * 0.4, 0.55),
    v: new Vector3((Math.random() - .5) * 2.6, 1.6 + Math.random() * 2.4, 0.5 + Math.random() * 1.2),
    r: new Vector3(Math.random() * 6, Math.random() * 6, 0), w: new Vector3((Math.random() - .5) * 18, (Math.random() - .5) * 18, 0),
    t0: now() + i * 28, rest: false
  });
  kick();
}
function stepCoins(dt, t) {
  const C = S.coins; if (!C.list.length) { C.im.count = 0; return false; }
  const floor = S.trayY, o = C.o;
  C.list = C.list.filter(k => t - k.t0 < 4200 && k.p.y > -4);
  let n = 0;
  for (const k of C.list) {
    if (t < k.t0) continue;
    if (!k.rest) {
      k.v.y -= 9.0 * dt; k.p.addScaledVector(k.v, dt); k.r.addScaledVector(k.w, dt);
      const inTray = Math.abs(k.p.x) < 0.82 && k.p.z > 0.4 && k.p.z < 0.86;
      if (inTray && k.p.y < floor && k.v.y < 0) { k.p.y = floor; k.v.y *= -0.32; k.v.x *= 0.6; k.v.z *= 0.6; k.w.multiplyScalar(0.5); if (Math.abs(k.v.y) < 0.4) { k.rest = true; k.r.set(Math.PI / 2 * 0 + 0, k.r.y, 0); } }
    }
    const age = t - k.t0, sc = age > 3600 ? Math.max(0.01, 1 - (age - 3600) / 600) : 1;
    o.position.copy(k.p); o.rotation.set(k.rest ? 0 : k.r.x, k.r.y, k.rest ? 0 : k.r.z); o.scale.setScalar(sc); o.updateMatrix();
    C.im.setMatrixAt(n++, o.matrix);
  }
  C.im.count = n; C.im.instanceMatrix.needsUpdate = true;
  return C.list.length > 0;
}

/* ---------- tema (máquina y VIP) ---------- */
function theme() {
  if (!S) return;
  const m = document.getElementById('slots-machine'); let id = 'verde';
  if (m) ['verde', 'azul', 'roja', 'oro'].forEach(k => { if (m.classList.contains('slot-' + k)) id = k; });
  const v = vip(), M = S.m;
  if (v) {
    M.paint.color.set(0x0c0b0e); M.paint.metalness = 0.45; M.paint.roughness = 0.2;
    M.chrome.color.set(0xf0c25a); M.chrome.roughness = 0.2;
    M.bulbs.forEach(b => b.emissive.set(0xffc23a));
  } else {
    M.paint.color.set(THEMES[id].paint); M.paint.metalness = 0.55; M.paint.roughness = 0.28;
    M.chrome.color.set(0xeef0f6); M.chrome.roughness = 0.12;
    M.bulbs.forEach(b => b.emissive.set(0xffd27a));
  }
  marqueePaint(); S.dirty = true; kick();
}

/* ---------- rodillos ---------- */
function profile(t) { // 0..1 → 0..1 con arranque, giro constante, frenado y pequeño rebote
  const a = 0.1, d = 0.38, v = 1 / (1 - (a + d) / 2), OV = 0.035;
  let x;
  if (t <= a) x = v * t * t / (2 * a);
  else if (t <= 1 - d) x = v * a / 2 + v * (t - a);
  else { const u = (t - (1 - d)) / d; x = v * a / 2 + v * (1 - d - a) + v * d * (u - u * u / 2); }
  // rebote: se pasa un poco y vuelve
  if (t > 0.86) { const u = (t - 0.86) / 0.14; x += OV * Math.sin(Math.PI * u) * (1 - u * 0.3); }
  return Math.min(x, 1 + OV);
}
function reelSym(rl, k, c) { return (k >= 0 && k < rl.st.length) ? rl.st[k] : SYMS[hash(k + 50, c) % 7]; }
function paintReels(t) {
  let moving = false;
  L.reels.forEach((rl, c) => {
    const V = S.reels[c]; if (!V) return;
    let speed = 0;
    if (rl.spin) {
      const u = rl.dur > 0 ? Math.min(1, (t - rl.t0) / rl.dur) : 1;
      const prev = rl.p;
      rl.p = rl.from + (rl.to - rl.from) * profile(u);
      speed = Math.abs(rl.p - prev) / Math.max(0.008, S.dt || 0.016);
      if (u >= 1) { rl.p = rl.to; rl.spin = false; if (!rl.landed) { rl.landed = true; } }
      else moving = true;
    }
    const base = rl.p + 1;
    V.g.rotation.x = base * STEP;
    const blur = speed > 7;
    for (let j = 0; j < N; j++) {
      const k = j + N * Math.round((base - j) / N);
      const s = reelSym(rl, k, c), mat = blur ? S.sym[s].blur : S.sym[s].sharp;
      if (V.panels[j].material !== mat) V.panels[j].material = mat;
    }
  });
  return moving;
}

/* resolución: completa en reposo; en móvil, 1,25 mientras giran los rodillos */
function setPR(pr) { if (!S || S.pr === pr) return; S.pr = pr; S.r.setPixelRatio(pr); if (S.w) S.r.setSize(S.w, S.h, false); S.dirty = true; }
function prFor(spinning) { return (spinning && window.innerWidth <= 900) ? Math.min(1.25, S.prFull) : S.prFull; }

/* ---------- API para el juego ---------- */
function sync(d) { // estado en reposo (al entrar en la tragaperras)
  if (!d || !d.st) return;
  d.st.forEach((st, c) => { const rl = L.reels[c]; if (rl.spin) return; rl.st = st.slice(); rl.p = d.fin[c]; });
  if (S) { S.dirty = true; kick(); }
}
function spin(d) {
  const t = now();
  L.hit = null;
  d.st.forEach((st, c) => {
    const rl = L.reels[c];
    rl.st = st.slice(); rl.from = 0; rl.p = 0; rl.to = d.fin[c]; rl.t0 = t; rl.dur = d.still ? 0 : d.durs[c]; rl.spin = !d.still; rl.landed = !!d.still;
    if (d.still) rl.p = rl.to;
  });
  if (S) {
    S.reels.forEach(V => { V.hl.material.opacity = 0; });
    if (!d.still && !rm()) S.leverT = t; else S.leverT = 0;
    setPR(prFor(!d.still)); S.dirty = true; resize(); kick();
  }
}
function result(d) {
  if (!d) return;
  const r = d.r || [];
  const hits = [0, 1, 2].map(c => d.st === 3 || (d.cash > 0 && (r[c] === r[(c + 1) % 3] || r[c] === r[(c + 2) % 3]) && r[c] !== 'estrella') || (r[c] === 'estrella' && d.win));
  L.hit = d.win ? { hits, t0: now(), big: d.st === 3 } : null;
  if (S && d.cash > 0 && d.net > 0) {
    const ratio = d.ap > 0 ? d.cash / d.ap : 2;
    spawnCoins(d.st === 3 ? 70 : Math.round(Math.min(60, 8 + ratio * 3)));
  }
  if (S) { S.dirty = true; kick(); }
}

/* ---------- render ---------- */
function frame(t) {
  if (!S) return;
  S.raf = 0;
  if (!S.on) return;
  const dt = Math.min(0.05, (t - (S.lt || t)) / 1000); S.lt = t; S.dt = dt || 0.016;
  let anim = paintReels(t);
  if (!anim && S.pr !== S.prFull && !S.leverT) setPR(S.prFull);
  // palanca
  if (S.leverT) {
    const u = (t - S.leverT) / 650; let a;
    if (u >= 1) { a = 0; S.leverT = 0; } else { a = u < 0.3 ? Math.sin(u / 0.3 * Math.PI / 2) : Math.cos((u - 0.3) / 0.7 * Math.PI / 2) * (1 + 0.12 * Math.sin((u - 0.3) * 30) * (1 - u)); a *= 1.05; anim = true; }
    S.arm.rotation.x = a; S.btn.position.y = -0.51 - (a > 0.2 ? 0.015 : 0);
  }
  // bombillas: persecución en reposo, destellos al ganar
  const still = rm(); let step = 0;
  const H = L.hit, hitAge = H ? t - H.t0 : 1e9;
  const spinning = L.reels.some(r => r.spin);
  if (still) step = -1;
  else if (hitAge < (H && H.big ? 6000 : 2600)) step = Math.floor(t / 90) % 2 + 10;
  else step = Math.floor(t / (spinning ? 90 : 220)) % 3;
  if (step !== S.bstep) {
    S.bstep = step;
    S.m.bulbs.forEach((b, i) => { b.emissiveIntensity = step < 0 ? 1.6 : step >= 10 ? ((step - 10) === (i % 2) ? 3.2 : 0.25) : (i === step ? 3 : 0.35); });
    S.dirty = true;
  }
  // brillo en los símbolos premiados
  S.reels.forEach((V, c) => {
    const want = H && H.hits[c] && hitAge < 3200 ? (still ? 0.35 : 0.22 + 0.22 * Math.sin(hitAge / 120)) : 0;
    if (Math.abs(V.hl.material.opacity - want) > 0.005) { V.hl.material.opacity = want; S.dirty = true; }
    if (want) anim = true;
  });
  if (stepCoins(dt, t)) anim = true;
  if (anim) S.dirty = true;
  if (S.dirty) { S.r.render(S.scene, S.cam); S.dirty = false; }
  if (anim) kick();
  else if (!still) { S.idle = setTimeout(() => { S && (S.idle = 0, kick()); }, 120); }
}
function kick() { if (S && S.on && !S.raf) { if (S.idle) { clearTimeout(S.idle); S.idle = 0; } S.raf = requestAnimationFrame(t => { try { frame(t); } catch (e) { console.warn('slot3d', e); destroy(); broken = true; } }); } }

/* ---------- tamaño (móvil: hasta la barra inferior, mínimo 200 px) ---------- */
function resize() {
  if (!S) return;
  const w = Math.max(200, S.stage.clientWidth || 360);
  const ideal = Math.round(Math.min(440, Math.max(280, w * 0.82)));
  let h = ideal;
  if (window.innerWidth <= 900) {
    const nav = document.querySelector('.bottom-nav');
    const navTop = nav && nav.getBoundingClientRect().height ? nav.getBoundingClientRect().top : (window.innerHeight || 800);
    const r = S.stage.getBoundingClientRect();
    const btn = document.getElementById('tr-girar'), row = btn && btn.closest('.btn-row');
    let bottom = btn ? btn.getBoundingClientRect().bottom : r.bottom + 132;
    if (row) row.querySelectorAll('button').forEach(b => { if (b.offsetParent) bottom = Math.max(bottom, b.getBoundingClientRect().bottom); });
    const need = Math.max(60, bottom - r.bottom + 12);
    h = Math.round(Math.min(ideal, Math.max(200, Math.floor(navTop - (r.top + (window.scrollY || 0)) - need)))); // posición al entrar (sin scroll)
  }
  if (S.stage.style.height !== h + 'px') S.stage.style.height = h + 'px';
  S.w = w; S.h = h; if (!S.pr) S.pr = S.prFull;
  S.r.setSize(w, h, false);
  const cam = S.cam; cam.aspect = w / h;
  const vf = cam.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * cam.aspect);
  // encuadre: ventana + palanca siempre; cartel y bandeja si hay altura
  const needW = 2.85, needH = h < 260 ? 1.55 : h < 330 ? 2.3 : 3.15;
  const cy = h < 260 ? 0.02 : h < 330 ? 0.18 : 0.12;
  const dist = Math.max(needW / 2 / Math.tan(hf / 2), needH / 2 / Math.tan(vf / 2)) + 0.12;
  const tgt = new Vector3(0.1, cy, 0.2);
  cam.position.set(tgt.x + dist * 0.16, tgt.y + dist * 0.1, tgt.z + dist);
  cam.lookAt(tgt); cam.updateProjectionMatrix();
  S.dirty = true; kick();
}

/* ---------- ciclo de vida ---------- */
function init() {
  if (S || broken) return;
  const host = document.getElementById('slots-machine'); if (!host) return;
  const win = host.querySelector('.slots-window'); if (!win) return;
  if (!webglOK()) { broken = true; return; }
  let r;
  try { r = new WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 2, alpha: false, powerPreference: 'default' }); }
  catch (e) { broken = true; return; }
  r.outputColorSpace = SRGBColorSpace; r.toneMapping = ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = true; r.shadowMap.type = PCFShadowMap; // en r187 PCF ya filtra suave (radius)
  r.shadowMap.autoUpdate = false; r.shadowMap.needsUpdate = true; // escena estática: sombras calculadas una vez, nunca durante el giro
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = r.domElement; canvas.className = 'sl3d-cv'; canvas.setAttribute('aria-hidden', 'true');
  const stage = document.createElement('div'); stage.className = 'sl3d-stage'; stage.appendChild(canvas);
  S = { host, win, stage, r, canvas, tex: [], pr: 0, prFull: Math.min(window.devicePixelRatio || 1, 2), on: true, raf: 0, idle: 0, dirty: true, bstep: null, leverT: 0 };
  try {
    const scene = new Scene(); S.scene = scene;
    scene.background = bgTex();
    const pm = new PMREMGenerator(r); const env = new RoomEnvironment();
    S.envRT = pm.fromScene(env, 0.04); scene.environment = S.envRT.texture; scene.environmentIntensity = 0.9;
    env.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); pm.dispose();
    S.cam = new PerspectiveCamera(32, 1, 0.1, 60);
    scene.add(new HemisphereLight(0xfff0e0, 0x201028, 0.5));
    const key = new DirectionalLight(0xfff3e0, 2.2); key.position.set(-2.2, 3.6, 4.2); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 4; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02;
    Object.assign(key.shadow.camera, { left: -2.2, right: 2.2, top: 2.4, bottom: -2.2, near: 0.5, far: 12 }); key.shadow.camera.updateProjectionMatrix();
    scene.add(key);
    const rim = new DirectionalLight(0xff6ab0, 0.9); rim.position.set(3, 1.5, -2); scene.add(rim);
    mats(); buildSymbolMats(); buildMachine(scene); buildCoins(scene);
    theme();
  } catch (e) { console.warn('slot3d', e); destroy(); broken = true; return; }
  S.onLost = ev => { ev.preventDefault(); destroy(); broken = true; };
  canvas.addEventListener('webglcontextlost', S.onLost);
  // tocar la palanca o el botón rojo = pulsar «Girar»
  const rc = new Raycaster(), v2 = new Vector2();
  S.onDown = ev => {
    if (!S) return; const b = canvas.getBoundingClientRect();
    v2.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
    rc.setFromCamera(v2, S.cam);
    if (rc.intersectObjects(S.pick, false).length) { const g = document.getElementById('tr-girar'); if (g && !g.disabled) g.click(); }
  };
  canvas.addEventListener('pointerdown', S.onDown);
  win.parentNode.insertBefore(stage, win);
  host.classList.add('sl3d');
  S.ro = new ResizeObserver(() => { if (S && !S.rof) S.rof = requestAnimationFrame(() => { if (S) { S.rof = 0; resize(); } }); }); S.ro.observe(stage);
  S.io = new IntersectionObserver(es => { if (!S) return; S.on = es.some(e => e.isIntersecting); if (S.on) { S.dirty = true; kick(); } }); S.io.observe(stage);
  S.mo = new MutationObserver(theme);
  S.mo.observe(host, { attributes: true, attributeFilter: ['class'] }); S.mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  S.onWin = () => resize(); window.addEventListener('resize', S.onWin);
  resize(); kick();
}
function destroy() {
  if (!S) return;
  const s = S; S = null;
  if (s.raf) cancelAnimationFrame(s.raf); if (s.idle) clearTimeout(s.idle);
  try { s.ro && s.ro.disconnect(); s.io && s.io.disconnect(); s.mo && s.mo.disconnect(); } catch (e) {}
  if (s.onWin) window.removeEventListener('resize', s.onWin);
  if (s.onLost) s.canvas.removeEventListener('webglcontextlost', s.onLost);
  if (s.onDown) s.canvas.removeEventListener('pointerdown', s.onDown);
  s.host.classList.remove('sl3d');
  try {
    if (s.scene) s.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); });
    if (s.sym) Object.values(s.sym).forEach(x => { x.sharp.dispose(); x.blur.dispose(); });
    s.tex.forEach(t => t.dispose()); if (s.envRT) s.envRT.dispose();
    s.r.dispose(); s.r.forceContextLoss();
  } catch (e) {}
  if (s.stage.parentNode) s.stage.parentNode.removeChild(s.stage);
}
function check() {
  const scr = document.getElementById('tragaperras');
  const vis = scr && scr.classList.contains('active') && !document.hidden;
  if (vis) init(); else destroy();
}
function boot() {
  const scr = document.getElementById('tragaperras'); if (!scr) return;
  new MutationObserver(check).observe(scr, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', check);
  check();
}
window.SLOT3D = { sync, spin, result, on: () => !!S, _destroy: destroy, _state: L };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
