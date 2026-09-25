(() => {
  const START = 1500;
  const DAILY = 250;
  const RESCUE = 150;
  const KEY = "aurum-casino-v2";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const state = load() || {
    chips: START,
    name: "Invitado",
    hands: 0,
    won: 0,
    lost: 0,
    history: [],
    lastBonus: 0,
    ageOk: false,
    p2: { chips: START, name: "Jugador 2" }
  };
  if (!state.p2) state.p2 = { chips: START, name: "Jugador 2" };
  if (!state.p2.avatar) state.p2.avatar = "🦊";
  if (!state.p2.name) state.p2.name = "Jugador 2";
  if (state.jp == null) state.jp = 25000;
  const todayStr = () => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  };
  if (!state.daily || state.daily.day !== todayStr()) state.daily = { day: todayStr(), bj: 0, done: false };

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)); }
    catch { return null; }
  }
  const USERS_KEY = "aurum-users-v1";
  const SESS_KEY = "aurum-session-v1";

  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
    return String(h >>> 0);
  }
  function loadUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; }
    catch { return {}; }
  }
  function saveUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }
  function sessionName() { return localStorage.getItem(SESS_KEY) || ""; }
  function snapshot() {
    return {
      chips: state.chips, name: state.name, hands: state.hands,
      won: state.won, lost: state.lost, history: state.history,
      lastBonus: state.lastBonus, ageOk: true,
      p2: state.p2, jp: state.jp, daily: state.daily, rescued: !!state.rescued
    };
  }
  function applySnap(s, fallbackName) {
    Object.assign(state, {
      chips: s?.chips ?? START,
      name: s?.name || fallbackName || "Invitado",
      hands: s?.hands ?? 0,
      won: s?.won ?? 0,
      lost: s?.lost ?? 0,
      history: s?.history ?? [],
      lastBonus: s?.lastBonus ?? 0,
      ageOk: true,
      p2: s?.p2 || state.p2 || { chips: START, name: "Jugador 2" },
      jp: s?.jp ?? state.jp ?? 25000,
      daily: s?.daily || state.daily,
      rescued: !!s?.rescued
    });
  }
  function persistUser() {
    const sess = sessionName();
    if (sess === "guest") {
      localStorage.setItem(KEY + "-guest", JSON.stringify(snapshot()));
      return;
    }
    if (!sess) return;
    const users = loadUsers();
    if (users[sess]) {
      users[sess].state = snapshot();
      saveUsers(users);
    }
  }
  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
    persistUser();
    renderWallet();
  }
  function fmt(n) {
    return Math.round(n).toLocaleString("es-ES");
  }
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2400);
  }
  function renderWallet() {
    $("#chip-count").textContent = fmt(state.chips);
    const who = $("#who");
    if (who) who.textContent = state.name || "Invitado";
    const acc = $("#acc-chips");
    if (acc) {
      acc.textContent = fmt(state.chips);
      $("#acc-hands").textContent = fmt(state.hands);
      $("#acc-won").textContent = fmt(state.won);
      $("#acc-lost").textContent = fmt(state.lost);
      $("#acc-net").textContent = fmt(state.won - state.lost);
      $("#player-name").value = state.name;
      const ul = $("#history");
      ul.innerHTML = state.history.slice(0, 18).map(h =>
        `<li><span>${h.game} · ${h.note}</span><b class="${h.delta >= 0 ? "win" : "lose"}">${h.delta >= 0 ? "+" : ""}${fmt(h.delta)}</b></li>`
      ).join("") || "<li>Sin jugadas todavía</li>";
    }
  }
  function log(game, note, delta) {
    state.history.unshift({ game, note, delta, t: Date.now() });
    state.history = state.history.slice(0, 40);
    state.hands += 1;
    if (delta > 0) state.won += delta;
    if (delta < 0) state.lost += -delta;
    save();
  }
  const MP_GAMES = ["roulette", "blackjack", "dice", "horses", "poker", "scratch", "keno"];
  const mp = {
    roulette: { on: false, turn: 0, joint: true, busy: false },
    blackjack: { on: false, turn: 0, joint: false, busy: false },
    dice: { on: false, turn: 0, joint: false, busy: false },
    horses: { on: false, turn: 0, joint: false, busy: false },
    poker: { on: false, turn: 0, joint: false, busy: false },
    scratch: { on: false, turn: 0, joint: false, busy: false },
    keno: { on: false, turn: 0, joint: false, busy: false }
  };
  let betCtx = "global";

  function seatOf(game) {
    const g = mp[game];
    return g && g.on ? g.turn : 0;
  }
  function wallet(game) {
    return seatOf(game) === 1 ? state.p2 : state;
  }
  function seatName(seat) {
    if (seat === 1) return (state.p2.avatar || "🦊") + " " + (state.p2.name || "Jugador 2");
    return state.name || "Jugador 1";
  }
  function renderMP() {
    $$(".mp-bar").forEach(bar => {
      const game = bar.dataset.mp;
      const g = mp[game];
      if (!g) return;
      const hint = g.joint
        ? "Los dos pueden apostar en la misma tirada. Elige quién coloca ficha."
        : "Jugáis por turnos en este dispositivo.";
      bar.innerHTML = `
        <div class="mp-modes">
          <button class="mp-mode ${g.on ? "" : "on"}" data-mode="solo">Solo</button>
          <button class="mp-mode ${g.on ? "on" : ""}" data-mode="mp">Multijugador</button>
        </div>
        <div class="mp-seats ${g.on ? "" : "hidden"}">
          <button class="mp-seat ${g.turn === 0 ? "on" : ""}" data-seat="0">${seatName(0)} · ${fmt(state.chips)}</button>
          <button class="mp-seat ${g.turn === 1 ? "on" : ""}" data-seat="1">${seatName(1)} · ${fmt(state.p2.chips)}</button>
        </div>
        <div class="mp-hint">${g.on ? hint + " Turno: " + seatName(g.turn) : "Modo individual"}</div>`;
    });
  }
  function nextTurn(game) {
    const g = mp[game];
    if (!g || !g.on || g.joint) { renderMP(); return; }
    g.turn = 1 - g.turn;
    renderMP();
    toast("Turno de " + seatName(g.turn));
  }
  document.addEventListener("click", (e) => {
    const mode = e.target.closest("[data-mode]");
    const bar = e.target.closest(".mp-bar");
    if (mode && bar) {
      const game = bar.dataset.mp;
      const g = mp[game];
      if (!g || g.busy) { if (g?.busy) toast("Termina la mano primero"); return; }
      g.on = mode.dataset.mode === "mp";
      g.turn = 0;
      renderMP();
    }
    const seat = e.target.closest("[data-seat]");
    if (seat && bar) {
      const game = bar.dataset.mp;
      const g = mp[game];
      if (!g || !g.on || g.busy) return;
      g.turn = +seat.dataset.seat;
      renderMP();
    }
  });

  function canBet(n) {
    const w = MP_GAMES.includes(betCtx) ? wallet(betCtx) : state;
    if (w.chips < n) {
      toast("No hay fichas suficientes" + (mp[betCtx]?.on ? " (" + seatName(seatOf(betCtx)) + ")" : ""));
      if (w.chips === 0) toast("Pulsa Bono para un auxilio");
      return false;
    }
    return true;
  }
  function addChips(n) {
    const w = MP_GAMES.includes(betCtx) ? wallet(betCtx) : state;
    w.chips = Math.max(0, w.chips + n);
    save();
    renderMP();
  }

  /* NAV */
  function go(id) {
    $$(".view").forEach(v => v.classList.remove("active"));
    const view = $("#view-" + id);
    if (view) view.classList.add("active");
    $$(".nav button").forEach(b => b.classList.toggle("active", b.dataset.go === id));
    $("#nav").classList.remove("open");
    betCtx = MP_GAMES.includes(id) ? id : "global";
    renderMP();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-go]");
    if (t) {
      e.preventDefault();
      go(t.dataset.go);
    }
  });
  $("#menu-btn").onclick = () => $("#nav").classList.toggle("open");

  /* AGE + LOGIN */
  let authMode = "login";
  function showLogin() { $("#login-gate").classList.remove("hidden"); }
  function hideLogin() { $("#login-gate").classList.add("hidden"); }
  function setAuthMode(mode) {
    authMode = mode;
    $$(".login-tabs .tab").forEach(t => t.classList.toggle("on", t.dataset.auth === mode));
    $("#auth-pass2").classList.toggle("hidden", mode === "login");
    $("#auth-submit").textContent =
      mode === "register" ? "Crear cuenta" : mode === "recover" ? "Guardar nueva clave" : "Iniciar sesión";
    $("#auth-msg").textContent = "";
  }
  $$(".login-tabs .tab").forEach(t => t.onclick = () => setAuthMode(t.dataset.auth));

  function enterAs(name, snap) {
    applySnap(snap, name);
    localStorage.setItem(SESS_KEY, name === "Invitado" ? "guest" : name.toLowerCase());
    save();
    hideLogin();
    toast("Bienvenido, " + state.name);
  }

  $("#auth-form").onsubmit = (e) => {
    e.preventDefault();
    const user = ($("#auth-user").value || "").trim();
    const pass = $("#auth-pass").value || "";
    const pass2 = $("#auth-pass2").value || "";
    const key = user.toLowerCase();
    const msg = $("#auth-msg");
    if (user.length < 3) { msg.textContent = "El usuario necesita 3 caracteres."; return; }
    if (pass.length < 4) { msg.textContent = "La contraseña necesita 4 caracteres."; return; }
    if (!/^[a-zA-Z0-9_áéíóúüñÁÉÍÓÚÜÑ]+$/.test(user)) { msg.textContent = "Solo letras, números y _"; return; }
    const users = loadUsers();

    if (authMode === "register") {
      if (pass !== pass2) { msg.textContent = "Las contraseñas no coinciden."; return; }
      if (users[key]) { msg.textContent = "Ese usuario ya existe."; return; }
      users[key] = { user, pass: hash(pass), state: { chips: START, name: user, hands: 0, won: 0, lost: 0, history: [], lastBonus: 0, ageOk: true } };
      saveUsers(users);
      enterAs(user, users[key].state);
      return;
    }
    if (authMode === "recover") {
      if (!users[key]) { msg.textContent = "No hay una cuenta con ese nombre."; return; }
      if (pass !== pass2) { msg.textContent = "Las contraseñas no coinciden."; return; }
      users[key].pass = hash(pass);
      saveUsers(users);
      msg.textContent = "";
      toast("Contraseña actualizada. Entra ahora.");
      setAuthMode("login");
      return;
    }
    if (!users[key] || users[key].pass !== hash(pass)) {
      msg.textContent = "Usuario o contraseña incorrectos.";
      return;
    }
    enterAs(users[key].user, users[key].state);
  };

  $("#guest-btn").onclick = () => {
    let guest = null;
    try { guest = JSON.parse(localStorage.getItem(KEY + "-guest")); } catch {}
    enterAs("Invitado", guest || { chips: START, name: "Invitado", hands: 0, won: 0, lost: 0, history: [], lastBonus: 0, ageOk: true });
  };
  $("#logout-btn").onclick = () => {
    persistUser();
    localStorage.removeItem(SESS_KEY);
    showLogin();
    toast("Sesión cerrada");
  };

  if (state.ageOk) $("#age-gate").classList.add("hidden");
  $("#age-yes").onclick = () => {
    state.ageOk = true;
    save();
    $("#age-gate").classList.add("hidden");
    if (!sessionName()) showLogin();
  };
  $("#age-no").onclick = () => $("#deny").classList.add("show");

  if (state.ageOk) {
    const sess = sessionName();
    if (!sess) showLogin();
    else if (sess !== "guest") {
      const users = loadUsers();
      if (users[sess]) applySnap(users[sess].state, users[sess].user);
    }
  }

  function creditMain(n) {
    state.chips = Math.max(0, state.chips + n);
    save();
    renderMP();
  }
  /* BONUS */
  $("#bonus-btn").onclick = () => {
    const now = Date.now();
    if (now - (state.lastBonus || 0) > 24 * 3600 * 1000) {
      creditMain(DAILY);
      state.lastBonus = now;
      save();
      toast("+250 fichas de cortesía");
      return;
    }
    if (state.chips === 0 && !state.rescued) {
      state.rescued = true;
      creditMain(RESCUE);
      toast("+150 de auxilio. Solo una vez");
      return;
    }
    if (state.chips === 0) toast("El auxilio ya se usó. Reinicia el progreso o espera el bono.");
    else toast("El bono diario ya se usó. Vuelve mañana.");
  };

  /* ACCOUNT */
  $("#save-name").onclick = () => {
    state.name = ($("#player-name").value || "Invitado").trim().slice(0, 20);
    if ($("#p2-name")) state.p2.name = ($("#p2-name").value || "Jugador 2").trim().slice(0, 20);
    save();
    renderMP();
    toast("Perfil guardado");
  };
  $("#reset-btn").onclick = () => {
    if (!confirm("¿Borrar fichas e historial de este navegador?")) return;
    Object.assign(state, {
      chips: START, hands: 0, won: 0, lost: 0, history: [], lastBonus: 0, ageOk: true,
      p2: { chips: START, name: state.p2?.name || "Jugador 2", avatar: state.p2?.avatar || "🦊" },
      jp: 25000, daily: { day: todayStr(), bj: 0, done: false }, rescued: false
    });
    save();
    renderWallet();
    toast("Progreso reiniciado");
  };

  /* CHIPS + MESAS */
  const TABLE_TIERS = [
    { id: "clasica", name: "Clásica", range: "5–1.000", min: 5, max: 1000, chips: [5, 25, 50, 100, 250] },
    { id: "gold", name: "Gold", range: "500–10.000", min: 500, max: 10000, chips: [500, 1000, 2500, 5000] },
    { id: "plat", name: "Platinum", range: "desde 5.000", min: 5000, max: 50000, chips: [5000, 7500, 10000, 15000] }
  ];
  const SLOT_TIERS = [
    { id: "verde", name: "Verde", range: "5–25", min: 5, max: 25, chips: [5, 10, 15, 25], tone: "green" },
    { id: "azul", name: "Azul", range: "50–75", min: 50, max: 75, chips: [50, 60, 75], tone: "blue" },
    { id: "roja", name: "Roja", range: "100–250", min: 100, max: 250, chips: [100, 150, 250], tone: "red" }
  ];

  function mountChips(id, currentRef, labelId, set) {
    const box = document.getElementById(id);
    const chips = set || currentRef.chips || [25, 50, 100, 250, 500];
    if (!chips.includes(currentRef.value)) currentRef.value = chips[0];
    box.innerHTML = chips.map(v =>
      `<button class="chip c${v} ${v === currentRef.value ? "on" : ""}" data-v="${v}">${v}</button>`
    ).join("");
    box.onclick = (e) => {
      const b = e.target.closest("[data-v]");
      if (!b) return;
      currentRef.value = +b.dataset.v;
      $$(".chip", box).forEach(c => c.classList.toggle("on", +c.dataset.v === currentRef.value));
      if (labelId) document.getElementById(labelId).textContent = currentRef.value;
    };
    if (labelId) document.getElementById(labelId).textContent = currentRef.value;
  }

  function bindTiers(tierId, noteId, chipId, labelId, betRef, tiers, defaultId) {
    const box = document.getElementById(tierId);
    const note = document.getElementById(noteId);
    betRef.tier = tiers.find(t => t.id === defaultId) || tiers[0];
    const draw = () => {
      box.innerHTML = tiers.map(t =>
        `<button class="tier ${t.tone ? "tone-" + t.tone : ""} ${t.id === betRef.tier.id ? "on" : ""}" data-tier="${t.id}">
          <b>${t.name}</b><span>${t.range}</span>
        </button>`
      ).join("");
      note.textContent = `Mesa ${betRef.tier.name} · apuesta ${betRef.tier.range} fichas`;
      mountChips(chipId, betRef, labelId, betRef.tier.chips);
    };
    box.onclick = (e) => {
      const btn = e.target.closest("[data-tier]");
      if (!btn) return;
      const next = tiers.find(t => t.id === btn.dataset.tier);
      if (!next) return;
      if (state.chips < next.min) {
        toast(`Necesitas al menos ${fmt(next.min)} fichas para ${next.name}`);
        return;
      }
      betRef.tier = next;
      betRef.value = next.chips[0];
      draw();
    };
    draw();
  }

  function paintJP() {
    const n = fmt(state.jp || 0);
    if ($("#jackpot")) $("#jackpot").textContent = n;
    if ($("#slots-jp")) $("#slots-jp").textContent = n;
  }
  paintJP();

  /* ========== SLOTS ========== */
  const SYMS = ["7️⃣", "💎", "🔔", "🍒", "🍋", "⭐"];
  const WEIGHTS = [2, 3, 5, 7, 8, 6];
  const PAY3 = { "7️⃣": 20, "💎": 12, "🔔": 8, "🍒": 6, "🍋": 4, "⭐": 5 };
  const slotsBet = { value: 5 };
  bindTiers("slots-tiers", "slots-tier-note", "slots-chips", "slots-bet", slotsBet, SLOT_TIERS, "verde");
  let spinning = false;

  function pickSym() {
    const total = WEIGHTS.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < SYMS.length; i++) {
      r -= WEIGHTS[i];
      if (r <= 0) return SYMS[i];
    }
    return SYMS[0];
  }
  $("#spin-btn").onclick = async () => {
    if (spinning || !canBet(slotsBet.value)) return;
    spinning = true;
    addChips(-slotsBet.value);
    $("#spin-btn").disabled = true;
    ["r1", "r2", "r3"].forEach(id => $("#" + id).classList.add("spinning"));
    const t = setInterval(() => {
      $("#r1").textContent = pickSym();
      $("#r2").textContent = pickSym();
      $("#r3").textContent = pickSym();
    }, 70);
    await wait(1100);
    clearInterval(t);
    const a = pickSym(), b = pickSym(), c = pickSym();
    $("#r1").textContent = a; $("#r2").textContent = b; $("#r3").textContent = c;
    ["r1", "r2", "r3"].forEach(id => $("#" + id).classList.remove("spinning"));
    let mult = 0, note = "sin premio";
    if (a === b && b === c) { mult = PAY3[a]; note = "trío " + a; }
    else if (a === b || b === c || a === c) { mult = 2; note = "pareja"; }
    const rake = Math.max(1, Math.round(slotsBet.value * 0.08));
    state.jp = (state.jp || 25000) + rake;
    let prize = slotsBet.value * mult;
    let jpHit = false;
    if (state.jp >= 400 && Math.random() < 0.012) {
      prize += state.jp;
      jpHit = true;
      note = "BOTE " + fmt(state.jp);
      state.jp = 8000;
      sfx("win");
    } else if (prize) sfx("win");
    else sfx("lose");
    if (prize) addChips(prize);
    log("Slots", note, prize - slotsBet.value);
    paintJP();
    $("#slots-msg").textContent = prize ? `Premio ${fmt(prize)} · ${note}` : "Sin premio";
    if (jpHit) toast("¡Cae el bote de la máquina!");
    spinning = false;
    $("#spin-btn").disabled = false;
  };

  /* ========== ROULETTE ========== */
  const REDS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const EURO_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
  const rouletteBet = { value: 25 };
  bindTiers("roulette-tiers", "roulette-tier-note", "roulette-chips", "roulette-bet", rouletteBet, TABLE_TIERS, "clasica");
  const bets = []; // {key, amt, seat}
  let ballBusy = false;

  function buildWheel() {
    const wheel = $("#wheel");
    const slice = 360 / 37;
    const stops = EURO_ORDER.map((num, i) => {
      const c = num === 0 ? "#0b7a32" : REDS.has(num) ? "#b03a2e" : "#161616";
      return `${c} ${(i / 37) * 100}% ${((i + 1) / 37) * 100}%`;
    });
    wheel.style.background = `conic-gradient(${stops.join(",")})`;
    wheel.innerHTML = `<div class="wheel-nums">${EURO_ORDER.map((num, i) =>
      `<span class="wnum">${num}</span>`
    ).join("")}</div>`;
    $$(".wnum", wheel).forEach((el, i) => {
      el.style.transform = `rotate(${i * slice + slice / 2}deg) translateY(-114px)`;
    });
  }
  buildWheel();

  function colorOf(n) {
    if (n === 0) return "green";
    return REDS.has(n) ? "red" : "black";
  }
  function buildBoard() {
    const board = $("#board");
    board.innerHTML = "";
    const zero = document.createElement("button");
    zero.className = "cell green";
    zero.textContent = "0";
    zero.dataset.bet = "n-0";
    board.appendChild(zero);
    for (let col = 0; col < 12; col++) {
      for (let row = 0; row < 3; row++) {
        const n = col * 3 + (3 - row);
        const cell = document.createElement("button");
        cell.className = "cell " + colorOf(n);
        cell.textContent = n;
        cell.dataset.bet = "n-" + n;
        board.appendChild(cell);
      }
    }
    const extras = [
      ["1-12", "d-1st"], ["13-24", "d-2nd"], ["25-36", "d-3rd"],
      ["Rojo", "c-red"], ["Negro", "c-black"],
      ["Par", "e-even"], ["Impar", "e-odd"],
      ["1-18", "h-low"], ["19-36", "h-high"]
    ];
    const out = $("#outbets");
    out.innerHTML = extras.map(([l, k]) => `<button class="cell" data-bet="${k}">${l}</button>`).join("");
  }
  buildBoard();

  function placeBet(key) {
    if (ballBusy) { toast("Espera a que pare la bola"); return; }
    if (!canBet(rouletteBet.value)) return;
    addChips(-rouletteBet.value);
    sfx("chip");
    bets.push({ key, amt: rouletteBet.value, seat: seatOf("roulette") });
    paintBets();
    const tot = bets.reduce((a, b) => a + b.amt, 0);
    $("#roulette-msg").textContent = `Apuestas ${fmt(tot)}`;
  }
  function paintBets() {
    const by = {};
    bets.forEach(b => { by[b.key] = (by[b.key] || 0) + b.amt; });
    $$("#view-roulette [data-bet]").forEach(el => {
      const k = el.dataset.bet;
      el.classList.toggle("on", !!by[k]);
      let chip = el.querySelector(".felt-chip");
      if (by[k]) {
        if (!chip) { chip = document.createElement("span"); chip.className = "felt-chip"; el.appendChild(chip); }
        chip.textContent = by[k];
      } else if (chip) chip.remove();
    });
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest(".felt-chip")) return;
    const cell = e.target.closest("#view-roulette [data-bet]");
    if (cell) placeBet(cell.dataset.bet);
  });
  $("#clear-roulette").onclick = () => {
    bets.forEach(b => {
      const w = b.seat === 1 ? state.p2 : state;
      w.chips += b.amt;
    });
    bets.length = 0;
    save();
    renderMP();
    paintBets();
    $("#roulette-msg").textContent = "Mesa limpia";
  };

  function winsOn(n, key) {
    if (key.startsWith("n-")) return +key.slice(2) === n;
    if (key === "c-red") return colorOf(n) === "red";
    if (key === "c-black") return colorOf(n) === "black";
    if (key === "e-even") return n !== 0 && n % 2 === 0;
    if (key === "e-odd") return n !== 0 && n % 2 === 1;
    if (key === "h-low") return n >= 1 && n <= 18;
    if (key === "h-high") return n >= 19 && n <= 36;
    if (key === "d-1st") return n >= 1 && n <= 12;
    if (key === "d-2nd") return n >= 13 && n <= 24;
    if (key === "d-3rd") return n >= 25 && n <= 36;
    return false;
  }
  function payoutMult(key) {
    if (key.startsWith("n-")) return 36;
    if (key.startsWith("d-")) return 3;
    return 2;
  }

  $("#spin-roulette").onclick = async () => {
    if (ballBusy) return;
    if (!bets.length) { toast("Apuesta primero"); return; }
    ballBusy = true;
    mp.roulette.busy = true;
    const n = Math.floor(Math.random() * 37);
    const idx = EURO_ORDER.indexOf(n);
    const slice = 360 / 37;
    const extra = 6 + Math.floor(Math.random() * 3);
    $("#wheel").style.transform = `rotate(${extra * 360 - (idx * slice + slice / 2)}deg)`;
    sfx("spin");
    $("#roulette-msg").textContent = "La bola corre…";
    await wait(4200);
    let pay = 0;
    const stake = bets.reduce((a, b) => a + b.amt, 0);
    bets.forEach(b => {
      const won = winsOn(n, b.key) ? b.amt * payoutMult(b.key) : 0;
      const w = b.seat === 1 ? state.p2 : state;
      w.chips += won;
      pay += won;
    });
    save();
    const net = pay - stake;
    log("Ruleta", `${n} ${colorOf(n)}`, net);
    $("#roulette-msg").textContent = `Salió ${n} (${colorOf(n) === "green" ? "verde" : colorOf(n) === "red" ? "rojo" : "negro"}) · ${pay ? "mesa paga " + fmt(pay) : "mesa gana"}`;
    bets.length = 0;
    paintBets();
    ballBusy = false;
    mp.roulette.busy = false;
    renderMP();
  };

  /* ========== BLACKJACK ========== */
  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const bjBet = { value: 50 };
  bindTiers("bj-tiers", "bj-tier-note", "bj-chips", "bj-bet", bjBet, TABLE_TIERS, "clasica");
  let deck = [], player = [], dealer = [], bjLock = false, bjStake = 0;

  function newDeck() {
    const d = [];
    for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }
  function val(hand) {
    let t = 0, aces = 0;
    for (const c of hand) {
      if (c.r === "A") { aces++; t += 11; }
      else if ("JQK".includes(c.r)) t += 10;
      else t += +c.r;
    }
    while (t > 21 && aces) { t -= 10; aces--; }
    return t;
  }
  function cardHtml(c, hide) {
    if (hide) return `<div class="card back"></div>`;
    const red = c.s === "♥" || c.s === "♦";
    return `<div class="card ${red ? "red" : ""}"><span>${c.r}${c.s}</span><span style="align-self:flex-end">${c.s}</span></div>`;
  }
  let bjHands = [], bjCur = 0;
  function curHand() { return bjHands[bjCur]; }
  function paintBJ(hideDealer) {
    const a = bjHands[0];
    const b = bjHands[1];
    $("#player-cards").innerHTML = a ? a.cards.map(c => cardHtml(c, false)).join("") : "";
    const splitBox = $("#split-cards");
    if (splitBox) splitBox.innerHTML = b ? b.cards.map(c => cardHtml(c, false)).join("") : "";
    if ($("#wrap-1")) $("#wrap-1").classList.toggle("hidden", !b);
    if ($("#wrap-0")) $("#wrap-0").classList.toggle("on-hand", !!a && bjCur === 0 && bjLock);
    if ($("#wrap-1")) $("#wrap-1").classList.toggle("on-hand", !!b && bjCur === 1 && bjLock);
    const scores = bjHands.map(h => val(h.cards));
    $("#player-score").textContent = scores.length ? scores.join(" · ") : "-";
    $("#dealer-cards").innerHTML = dealer.map((c, i) => cardHtml(c, hideDealer && i === 1)).join("");
    $("#dealer-score").textContent = dealer.length ? (hideDealer ? val([dealer[0]]) : val(dealer)) : "-";
  }
  function setBJ(playing) {
    const h = curHand();
    $("#bj-deal").disabled = playing;
    $("#bj-hit").disabled = !playing;
    $("#bj-stand").disabled = !playing;
    $("#bj-double").disabled = !playing || !h || h.cards.length !== 2;
    const pair = playing && bjHands.length === 1 && h && h.cards.length === 2 && h.cards[0].r === h.cards[1].r;
    const canSplit = pair && wallet("blackjack").chips >= h.stake;
    $("#bj-split").disabled = !canSplit;
  }
  function nextBjHandOrDealer() {
    if (bjCur < bjHands.length - 1) {
      bjCur += 1;
      paintBJ(true);
      setBJ(true);
      $("#bj-msg").textContent = "Mano " + (bjCur + 1);
      return;
    }
    dealerPlay();
  }
  $("#bj-deal").onclick = () => {
    if (bjLock || !canBet(bjBet.value)) return;
    deck = newDeck();
    dealer = [deck.pop(), deck.pop()];
    bjHands = [{ cards: [deck.pop(), deck.pop()], stake: bjBet.value }];
    bjCur = 0;
    addChips(-bjBet.value);
    sfx("chip");
    bjLock = true;
    mp.blackjack.busy = true;
    setBJ(true);
    paintBJ(true);
    $("#bj-msg").textContent = "Tu turno";
    if (val(bjHands[0].cards) === 21) {
      paintBJ(false);
      if (val(dealer) === 21) endBJ("Empate de blackjack", bjHands[0].stake);
      else endBJ("Blackjack", Math.floor(bjHands[0].stake * 2.5));
    }
  };
  $("#bj-hit").onclick = () => {
    if (!bjLock || !curHand()) return;
    curHand().cards.push(deck.pop());
    paintBJ(true);
    $("#bj-double").disabled = true;
    if (val(curHand().cards) > 21) {
      toast("Mano " + (bjCur + 1) + " pasada");
      nextBjHandOrDealer();
    }
  };
  $("#bj-stand").onclick = () => {
    if (!bjLock) return;
    nextBjHandOrDealer();
  };
  $("#bj-double").onclick = () => {
    const h = curHand();
    if (!bjLock || !h || h.cards.length !== 2 || !canBet(h.stake)) return;
    addChips(-h.stake);
    h.stake *= 2;
    h.cards.push(deck.pop());
    paintBJ(true);
    nextBjHandOrDealer();
  };
  $("#bj-split").onclick = () => {
    const h = curHand();
    if (!bjLock || bjHands.length !== 1 || !h || h.cards.length !== 2 || h.cards[0].r !== h.cards[1].r) return;
    if (!canBet(h.stake)) return;
    addChips(-h.stake);
    sfx("chip");
    const c2 = h.cards.pop();
    bjHands = [
      { cards: [h.cards[0], deck.pop()], stake: h.stake },
      { cards: [c2, deck.pop()], stake: h.stake }
    ];
    bjCur = 0;
    paintBJ(true);
    setBJ(true);
    $("#bj-msg").textContent = "Mano 1 · pareja separada";
  };
  function settleHand(hand, label) {
    const p = val(hand.cards), d = val(dealer), stake = hand.stake;
    if (p > 21) return { pay: 0, note: label + " pasada", stake };
    if (d > 21 || p > d) return { pay: stake * 2, note: label + " gana", stake };
    if (p === d) return { pay: stake, note: label + " empate", stake };
    return { pay: 0, note: label + " pierde", stake };
  }
  function dealerPlay() {
    paintBJ(false);
    const allBust = bjHands.every(h => val(h.cards) > 21);
    if (!allBust) {
      while (val(dealer) < 17) dealer.push(deck.pop());
    }
    paintBJ(false);
    if (bjHands.length > 1) {
      const res = bjHands.map((h, i) => settleHand(h, "Mano " + (i + 1)));
      const pay = res.reduce((a, r) => a + r.pay, 0);
      const stake = res.reduce((a, r) => a + r.stake, 0);
      addChips(pay);
      const net = pay - stake;
      if (net > 0) { sfx("win"); bumpDailyBJ(); } else if (net === 0) sfx("chip"); else sfx("lose");
      log("Blackjack", res.map(r => r.note).join(" / "), net);
      $("#bj-msg").textContent = res.map(r => r.note).join(" · ");
      bjLock = false;
      mp.blackjack.busy = false;
      setBJ(false);
      nextTurn("blackjack");
      return;
    }
    const r = settleHand(bjHands[0], "Mano");
    if (val(bjHands[0].cards) > 21) endBJ("Te pasaste", 0);
    else if (r.pay === r.stake * 2) endBJ(val(dealer) > 21 ? "Crupier se pasa" : "Ganas", r.pay);
    else if (r.pay === r.stake) endBJ("Empate", r.pay);
    else endBJ("Gana la casa", 0);
  }
  function endBJ(note, pay) {
    const stake = bjHands[0] ? bjHands[0].stake : 0;
    addChips(pay);
    if (pay > stake) { sfx("win"); bumpDailyBJ(); }
    else if (pay === stake) sfx("chip");
    else sfx("lose");
    log("Blackjack", note, pay - stake);
    $("#bj-msg").textContent = pay === stake ? "Empate · apuesta devuelta" : (note + " · " + (pay ? "+" + fmt(pay - stake) : "−" + fmt(stake)));
    paintBJ(false);
    bjLock = false;
    mp.blackjack.busy = false;
    setBJ(false);
    nextTurn("blackjack");
  }

  /* ========== DICE ========== */
  const diceBet = { value: 50 };
  bindTiers("dice-tiers", "dice-tier-note", "dice-chips", "dice-bet", diceBet, TABLE_TIERS, "clasica");
  let diceSide = "over";
  $$("[data-dice]").forEach(b => b.onclick = () => {
    diceSide = b.dataset.dice;
    $$("[data-dice]").forEach(x => x.classList.toggle("btn-gold", x === b));
    $$("[data-dice]").forEach(x => { if (x !== b) x.classList.remove("btn-gold"); x.classList.toggle("btn-ghost", x !== b); });
  });
  $$("[data-dice]")[2].classList.add("btn-gold");
  $$("[data-dice]")[2].classList.remove("btn-ghost");

  $("#roll-dice").onclick = async () => {
    if (!canBet(diceBet.value)) return;
    addChips(-diceBet.value);
    $("#d1").classList.add("rolling");
    $("#d2").classList.add("rolling");
    const flicker = setInterval(() => {
      $("#d1").textContent = 1 + Math.floor(Math.random() * 6);
      $("#d2").textContent = 1 + Math.floor(Math.random() * 6);
    }, 80);
    await wait(900);
    clearInterval(flicker);
    const a = 1 + Math.floor(Math.random() * 6);
    const b = 1 + Math.floor(Math.random() * 6);
    $("#d1").textContent = a;
    $("#d2").textContent = b;
    $("#d1").classList.remove("rolling");
    $("#d2").classList.remove("rolling");
    const sum = a + b;
    let win = false, mult = 0;
    if (diceSide === "over") { win = sum > 7; mult = 2; }
    if (diceSide === "under") { win = sum < 7; mult = 2; }
    if (diceSide === "seven") { win = sum === 7; mult = 5; }
    const pay = win ? diceBet.value * mult : 0;
    addChips(pay);
    log("Dados", `${a}+${b}=${sum}`, pay - diceBet.value);
    $("#dice-msg").textContent = win ? `Salió ${sum} · cobras ${fmt(pay)}` : `Salió ${sum} · sin premio`;
    nextTurn("dice");
  };

  /* ========== HORSES ========== */
  const HORSES = [
    { id: 0, name: "Oro Negro", emoji: "🐎", color: "#8e6b1a" },
    { id: 1, name: "Luna Roja", emoji: "🏇", color: "#8e1e1e" },
    { id: 2, name: "Viento", emoji: "🐎", color: "#1f4e79" },
    { id: 3, name: "Duquesa", emoji: "🏇", color: "#6c3483" },
    { id: 4, name: "Relámpago", emoji: "🐎", color: "#117a65" },
    { id: 5, name: "Conde", emoji: "🏇", color: "#1c2833" }
  ];
  const horsesBet = { value: 50 };
  bindTiers("horses-tiers", "horses-tier-note", "horses-chips", "horses-bet", horsesBet, TABLE_TIERS, "clasica");
  let horsePick = 0, racing = false, horseOdds = [];

  function shuffleOdds() {
    const pool = [2.1, 2.8, 3.6, 4.8, 6.5, 9.0];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    horseOdds = pool;
  }
  function paintHorses() {
    const track = $("#track");
    track.innerHTML = HORSES.map(h =>
      `<div class="lane"><div class="horse" id="horse-${h.id}" style="background:${h.color}">${h.emoji} ${h.id + 1}</div><div class="finish"></div></div>`
    ).join("");
    $("#horse-list").innerHTML = HORSES.map(h =>
      `<button class="horse-btn ${h.id === horsePick ? "on" : ""}" data-h="${h.id}">
        ${h.id + 1}. ${h.name}<small>cuota ×${horseOdds[h.id].toFixed(1)}</small>
      </button>`
    ).join("");
  }
  shuffleOdds();
  paintHorses();
  $("#horse-list").onclick = (e) => {
    const b = e.target.closest("[data-h]");
    if (!b || racing) return;
    horsePick = +b.dataset.h;
    $$("#horse-list .horse-btn").forEach(x => x.classList.toggle("on", +x.dataset.h === horsePick));
  };

  $("#start-race").onclick = async () => {
    if (racing || !canBet(horsesBet.value)) return;
    racing = true;
    mp.horses.busy = true;
    $("#start-race").disabled = true;
    addChips(-horsesBet.value);
    const max = ($("#track").clientWidth || 640) - 92;
    const speeds = HORSES.map((h, i) => {
      const fav = 1 / horseOdds[i];
      return fav * 0.55 + Math.random() * 0.7;
    });
    const pos = HORSES.map(() => 0);
    $("#horses-msg").textContent = "¡Arrancan!";
    let winner = -1;
    await new Promise(resolve => {
      const tick = setInterval(() => {
        HORSES.forEach((h, i) => {
          pos[i] += speeds[i] * (8 + Math.random() * 10);
          if (pos[i] > max) pos[i] = max;
          $(`#horse-${h.id}`).style.transform = `translateX(${pos[i]}px)`;
        });
        const done = pos.map((p, i) => p >= max ? i : -1).filter(i => i >= 0);
        if (done.length) {
          winner = done.sort((a, b) => pos[b] - pos[a])[0];
          clearInterval(tick);
          resolve();
        }
      }, 50);
    });
    const name = HORSES[winner].name;
    const win = winner === horsePick;
    const pay = win ? Math.round(horsesBet.value * horseOdds[winner]) : 0;
    if (pay) addChips(pay);
    log("Caballos", `${name} gana`, pay - horsesBet.value);
    $("#horses-msg").textContent = win
      ? `Gana ${name} · cobras ${fmt(pay)}`
      : `Gana ${name} · tu boleto no entra`;
    await wait(900);
    shuffleOdds();
    paintHorses();
    racing = false;
    mp.horses.busy = false;
    $("#start-race").disabled = false;
    nextTurn("horses");
  };

  /* ========== POKER 2 CARTAS ========== */
  const pkBet = { value: 50 };
  bindTiers("pk-tiers", "pk-tier-note", "pk-chips", "pk-bet", pkBet, TABLE_TIERS, "clasica");
  const RANK_N = { A: 14, K: 13, Q: 12, J: 11, "10": 10, "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2 };
  const SUIT_N = { "♠": 4, "♥": 3, "♦": 2, "♣": 1 };

  function twoEval(hand) {
    const a = hand[0], b = hand[1];
    const n1 = RANK_N[a.r], n2 = RANK_N[b.r];
    const hi = Math.max(n1, n2), lo = Math.min(n1, n2);
    const pair = n1 === n2;
    const score = pair ? 200 + hi : hi * 20 + lo;
    const label = pair ? `Pareja de ${a.r}` : `${hi === n1 ? a.r : b.r} alta`;
    const suitTie = SUIT_N[a.s] + SUIT_N[b.s];
    return { pair, score, suitTie, label };
  }
  function paintPK(pHand, dHand, hideD) {
    $("#pk-player").innerHTML = pHand.map(c => cardHtml(c, false)).join("");
    $("#pk-dealer").innerHTML = dHand.map(c => cardHtml(c, hideD)).join("");
  }

  $("#pk-deal").onclick = async () => {
    if (!canBet(pkBet.value)) return;
    addChips(-pkBet.value);
    $("#pk-deal").disabled = true;
    const d = newDeck();
    const pHand = [d.pop(), d.pop()];
    const dHand = [d.pop(), d.pop()];
    paintPK(pHand, dHand, true);
    $("#pk-player-rank").textContent = twoEval(pHand).label;
    $("#pk-dealer-rank").textContent = "?";
    $("#pk-msg").textContent = "Revelando…";
    await wait(700);
    paintPK(pHand, dHand, false);
    const P = twoEval(pHand), D = twoEval(dHand);
    $("#pk-dealer-rank").textContent = D.label;
    let pay = 0, note;
    if (P.score > D.score || (P.score === D.score && P.suitTie > D.suitTie)) {
      pay = P.pair ? pkBet.value * 3 : pkBet.value * 2;
      note = P.pair ? "Pareja gana" : "Carta alta gana";
      addChips(pay);
    } else if (P.score === D.score && P.suitTie === D.suitTie) {
      pay = pkBet.value;
      note = "Empate";
      addChips(pay);
    } else {
      note = "Gana el crupier";
    }
    log("Póker 2", `${P.label} vs ${D.label}`, pay - pkBet.value);
    $("#pk-msg").textContent = pay
      ? `${note} · ${pay === pkBet.value ? "apuesta devuelta" : "cobras " + fmt(pay)}`
      : note;
    $("#pk-deal").disabled = false;
    nextTurn("poker");
  };

  /* ========== RASCA Y GANA ========== */
  const SCRATCH_TICKETS = [
    {
      id: "cobre", name: "Cobre", range: "5 fichas", cost: 5, tone: "copper",
      symbols: [
        { s: "🍒", prize: 4, p: 0.058 },
        { s: "🍋", prize: 6, p: 0.018 },
        { s: "🔔", prize: 10, p: 0.006 },
        { s: "⭐", prize: 18, p: 0.002 },
        { s: "7️⃣", prize: 40, p: 0.0005 },
        { s: "💎", prize: 100, p: 0.00012 }
      ]
    },
    {
      id: "bronce", name: "Bronce", range: "10 fichas", cost: 10, tone: "green",
      symbols: [
        { s: "🍒", prize: 8, p: 0.055 },
        { s: "🍋", prize: 12, p: 0.018 },
        { s: "🔔", prize: 20, p: 0.006 },
        { s: "⭐", prize: 35, p: 0.002 },
        { s: "7️⃣", prize: 80, p: 0.0006 },
        { s: "💎", prize: 200, p: 0.00015 }
      ]
    },
    {
      id: "plata", name: "Plata", range: "25 fichas", cost: 25, tone: "blue",
      symbols: [
        { s: "🍒", prize: 15, p: 0.050 },
        { s: "🍋", prize: 25, p: 0.016 },
        { s: "🔔", prize: 40, p: 0.005 },
        { s: "⭐", prize: 80, p: 0.0016 },
        { s: "7️⃣", prize: 200, p: 0.0005 },
        { s: "💎", prize: 600, p: 0.00012 }
      ]
    },
    {
      id: "rubi", name: "Rubí", range: "50 fichas", cost: 50, tone: "red",
      symbols: [
        { s: "🍒", prize: 28, p: 0.048 },
        { s: "🍋", prize: 50, p: 0.015 },
        { s: "🔔", prize: 80, p: 0.0045 },
        { s: "⭐", prize: 160, p: 0.0014 },
        { s: "7️⃣", prize: 400, p: 0.00045 },
        { s: "💎", prize: 1200, p: 0.0001 }
      ]
    },
    {
      id: "oro", name: "Oro", range: "75 fichas", cost: 75, tone: "gold",
      symbols: [
        { s: "🍒", prize: 40, p: 0.045 },
        { s: "🍋", prize: 75, p: 0.014 },
        { s: "🔔", prize: 120, p: 0.004 },
        { s: "⭐", prize: 250, p: 0.0012 },
        { s: "7️⃣", prize: 600, p: 0.0004 },
        { s: "💎", prize: 2000, p: 0.00008 }
      ]
    },
    {
      id: "diamante", name: "Diamante", range: "150 fichas", cost: 150, tone: "purple",
      symbols: [
        { s: "🍒", prize: 80, p: 0.040 },
        { s: "🍋", prize: 150, p: 0.012 },
        { s: "🔔", prize: 250, p: 0.0035 },
        { s: "⭐", prize: 500, p: 0.001 },
        { s: "7️⃣", prize: 1200, p: 0.0003 },
        { s: "💎", prize: 4000, p: 0.00006 }
      ]
    }
  ];
  let scratchTicket = SCRATCH_TICKETS[0];
  let scratchLive = false, scratchGrid = [], scratchOpen = [], scratchDone = false;

  function countMax(arr) {
    const map = {};
    arr.forEach(x => { map[x] = (map[x] || 0) + 1; });
    return Math.max(0, ...Object.values(map));
  }
  function fillLose(syms) {
    const pool = syms.map(x => x.s);
    let cells;
    do {
      cells = Array.from({ length: 9 }, () => pool[Math.floor(Math.random() * pool.length)]);
    } while (countMax(cells) >= 3);
    return cells;
  }
  function makeScratch() {
    const syms = scratchTicket.symbols;
    let r = Math.random();
    for (const row of syms) {
      if (r < row.p) {
        const cells = fillLose(syms);
        const spots = [0,1,2,3,4,5,6,7,8];
        for (let i = 0; i < 3; i++) {
          const j = Math.floor(Math.random() * spots.length);
          cells[spots.splice(j, 1)[0]] = row.s;
        }
        return { cells, win: row };
      }
      r -= row.p;
    }
    return { cells: fillLose(syms), win: null };
  }
  function paintScratchPay() {
    $("#scratch-pay").innerHTML = scratchTicket.symbols
      .map(x => `<span>${x.s} ×3 = ${x.prize}</span>`).join("");
    $("#scratch-bet").textContent = scratchTicket.cost;
    $("#scratch-tier-note").textContent = `Boleto ${scratchTicket.name} · ${scratchTicket.cost} fichas`;
    $("#scratch-grid").className = "scratch-card theme-" + scratchTicket.tone;
    const box = $("#scratch-tiers");
    box.innerHTML = SCRATCH_TICKETS.map(t => {
      const tone = t.tone === "gold" ? "" : "tone-" + t.tone;
      return `<button class="tier ${tone} ${t.id === scratchTicket.id ? "on" : ""}" data-ticket="${t.id}">
        <b>${t.name}</b><span>${t.range}</span>
      </button>`;
    }).join("");
  }
  function paintScratch(locked) {
    const box = $("#scratch-grid");
    box.className = "scratch-card theme-" + scratchTicket.tone;
    box.innerHTML = scratchGrid.map((s, i) => {
      const open = scratchOpen[i];
      return `<button class="foil ${locked ? "locked" : ""} ${open ? "open" : ""}" data-i="${i}">${open ? s : ""}</button>`;
    }).join("");
  }
  scratchGrid = fillLose(scratchTicket.symbols);
  scratchOpen = Array(9).fill(false);
  paintScratchPay();
  paintScratch(true);

  $("#scratch-tiers").onclick = (e) => {
    const btn = e.target.closest("[data-ticket]");
    if (!btn || scratchLive) {
      if (scratchLive) toast("Termina este boleto primero");
      return;
    }
    const next = SCRATCH_TICKETS.find(t => t.id === btn.dataset.ticket);
    if (!next) return;
    scratchTicket = next;
    scratchGrid = fillLose(next.symbols);
    scratchOpen = Array(9).fill(false);
    paintScratchPay();
    paintScratch(true);
  };

  function settleScratch() {
    if (scratchDone) return;
    scratchDone = true;
    const card = scratchGrid._card;
    const cost = scratchTicket.cost;
    if (card.win) {
      const pay = card.win.prize;
      addChips(pay);
      log("Rasca " + scratchTicket.name, `3× ${card.win.s}`, pay - cost);
      $("#scratch-msg").textContent = `${scratchTicket.name}: ${card.win.s} · cobras ${fmt(pay)}`;
      scratchGrid.forEach((s, i) => {
        if (s === card.win.s) $$("#scratch-grid .foil")[i].classList.add("hit");
      });
    } else {
      log("Rasca " + scratchTicket.name, "sin premio", -cost);
      $("#scratch-msg").textContent = `${scratchTicket.name}: sin premio`;
    }
    $("#scratch-buy").disabled = false;
    $("#scratch-all").disabled = true;
    scratchLive = false;
    mp.scratch.busy = false;
    nextTurn("scratch");
  }
  function reveal(i) {
    if (!scratchLive || scratchOpen[i]) return;
    scratchOpen[i] = true;
    paintScratch(false);
    if (scratchOpen.every(Boolean)) settleScratch();
  }
  $("#scratch-grid").onclick = (e) => {
    const b = e.target.closest("[data-i]");
    if (b) reveal(+b.dataset.i);
  };
  $("#scratch-buy").onclick = () => {
    if (scratchLive || !canBet(scratchTicket.cost)) return;
    addChips(-scratchTicket.cost);
    const card = makeScratch();
    scratchGrid = card.cells;
    scratchGrid._card = card;
    scratchOpen = Array(9).fill(false);
    scratchDone = false;
    scratchLive = true;
    mp.scratch.busy = true;
    paintScratch(false);
    $("#scratch-msg").textContent = `Rasca ${scratchTicket.name}`;
    $("#scratch-buy").disabled = true;
    $("#scratch-all").disabled = false;
  };
  $("#scratch-all").onclick = () => {
    if (!scratchLive) return;
    scratchOpen = Array(9).fill(true);
    paintScratch(false);
    settleScratch();
  };


  /* ========== SOUND ========== */
  let soundOn = localStorage.getItem("aurum-sound") !== "0";
  let audioCtx;
  function sfx(kind) {
    if (!soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      if (kind === "chip") { o.frequency.value = 420; g.gain.setValueAtTime(0.05, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.12); o.start(now); o.stop(now + 0.12); }
      else if (kind === "spin") { o.type = "triangle"; o.frequency.setValueAtTime(180, now); o.frequency.exponentialRampToValueAtTime(520, now + 0.35); g.gain.setValueAtTime(0.04, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.4); o.start(now); o.stop(now + 0.4); }
      else if (kind === "win") {
        [523, 659, 784].forEach((f, i) => {
          const o2 = audioCtx.createOscillator(); const g2 = audioCtx.createGain();
          o2.connect(g2); g2.connect(audioCtx.destination);
          o2.frequency.value = f; g2.gain.setValueAtTime(0.05, now + i * 0.09);
          g2.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.2);
          o2.start(now + i * 0.09); o2.stop(now + i * 0.09 + 0.2);
        });
      } else {
        o.type = "sawtooth"; o.frequency.value = 140; g.gain.setValueAtTime(0.04, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.22); o.start(now); o.stop(now + 0.22);
      }
    } catch {}
  }
  function paintSound() {
    const b = $("#sound-btn");
    if (b) b.textContent = soundOn ? "🔊" : "🔇";
  }
  paintSound();
  if ($("#sound-btn")) $("#sound-btn").onclick = () => {
    soundOn = !soundOn;
    localStorage.setItem("aurum-sound", soundOn ? "1" : "0");
    paintSound();
    if (soundOn) sfx("chip");
  };

  /* ========== RULES ========== */
  const RULES = {
    slots: ["Tragaperras", "Tres rodillos. Trío paga según símbolo (×4 a ×20). Pareja ×2. Un 8 % de cada giro alimenta el bote. El bote cae a veces (poco)."],
    roulette: ["Ruleta europea", "37 números, un solo cero. Pleno ×36. Docenas ×3. Rojo/negro, par/impar y 1-18/19-36 ×2. Las fichas se ven sobre el tapete."],
    blackjack: ["Blackjack", "El crupier se planta en 17. Natural paga 3:2. Puedes doblar con dos cartas. Si las dos primeras coinciden en valor, Separar abre dos manos."],
    dice: ["Dados", "Dos dados. Más de 7 o menos de 7 pagan 1:1. Exacto 7 paga 4:1."],
    horses: ["Caballos", "Seis corredores. Si el tuyo gana cobras apuesta × cuota. Las cuotas se barajan cada carrera."],
    poker: ["Póker de 2 cartas", "Dos cartas contra el crupier. Pareja gana a carta alta. Pareja ×3, carta alta ×2, empate se devuelve."],
    scratch: ["Rasca y gana", "Compras un boleto y descubres 9 casillas. Solo hay premio con 3 símbolos iguales. Casi todos salen en blanco."],
    keno: ["Keno", "Elige 6 números del 1 al 20. Salen 6 bolas. 3 aciertos ×2, 4 ×6, 5 ×18, 6 ×120."]
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-rules]");
    if (!b) return;
    const r = RULES[b.dataset.rules];
    if (!r) return;
    $("#rules-title").textContent = r[0];
    $("#rules-body").textContent = r[1];
    $("#rules-modal").classList.remove("hidden");
  });
  if ($("#rules-close")) $("#rules-close").onclick = () => $("#rules-modal").classList.add("hidden");

  /* ========== DAILY + RANK ========== */
  function bumpDailyBJ() {
    if (!state.daily || state.daily.day !== todayStr()) state.daily = { day: todayStr(), bj: 0, done: false };
    if (state.daily.done) return;
    state.daily.bj += 1;
    if (state.daily.bj >= 3) {
      state.daily.done = true;
      addChips(200);
      toast("Reto diario: 3 blackjacks. +200 fichas");
    }
    save();
    paintDaily();
  }
  function paintDaily() {
    const d = state.daily || { bj: 0, done: false };
    const txt = d.done ? "Reto de hoy completado (+200)" : `Reto de hoy: gana ${d.bj}/3 manos de blackjack`;
    if ($("#daily-box")) $("#daily-box").textContent = txt;
    if ($("#challenge-strip")) $("#challenge-strip").textContent = txt;
  }
  const RANK_KEY = "aurum-rank-v1";
  function pushRank() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(RANK_KEY)) || []; } catch {}
    const name = state.name || "Invitado";
    list = list.filter(x => x.name !== name);
    list.push({ name, chips: state.chips, t: Date.now() });
    list.sort((a,b) => b.chips - a.chips);
    localStorage.setItem(RANK_KEY, JSON.stringify(list.slice(0, 40)));
  }
  const _save = save;
  // wrap save via reassignment after original exists — call pushRank in renderWallet instead

  function startOfDay() {
    const d = new Date(); d.setHours(0,0,0,0); return d.getTime();
  }
  function startOfWeek() {
    const d = new Date();
    const day = (d.getDay() + 6) % 7;
    d.setHours(0,0,0,0); d.setDate(d.getDate() - day);
    return d.getTime();
  }
  let rankMode = "today";
  function paintRank() {
    const box = $("#rank-list");
    if (!box) return;
    let list = [];
    try { list = JSON.parse(localStorage.getItem(RANK_KEY)) || []; } catch {}
    const cut = rankMode === "week" ? startOfWeek() : startOfDay();
    list = list.filter(x => x.t >= cut).sort((a,b) => b.chips - a.chips).slice(0, 10);
    box.innerHTML = list.map((x,i) => `<li><span>${i+1}. ${x.name}</span><b>${fmt(x.chips)}</b></li>`).join("") || "<li>Nadie ha guardado fichas en este periodo</li>";
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-rank]");
    if (!b) return;
    rankMode = b.dataset.rank;
    $$("[data-rank]").forEach(x => x.classList.toggle("on", x === b));
    paintRank();
  });

  const _rw = renderWallet;
  renderWallet = function() {
    _rw();
    paintJP();
    paintDaily();
    pushRank();
    paintRank();
    if ($("#p2-name")) $("#p2-name").value = state.p2.name || "";
    paintAvatars();
  };

  const AVATARS = ["🦊","🦁","🐺","🐯","🐻","🦉"];
  function paintAvatars() {
    const box = $("#p2-avatars");
    if (!box) return;
    box.innerHTML = AVATARS.map(a => `<button class="avatar-pick ${a === state.p2.avatar ? "on" : ""}" data-av="${a}">${a}</button>`).join("");
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-av]");
    if (!b) return;
    state.p2.avatar = b.dataset.av;
    save();
    renderMP();
    paintAvatars();
  });

  /* ========== KENO ========== */
  const kenoBet = { value: 25 };
  if ($("#keno-tiers")) bindTiers("keno-tiers", "keno-tier-note", "keno-chips", "keno-bet", kenoBet, TABLE_TIERS, "clasica");
  let kenoPick = new Set();
  function paintKeno(drawn, hits) {
    const box = $("#keno-grid");
    if (!box) return;
    box.innerHTML = Array.from({length:20}, (_,i) => {
      const n = i+1;
      const on = kenoPick.has(n);
      const isD = drawn && drawn.includes(n);
      const isH = hits && hits.includes(n);
      return `<button class="keno-n ${on?"on":""} ${isD?"drawn":""} ${isH?"hit":""}" data-keno="${n}">${n}</button>`;
    }).join("");
  }
  paintKeno();
  if ($("#keno-grid")) $("#keno-grid").onclick = (e) => {
    const b = e.target.closest("[data-keno]");
    if (!b) return;
    const n = +b.dataset.keno;
    if (kenoPick.has(n)) kenoPick.delete(n);
    else if (kenoPick.size < 6) kenoPick.add(n);
    paintKeno();
    $("#keno-msg").textContent = kenoPick.size === 6 ? "Listo para sortear" : `Elegidos ${kenoPick.size}/6`;
  };
  if ($("#keno-draw")) $("#keno-draw").onclick = () => {
    if (kenoPick.size !== 6) { toast("Marca 6 números"); return; }
    if (!canBet(kenoBet.value)) return;
    addChips(-kenoBet.value);
    sfx("spin");
    const pool = Array.from({length:20}, (_,i)=>i+1);
    const drawn = [];
    while (drawn.length < 6) {
      const j = Math.floor(Math.random()*pool.length);
      drawn.push(pool.splice(j,1)[0]);
    }
    const hits = drawn.filter(n => kenoPick.has(n));
    const table = {0:0,1:0,2:0,3:2,4:6,5:18,6:120};
    const pay = kenoBet.value * (table[hits.length] || 0);
    if (pay) { addChips(pay); sfx("win"); } else sfx("lose");
    log("Keno", `${hits.length} aciertos`, pay - kenoBet.value);
    paintKeno(drawn, hits);
    $("#keno-msg").textContent = pay ? `${hits.length} aciertos · cobras ${fmt(pay)}` : `${hits.length} aciertos · sin premio`;
    nextTurn("keno");
  };

  /* ========== PEER SALA ========== */
  let net = { peer: null, conn: null, role: null, code: "" };
  function salaMsg(s) { if ($("#sala-msg")) $("#sala-msg").textContent = s; }
  function netSend(obj) {
    try { if (net.conn && net.conn.open) net.conn.send(obj); } catch {}
  }
  function onNet(data) {
    if (!data || typeof data !== "object") return;
    if (data.type === "hello") {
      salaMsg("Conectados: " + (data.name || "invitado"));
      toast("Sala lista con " + (data.name || "invitado"));
      netSend({ type: "hello-ack", name: state.name, chips: state.chips });
    }
    if (data.type === "hello-ack") {
      salaMsg("Conectados: " + (data.name || "anfitrión"));
    }
    if (data.type === "note") toast(data.text || "Mesa");
  }
  function bindConn(conn) {
    net.conn = conn;
    conn.on("open", () => {
      salaMsg("Enlace abierto");
      netSend({ type: "hello", name: state.name, chips: state.chips });
    });
    conn.on("data", onNet);
    conn.on("close", () => salaMsg("El otro jugador se ha desconectado"));
  }
  function loadPeer(cb) {
    if (window.Peer) return cb();
    salaMsg("No carga PeerJS. Revisa la red.");
  }
  if ($("#sala-host")) $("#sala-host").onclick = () => {
    loadPeer(() => {
      const code = Math.random().toString(36).slice(2, 6).toUpperCase();
      net.code = code; net.role = "host";
      net.peer = new Peer("aurum-" + code);
      net.peer.on("open", id => { salaMsg("Código " + code + " · espera al otro jugador"); if ($("#sala-code")) $("#sala-code").value = code; });
      net.peer.on("connection", bindConn);
      net.peer.on("error", err => salaMsg("Error de sala: " + err.type));
    });
  };
  if ($("#sala-join")) $("#sala-join").onclick = () => {
    const code = ($("#sala-code").value || "").trim().toUpperCase();
    if (code.length < 4) { toast("Escribe el código"); return; }
    loadPeer(() => {
      net.role = "guest"; net.code = code;
      net.peer = new Peer();
      net.peer.on("open", () => {
        const conn = net.peer.connect("aurum-" + code);
        bindConn(conn);
        salaMsg("Conectando a " + code + "…");
      });
      net.peer.on("error", err => salaMsg("No hay sala con ese código"));
    });
  };


  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  renderWallet();
  renderMP();
})();
