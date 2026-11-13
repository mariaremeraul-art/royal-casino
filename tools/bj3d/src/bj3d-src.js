/* Royal Casino · Blackjack 3D (capa visual, no toca la lógica del juego) */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Vector3, Color,
  PlaneGeometry, BoxGeometry, CylinderGeometry, SphereGeometry, CircleGeometry, RingGeometry,
  TorusGeometry, TubeGeometry, ShapeGeometry, ConeGeometry, Shape, Curve,
  MeshLambertMaterial, MeshBasicMaterial, CanvasTexture, SRGBColorSpace,
  HemisphereLight, DirectionalLight, DoubleSide
} from './three-src.js';

const CW = 0.42, CH = 0.59;              // tamaño de carta
const DEALER_Z = -0.17, PLAYER_Z = 0.86;  // filas de cartas
const SABOT = new Vector3(1.45, 0.2, -0.32);

let S = null;            // estado vivo (null = sin 3D)
let broken = false;      // WebGL falló: vista clásica para siempre
let last = null;         // último estado recibido del juego

const now = () => performance.now();
const rm = () => { try { return (typeof fxRM === 'function') ? fxRM() : document.body.classList.contains('no-anim'); } catch (e) { return false; } };
const ease = t => 1 - Math.pow(1 - t, 3);

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2')); } catch (e) { return false; }
}

/* ---------- texturas dibujadas en canvas ---------- */
function tex(c) { const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4; S.tex.push(t); return t; }
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function cardTex(card) {
  if (S.cardTex[card]) return S.cardTex[card];
  const [c, g] = cv(170, 240);
  const v = String(card).slice(0, -1), s = String(card).slice(-1), red = s === '♥' || s === '♦';
  g.fillStyle = '#fffdf6'; rr(g, 2, 2, 166, 236, 16); g.fill();
  g.strokeStyle = '#d8d0bd'; g.lineWidth = 3; g.stroke();
  g.fillStyle = red ? '#c8102e' : '#16161d';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '800 40px system-ui,Arial,sans-serif'; g.fillText(v, 30, 32);
  g.font = '34px system-ui,Arial,sans-serif'; g.fillText(s, 30, 68);
  g.save(); g.translate(170, 240); g.rotate(Math.PI);
  g.font = '800 40px system-ui,Arial,sans-serif'; g.fillText(v, 30, 32);
  g.font = '34px system-ui,Arial,sans-serif'; g.fillText(s, 30, 68); g.restore();
  if (v === 'J' || v === 'Q' || v === 'K') {
    g.strokeStyle = red ? '#c8102e' : '#16161d'; g.lineWidth = 3; rr(g, 46, 56, 78, 128, 10); g.stroke();
    g.fillStyle = 'rgba(212,175,55,.25)'; rr(g, 46, 56, 78, 128, 10); g.fill();
    g.fillStyle = red ? '#c8102e' : '#16161d'; g.font = '900 64px Georgia,serif'; g.fillText(v, 85, 108);
    g.font = '36px system-ui,Arial,sans-serif'; g.fillText(s, 85, 158);
  } else {
    g.font = (v === 'A' ? '110px' : '86px') + ' system-ui,Arial,sans-serif'; g.fillText(s, 85, 124);
  }
  return (S.cardTex[card] = tex(c));
}
function backTex() {
  if (S.backTex) return S.backTex;
  const [c, g] = cv(170, 240);
  g.fillStyle = '#fffdf6'; rr(g, 2, 2, 166, 236, 16); g.fill();
  const gr = g.createLinearGradient(0, 0, 170, 240); gr.addColorStop(0, '#8e1022'); gr.addColorStop(1, '#4a0611');
  g.fillStyle = gr; rr(g, 12, 12, 146, 216, 10); g.fill();
  g.strokeStyle = 'rgba(255,214,102,.55)'; g.lineWidth = 2;
  for (let i = -240; i < 400; i += 18) { g.beginPath(); g.moveTo(i, 12); g.lineTo(i + 216, 228); g.stroke(); g.beginPath(); g.moveTo(i + 216, 12); g.lineTo(i, 228); g.stroke(); }
  g.strokeStyle = '#e8c15a'; g.lineWidth = 4; rr(g, 18, 18, 134, 204, 8); g.stroke();
  g.fillStyle = '#4a0611'; g.beginPath(); g.arc(85, 120, 30, 0, 7); g.fill(); g.strokeStyle = '#e8c15a'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#e8c15a'; g.font = '900 34px Georgia,serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('R', 85, 122);
  return (S.backTex = tex(c));
}
function arcText(g, txt, cx, cy, R, a0, a1, font, col) {
  g.save(); g.font = font; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = txt.length;
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * (i + .5) / n;
    g.save(); g.translate(cx + R * Math.cos(a), cy + R * Math.sin(a)); g.rotate(a - Math.PI / 2); g.fillText(txt[i], 0, 0); g.restore();
  }
  g.restore();
}
function feltTex() {
  const [c, g] = cv(1024, 1024);
  const gr = g.createRadialGradient(512, 560, 60, 512, 512, 560);
  gr.addColorStop(0, '#17935f'); gr.addColorStop(.6, '#0d6a45'); gr.addColorStop(1, '#063a27');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 2600; i++) { g.fillStyle = Math.random() < .5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)'; g.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2); }
  g.strokeStyle = 'rgba(232,193,90,.75)'; g.lineWidth = 5;
  g.beginPath(); g.arc(512, 512, 488, 0.04 * Math.PI, 0.96 * Math.PI); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.arc(512, 512, 300, 0.12 * Math.PI, 0.88 * Math.PI); g.stroke();
  arcText(g, 'BLACKJACK PAGA 3 A 2', 512, 512, 282, 0.75 * Math.PI, 0.25 * Math.PI, '800 30px Georgia,serif', '#f2d27a');
  arcText(g, 'EL CRUPIER PIDE CON 16 Y SE PLANTA CON 17', 512, 512, 250, 0.8 * Math.PI, 0.2 * Math.PI, '700 17px system-ui,Arial,sans-serif', 'rgba(255,246,194,.8)');
  arcText(g, 'SEGURO PAGA 2 A 1', 512, 512, 222, 0.66 * Math.PI, 0.34 * Math.PI, '700 16px system-ui,Arial,sans-serif', 'rgba(255,246,194,.7)');
  return tex(c);
}
function bgTex() {
  const [c, g] = cv(512, 512);
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#12040c'); gr.addColorStop(.55, '#3a0b1f'); gr.addColorStop(1, '#14040b');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 512, y = 40 + Math.random() * 230, r = 6 + Math.random() * 18;
    const b = g.createRadialGradient(x, y, 0, x, y, r);
    b.addColorStop(0, 'rgba(255,205,110,.55)'); b.addColorStop(1, 'rgba(255,205,110,0)');
    g.fillStyle = b; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const v = g.createRadialGradient(256, 230, 80, 256, 256, 380); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.6)');
  g.fillStyle = v; g.fillRect(0, 0, 512, 512);
  return tex(c);
}

/* ---------- materiales y mallas ---------- */
const lam = (col, o) => new MeshLambertMaterial(Object.assign({ color: col, flatShading: true }, o || {}));
function add(parent, geo, mat, x, y, z, rx, ry, rz) {
  const m = new Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0);
  if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0); parent.add(m); return m;
}

class HalfEllipse extends Curve {
  constructor(a, b, z0, y) { super(); this.a = a; this.b = b; this.z0 = z0; this.y = y; }
  getPoint(t, o = new Vector3()) { const ang = Math.PI * t; return o.set(this.a * Math.cos(ang), this.y, this.z0 + this.b * Math.sin(ang)); }
}

function buildTable(scene) {
  const A = 2.3, B = 1.9, Z0 = -0.62;
  const felt = add(scene, new CircleGeometry(1, 64, Math.PI, Math.PI), new MeshLambertMaterial({ map: feltTex() }), 0, 0, Z0, -Math.PI / 2);
  felt.scale.set(A, B, 1);
  // cuerpo de madera
  const body = add(scene, new CylinderGeometry(1, 1, 0.42, 48, 1, false, -Math.PI / 2, Math.PI), lam(0x3b1d10), 0, -0.22, Z0);
  body.scale.set(A + 0.1, 1, B + 0.1);
  // borde acolchado (cuero)
  const leather = new MeshLambertMaterial({ color: 0x4a1f12 });
  add(scene, new TubeGeometry(new HalfEllipse(A + 0.02, B + 0.02, Z0, 0.05), 72, 0.1, 12, false), leather);
  add(scene, new SphereGeometry(0.1, 12, 8), leather, A + 0.02, 0.05, Z0);
  add(scene, new SphereGeometry(0.1, 12, 8), leather, -A - 0.02, 0.05, Z0);
  // filete dorado interior
  add(scene, new TubeGeometry(new HalfEllipse(A - 0.1, B - 0.1, Z0, 0.012), 72, 0.012, 5, false), new MeshLambertMaterial({ color: 0xd4af37, emissive: 0x3a2a00 }));
  // canto trasero de madera (lado de la crupier)
  add(scene, new BoxGeometry(2 * A + 0.3, 0.1, 0.12), lam(0x5a2e16), 0, 0.02, Z0 - 0.04);
  // bandeja de fichas de la crupier
  const tray = add(scene, new BoxGeometry(1.2, 0.05, 0.16), lam(0x2a1408), 0, 0.03, Z0 + 0.09);
  const cols = [0xd32f2f, 0x1e9e4a, 0x1f5fd1, 0x111111, 0x7b3fe4, 0xe0a800];
  const chipG = new CylinderGeometry(0.07, 0.07, 0.022, 14);
  cols.forEach((col, i) => { const m = lam(col); for (let k = 0; k < 4; k++) add(scene, chipG, m, -0.48 + i * 0.19, 0.067 + k * 0.024, Z0 + 0.09); });
  // sabot (zapato de cartas)
  const sab = new Group(); sab.position.copy(SABOT).setY(0); sab.rotation.y = -0.5; scene.add(sab);
  add(sab, new BoxGeometry(0.42, 0.2, 0.56), lam(0x1a1a22), 0, 0.1, 0);
  add(sab, new BoxGeometry(0.36, 0.17, 0.5), new MeshLambertMaterial({ color: 0xf4efe2 }), 0, 0.12, -0.02);
  add(sab, new BoxGeometry(0.44, 0.03, 0.58), lam(0x24242e), 0, 0.215, 0);
  add(sab, new BoxGeometry(0.45, 0.035, 0.04), lam(0xd4af37), 0, 0.215, 0.29);
  add(sab, new BoxGeometry(0.45, 0.035, 0.04), lam(0xd4af37), 0, 0.215, -0.29);
  const tb = add(sab, new PlaneGeometry(CW * 0.9, CH * 0.5), new MeshBasicMaterial({ map: backTex() }), 0, 0.16, 0.285, -0.35);
  tb.rotation.x = -0.3;
  // círculos de apuesta del jugador
  S.rings = [];
  for (let i = 0; i < 3; i++) {
    const r = add(scene, new RingGeometry(0.4, 0.43, 40), new MeshBasicMaterial({ color: 0xe8c15a, transparent: true, opacity: .7 }), 0, 0.004, PLAYER_Z + 0.02, -Math.PI / 2);
    S.rings.push(r);
  }
}

function buildDealer(scene) {
  const D = new Group(); D.position.set(0, 0, -1.05); scene.add(D);
  const skin = lam(0xf2c6a2), shirt = lam(0xf7f7f4), vest = lam(0x1b1b2b), hair = lam(0x4a2a1a), black = lam(0x0c0c10), gold = lam(0xd4af37, { emissive: 0x2a1e00 });
  const body = new Group(); D.add(body);
  // torso: camisa blanca debajo, chaleco oscuro encima
  const torso = add(body, new CylinderGeometry(0.3, 0.25, 0.92, 14), vest, 0, 0.3, 0); torso.scale.z = 0.62;
  // pechera blanca en V
  const v = new Shape(); v.moveTo(-0.13, 0); v.lineTo(0.13, 0); v.lineTo(0, -0.36); v.closePath();
  add(body, new ShapeGeometry(v), new MeshLambertMaterial({ color: 0xf7f7f4 }), 0, 0.755, 0.188, -0.18);
  // solapas del chaleco
  const lap = new Shape(); lap.moveTo(0, 0); lap.lineTo(0.035, 0); lap.lineTo(0.0, -0.37); lap.lineTo(-0.02, -0.33); lap.closePath();
  add(body, new ShapeGeometry(lap), lam(0x2c2c44), -0.135, 0.757, 0.192, -0.18, 0, 0.36);
  const lap2 = add(body, new ShapeGeometry(lap), lam(0x2c2c44), 0.135, 0.757, 0.192, -0.18, 0, -0.36); lap2.scale.x = -1;
  // botones dorados y placa con nombre
  for (let i = 0; i < 3; i++) add(body, new SphereGeometry(0.016, 8, 6), gold, 0, 0.33 - i * 0.1, 0.176 - i * 0.002);
  add(body, new BoxGeometry(0.1, 0.035, 0.01), gold, 0.15, 0.6, 0.168, -0.15);
  // hombros (mangas de camisa)
  [-1, 1].forEach(s => add(body, new SphereGeometry(0.1, 12, 10), shirt, s * 0.3, 0.68, 0));
  // cuello
  add(body, new CylinderGeometry(0.06, 0.07, 0.12, 10), skin, 0, 0.8, 0.01);
  // cuello de la camisa
  const col = new Shape(); col.moveTo(0, 0); col.lineTo(0.08, 0.025); col.lineTo(0.06, -0.05); col.closePath();
  add(body, new ShapeGeometry(col), new MeshLambertMaterial({ color: 0xffffff, side: DoubleSide }), 0.005, 0.77, 0.09, -0.3);
  const c2 = add(body, new ShapeGeometry(col), new MeshLambertMaterial({ color: 0xffffff, side: DoubleSide }), -0.005, 0.77, 0.09, -0.3); c2.scale.x = -1;
  // pajarita
  const bow = new Group(); bow.position.set(0, 0.755, 0.12); body.add(bow);
  [-1, 1].forEach(s => { const w = add(bow, new ConeGeometry(0.04, 0.07, 4), black, s * 0.036, 0, 0, 0, 0, s * Math.PI / 2); w.scale.z = 0.5; });
  add(bow, new SphereGeometry(0.018, 8, 6), black, 0, 0, 0.004);
  // cabeza
  const head = new Group(); head.position.set(0, 1.04, 0.01); D.add(head);
  add(head, new SphereGeometry(0.2, 20, 16), skin, 0, 0, 0).scale.set(1, 1.1, 0.95);
  // pelo largo castaño, por detrás de los hombros, con flequillo de lado
  const cap = add(head, new SphereGeometry(0.214, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), hair, 0, 0.015, -0.005, -0.2);
  cap.scale.set(1.04, 1.12, 1.02);
  add(head, new SphereGeometry(0.2, 16, 12), hair, 0, -0.07, -0.07).scale.set(1.12, 1.35, 0.85);
  [-1, 1].forEach(s => { const l = add(head, new CylinderGeometry(0.065, 0.085, 0.36, 10), hair, s * 0.175, -0.15, -0.01, 0, 0, s * 0.08); l.scale.z = 0.8; });
  add(head, new SphereGeometry(0.11, 12, 8), hair, -0.07, 0.16, 0.12, 0, 0, 0.35).scale.set(1.35, 0.42, 0.6);
  add(head, new SphereGeometry(0.08, 12, 8), hair, 0.09, 0.17, 0.1, 0, 0, -0.3).scale.set(1.2, 0.4, 0.6);
  // cara
  const eyeG = new SphereGeometry(0.027, 12, 10);
  S.eyes = [-1, 1].map(s => add(head, eyeG, black, s * 0.072, 0.015, 0.177));
  [-1, 1].forEach(s => { add(head, new SphereGeometry(0.009, 6, 4), lam(0xffffff), s * 0.064, 0.027, 0.2); });
  [-1, 1].forEach(s => add(head, new BoxGeometry(0.03, 0.008, 0.012), black, s * 0.1, 0.04, 0.17, 0, 0, s * 0.5));
  [-1, 1].forEach(s => add(head, new BoxGeometry(0.055, 0.01, 0.01), hair, s * 0.072, 0.07, 0.188, 0, 0, s * -0.15));
  [-1, 1].forEach(s => add(head, new SphereGeometry(0.022, 10, 8), lam(0xf4aaa0), s * 0.118, -0.045, 0.15).scale.set(1, 0.6, 0.35));
  add(head, new SphereGeometry(0.014, 8, 6), lam(0xe8b08c), 0, -0.025, 0.205);
  add(head, new TorusGeometry(0.032, 0.01, 6, 12, Math.PI), lam(0xd0505f), 0, -0.075, 0.185, 0, 0, Math.PI);
  // orejas y pendientes discretos
  [-1, 1].forEach(s => { add(head, new SphereGeometry(0.035, 8, 6), skin, s * 0.195, 0, 0).scale.set(0.5, 1, 0.8); add(head, new SphereGeometry(0.012, 6, 4), gold, s * 0.2, -0.045, 0.005); });
  // brazos (articulados: hombro y codo)
  S.arms = [-1, 1].map(s => {
    const sh = new Group(); sh.position.set(s * 0.32, 0.66, 0); body.add(sh);
    add(sh, new CylinderGeometry(0.07, 0.06, 0.34, 10), shirt, 0, -0.17, 0);
    const el = new Group(); el.position.set(0, -0.34, 0); sh.add(el);
    add(el, new CylinderGeometry(0.058, 0.05, 0.3, 10), shirt, 0, -0.15, 0);
    add(el, new CylinderGeometry(0.052, 0.052, 0.04, 10), lam(0xffffff), 0, -0.29, 0);
    add(el, new SphereGeometry(0.055, 10, 8), skin, 0, -0.34, 0).scale.set(0.9, 1.1, 0.7);
    return { sh, el, s };
  });
  S.dealer = { D, body, head, torso };
  poseArms(0, 0);
}
function poseArms(t, side) {
  // t = 0 reposo; 0..1 gesto de repartir con el brazo "side" (1 = lado del sabot)
  S.arms.forEach(a => {
    const k = a.s === side ? Math.sin(Math.PI * t) : 0;
    a.sh.rotation.x = -0.55 - 0.7 * k;
    a.sh.rotation.z = a.s * (0.18 + 0.25 * k);
    a.el.rotation.x = -1.0 + 0.5 * k;
    a.el.rotation.z = -a.s * 0.25 * (1 - k);
  });
}

/* ---------- cartas ---------- */
function makeCard() {
  const g = new Group();
  const inner = new Group(); g.add(inner);
  const f = add(inner, S.cardGeo, new MeshBasicMaterial({ map: backTex() }), 0, 0.001, 0, -Math.PI / 2);
  const b = add(inner, S.cardGeo, new MeshBasicMaterial({ map: backTex() }), 0, -0.001, 0, Math.PI / 2);
  g.userData = { inner, f, b };
  S.scene.add(g); return g;
}
function setFace(m, card) { const mt = m.userData.f.material; mt.map = card ? cardTex(card) : backTex(); mt.needsUpdate = true; }

function layout(st) {
  const out = [];
  const row = (cards, cx, z, sp, pre) => {
    const n = cards.length; const s = Math.min(sp, n > 1 ? (pre === 'c' ? 2.0 : (st.split ? 0.9 : 2.2)) / (n - 1) : sp);
    cards.forEach((c, i) => out.push({ id: pre + i, card: c || null, x: cx + (i - (n - 1) / 2) * s, y: 0.006 + i * 0.0025, z: z + (pre === 'c' ? 0 : -i * 0.012) }));
  };
  row(st.c || [], 0, DEALER_Z, 0.3, 'c');
  (st.hands || []).slice(0, 2).forEach((h, hi) => row(h.cards || [], st.split ? (hi ? 0.8 : -0.8) : 0, PLAYER_Z, st.split ? 0.22 : 0.3, 'h' + hi + '_'));
  return out;
}

function sync(st) {
  last = st;
  if (!S) return;
  const t0 = now(), still = rm() || S.instant;
  const want = layout(st);
  const pool = {};
  const keep = {};
  want.forEach(w => keep[w.id] = 1);
  // cartas que cambian de sitio (p. ej. al dividir) se reutilizan si coinciden
  Object.keys(S.cards).forEach(id => {
    const m = S.cards[id], w = want.find(x => x.id === id);
    if (!w || (m.userData.card && w.card && m.userData.card !== w.card) || (!m.userData.card && !m.userData.down && w.card !== m.userData.card)) {
      if (m.userData.card) (pool[m.userData.card] = pool[m.userData.card] || []).push(m); else S.dead.push(m);
      delete S.cards[id];
    }
  });
  let k = 0;
  want.forEach(w => {
    let m = S.cards[w.id];
    if (!m && w.card && pool[w.card] && pool[w.card].length) { m = pool[w.card].shift(); S.cards[w.id] = m; m.userData.anim = { type: 'move', t0, d: still ? 0 : 320, from: m.position.clone() }; }
    if (!m) {
      m = makeCard(); S.cards[w.id] = m; m.userData.card = w.card; m.userData.down = !w.card;
      setFace(m, w.card);
      if (still) { m.position.set(w.x, w.y, w.z); m.userData.inner.rotation.z = w.card ? 0 : Math.PI; }
      else {
        m.position.copy(SABOT); m.userData.inner.rotation.z = Math.PI; m.rotation.y = -0.5;
        m.userData.anim = { type: 'deal', t0: t0 + k * 150, d: 480, from: SABOT.clone(), up: !!w.card };
        S.armQ.push(t0 + k * 150); k++;
      }
    } else if (m.userData.down && w.card) {
      m.userData.down = false; m.userData.card = w.card; setFace(m, w.card);
      if (still) m.userData.inner.rotation.z = 0; else m.userData.anim = { type: 'flip', t0: t0 + k++ * 120, d: 380, from: m.position.clone() };
    } else if (!m.userData.anim && (Math.abs(m.position.x - w.x) > 1e-3 || Math.abs(m.position.z - w.z) > 1e-3)) {
      m.userData.anim = { type: 'move', t0, d: still ? 0 : 300, from: m.position.clone() };
    }
    m.userData.target = new Vector3(w.x, w.y, w.z);
  });
  Object.values(pool).forEach(a => a.forEach(m => S.dead.push(m)));
  S.dead.forEach(m => { S.scene.remove(m); m.userData.f.material.dispose(); m.userData.b.material.dispose(); });
  S.dead = [];
  // círculos de apuesta
  const hs = st.hands || [];
  S.rings.forEach((r, i) => {
    const on = st.split ? (i < 2) : i === 2;
    r.visible = on && (hs.length > 0 || i === 2);
    r.position.x = st.split ? (i ? 0.8 : -0.8) : 0;
    const h = st.split ? hs[i] : hs[0];
    const res = h && h.res;
    r.material.color.set(res === 'win' ? 0xffe14d : res === 'lose' ? 0x8a3a3a : (st.split && st.phase === 'play' && i === st.cur) ? 0xfff6c2 : 0xe8c15a);
    r.material.opacity = res === 'win' ? 1 : .7;
  });
  S.host.classList.toggle('bj3d-split', !!st.split);
  placeLabels(); S.dirty = true; kick();
}

/* ---------- bucle de render ---------- */
function stepCards(t) {
  let busy = false;
  for (const id in S.cards) {
    const m = S.cards[id], a = m.userData.anim, T = m.userData.target; if (!a || !T) continue;
    busy = true;
    if (t < a.t0) continue;
    const p = a.d ? Math.min(1, (t - a.t0) / a.d) : 1, e = ease(p);
    if (a.type === 'deal') {
      m.position.lerpVectors(a.from, T, e); m.position.y += Math.sin(Math.PI * p) * 0.35;
      m.rotation.y = -0.5 * (1 - e);
      m.userData.inner.rotation.z = a.up ? Math.PI * (1 - Math.min(1, Math.max(0, (p - 0.35) / 0.65))) : Math.PI;
    } else if (a.type === 'flip') {
      m.position.copy(T); m.position.y += Math.sin(Math.PI * p) * 0.12;
      m.userData.inner.rotation.z = Math.PI * (1 - e);
    } else {
      m.position.lerpVectors(a.from, T, e);
    }
    if (p >= 1) { m.position.copy(T); m.rotation.y = 0; if (a.type !== 'move' || !m.userData.down) m.userData.inner.rotation.z = m.userData.down ? Math.PI : 0; m.userData.anim = null; }
  }
  return busy;
}
function stepDealer(t) {
  const d = S.dealer; if (!d) return false;
  if (rm()) { poseArms(0, 0); d.body.scale.y = 1; return false; }
  const b = Math.sin(t / 900);
  d.body.scale.set(1 + b * 0.008, 1 + b * 0.012, 1 + b * 0.01);
  d.head.position.y = 1.04 + b * 0.008;
  d.head.rotation.y = Math.sin(t / 3100) * 0.08; d.head.rotation.z = Math.sin(t / 4300) * 0.03;
  // parpadeo
  const bl = (t % 4200) < 120 ? 0.15 : 1; S.eyes.forEach(e => e.scale.y = bl);
  // brazo al repartir
  while (S.armQ.length && t - S.armQ[0] > 520) S.armQ.shift();
  const q = S.armQ.find(x => t >= x); poseArms(q != null ? Math.min(1, (t - q) / 520) : 0, 1);
  return true;
}
const P = new Vector3();
function place(el, x, y, z, dy) {
  if (!el) return; P.set(x, y, z).project(S.cam);
  el.style.left = ((P.x + 1) / 2 * S.w).toFixed(1) + 'px'; el.style.top = ((1 - P.y) / 2 * S.h + (dy || 0)).toFixed(1) + 'px';
}
function placeLabels() {
  const st = last || {}; const split = !!st.split;
  place(document.getElementById('bj-sub0'), split ? -0.8 : 0, 0, PLAYER_Z + CH / 2 + 0.06, 0);
  place(document.getElementById('bj-sub1'), 0.8, 0, PLAYER_Z + CH / 2 + 0.06, 0);
}
function frame() {
  S.raf = 0; if (!S || !S.on) return;
  const t = now();
  const busy = stepCards(t);
  const alive = stepDealer(t);
  const minGap = busy ? 0 : 33; // sin cartas moviéndose basta con ~30 fps
  if (busy || S.dirty || (alive && t - S.lastDraw >= minGap)) {
    S.r.render(S.scene, S.cam); S.lastDraw = t; S.dirty = false;
  }
  if (busy || alive) kick();
}
function kick() { if (S && S.on && !S.raf && !document.hidden) S.raf = requestAnimationFrame(frame); }

function resize() {
  if (!S) return;
  const w = Math.max(200, S.host.clientWidth || 360);
  const ideal = Math.round(Math.min(460, Math.max(320, w * 0.98)));
  let h = ideal;
  // En móvil, bajar la mesa para que TÚ + Nueva/Pedir/Plantarse queden sobre la barra, sin scroll.
  // En escritorio se deja la altura de siempre.
  if (window.innerWidth <= 900) {
    const nav = document.querySelector('.bottom-nav');
    const navTop = nav ? nav.getBoundingClientRect().top : ((window.innerHeight || 800) - 70);
    const tableTop = S.host.getBoundingClientRect().top;
    const row = S.host.nextElementSibling;
    const nueva = document.getElementById('bj-nueva');
    const pedir = document.getElementById('bj-carta');
    let need = 120;
    if (row && nueva && pedir) {
      const cs = getComputedStyle(row);
      const mt = parseFloat(cs.marginTop) || 8;
      const gap = parseFloat(cs.rowGap || cs.gap) || 8;
      need = mt + (nueva.offsetHeight || 44) + gap + (pedir.offsetHeight || 44) + 8;
    }
    const cap = Math.floor(navTop - tableTop - need);
    h = Math.round(Math.min(ideal, Math.max(200, cap)));
  }
  if (S.host.style.height !== h + 'px') S.host.style.height = h + 'px';
  S.w = w; S.h = h;
  S.r.setSize(w, h, false);
  const cam = S.cam; cam.aspect = w / h;
  const tgt = new Vector3(0, 0.32, 0.05);
  const hf = 2 * Math.atan(Math.tan(cam.fov * Math.PI / 360) * cam.aspect);
  let dist = Math.max(3.3, 2.05 / Math.tan(hf / 2));
  if (h + 2 < ideal) dist = Math.max(dist, 1.55 / Math.tan(cam.fov * Math.PI / 360));
  const el = 0.7;
  cam.position.set(0, tgt.y + dist * Math.sin(el), tgt.z + dist * Math.cos(el));
  cam.lookAt(tgt); cam.updateProjectionMatrix();
  placeLabels(); S.dirty = true; kick();
}

/* ---------- ciclo de vida ---------- */
function init() {
  if (S || broken) return;
  const host = document.querySelector('#blackjack .bj-table'); if (!host) return;
  if (!webglOK()) { broken = true; return; }
  let r;
  try {
    r = new WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 2, alpha: false, powerPreference: 'default' });
  } catch (e) { broken = true; return; }
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.outputColorSpace = SRGBColorSpace;
  const canvas = r.domElement; canvas.className = 'bj3d-cv'; canvas.setAttribute('aria-hidden', 'true');
  S = { host, r, canvas, tex: [], cardTex: {}, backTex: null, cards: {}, dead: [], armQ: [], on: true, raf: 0, dirty: true, lastDraw: 0, instant: true };
  try {
    const scene = new Scene(); S.scene = scene;
    scene.background = bgTex();
    S.cam = new PerspectiveCamera(40, 1, 0.1, 50);
    scene.add(new HemisphereLight(0xfff1dc, 0x2a1830, 2.2));
    const dl = new DirectionalLight(0xffffff, 2.2); dl.position.set(1.5, 4, 3); scene.add(dl);
    const fl = new DirectionalLight(0xffd9a0, 0.8); fl.position.set(-3, 2, -1); scene.add(fl);
    S.cardGeo = new PlaneGeometry(CW, CH);
    buildTable(scene);
    buildDealer(scene);
  } catch (e) { console.warn('bj3d', e); destroy(); broken = true; return; }
  S.onLost = ev => { ev.preventDefault(); destroy(); broken = true; };
  canvas.addEventListener('webglcontextlost', S.onLost);
  host.insertBefore(canvas, host.firstChild);
  host.classList.add('bj3d');
  S.ro = new ResizeObserver(() => resize()); S.ro.observe(host);
  resize();
  if (last) sync(last);
  S.instant = false;
  kick();
}
function destroy() {
  if (!S) return;
  const s = S; S = null;
  if (s.raf) cancelAnimationFrame(s.raf);
  try { s.ro && s.ro.disconnect(); } catch (e) {}
  if (s.onLost) s.canvas.removeEventListener('webglcontextlost', s.onLost);
  s.host.classList.remove('bj3d', 'bj3d-split'); s.host.style.height = '';
  ['bj-label-c', 'bj-sub0', 'bj-sub1'].forEach(id => { const e = document.getElementById(id); if (e) { e.style.left = ''; e.style.top = ''; } });
  try {
    if (s.scene) s.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) [].concat(o.material).forEach(m => m.dispose());
    });
    s.tex.forEach(t => t.dispose());
    s.r.dispose(); s.r.forceContextLoss();
  } catch (e) {}
  if (s.canvas.parentNode) s.canvas.parentNode.removeChild(s.canvas);
}
function check() {
  const scr = document.getElementById('blackjack');
  const vis = scr && scr.classList.contains('active') && !document.hidden;
  if (vis) init(); else destroy();
}
function boot() {
  const scr = document.getElementById('blackjack'); if (!scr) return;
  new MutationObserver(check).observe(scr, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', check);
  check();
}
window.BJ3D = { sync, on: () => !!S, _destroy: destroy };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
