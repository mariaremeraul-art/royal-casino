// Base de datos de Royal Casino (Netlify Functions + Netlify Blobs)
import { getStore } from "@netlify/blobs";
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

const OWNER_CODE = process.env.OWNER_CODE || "";
const VIP_MIN = 500000; // por debajo de 500.000 fichas (saldo + fichas en una mesa abierta) se pierde el VIP
const LOAN_MIN = 100, LOAN_MAX = 1000, LOAN_INTEREST = 0.10;
const BOTE_BASE = 100, BOTE_MAX_MULT = 10;
async function getBote(store, pool) {
  const b = await store.get("bote/" + pool, { type: "json" });
  return b && typeof b.amount === "number" ? b : { amount: BOTE_BASE, last: null };
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" }
});
const cleanId = id => String(id || "").replace(/[^a-zA-Z0-9_\-]/g, "").slice(0, 60);
const cleanTxt = (t, n) => String(t || "").slice(0, n);
const num = v => (Number.isFinite(+v) ? +v : 0);

async function getPlayer(store, id) { return (await store.get("p/" + id, { type: "json" })) || null; }
async function putPlayer(store, p) { await store.setJSON("p/" + p.id, p); }

/* ---- Torneo global ---- */
const TOR_HOURS = 6, TOR_BASE_PRIZE = 50000, TOR_FEE = 50;
// Premio base del torneo: lo cambia el dueño desde su panel (tor/config); si no, 50.000
async function torBase(store) {
  const c = await store.get("tor/config", { type: "json" });
  return c && Number.isFinite(+c.base) ? Math.max(0, Math.floor(+c.base)) : TOR_BASE_PRIZE;
}
async function torEntries(store, torId) {
  const { blobs } = await store.list({ prefix: "tore/" + torId + "/" });
  return (await Promise.all(blobs.map(b => store.get(b.key, { type: "json" })))).filter(Boolean);
}
// Nombre que se enseña: siempre el de la cuenta (nunca "Jugador_XXXX")
function accName(p) {
  if (!p) return "";
  if (p.user) return p.user;
  if (String(p.id || "").startsWith("u_")) return String(p.id).slice(2);
  return "";
}
async function torCurrent(store) {
  let meta = await store.get("tor/meta", { type: "json" });
  const now = Date.now();
  if (meta && meta.endsAt > now) return meta;
  if (meta && !(await store.get("torpaid/" + meta.id))) {
    await store.set("torpaid/" + meta.id, "1");
    const rows = (await torEntries(store, meta.id)).sort((a, b) => b.pts - a.pts);
    if (rows[0]) {
      const w = await getPlayer(store, rows[0].id);
      const prize = (await torBase(store)) + TOR_FEE * rows.length;
      if (w) { w.adjust = num(w.adjust) + prize; w.saldo = num(w.saldo) + prize; await putPlayer(store, w); }
      await store.setJSON("tor/last", { id: meta.id, winner: rows[0].name, winnerId: rows[0].id, prize, endedAt: meta.endsAt });
    }
  }
  meta = { id: "t" + now, endsAt: now + TOR_HOURS * 3600 * 1000, created: now };
  await store.setJSON("tor/meta", meta);
  return meta;
}
async function torView(store) {
  const meta = await torCurrent(store);
  const rows = (await torEntries(store, meta.id)).sort((a, b) => b.pts - a.pts);
  await Promise.all(rows.map(async r => { const p = await getPlayer(store, r.id); r.vip = !!(p && p.vip); if (p && accName(p)) r.name = accName(p); }));
  return { id: meta.id, endsAt: meta.endsAt, prize: (await torBase(store)) + TOR_FEE * rows.length, base: await torBase(store), fee: TOR_FEE, players: rows,
    last: (await store.get("tor/last", { type: "json" })) || null };
}

/* ---- Torneos especiales: los crea el dueño (nombre, premio, inscripción, duración) ----
   Puntúan igual que el torneo global (los mismos puntos de cada partida ganada) y
   pagan igual: el primero se lleva el premio más la inscripción de cada jugador. */
const CTOR_MAX = 10, CTOR_KEEP_MS = 24 * 3600e3;
async function ctorMetas(store) {
  const { blobs } = await store.list({ prefix: "ctor/" });
  return (await Promise.all(blobs.map(b => store.get(b.key, { type: "json" })))).filter(Boolean);
}
const ctorActive = (m, now) => !m.done && !m.cancelled && m.endsAt > now;
async function ctorSettle(store, m, now) {
  if (m.done || m.cancelled || m.endsAt > now) return m;
  // Solo una petición paga: la marca se crea una única vez
  const claim = await store.setJSON("ctorpaid/" + m.id, { at: now }, { onlyIfNew: true });
  if (claim && claim.modified === false) return (await store.get("ctor/" + m.id, { type: "json" })) || m;
  const rows = (await torEntries(store, "c" + m.id)).sort((a, b) => b.pts - a.pts);
  const prize = num(m.prize) + num(m.fee) * rows.length;
  m.done = true; m.result = { winner: rows[0] ? rows[0].name : null, winnerId: rows[0] ? rows[0].id : null, prize: rows[0] ? prize : 0, players: rows.length, endedAt: m.endsAt };
  if (rows[0]) { const w = await getPlayer(store, rows[0].id); if (w) { w.adjust = num(w.adjust) + prize; w.saldo = num(w.saldo) + prize; await putPlayer(store, w); } }
  await store.setJSON("ctor/" + m.id, m);
  return m;
}
async function ctorView(store, me) {
  const now = Date.now(), out = [];
  for (let m of await ctorMetas(store)) {
    m = await ctorSettle(store, m, now);
    const endedAt = m.cancelled ? num(m.cancelledAt) : m.endsAt;
    if (!ctorActive(m, now) && now - endedAt > CTOR_KEEP_MS) { // limpieza: ya no se enseña
      await store.delete("ctor/" + m.id);
      continue;
    }
    if (m.cancelled) continue;
    const rows = (await torEntries(store, "c" + m.id)).sort((a, b) => b.pts - a.pts);
    const mine = me ? rows.find(r => r.id === me) : null;
    out.push({ id: m.id, name: m.name, prize: num(m.prize) + num(m.fee) * rows.length, base: num(m.prize), fee: num(m.fee), minutes: m.minutes,
      endsAt: m.endsAt, active: ctorActive(m, now), result: m.result || null, n: rows.length, joined: !!mine, myPts: mine ? mine.pts : null,
      players: rows.slice(0, 20).map(r => ({ id: r.id, name: r.name, avatar: r.avatar, pts: r.pts })) });
  }
  return out.sort((a, b) => (b.active - a.active) || a.endsAt - b.endsAt);
}

/* ---- Estadísticas públicas de cada jugador (las manda su app al sincronizar) ---- */
const PUB_MIN_MS = 30000, PUB_MAX_CHARS = 3000;
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(num(v))));
function cleanPub(x) {
  if (!x || typeof x !== "object") return null;
  const B = 1e12, out = { wins: int(x.wins, 0, 1e9), losses: int(x.losses, 0, 1e9), wagered: int(x.wagered, 0, B), net: int(x.net, -B, B),
    biggestWin: int(x.biggestWin, 0, B), biggestLoss: int(x.biggestLoss, -B, 0), bestStreak: int(x.bestStreak, 0, 1e6), byGame: {} };
  const g = x.byGame && typeof x.byGame === "object" ? x.byGame : {};
  Object.keys(g).slice(0, 20).forEach(k => {
    const v = g[k]; const name = String(k).replace(/[<>"]/g, "").slice(0, 24); if (!name || !v || typeof v !== "object") return;
    out.byGame[name] = { games: int(v.games, 0, 1e9), wagered: int(v.wagered, 0, B), net: int(v.net, -B, B), wins: int(v.wins, 0, 1e9) };
  });
  return JSON.stringify(out).length <= PUB_MAX_CHARS ? out : null;
}

/* ---- Cuentas y sesiones ---- */
const SESSION_DAYS = 90, ONLINE_MS = 70 * 1000;
const normUser = u => String(u || "").trim().toLowerCase();
const validUser = u => /^[a-z0-9_.\-ñáéíóúü]{3,20}$/i.test(u);
const userKey = u => encodeURIComponent(normUser(u));
function hashPass(pass, salt) { return scryptSync(String(pass), salt, 32).toString("hex"); }
function checkHash(pass, salt, hash) {
  if (!salt || !hash) return false;
  const a = Buffer.from(hashPass(pass, salt), "hex"), b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
async function getAcc(store, u) { return (await store.get("acc/" + userKey(u), { type: "json" })) || null; }
async function putAcc(store, a) { await store.setJSON("acc/" + userKey(a.user), a); }
async function newSession(store, user) {
  const token = randomBytes(24).toString("hex");
  await store.setJSON("sess/" + token, { user: normUser(user), at: Date.now() });
  return token;
}
async function sessionUser(store, req) {
  const m = /^Bearer\s+([a-f0-9]{48})$/i.exec(req.headers.get("authorization") || "");
  if (!m) return "";
  const s = await store.get("sess/" + m[1], { type: "json" });
  if (!s || Date.now() - s.at > SESSION_DAYS * 864e5) return "";
  return s.user;
}
// Las cuentas con usuario en el servidor solo se tocan con su sesión
async function guardId(store, req, id) {
  if (!String(id).startsWith("u_")) return true;
  const u = String(id).slice(2);
  if (!(await getAcc(store, u))) return true;
  return (await sessionUser(store, req)) === normUser(u);
}
async function meOf(store, a) {
  const save = (await store.get("save/" + userKey(a.user), { type: "json" })) || null;
  const p = await getPlayer(store, "u_" + normUser(a.user));
  const savedAt = num(save && save.savedAt);
  const saldoAt = num(p && p.saldoAt);
  let outSave = save;
  // Compara horas del servidor (saldoAt vs savedAt), nunca el reloj del cliente
  if (p && p.saldo != null && saldoAt && (!savedAt || saldoAt > savedAt)) {
    outSave = Object.assign({}, save || {}, { saldo: Math.max(0, num(p.saldo)) });
  }
  return {
    user: a.user, id: "u_" + normUser(a.user), name: a.name || a.user, avatar: a.avatar || "🎲",
    question: a.question, save: outSave, rev: num(save && save.rev) || 0, savedAt,
    saldoAt: saldoAt || savedAt || 0,
    saldo: outSave && outSave.saldo != null ? outSave.saldo : (p && p.saldo)
  };
}
/* ---- Amigos ---- */
async function getFr(store, u) {
  const f = (await store.get("fr/" + userKey(u), { type: "json" })) || {};
  return { friends: f.friends || [], in: f.in || [], out: f.out || [], invites: f.invites || [] };
}
async function putFr(store, u, f) { await store.setJSON("fr/" + userKey(u), f); }
const without = (arr, u) => arr.filter(x => x !== u);
async function frProfile(store, u) {
  const a = await getAcc(store, u); const p = await getPlayer(store, "u_" + u);
  return { user: a ? a.user : u, name: (p && accName(p)) || (a && a.user) || u, avatar: (p && p.avatar) || (a && a.avatar) || "😎",
    vip: !!(p && p.vip), online: !!(p && p.lastSeen && Date.now() - p.lastSeen < ONLINE_MS) };
}

/* ---- Póker online por el servidor del casino ----
   El servidor crea la mesa, baraja, reparte, guarda las manos y decide el resultado.
   Cada jugador solo recibe sus cartas; las de los demás, solo al enseñar (fase "show"). */
const PK_MAX = 6, PK_DROP_MS = 120000, PK_IDLE_MS = 600000, PK_SEEN_MS = 15000;
const PK_AUTODEAL_MS = 12000, PK_AUTOSHOW_MS = 60000, PK_BET_MAX = 10000000;
const PK_VAL = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14 };
const pkCode = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
function pkDeck() {
  const d = [];
  for (const s of ["♠", "♥", "♦", "♣"]) for (const v of Object.keys(PK_VAL)) d.push([v, s]);
  for (let i = d.length - 1; i > 0; i--) { const j = randomInt(i + 1); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
// Misma regla que el póker de 2 cartas del cliente: pareja > color > carta alta
function pkEval(m) {
  const vals = m.map(c => PK_VAL[c[0]]).sort((a, b) => b - a);
  if (vals[0] === vals[1]) return [2, vals, "Pareja"];
  if (m[0][1] === m[1][1]) return [1, vals, "Color"];
  return [0, vals, "Alta " + (PK_VAL[m[0][0]] >= PK_VAL[m[1][0]] ? m[0][0] : m[1][0])];
}
const pkCmp = (a, b) => (a[0] - b[0]) || (a[1][0] - b[1][0]) || (a[1][1] - b[1][1]);
const pkSeats = t => Object.values(t.seats || {});
// Cambios por tiempo: quita asientos sin conexión, reparte o enseña solo si toca. Devuelve true si cambia algo.
function pkTick(t, now) {
  let ch = false;
  for (const s of pkSeats(t)) {
    if (now - num(s.seen) <= PK_DROP_MS) continue;
    if (t.phase === "dealt" && s.inHand) continue; // su mano se juega igual; se quita al acabar
    if (t.phase === "lobby" && s.ready && num(s.bet) > 0) { t.refunds = t.refunds || {}; t.refunds[s.id] = num(t.refunds[s.id]) + num(s.bet); }
    pkRemove(t, s.id); ch = true;
  }
  if (t.phase === "lobby") {
    const all = pkSeats(t), ready = all.filter(s => s.ready);
    if (ready.length >= 2 && (ready.length === all.length || (t.readyAt && now - t.readyAt > PK_AUTODEAL_MS))) { pkDeal(t, now); ch = true; }
    else if (ready.length < 2 && t.readyAt) { t.readyAt = null; ch = true; }
  } else if (t.phase === "dealt") {
    const inHand = pkSeats(t).filter(s => s.inHand);
    if (inHand.length === 0) { pkReset(t); ch = true; }
    else if (inHand.every(s => s.revealed) || now - num(t.dealtAt) > PK_AUTOSHOW_MS || inHand.length === 1) { pkShow(t, now); ch = true; }
  }
  return ch;
}
function pkRemove(t, id) { delete t.seats[id]; t.order = (t.order || []).filter(x => x !== id); }
function pkReset(t) {
  for (const s of pkSeats(t)) { s.ready = false; s.bet = 0; s.cards = null; s.label = ""; s.revealed = false; s.inHand = false; }
  if (t.result) t.last = t.result; // el último resultado se guarda para quien no lo vio a tiempo
  t.phase = "lobby"; t.pot = 0; t.result = null; t.readyAt = null; t.dealtAt = null;
}
function pkDeal(t, now) {
  const deck = pkDeck();
  t.hand = num(t.hand) + 1; t.pot = 0;
  for (const s of pkSeats(t)) {
    if (s.ready) { s.cards = [deck.pop(), deck.pop()]; s.label = pkEval(s.cards)[2]; s.inHand = true; s.revealed = false; t.pot += num(s.bet); }
    else { s.cards = null; s.label = ""; s.inHand = false; }
  }
  t.phase = "dealt"; t.dealtAt = now; t.readyAt = null; t.result = null;
}
function pkShow(t, now) {
  const inHand = pkSeats(t).filter(s => s.inHand);
  const ev = inHand.map(s => ({ s, r: pkEval(s.cards) })).sort((a, b) => pkCmp(b.r, a.r));
  const best = ev.length ? ev[0].r : null;
  const winners = best ? ev.filter(x => pkCmp(x.r, best) === 0).map(x => x.s) : [];
  const payments = {};
  let share = 0;
  if (winners.length && winners.length === inHand.length && inHand.length > 1) {
    // Empate de todos: cada uno recupera su apuesta (como antes)
    inHand.forEach(s => payments[s.id] = num(s.bet));
  } else if (winners.length) {
    share = Math.floor(t.pot / winners.length);
    inHand.forEach(s => payments[s.id] = winners.includes(s) ? share : 0);
  }
  t.result = { hand: t.hand, pot: t.pot, winners: winners.map(s => s.name), winnerIds: winners.map(s => s.id), share, payments,
    bets: Object.fromEntries(inHand.map(s => [s.id, num(s.bet)])),
    shown: inHand.map(s => ({ user: s.id, name: s.name, hand: s.cards, label: s.label })) };
  t.phase = "show"; t.shownAt = now;
  t.results = (t.results || []).concat(t.result).slice(-5); // para quien vuelve tarde: cobra igual
}
// Lo que ve un jugador: sus cartas siempre; las de los demás, solo en "show"
function pkView(t, id) {
  const me = t.seats[id];
  return {
    code: t.code, v: t.v, hand: num(t.hand), phase: t.phase, pot: num(t.pot), you: id, result: t.result || null, last: t.last || null,
    mine: (t.results || []).filter(r => r.bets && id in r.bets && (!t.result || r.hand !== t.result.hand)),
    readyAt: t.readyAt || null, dealtAt: t.dealtAt || null, now: Date.now(),
    players: (t.order || []).map(k => t.seats[k]).filter(Boolean).map(s => {
      const show = s.id === id || (t.phase === "show" && s.inHand);
      return { user: s.id, name: s.name, avatar: s.avatar, ready: !!s.ready, bet: num(s.bet), inHand: !!s.inHand, revealed: !!s.revealed,
        connected: Date.now() - num(s.seen) < 30000, hand: show ? (s.cards || null) : null, label: show ? (s.label || "") : "" };
    }),
    chat: (t.chat || []).slice(-30),
    me: me ? { ready: !!me.ready, bet: num(me.bet), inHand: !!me.inHand } : null
  };
}
// Escritura segura de la mesa: lee con etag, aplica el cambio y escribe solo si nadie la ha tocado; si no, repite
const pkLocks = new Map();
async function pkMutate(store, code, fn) {
  const key = "pk/" + code;
  // Cola por mesa dentro de la misma función (el etag protege entre servidores distintos)
  const prev = pkLocks.get(key) || Promise.resolve();
  let release; const mine = new Promise(r => release = r);
  const chain = prev.then(() => mine);
  pkLocks.set(key, chain);
  await prev;
  try {
    for (let intento = 0; intento < 6; intento++) {
      const cur = await store.getWithMetadata(key, { type: "json" });
      const t = cur && cur.data ? cur.data : null;
      const r = fn(t);
      if (r.error) return r;
      if (r.delete) { await store.delete(key); return r; }
      if (!r.write) return r;
      if (!r.keepV) r.table.v = num(r.table.v) + 1; // un latido solo no cambia la versión
      r.table.at = Date.now();
      const res = cur && cur.etag ? await store.setJSON(key, r.table, { onlyIfMatch: cur.etag })
        : !cur ? await store.setJSON(key, r.table, { onlyIfNew: true })
        : await store.setJSON(key, r.table);
      if (!res || res.modified !== false) return r;
    }
    return { error: "La mesa está muy ocupada, prueba otra vez", status: 409 };
  } finally { release(); if (pkLocks.get(key) === chain) pkLocks.delete(key); }
}
const pkSeatOk = (t, id, seat) => t && t.seats && t.seats[id] && String(seat || "") !== "" && t.seats[id].secret === String(seat);

export default async (req) => {
  const store = getStore({ name: "royal-casino", consistency: "strong" });
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/db\/?/, "");
  let body = {};
  if (req.method === "POST") { try { body = await req.json(); } catch (e) {} }
  const isOwner = () => !!OWNER_CODE && (req.headers.get("x-owner-code") || "") === OWNER_CODE;

  try {
    /* ---- Cuentas ---- */
    if (route === "register" && req.method === "POST") {
      const user = String(body.user || "").trim(), u = normUser(user), pass = String(body.pass || "");
      if (!validUser(user)) return json({ error: "Usuario: de 3 a 20 letras, números, punto, guion o _" }, 400);
      if (pass.length < 6) return json({ error: "Contraseña: mínimo 6 caracteres" }, 400);
      const answer = String(body.answer || "").trim().toLowerCase();
      if (!answer) return json({ error: "Escribe una respuesta de recuperación" }, 400);
      if (await getAcc(store, u)) return json({ error: "Ese usuario ya existe" }, 409);
      const salt = randomBytes(16).toString("hex");
      const rec = /^RC-[A-Z0-9]{6}$/.test(String(body.rec || "")) ? String(body.rec) : "RC-" + randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
      const a = { user, salt, hash: hashPass(pass, salt), question: cleanTxt(body.question, 80), ans: hashPass(answer, salt),
        rec: hashPass(rec.toLowerCase(), salt), name: cleanTxt(body.name, 24) || user, avatar: cleanTxt(body.avatar, 8) || "🎲", created: Date.now(), migrated: !!body.migrate };
      await putAcc(store, a);
      if (body.save && typeof body.save === "object") await store.setJSON("save/" + userKey(u), body.save);
      return json({ ok: true, token: await newSession(store, u), me: await meOf(store, a), recoveryCode: body.migrate ? undefined : rec });
    }
    if (route === "login" && req.method === "POST") {
      const a = await getAcc(store, body.user);
      if (!a) return json({ error: "NO_ACCOUNT" }, 400);
      if (!checkHash(String(body.pass || ""), a.salt, a.hash)) return json({ error: "Usuario o contraseña incorrectos" }, 401);
      return json({ ok: true, token: await newSession(store, a.user), me: await meOf(store, a) });
    }
    if (route === "recover-hint" && req.method === "POST") {
      const a = await getAcc(store, body.user);
      return a ? json({ question: a.question || "Pregunta de recuperación" }) : json({ error: "NO_ACCOUNT" }, 400);
    }
    if (route === "recover" && req.method === "POST") {
      const a = await getAcc(store, body.user);
      if (!a) return json({ error: "NO_ACCOUNT" }, 400);
      const ans = String(body.answer || "").trim().toLowerCase();
      if (!checkHash(ans, a.salt, a.ans) && !checkHash(ans, a.salt, a.rec)) return json({ error: "Respuesta incorrecta" }, 401);
      const np = String(body.newPass || ""); if (np.length < 6) return json({ error: "Contraseña mínima 6" }, 400);
      a.hash = hashPass(np, a.salt); await putAcc(store, a);
      return json({ ok: true, token: await newSession(store, a.user), me: await meOf(store, a) });
    }
    if (route === "logout" && req.method === "POST") {
      const m = /^Bearer\s+([a-f0-9]{48})$/i.exec(req.headers.get("authorization") || "");
      if (m) await store.delete("sess/" + m[1]);
      return json({ ok: true });
    }
    if (route === "me" || route === "save" || route.startsWith("friends")) {
      const me = await sessionUser(store, req);
      if (!me) return json({ error: "Sesión caducada, vuelve a entrar" }, 401);
      const a = await getAcc(store, me); if (!a) return json({ error: "Sesión caducada, vuelve a entrar" }, 401);
      if (route === "me" && req.method === "GET") return json({ me: await meOf(store, a) });
      if (route === "save" && (req.method === "PUT" || req.method === "POST")) {
        let b = {}; if (req.method === "PUT") { try { b = await req.json(); } catch (e) {} } else b = body;
        const txt = JSON.stringify(b || {}); if (txt.length > 200000) return json({ error: "Partida demasiado grande" }, 413);
        const prev = (await store.get("save/" + userKey(me), { type: "json" })) || null;
        const curRev = num(prev && prev.rev);
        const baseRev = num(b && b.baseRev);
        // Acepta si no hay rev o el cliente trae baseRev >= rev actual; si otro móvil guardó después, conflicto
        if (prev && curRev && baseRev < curRev) {
          return json({ ok: false, conflict: true, rev: curRev, savedAt: num(prev.savedAt), save: prev, me: await meOf(store, a) }, 409);
        }
        const saveNow = Date.now();
        b = Object.assign({}, b || {});
        b.rev = (curRev || 0) + 1;
        b.savedAt = saveNow;
        delete b.updatedAt;
        delete b.baseRev;
        await store.setJSON("save/" + userKey(me), b);
        if (b.playerName || b.avatar) { a.name = cleanTxt(b.playerName, 24) || a.name; a.avatar = cleanTxt(b.avatar, 8) || a.avatar; await putAcc(store, a); }
        // Alinea p.saldo con la partida, sin tocar un ajuste pendiente del dueño
        let vipLost = false;
        if (b.saldo != null) {
          const p = await getPlayer(store, "u_" + me);
          let dirty = false;
          if (p && !num(p.adjust) && (!num(p.saldoAt) || saveNow >= num(p.saldoAt))) {
            p.saldo = Math.max(0, num(b.saldo));
            p.saldoAt = saveNow;
            dirty = true;
          }
          // VIP: si su dinero (saldo + fichas en una mesa abierta) baja de 500.000, lo pierde y tiene que volver a pedirlo
          const mesa = Math.max(0, Math.min(1e12, Math.floor(num(b.mesa))));
          if (p && p.vip && !num(p.adjust) && Math.max(0, num(b.saldo)) + mesa < VIP_MIN) {
            p.vip = false; p.vipReq = null; p.vipLost = { at: saveNow, saldo: Math.floor(num(b.saldo)), mesa };
            dirty = true; vipLost = true;
          }
          if (dirty) await putPlayer(store, p);
        }
        return json({ ok: true, rev: b.rev, savedAt: saveNow, vipLost });
      }
      if (route === "friends" && req.method === "GET") {
        const f = await getFr(store, me);
        const now = Date.now(); const invites = f.invites.filter(i => now - i.at < 3600e3);
        return json({ friends: await Promise.all(f.friends.map(u => frProfile(store, u))),
          requests: await Promise.all(f.in.map(u => frProfile(store, u))),
          sent: await Promise.all(f.out.map(u => frProfile(store, u))), invites });
      }
      if (route.startsWith("friends/vs/") && req.method === "GET") return json({ vs: [] });
      if (req.method !== "POST") return json({ error: "Ruta no encontrada" }, 404);
      const other = normUser(body.user);
      if (!other) return json({ error: "Escribe un usuario" }, 400);
      if (other === me) return json({ error: "No puedes añadirte a ti mismo" }, 400);
      const oa = await getAcc(store, other);
      if (!oa) return json({ error: "No existe ninguna cuenta con ese usuario" }, 400);
      const mine = await getFr(store, me), theirs = await getFr(store, other);
      const save2 = async () => { await putFr(store, me, mine); await putFr(store, other, theirs); };
      if (route === "friends/add") {
        if (mine.friends.includes(other)) return json({ ok: true, already: true });
        if (mine.in.includes(other)) { // él ya me lo había pedido: somos amigos
          mine.in = without(mine.in, other); theirs.out = without(theirs.out, me);
          mine.friends.push(other); theirs.friends.push(me); await save2(); return json({ ok: true, friends: true });
        }
        if (!mine.out.includes(other)) mine.out.push(other);
        if (!theirs.in.includes(me)) theirs.in.push(me);
        if (mine.out.length > 100 || theirs.in.length > 100) return json({ error: "Demasiadas solicitudes pendientes" }, 400);
        await save2(); return json({ ok: true, sent: true });
      }
      if (route === "friends/accept") {
        if (!mine.in.includes(other)) return json({ error: "No tienes ninguna solicitud de ese usuario" }, 400);
        mine.in = without(mine.in, other); theirs.out = without(theirs.out, me);
        if (!mine.friends.includes(other)) mine.friends.push(other);
        if (!theirs.friends.includes(me)) theirs.friends.push(me);
        await save2(); return json({ ok: true });
      }
      if (route === "friends/remove") {
        for (const k of ["friends", "in", "out"]) { mine[k] = without(mine[k], other); theirs[k] = without(theirs[k], me); }
        await save2(); return json({ ok: true });
      }
      if (route === "friends/invite") {
        if (!mine.friends.includes(other)) return json({ error: "Solo puedes invitar a tus amigos" }, 400);
        const code = cleanTxt(body.code, 12).replace(/[^A-Za-z0-9]/g, "");
        if (!code) return json({ error: "Falta la mesa" }, 400);
        theirs.invites = theirs.invites.filter(i => Date.now() - i.at < 3600e3 && i.from !== me).slice(-9);
        theirs.invites.push({ from: me, name: a.name || a.user, avatar: a.avatar, code, at: Date.now() });
        await putFr(store, other, theirs); return json({ ok: true });
      }
      return json({ error: "Ruta no encontrada" }, 404);
    }

    /* ---- Jugadores ---- */
    if (route === "sync" && req.method === "POST") {
      const id = cleanId(body.id); if (id && !(await guardId(store, req, id))) return json({ error: "Sesión caducada, vuelve a entrar" }, 401); if (!id) return json({ error: "Falta id" }, 400);
      const now = Date.now();
      if (await store.get("del/" + id)) {
        await store.delete("del/" + id); await store.delete("p/" + id);
        return json({ ok: true, deleted: true });
      }
      let p = await getPlayer(store, id);
      if (!p) p = { id, firstSeen: now, visits: 0, adjust: 0, loan: null, loansHistory: [] };
      if (!p.lastSeen || now - p.lastSeen > 30 * 60 * 1000) p.visits = (p.visits || 0) + 1;
      p.lastSeen = now;
      p.name = cleanTxt(body.name, 24) || p.name || id;
      p.avatar = cleanTxt(body.avatar, 8) || p.avatar || "🎲";
      p.user = cleanTxt(body.user, 32) || p.user || (id.startsWith("u_") ? id.slice(2) : "");
      if (p.user) p.name = p.user;
      p.games = Math.max(0, Math.floor(num(body.games)));
      p.xp = Math.max(0, Math.floor(num(body.xp)));
      if (body.lv != null) p.lv = Math.max(1, Math.min(100, Math.floor(num(body.lv)) || 1)); // nivel que muestra el jugador (incluye el que conserva de la curva antigua)
      // Resumen público de estadísticas: solo cuentas con sesión, como mucho cada 30 s y con tamaño limitado
      if (body.pub && id.startsWith("u_") && (await sessionUser(store, req)) === normUser(id.slice(2)) && now - num(p.pubAt) > PUB_MIN_MS) {
        const pub = cleanPub(body.pub); if (pub) { p.pub = pub; p.pubAt = now; }
      }
      const adjust = num(p.adjust); p.adjust = 0;
      let saveBlob = null;
      if (id.startsWith("u_")) saveBlob = (await store.get("save/" + userKey(id.slice(2)), { type: "json" })) || null;
      const savedAt = num(saveBlob && saveBlob.savedAt);
      if (adjust) {
        const newest = (savedAt > num(p.saldoAt) && saveBlob && saveBlob.saldo != null)
          ? num(saveBlob.saldo)
          : (num(p.saldoAt) ? num(p.saldo) : num(body.saldo));
        p.saldo = Math.max(0, newest + adjust);
        p.saldoAt = now;
      } else if (savedAt && savedAt >= num(p.saldoAt)) {
        // save/ más reciente: no pisar con un sync posiblemente viejo
        if (saveBlob.saldo != null) p.saldo = Math.max(0, num(saveBlob.saldo));
      } else if (num(p.saldoAt)) {
        // p.saldo ya es más nuevo (p.ej. ajuste del dueño)
      } else {
        p.saldo = Math.max(0, num(body.saldo));
        p.saldoAt = now;
      }
      // Si el dueño ha cambiado algo mientras tanto, no lo pisamos
      const fresh = await getPlayer(store, id);
      if (fresh) {
        for (const k of ["loan", "loansHistory", "vip", "vipReq", "vipLost", "recargado", "recargas", "recReq"]) p[k] = fresh[k];
        const extra = num(fresh.adjust) - adjust;
        if (extra > 0 || extra < 0) { p.adjust = extra; }
      }
      await putPlayer(store, p);
      return json({ ok: true, adjust, loan: p.loan || null, vip: !!p.vip, vipReq: !!p.vipReq, vipLost: (!p.vip && p.vipLost && num(p.vipLost.at)) || null, recReq: p.recReq || null, recLast: (p.recargas || []).slice(-1)[0] || null });
    }

    /* ---- Zona VIP ---- */
    if (route === "vip/request" && req.method === "POST") {
      const id = cleanId(body.id); if (id && !(await guardId(store, req, id))) return json({ error: "Sesión caducada, vuelve a entrar" }, 401); const p = id && await getPlayer(store, id);
      if (!p) return json({ error: "Jugador no encontrado, recarga la página" }, 404);
      if (!accName(p)) return json({ error: "Necesitas una cuenta para pedir la zona VIP" }, 400);
      if (p.vip) return json({ ok: true, vip: true, vipReq: false });
      if (num(p.saldo) < VIP_MIN) return json({ error: "Necesitas al menos 500.000 fichas para pedir la zona VIP" }, 400);
      if (!p.vipReq) { p.vipReq = { at: Date.now() }; await putPlayer(store, p); }
      return json({ ok: true, vip: false, vipReq: true });
    }

    /* ---- Solicitud de recarga (solo registro, no se cobra nada) ---- */
    if (route === "recarga/request" && req.method === "POST") {
      const id = cleanId(body.id); if (id && !(await guardId(store, req, id))) return json({ error: "Sesión caducada, vuelve a entrar" }, 401); const p = id && await getPlayer(store, id);
      if (!p) return json({ error: "Jugador no encontrado, recarga la página" }, 404);
      if (!accName(p)) return json({ error: "Necesitas una cuenta para pedir una recarga" }, 400);
      if (body.cancel) { p.recReq = null; await putPlayer(store, p); return json({ ok: true, recReq: null }); }
      const chips = Math.floor(num(body.chips) / 1000) * 1000;
      if (chips < 1000 || chips > 10000000) return json({ error: "La recarga debe ser de 1.000 a 10.000.000 fichas, de 1.000 en 1.000" }, 400);
      p.recReq = { amount: Math.round(chips / 100) / 100, chips, at: Date.now() };
      await putPlayer(store, p);
      return json({ ok: true, recReq: p.recReq });
    }

    /* ---- Bote común de la tragaperras: uno normal y otro VIP ---- */
    if (route === "bote" && req.method === "GET") {
      const [n, v, x, xv] = await Promise.all(["normal", "vip", "sx", "sxvip"].map(k => getBote(store, k)));
      const pub = l => l ? { name: l.name, amount: l.amount, at: l.at } : null;
      return json({ normal: Math.floor(n.amount), vip: Math.floor(v.amount), sx: Math.floor(x.amount), sxvip: Math.floor(xv.amount),
        lastNormal: pub(n.last), lastVip: pub(v.last), lastSx: pub(x.last), lastSxvip: pub(xv.last) });
    }
    if ((route === "bote/add" || route === "bote/win") && req.method === "POST") {
      const id = cleanId(body.id);
      if (!id) return json({ error: "Falta el jugador" }, 400);
      if (!(await guardId(store, req, id))) return json({ error: "Sesión caducada, vuelve a entrar" }, 401);
      const p = await getPlayer(store, id);
      const pool = ["vip", "sx", "sxvip"].includes(body.pool) ? body.pool : "normal";
      const poolVip = pool === "vip" || pool === "sxvip";
      if (poolVip && !(p && p.vip)) return json({ error: "No eres VIP" }, 403);
      if (route === "bote/win") {
        // Cobrar el bote exige cuenta con sesión iniciada
        const u = String(id).startsWith("u_") ? String(id).slice(2) : "";
        if (!u || !(await getAcc(store, u)) || (await sessionUser(store, req)) !== normUser(u))
          return json({ error: "Inicia sesión con tu cuenta para cobrar el bote" }, 401);
      }
      const ap = Math.max(0, Math.min(poolVip ? 10000000 : pool === "sx" ? 350 : 1000, Math.floor(num(body.ap))));
      // Tragaperras: el bote se multiplica por apuesta ÷ 5, como mucho ×10 (normal y VIP). Slots de 5 líneas: siempre ×1
      const mult = pool === "sx" || pool === "sxvip" ? 1 : Math.min(BOTE_MAX_MULT, Math.max(1, ap / 5));
      for (let intento = 0; intento < 5; intento++) {
        const cur = await store.getWithMetadata("bote/" + pool, { type: "json" });
        const b = cur && cur.data && typeof cur.data.amount === "number" ? cur.data : { amount: BOTE_BASE, last: null };
        let out;
        if (route === "bote/add") {
          b.amount = num(b.amount) + ap * 0.05;
          out = { ok: true, amount: Math.floor(b.amount) };
        } else {
          if (b.last && b.last.id === id) return json({ error: "Ya ganaste el último bote: tiene que ganarlo otro jugador antes", amount: Math.floor(num(b.amount)) }, 429);
          const amount = Math.floor(num(b.amount));
          b.last = { id, name: (p && (accName(p) || p.name)) || "Jugador", amount, at: Date.now() };
          b.amount = BOTE_BASE;
          out = { ok: true, amount, mult, pay: Math.floor(amount * mult), next: BOTE_BASE };
        }
        // Escritura condicionada: si otro jugador lo ha tocado a la vez, se vuelve a leer y se repite
        // (en Netlify siempre hay etag; el servidor local de pruebas no lo da y entonces se escribe normal)
        const res = cur && cur.etag ? await store.setJSON("bote/" + pool, b, { onlyIfMatch: cur.etag })
          : !cur ? await store.setJSON("bote/" + pool, b, { onlyIfNew: true })
          : await store.setJSON("bote/" + pool, b);
        if (!res || res.modified !== false) return json(out);
      }
      return json({ error: "El bote está muy solicitado, prueba otra vez" }, 409);
    }


    /* ---- Póker online (mesa en el servidor) ---- */
    if (route.startsWith("pk/") && req.method === "POST") {
      const id = cleanId(body.id);
      if (!id) return json({ error: "Falta el jugador" }, 400);
      if (!(await guardId(store, req, id))) return json({ error: "Sesión caducada, vuelve a entrar" }, 401);
      const now = Date.now();
      const name = cleanTxt(body.name, 24) || "Jugador", avatar = cleanTxt(body.avatar, 8) || "😎";
      const out = (r) => r.error ? json({ error: r.error, gone: !!r.gone }, r.status || 400) : json(r.res);
      if (route === "pk/create") {
        // Limpieza de mesas abandonadas (más de 10 min sin actividad)
        try {
          const { blobs } = await store.list({ prefix: "pk/" });
          if (blobs.length > 20) for (const b of blobs) { const o = await store.get(b.key, { type: "json" }); if (!o || now - num(o.at) > PK_IDLE_MS) await store.delete(b.key); }
        } catch (e) {}
        for (let k = 0; k < 8; k++) {
          const code = Array.from({ length: 5 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)]).join("");
          const secret = randomBytes(12).toString("hex");
          const r = await pkMutate(store, code, t => {
            if (t && now - num(t.at) < PK_IDLE_MS) return { error: "dup" };
            const table = { code, v: 0, created: now, hand: 0, phase: "lobby", pot: 0, result: null, chat: [], chatN: 0, order: [id],
              seats: { [id]: { id, name, avatar, secret, seen: now, ready: false, bet: 0 } } };
            return { write: true, table, res: { ok: true, seat: secret } };
          });
          if (r.error === "dup") continue;
          if (r.error) return out(r);
          r.res.state = pkView(r.table, id);
          return json(r.res);
        }
        return json({ error: "No se pudo crear la mesa, prueba otra vez" }, 409);
      }
      const code = pkCode(body.code);
      if (!code) return json({ error: "Falta el código de la mesa" }, 400);
      const gone = (msg) => ({ error: msg || "Esa mesa ya no existe", status: 410, gone: true });
      const alive = t => t && now - num(t.at) < PK_IDLE_MS && pkSeats(t).length > 0;
      if (route === "pk/join") {
        const secret = randomBytes(12).toString("hex");
        const r = await pkMutate(store, code, t => {
          if (!alive(t)) return gone("No hay ninguna mesa con ese código");
          pkTick(t, now);
          const had = t.seats[id];
          if (had) {
            // Volver a la misma silla: con la clave de la silla, o con la sesión de la cuenta (u_)
            if (!(pkSeatOk(t, id, body.seat) || (id.startsWith("u_") && had))) return { error: "Ese jugador ya está sentado en la mesa", status: 409 };
            if (!pkSeatOk(t, id, body.seat)) had.secret = secret;
            had.seen = now; had.name = name; had.avatar = avatar;
            return { write: true, table: t, res: { ok: true, seat: had.secret } };
          }
          if (pkSeats(t).length >= PK_MAX) return { error: "La mesa está llena (máximo " + PK_MAX + ")", status: 409 };
          t.seats[id] = { id, name, avatar, secret, seen: now, ready: false, bet: 0 };
          t.order = (t.order || []).concat(id);
          // Si el servidor te quitó la silla con una apuesta sin jugar, se devuelve al volver
          const refund = num((t.refunds || {})[id]); if (refund) delete t.refunds[id];
          return { write: true, table: t, res: { ok: true, seat: secret, refund } };
        });
        if (!r.error) r.res.state = pkView(r.table, id);
        return out(r);
      }
      // Resto de acciones: la petición tiene que venir de esa silla
      const act = route.slice(3);
      if (!["state", "ready", "reveal", "chat", "leave"].includes(act)) return json({ error: "Ruta no encontrada" }, 404);
      if (act === "state") {
        // Lectura rápida: si nada ha cambiado desde la versión que tiene el jugador, respuesta mínima {same:1}
        const t = await store.get("pk/" + code, { type: "json" });
        if (!alive(t)) return json({ gone: true, error: "La mesa se ha cerrado" });
        if (!t.seats[id]) return json({ gone: true, table: true, error: "El servidor te sacó de la mesa por inactividad" });
        if (!pkSeatOk(t, id, body.seat)) return json({ error: "Esa silla no es tuya" }, 401);
        const probe = JSON.parse(JSON.stringify(t));
        const needs = pkTick(probe, now) || now - num(t.seats[id].seen) > PK_SEEN_MS;
        if (!needs) return body.v != null && num(body.v) === num(t.v) ? json({ same: 1, v: t.v }) : json(pkView(t, id));
        const r = await pkMutate(store, code, t2 => {
          if (!alive(t2) || !t2.seats[id]) return gone("Ya no estás en la mesa");
          if (!pkSeatOk(t2, id, body.seat)) return { error: "Esa silla no es tuya", status: 401 };
          const before = JSON.stringify({ ...t2, seats: Object.fromEntries(Object.entries(t2.seats).map(([k, x]) => [k, { ...x, seen: 0 }])) });
          t2.seats[id].seen = now; pkTick(t2, now);
          const after = JSON.stringify({ ...t2, seats: Object.fromEntries(Object.entries(t2.seats).map(([k, x]) => [k, { ...x, seen: 0 }])) });
          return { write: true, table: t2, res: null, keepV: before === after };
        });
        if (r.error) return r.gone ? json({ gone: true, error: r.error }) : out(r);
        if (r.keepV && body.v != null && num(body.v) === num(r.table.v)) return json({ same: 1, v: r.table.v });
        return json(pkView(r.table, id));
      }
      const r = await pkMutate(store, code, t => {
        if (!alive(t) || !t.seats[id]) return gone("Ya no estás en la mesa");
        if (!pkSeatOk(t, id, body.seat)) return { error: "Esa silla no es tuya", status: 401 };
        const s = t.seats[id]; s.seen = now;
        pkTick(t, now);
        if (!t.seats[id]) return gone("Ya no estás en la mesa");
        if (act === "ready") {
          const bet = Math.floor(num(body.bet));
          if (!(bet >= 1 && bet <= PK_BET_MAX)) return { error: "Apuesta no válida" };
          if (t.phase === "dealt") return { error: "Hay una mano en juego. Espera al resultado.", status: 409 };
          if (t.phase === "show") pkReset(t);
          if (s.ready) return { error: "Ya estás listo con $" + s.bet, status: 409 };
          s.ready = true; s.bet = bet;
          const ready = pkSeats(t).filter(x => x.ready).length;
          if (ready === 2 && !t.readyAt) t.readyAt = now;
          pkTick(t, now);
          return { write: true, table: t, res: { ok: true, bet } };
        }
        if (act === "reveal") {
          if (t.phase !== "dealt" || !s.inHand) return { error: "No hay ninguna mano que enseñar", status: 409 };
          s.revealed = true; pkTick(t, now);
          return { write: true, table: t, res: { ok: true } };
        }
        if (act === "chat") {
          const text = cleanTxt(body.text, 200).trim();
          if (!text) return { error: "Mensaje vacío" };
          t.chatN = num(t.chatN) + 1;
          t.chat = (t.chat || []).concat({ n: t.chatN, id, name: s.name, avatar: s.avatar, text, at: now }).slice(-30);
          return { write: true, table: t, res: { ok: true, n: t.chatN } };
        }
        if (act === "leave") {
          // En la fase de espera la apuesta no se ha jugado: se devuelve; en juego, se queda en el bote
          const refund = t.phase !== "dealt" && s.ready && !s.inHand ? num(s.bet) : 0;
          pkRemove(t, id);
          if (!pkSeats(t).length) return { delete: true, res: { ok: true, refund } };
          pkTick(t, now);
          return { write: true, table: t, res: { ok: true, refund } };
        }
      });
      if (!r.error && r.table && act !== "leave") r.res.state = pkView(r.table, id);
      return out(r);
    }
    /* ---- Salas online por el servidor del casino (sin depender de la red del jugador) ---- */
    if (route === "sala/send" && req.method === "POST") {
      const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 30);
      const raw = JSON.stringify(body.msg || null);
      if (!code || !body.msg) return json({ error: "Falta la sala o el mensaje" }, 400);
      if (raw.length > 6000) return json({ error: "Mensaje demasiado grande" }, 413);
      const key = "sala/" + code;
      for (let intento = 0; intento < 6; intento++) {
        const cur = await store.getWithMetadata(key, { type: "json" });
        const now = Date.now();
        const b = cur && cur.data && Array.isArray(cur.data.msgs) ? cur.data : { seq: 0, msgs: [] };
        b.seq = num(b.seq) + 1;
        b.msgs = b.msgs.filter(x => now - x.at < 120000).slice(-79);
        b.msgs.push({ s: b.seq, at: now, m: body.msg });
        const res = cur && cur.etag ? await store.setJSON(key, b, { onlyIfMatch: cur.etag })
          : !cur ? await store.setJSON(key, b, { onlyIfNew: true })
          : await store.setJSON(key, b);
        if (!res || res.modified !== false) return json({ ok: true, seq: b.seq });
      }
      return json({ error: "Sala muy ocupada, prueba otra vez" }, 409);
    }
    if (route === "sala/poll" && req.method === "GET") {
      const code = String(url.searchParams.get("code") || "").toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 30);
      if (!code) return json({ error: "Falta la sala" }, 400);
      const after = num(url.searchParams.get("after"));
      const b = await store.get("sala/" + code, { type: "json" });
      const msgs = b && Array.isArray(b.msgs) ? b.msgs.filter(x => x.s > after) : [];
      if (!msgs.length) return json({ same: 1, seq: b ? num(b.seq) : 0 }); // nada nuevo: respuesta mínima
      return json({ seq: b ? num(b.seq) : 0, msgs });
    }

    /* ---- Ficha pública de un jugador: solo datos públicos (nunca sesión, contraseña, recargas ni préstamos) ---- */
    if (route === "player" && req.method === "GET") {
      const id = cleanId(url.searchParams.get("id"));
      if (!id) return json({ error: "Falta el jugador" }, 400);
      const p = await getPlayer(store, id);
      if (!p || !accName(p)) {
        // Cuenta creada que aún no ha sincronizado partida: enseñamos su ficha básica, no "invitado"
        const a = id.startsWith("u_") ? await getAcc(store, id.slice(2)) : null;
        if (!a) return json({ found: false, guest: !id.startsWith("u_") });
        return json({ found: true, id, name: a.user, avatar: a.avatar || "🎲", vip: false, xp: 0, chips: 0, games: 0, online: false,
          since: a.created || null, basic: true, stats: null, tor: { global: null, custom: [] } });
      }
      const meta = await store.get("tor/meta", { type: "json" });
      const te = meta ? await store.get("tore/" + meta.id + "/" + id, { type: "json" }) : null;
      const now = Date.now(), ctor = [];
      for (const m of await ctorMetas(store)) {
        if (!ctorActive(m, now)) continue;
        const ce = await store.get("tore/c" + m.id + "/" + id, { type: "json" });
        if (ce) ctor.push({ name: m.name, pts: num(ce.pts) });
      }
      return json({ found: true, id: p.id, name: accName(p), avatar: p.avatar || "🎲", vip: !!p.vip, xp: Math.floor(num(p.xp)), lv: Math.floor(num(p.lv)) || null, chips: Math.floor(num(p.saldo)),
        games: Math.floor(num(p.games)), online: !!(p.lastSeen && now - p.lastSeen < ONLINE_MS), since: p.firstSeen || null,
        stats: p.pub || null, tor: { global: te ? num(te.pts) : null, custom: ctor } });
    }

    /* ---- Ranking global ---- */
    if (route === "rank" && req.method === "GET") {
      const { blobs } = await store.list({ prefix: "p/" });
      const players = (await Promise.all(blobs.map(b => store.get(b.key, { type: "json" })))).filter(Boolean);
      const list = players.filter(p => accName(p)).map(p => ({ id: p.id, name: accName(p), vip: !!p.vip, avatar: p.avatar, chips: Math.floor(num(p.saldo)) }))
        .sort((a, b) => b.chips - a.chips).slice(0, 50);
      return json({ list });
    }

    /* ---- Torneo ---- */
    if (route === "tor" && req.method === "GET") return json(await torView(store));
    if (route === "tor/join" && req.method === "POST") {
      const id = cleanId(body.id); if (id && !(await guardId(store, req, id))) return json({ error: "Sesión caducada, vuelve a entrar" }, 401); const p = id && await getPlayer(store, id);
      if (!p) return json({ error: "Jugador no encontrado, recarga la página" }, 404);
      const meta = await torCurrent(store);
      const key = "tore/" + meta.id + "/" + id;
      if (await store.get(key)) return json({ error: "Ya estás inscrito" }, 409);
      await store.setJSON(key, { id, name: accName(p) || p.name, avatar: p.avatar, pts: 100, joined: Date.now() });
      return json({ ok: true, fee: TOR_FEE, tor: await torView(store) });
    }
    if (route === "tor/points" && req.method === "POST") {
      const id = cleanId(body.id); const meta = await torCurrent(store);
      const pts = Math.max(0, Math.min(500, Math.floor(num(body.pts))));
      const key = "tore/" + meta.id + "/" + id;
      const e = await store.get(key, { type: "json" });
      let joined = false, total = null;
      if (e) {
        e.pts += pts;
        if (body.name && !/^Jugador_/.test(String(body.name))) e.name = cleanTxt(body.name, 24);
        await store.setJSON(key, e); joined = true; total = e.pts;
      }
      // Los mismos puntos suman en los torneos especiales en los que estés inscrito
      let custom = 0; const now = Date.now();
      if (id) for (const m of await ctorMetas(store)) {
        if (!ctorActive(m, now)) continue;
        const k = "tore/c" + m.id + "/" + id, ce = await store.get(k, { type: "json" });
        if (ce) { ce.pts += pts; await store.setJSON(k, ce); custom++; }
      }
      return json({ ok: true, joined, pts: total, custom });
    }
    if (route === "ctor" && req.method === "GET") return json({ list: await ctorView(store, cleanId(url.searchParams.get("id"))), max: CTOR_MAX });
    if (route === "ctor/join" && req.method === "POST") {
      const id = cleanId(body.id); if (id && !(await guardId(store, req, id))) return json({ error: "Sesión caducada, vuelve a entrar" }, 401); const p = id && await getPlayer(store, id);
      if (!p) return json({ error: "Jugador no encontrado, recarga la página" }, 404);
      const tid = cleanId(body.tid); const m = tid && await store.get("ctor/" + tid, { type: "json" });
      if (!m || !ctorActive(m, Date.now())) return json({ error: "Ese torneo ya no está abierto" }, 400);
      if (num(p.saldo) < num(m.fee)) return json({ error: "Necesitas " + m.fee + " fichas para inscribirte" }, 400);
      const key = "tore/c" + m.id + "/" + id;
      const res = await store.setJSON(key, { id, name: accName(p) || p.name, avatar: p.avatar, pts: 100, joined: Date.now() }, { onlyIfNew: true });
      if (res && res.modified === false) return json({ error: "Ya estás inscrito" }, 409);
      return json({ ok: true, fee: num(m.fee), list: await ctorView(store, id) });
    }

    /* ---- Banco ---- */
    if (route === "loan" && req.method === "POST") {
      const id = cleanId(body.id); if (id && !(await guardId(store, req, id))) return json({ error: "Sesión caducada, vuelve a entrar" }, 401); const p = id && await getPlayer(store, id);
      if (!p) return json({ error: "Jugador no encontrado, recarga la página" }, 404);
      if (p.loan) return json({ error: "Tienes un préstamo sin devolver. Devuélvelo para pedir otro.", loan: p.loan }, 409);
      const amount = Math.floor(num(body.amount));
      if (amount < LOAN_MIN || amount > LOAN_MAX) return json({ error: `El préstamo debe ser de ${LOAN_MIN} a ${LOAN_MAX} fichas` }, 400);
      p.loan = { amount, owe: Math.ceil(Math.round(amount * (100 + LOAN_INTEREST * 100)) / 100), at: Date.now() };
      p.saldo = num(p.saldo) + amount;
      await putPlayer(store, p);
      return json({ ok: true, loan: p.loan });
    }
    if (route === "repay" && req.method === "POST") {
      const id = cleanId(body.id); if (id && !(await guardId(store, req, id))) return json({ error: "Sesión caducada, vuelve a entrar" }, 401); const p = id && await getPlayer(store, id);
      if (!p) return json({ error: "Jugador no encontrado" }, 404);
      if (!p.loan) return json({ error: "No tienes ningún préstamo" }, 400);
      if (num(body.saldo) < p.loan.owe) return json({ error: `Necesitas ${p.loan.owe} fichas para devolverlo`, loan: p.loan }, 400);
      const paid = p.loan.owe;
      (p.loansHistory = p.loansHistory || []).push({ ...p.loan, repaidAt: Date.now() });
      p.loansHistory = p.loansHistory.slice(-20);
      p.loan = null; p.saldo = Math.max(0, num(body.saldo) - paid);
      await putPlayer(store, p);
      return json({ ok: true, paid });
    }

    /* ---- Dueño ---- */
    if (route === "owner/login" && req.method === "POST") {
      return !!OWNER_CODE && String(body.code || "") === OWNER_CODE ? json({ ok: true }) : json({ error: "Código incorrecto" }, 401);
    }
    if (route.startsWith("owner/")) {
      if (!isOwner()) return json({ error: "No autorizado" }, 401);
      if (route === "owner/players" && req.method === "GET") {
        const { blobs } = await store.list({ prefix: "p/" });
        const players = (await Promise.all(blobs.map(b => store.get(b.key, { type: "json" })))).filter(Boolean);
        players.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
        return json({ players });
      }
      if (route === "owner/adjust" && req.method === "POST") {
        const p = await getPlayer(store, cleanId(body.id));
        if (!p) return json({ error: "Jugador no encontrado" }, 404);
        const amount = Math.floor(num(body.amount)); if (!amount) return json({ error: "Cantidad vacía" }, 400);
        const real = Math.max(-num(p.saldo), amount);
        p.adjust = num(p.adjust) + real; p.saldo = num(p.saldo) + real;
        await putPlayer(store, p);
        return json({ ok: true, player: p });
      }
      if (route === "owner/delete" && req.method === "POST") {
        const id = cleanId(body.id); const p = await getPlayer(store, id);
        if (!p) return json({ error: "Jugador no encontrado" }, 404);
        await store.delete("p/" + id);
        await store.set("del/" + id, "1");
        if (id.startsWith("u_")) { // borrar también la cuenta, la partida y sus amigos
          const u = id.slice(2), f = await getFr(store, u);
          for (const o of new Set([...f.friends, ...f.in, ...f.out])) {
            const of = await getFr(store, o);
            for (const k of ["friends", "in", "out"]) of[k] = without(of[k], normUser(u));
            await putFr(store, o, of);
          }
          for (const k of ["acc/", "save/", "fr/"]) await store.delete(k + userKey(u));
        }
        const meta = await store.get("tor/meta", { type: "json" });
        if (meta) await store.delete("tore/" + meta.id + "/" + id);
        return json({ ok: true });
      }
      if (route === "owner/recarga-req" && req.method === "POST") {
        const p = await getPlayer(store, cleanId(body.id));
        if (!p) return json({ error: "Jugador no encontrado" }, 404);
        if (!p.recReq) return json({ error: "Esa solicitud ya no existe" }, 404);
        const rq = p.recReq; p.recReq = null;
        let chips = 0;
        if (body.accept) {
          chips = Math.floor(num(rq.chips)) || Math.round(rq.amount * 10000);
          p.recargado = Math.round((num(p.recargado) + rq.amount) * 100) / 100;
          p.recargas = Array.isArray(p.recargas) ? p.recargas : [];
          p.adjust = num(p.adjust) + chips; p.saldo = num(p.saldo) + chips;
          p.recargas.push({ amount: rq.amount, chips, at: Date.now() }); p.recargas = p.recargas.slice(-50);
        }
        await putPlayer(store, p);
        return json({ ok: true, player: p, chips });
      }
      if (route === "owner/recarga" && req.method === "POST") {
        const p = await getPlayer(store, cleanId(body.id));
        if (!p) return json({ error: "Jugador no encontrado" }, 404);
        const amount = Math.round(num(body.amount) * 100) / 100;
        if (!amount) return json({ error: "Cantidad vacía" }, 400);
        const real = Math.max(-num(p.recargado), amount);
        p.recargado = Math.round((num(p.recargado) + real) * 100) / 100;
        p.recargas = Array.isArray(p.recargas) ? p.recargas : [];
        // 0,10 € = 1000 fichas  →  1 € = 10000 fichas
        let chips = Math.round(real * 10000);
        chips = Math.max(-num(p.saldo), chips);
        p.adjust = num(p.adjust) + chips; p.saldo = num(p.saldo) + chips;
        p.recargas.push({ amount: real, chips, at: Date.now() }); p.recargas = p.recargas.slice(-50);
        await putPlayer(store, p);
        return json({ ok: true, player: p, chips });
      }
      if (route === "owner/vip" && req.method === "POST") {
        const p = await getPlayer(store, cleanId(body.id));
        if (!p) return json({ error: "Jugador no encontrado" }, 404);
        p.vip = !!body.accept; p.vipReq = null;
        if (p.vip) { p.vipSince = Date.now(); p.vipLost = null; }
        await putPlayer(store, p);
        return json({ ok: true, player: p });
      }
      if (route === "owner/tor" && req.method === "GET") return json({ base: await torBase(store), fee: TOR_FEE });
      if (route === "owner/tor" && req.method === "POST") {
        const base = Math.floor(num(body.base));
        if (!(base >= 0 && base <= 100000000)) return json({ error: "Premio no válido (de 0 a 100.000.000)" }, 400);
        await store.setJSON("tor/config", { base, at: Date.now() });
        return json({ ok: true, base, fee: TOR_FEE });
      }
      if (route === "owner/ctor" && req.method === "GET") return json({ list: await ctorView(store, ""), max: CTOR_MAX });
      if (route === "owner/ctor" && req.method === "POST") {
        const name = String(body.name || "").replace(/[<>]/g, "").trim().slice(0, 40);
        const prize = Math.floor(num(body.prize)), fee = Math.floor(num(body.fee)), minutes = Math.floor(num(body.minutes));
        if (name.length < 3) return json({ error: "El nombre necesita al menos 3 letras (máximo 40)" }, 400);
        if (!(prize >= 0 && prize <= 100000000)) return json({ error: "Premio no válido (de 0 a 100.000.000)" }, 400);
        if (!(fee >= 0 && fee <= 1000000)) return json({ error: "Inscripción no válida (de 0 a 1.000.000)" }, 400);
        if (!(minutes >= 5 && minutes <= 43200)) return json({ error: "Duración no válida (de 5 minutos a 30 días)" }, 400);
        const now = Date.now();
        const active = (await ctorMetas(store)).filter(m => ctorActive(m, now));
        if (active.length >= CTOR_MAX) return json({ error: "Ya hay " + CTOR_MAX + " torneos especiales activos. Cancela uno o espera a que acabe." }, 400);
        const id = "x" + now.toString(36) + randomBytes(3).toString("hex");
        const m = { id, name, prize, fee, minutes, created: now, endsAt: now + minutes * 60000 };
        await store.setJSON("ctor/" + id, m);
        return json({ ok: true, tor: m, list: await ctorView(store, "") });
      }
      if (route === "owner/ctor/cancel" && req.method === "POST") {
        const tid = cleanId(body.tid); const m = tid && await store.get("ctor/" + tid, { type: "json" });
        if (!m) return json({ error: "Torneo no encontrado" }, 400);
        if (m.done || m.cancelled) return json({ error: "Ese torneo ya ha terminado" }, 400);
        // Se devuelve la inscripción a cada jugador (llega con su próxima sincronización)
        const rows = await torEntries(store, "c" + m.id); let refunded = 0;
        if (num(m.fee) > 0) for (const r of rows) { const p = await getPlayer(store, r.id); if (p) { p.adjust = num(p.adjust) + num(m.fee); p.saldo = num(p.saldo) + num(m.fee); await putPlayer(store, p); refunded++; } }
        m.cancelled = true; m.cancelledAt = Date.now(); await store.setJSON("ctor/" + m.id, m);
        return json({ ok: true, refunded, list: await ctorView(store, "") });
      }
      if (route === "owner/forgive" && req.method === "POST") {
        const p = await getPlayer(store, cleanId(body.id));
        if (!p) return json({ error: "Jugador no encontrado" }, 404);
        p.loan = null; await putPlayer(store, p);
        return json({ ok: true, player: p });
      }
    }
    return json({ error: "Ruta no encontrada" }, 404);
  } catch (e) {
    return json({ error: "Error de base de datos: " + (e.message || e) }, 500);
  }
};

export const config = { path: "/db/*" };
