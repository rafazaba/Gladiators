/* =========================================================================
   GLADIUS — script.js
   Protótipo funcional (sem backend). Toda a persistência hoje é local
   (localStorage) para simular o que futuramente será Supabase.
   Pontos marcados com "TODO SUPABASE" indicam onde a integração real
   deve entrar: autenticação de carteira, tabelas de gladiadores/itens,
   matchmaking de arena em tempo real e RNG de catacumbas do lado do servidor
   (importante para evitar manipulação client-side em um jogo com dinheiro real).
   ========================================================================= */

(() => {
  "use strict";

  /* ---------------------------------------------------------------------
     CONFIG
  --------------------------------------------------------------------- */
  const CONFIG = {
    GLADIATOR_COST_USDT: 2,
    CAVE_COST_USDT: 0.5,
    CAVE_FREE_PER_DAY: 1,
    STAT_POINTS_TOTAL: 20,
    STAT_MIN: 1,
    STAT_MAX: 10,
    STAT_KEYS: ["forca", "agilidade", "resistencia", "altura", "peso"],
    STAT_LABELS: {
      forca: "Força",
      agilidade: "Agilidade",
      resistencia: "Resistência",
      altura: "Altura",
      peso: "Peso",
    },
    ARENA_MAX_PLAYERS: 16,
    ARENA_COUNT: 3,
    STARTING_USDT_ON_CONNECT: 100, // mock faucet só para prototipagem
  };

  const STORAGE_KEY = "gladius_state_v1";

  /* ---------------------------------------------------------------------
     STATE
  --------------------------------------------------------------------- */
  let state = null;

  function defaultState() {
    return {
      wallet: { connected: false, address: null },
      usdt: 0,
      coins: 0,
      lastFreeCaveDate: null,
      gladiators: [],
      arenas: seedArenas(),
      selection: { arenaGladiatorId: null, caveGladiatorId: null },
      caveRun: null, // { gladiatorId, hp, hpMax, lootCoins, lootItems, log }
    };
  }

  function loadState() {
    // TODO SUPABASE: substituir por fetch da sessão/gladiadores do usuário autenticado.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      state = raw ? JSON.parse(raw) : defaultState();
    } catch (e) {
      state = defaultState();
    }
    if (!state.arenas || !state.arenas.length) state.arenas = seedArenas();
  }

  function saveState() {
    // TODO SUPABASE: substituir por upsert nas tabelas correspondentes
    // (players, gladiators, arena_entries, cave_runs, inventory...).
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  /* ---------------------------------------------------------------------
     UTIL
  --------------------------------------------------------------------- */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const rand = (min, max) => Math.random() * (max - min) + min;
  const randInt = (min, max) => Math.floor(rand(min, max + 1));
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const fmtUsdt = (v) => v.toFixed(2);

  const NPC_NAMES = [
    "Brutus", "Kaeso", "Draven", "Orik", "Talon", "Ferrus", "Magnus", "Silas",
    "Rurik", "Cassio", "Bael", "Torvin", "Ganix", "Halric", "Vorn", "Deccan",
  ];
  const MONSTER_NAMES = [
    "Rato-das-Sombras Gigante", "Esqueleto Guerreiro", "Aranha Cavernosa",
    "Golem de Pedra Rachada", "Ceifador das Profundezas", "Lobo Cinzento Faminto",
  ];

  function toast(msg, kind = "") {
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.textContent = msg;
    $("#toast-container").appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  /* ---------------------------------------------------------------------
     DERIVED STATS
  --------------------------------------------------------------------- */
  function derive(stats) {
    const hpMax = Math.round(50 + stats.resistencia * 8 + stats.peso * 2);
    const initiative = Math.round(stats.agilidade * 3 + stats.altura * 1 - stats.peso * 0.5);
    const attackPower = Math.round(stats.forca * 3 + stats.altura * 0.5);
    const defense = Math.round(stats.resistencia * 1.5 + stats.peso * 0.5);
    return { hpMax, initiative, attackPower, defense };
  }

  /* ---------------------------------------------------------------------
     NAVIGATION
  --------------------------------------------------------------------- */
  function goto(screen) {
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.screen === screen));
    $$(".screen").forEach((s) => s.classList.toggle("active", s.dataset.screen === screen));
    if (screen === "forge") renderForge();
    if (screen === "arenas") renderArenas();
    if (screen === "cave") renderCave();
    if (screen === "ludus") renderRoster();
  }

  /* ---------------------------------------------------------------------
     WALLET (stub)
  --------------------------------------------------------------------- */
  function connectWallet() {
    // TODO SUPABASE / WEB3: trocar por conexão real (ex: wagmi/viem) +
    // autenticação Supabase via assinatura de mensagem (SIWE) e leitura
    // de saldo USDT on-chain, em vez do saldo mock local.
    if (state.wallet.connected) {
      toast("Carteira já conectada.");
      return;
    }
    state.wallet.connected = true;
    state.wallet.address = "0x" + uid() + uid().slice(0, 6);
    state.usdt += CONFIG.STARTING_USDT_ON_CONNECT;
    saveState();
    renderWallet();
    toast("Carteira conectada (mock). +100 USDT de teste.", "good");
  }

  function renderWallet() {
    $("#usdt-balance").textContent = fmtUsdt(state.usdt);
    $("#coin-balance").textContent = state.coins;
    const btn = $("#btn-connect-wallet");
    btn.textContent = state.wallet.connected
      ? `${state.wallet.address.slice(0, 6)}…${state.wallet.address.slice(-4)}`
      : "Conectar Carteira";
  }

  function requireWallet() {
    if (!state.wallet.connected) {
      toast("Conecte sua carteira primeiro.", "bad");
      return false;
    }
    return true;
  }

  /* ---------------------------------------------------------------------
     LUDUS (roster)
  --------------------------------------------------------------------- */
  function renderRoster() {
    const grid = $("#roster-grid");
    grid.innerHTML = "";
    state.gladiators.forEach((g) => {
      const d = derive(g.stats);
      const card = document.createElement("div");
      card.className = "g-card" + (g.alive ? "" : " dead");
      card.innerHTML = `
        <h3>${g.name}</h3>
        <div class="g-record">${g.wins}V - ${g.losses}D &middot; Nv. Ludus</div>
        <div class="g-hp">
          <div class="hp-bar"><div class="hp-fill" style="width:${(g.hp / d.hpMax) * 100}%"></div></div>
          <span class="hp-text">${g.hp}/${d.hpMax} HP</span>
        </div>
        <div class="g-stats">
          ${CONFIG.STAT_KEYS.map(
            (k) => `<span>${CONFIG.STAT_LABELS[k]}<strong>${g.stats[k]}</strong></span>`
          ).join("")}
        </div>
      `;
      grid.appendChild(card);
    });
  }

  /* ---------------------------------------------------------------------
     FORGE (criação de gladiador)
  --------------------------------------------------------------------- */
  let forgeStats = null;

  function renderForge() {
    forgeStats = {};
    CONFIG.STAT_KEYS.forEach((k) => (forgeStats[k] = CONFIG.STAT_MIN));
    $("#input-name").value = "";
    $("#points-total").textContent = CONFIG.STAT_POINTS_TOTAL;
    buildStatRows();
    updateForgePreview();
  }

  function pointsUsed() {
    return CONFIG.STAT_KEYS.reduce((sum, k) => sum + (forgeStats[k] - CONFIG.STAT_MIN), 0);
  }

  function buildStatRows() {
    const list = $("#stat-list");
    list.innerHTML = "";
    CONFIG.STAT_KEYS.forEach((key) => {
      const row = document.createElement("div");
      row.className = "stat-row";
      row.innerHTML = `
        <div class="stat-row-head">
          <span class="stat-label">${CONFIG.STAT_LABELS[key]}</span>
          <span class="stat-value" id="stat-value-${key}">${forgeStats[key]}</span>
        </div>
        <input type="range" min="${CONFIG.STAT_MIN}" max="${CONFIG.STAT_MAX}"
               value="${forgeStats[key]}" data-stat="${key}">
      `;
      list.appendChild(row);
    });
    $$('input[type="range"]', list).forEach((input) => {
      input.addEventListener("input", onStatSlide);
    });
  }

  function onStatSlide(e) {
    const key = e.target.dataset.stat;
    const desired = parseInt(e.target.value, 10);
    const currentUsed = pointsUsed();
    const deltaIfApplied = desired - forgeStats[key];
    if (currentUsed + deltaIfApplied > CONFIG.STAT_POINTS_TOTAL) {
      // não deixa gastar além do orçamento — mantém justiça entre todos os gladiadores
      const maxAllowed = forgeStats[key] + (CONFIG.STAT_POINTS_TOTAL - currentUsed);
      forgeStats[key] = clamp(maxAllowed, CONFIG.STAT_MIN, CONFIG.STAT_MAX);
      e.target.value = forgeStats[key];
    } else {
      forgeStats[key] = desired;
    }
    $(`#stat-value-${key}`).textContent = forgeStats[key];
    updateForgePreview();
  }

  function updateForgePreview() {
    const used = pointsUsed();
    const remaining = CONFIG.STAT_POINTS_TOTAL - used;
    $("#points-remaining").textContent = remaining;

    const name = $("#input-name").value.trim();
    $("#preview-name").textContent = name || "Sem nome";

    const statsBox = $("#preview-stats");
    statsBox.innerHTML = CONFIG.STAT_KEYS.map(
      (k) => `<span>${CONFIG.STAT_LABELS[k]}<strong>${forgeStats[k]}</strong></span>`
    ).join("");

    const d = derive(forgeStats);
    $("#preview-hp").textContent = d.hpMax;
    $("#preview-init").textContent = d.initiative;

    const canCreate = name.length >= 2 && remaining === 0 && state.usdt >= CONFIG.GLADIATOR_COST_USDT;
    $("#btn-create-gladiator").disabled = !canCreate;
  }

  function createGladiator() {
    if (!requireWallet()) return;
    const name = $("#input-name").value.trim();
    if (name.length < 2) return toast("Escolha um nome com pelo menos 2 letras.", "bad");
    if (pointsUsed() !== CONFIG.STAT_POINTS_TOTAL)
      return toast("Distribua todos os pontos de atributo antes de selar o contrato.", "bad");
    if (state.usdt < CONFIG.GLADIATOR_COST_USDT)
      return toast("Saldo insuficiente. Necessário 2 USDT.", "bad");

    // TODO SUPABASE: inserir na tabela `gladiators` vinculado ao user_id
    // e debitar via transação assinada, em vez de subtrair localmente.
    const stats = { ...forgeStats };
    const d = derive(stats);
    const gladiator = {
      id: uid(),
      name,
      stats,
      hp: d.hpMax,
      wins: 0,
      losses: 0,
      alive: true,
      equipment: { arma: null, armadura: null, amuleto: null },
    };
    state.gladiators.push(gladiator);
    state.usdt -= CONFIG.GLADIATOR_COST_USDT;
    saveState();
    renderWallet();
    toast(`${name} foi forjado! Bem-vindo ao ludus.`, "good");
    goto("ludus");
  }

  /* ---------------------------------------------------------------------
     ARENAS (torneios)
  --------------------------------------------------------------------- */
  function seedArenas() {
    const arenas = [];
    for (let i = 0; i < CONFIG.ARENA_COUNT; i++) {
      arenas.push({
        id: uid(),
        name: `Arena ${["do Norte", "da Fornalha", "das Cinzas"][i] || i + 1}`,
        entryFee: [1, 2, 5][i] || 1,
        maxPlayers: CONFIG.ARENA_MAX_PLAYERS,
        players: randInt(3, 11), // ocupação simulada de NPCs até haver matchmaking real
        joinedGladiatorId: null,
      });
    }
    return arenas;
  }

  function populateGladiatorSelect(selectEl, { onlyAlive = true } = {}) {
    selectEl.innerHTML = "";
    const list = state.gladiators.filter((g) => (onlyAlive ? g.alive : true));
    if (!list.length) {
      selectEl.innerHTML = `<option value="">Nenhum gladiador disponível</option>`;
      return null;
    }
    list.forEach((g) => {
      const opt = document.createElement("option");
      opt.value = g.id;
      opt.textContent = `${g.name} (${g.hp} HP)`;
      selectEl.appendChild(opt);
    });
    return list[0].id;
  }

  function renderArenas() {
    const sel = $("#select-arena-gladiator");
    const firstId = populateGladiatorSelect(sel);
    if (firstId && !state.selection.arenaGladiatorId) state.selection.arenaGladiatorId = firstId;
    sel.value = state.selection.arenaGladiatorId || "";
    sel.onchange = () => (state.selection.arenaGladiatorId = sel.value);

    const grid = $("#arena-grid");
    grid.innerHTML = "";
    state.arenas.forEach((arena) => {
      const pct = Math.round((arena.players / arena.maxPlayers) * 100);
      const card = document.createElement("div");
      card.className = "arena-card";
      card.innerHTML = `
        <h3>${arena.name}</h3>
        <div class="arena-meta">Taxa de inscrição: ${arena.entryFee} USDT &middot; torneio diário</div>
        <div class="arena-fill"><div class="arena-fill-bar" style="width:${pct}%"></div></div>
        <div class="arena-count">${arena.players}/${arena.maxPlayers} lutadores inscritos</div>
        <button class="btn btn-primary" data-arena="${arena.id}">Entrar &middot; ${arena.entryFee} USDT</button>
      `;
      grid.appendChild(card);
    });

    $$("button[data-arena]", grid).forEach((btn) => {
      btn.addEventListener("click", () => joinArena(btn.dataset.arena));
    });
  }

  function joinArena(arenaId) {
    if (!requireWallet()) return;
    const arena = state.arenas.find((a) => a.id === arenaId);
    const gladiatorId = state.selection.arenaGladiatorId;
    const gladiator = state.gladiators.find((g) => g.id === gladiatorId);
    if (!gladiator) return toast("Selecione um gladiador vivo para inscrever.", "bad");
    if (arena.players >= arena.maxPlayers) return toast("Esta arena já está lotada.", "bad");
    if (state.usdt < arena.entryFee) return toast("Saldo insuficiente para a taxa de inscrição.", "bad");
    if (gladiator.hp <= 0) return toast(`${gladiator.name} está debilitado demais para lutar.`, "bad");

    // TODO SUPABASE: registrar inscrição em `arena_entries`, debitar a taxa
    // via transação on-chain e aguardar o matchmaking real com outros
    // jogadores conectados. O bracket abaixo é simulado localmente contra
    // NPCs apenas para permitir testar o loop de combate agora.
    state.usdt -= arena.entryFee;
    arena.players = Math.min(arena.maxPlayers, arena.players + 1);
    saveState();
    renderWallet();
    renderArenas();
    toast(`${gladiator.name} entrou em ${arena.name}. Preparando o bracket...`, "good");

    startTournamentBracket(gladiator, arena);
  }

  function startTournamentBracket(gladiator, arena) {
    const rounds = ["Oitavas", "Quartas", "Semifinal", "Final"];
    let roundIndex = 0;

    function nextFight() {
      if (roundIndex >= rounds.length || gladiator.hp <= 0) {
        finishTournament(gladiator, arena, roundIndex);
        return;
      }
      const opponent = makeNpcOpponent(gladiator, roundIndex);
      openCombat({
        title: `${arena.name} — ${rounds[roundIndex]}`,
        fighterA: gladiator,
        fighterB: opponent,
        onEnd: (result) => {
          if (result === "win") {
            gladiator.wins++;
            roundIndex++;
            toast(`Vitória na ${rounds[roundIndex - 1]}!`, "good");
            nextFight();
          } else {
            gladiator.losses++;
            toast(`${gladiator.name} foi eliminado na ${rounds[roundIndex]}.`, "bad");
            finishTournament(gladiator, arena, roundIndex);
          }
        },
      });
    }
    nextFight();
  }

  function makeNpcOpponent(playerGladiator, roundIndex) {
    // Oponentes ficam gradualmente mais fortes a cada rodada.
    const scale = 1 + roundIndex * 0.12;
    const stats = {};
    CONFIG.STAT_KEYS.forEach((k) => {
      const base = playerGladiator.stats[k] * rand(0.75, 1.15) * scale;
      stats[k] = clamp(Math.round(base), 1, 14);
    });
    const d = derive(stats);
    return {
      id: "npc-" + uid(),
      name: NPC_NAMES[randInt(0, NPC_NAMES.length - 1)],
      stats,
      hp: d.hpMax,
      isNpc: true,
    };
  }

  function finishTournament(gladiator, arena, roundsWon) {
    saveState();
    renderRoster();
    if (roundsWon >= 4) {
      const prize = arena.entryFee * 6;
      state.usdt += prize;
      saveState();
      renderWallet();
      toast(`${gladiator.name} venceu o torneio! Prêmio: ${prize} USDT.`, "good");
    } else if (roundsWon > 0) {
      toast(`Torneio encerrado para ${gladiator.name} após ${roundsWon} vitória(s).`, "");
    }
  }

  /* ---------------------------------------------------------------------
     CATACUMBAS (cave / PvE)
  --------------------------------------------------------------------- */
  function canUseFreeCaveToday() {
    return state.lastFreeCaveDate !== todayStr();
  }

  function renderCave() {
    const sel = $("#select-cave-gladiator");
    const firstId = populateGladiatorSelect(sel);
    if (firstId && !state.selection.caveGladiatorId) state.selection.caveGladiatorId = firstId;
    sel.value = state.selection.caveGladiatorId || "";
    sel.onchange = () => (state.selection.caveGladiatorId = sel.value);

    $("#cave-fee-note").textContent = canUseFreeCaveToday()
      ? "Entrada gratuita disponível hoje."
      : `Entrada gratuita já usada hoje. Custo: ${CONFIG.CAVE_COST_USDT} USDT.`;

    const inRun = !!state.caveRun;
    $("#cave-entry").classList.toggle("hidden", inRun);
    $("#cave-run").classList.toggle("hidden", !inRun);
    if (inRun) renderCaveRun();
  }

  function enterCave() {
    if (!requireWallet()) return;
    const gladiatorId = state.selection.caveGladiatorId;
    const gladiator = state.gladiators.find((g) => g.id === gladiatorId);
    if (!gladiator) return toast("Selecione um gladiador vivo para descer.", "bad");
    if (gladiator.hp <= 0) return toast(`${gladiator.name} está debilitado demais.`, "bad");

    const free = canUseFreeCaveToday();
    if (!free && state.usdt < CONFIG.CAVE_COST_USDT)
      return toast("Saldo insuficiente para a entrada nas catacumbas.", "bad");

    // TODO SUPABASE: a entrada, o RNG dos encontros e o resultado final devem
    // ser validados/gerados no servidor para impedir manipulação do cliente
    // (já que há recompensas em moedas/itens em jogo).
    if (free) {
      state.lastFreeCaveDate = todayStr();
    } else {
      state.usdt -= CONFIG.CAVE_COST_USDT;
    }

    const d = derive(gladiator.stats);
    state.caveRun = {
      gladiatorId,
      hp: gladiator.hp,
      hpMax: d.hpMax,
      lootCoins: 0,
      lootItems: [],
      log: [],
    };
    saveState();
    renderWallet();
    caveLog("Você desce as escadas úmidas em direção à escuridão...", "neutral");
    renderCave();
  }

  function caveLog(msg, kind = "neutral") {
    state.caveRun.log.push({ msg, kind });
    saveState();
  }

  function renderCaveRun() {
    const run = state.caveRun;
    const gladiator = state.gladiators.find((g) => g.id === run.gladiatorId);
    $("#cave-gladiator-name").textContent = gladiator.name;
    $("#cave-hp-value").textContent = run.hp;
    $("#cave-hp-max").textContent = run.hpMax;
    $("#cave-hp-fill").style.width = `${(run.hp / run.hpMax) * 100}%`;
    $("#cave-loot-count").textContent = `${run.lootCoins} ◈`;

    const logBox = $("#cave-log");
    logBox.innerHTML = run.log
      .map((l) => `<p class="log-${l.kind}">${l.msg}</p>`)
      .join("");
    logBox.scrollTop = logBox.scrollHeight;

    const actions = $("#cave-actions");
    actions.innerHTML = `
      <button class="btn btn-primary" id="btn-cave-explore">Explorar mais fundo</button>
      <button class="btn" id="btn-cave-leave">Sair com o butim</button>
    `;
    $("#btn-cave-explore").onclick = exploreCaveTurn;
    $("#btn-cave-leave").onclick = leaveCave;
  }

  function exploreCaveTurn() {
    const run = state.caveRun;
    const roll = Math.random();
    if (roll < 0.4) {
      // monstro
      const gladiator = state.gladiators.find((g) => g.id === run.gladiatorId);
      const monster = makeCaveMonster(gladiator);
      caveLog(`Um ${monster.name} surge das sombras!`, "bad");
      renderCaveRun();
      openCombat({
        title: "Confronto nas catacumbas",
        fighterA: { ...gladiator, hp: run.hp },
        fighterB: monster,
        onEnd: (result, finalHp) => {
          run.hp = finalHp;
          if (result === "win") {
            const coins = randInt(4, 14);
            run.lootCoins += coins;
            caveLog(`Você derrotou o ${monster.name} e encontrou ${coins} ◈.`, "good");
            saveState();
            renderCaveRun();
          } else {
            handleCaveDeath(gladiator);
          }
        },
      });
    } else if (roll < 0.75) {
      // tesouro
      const coins = randInt(6, 20);
      run.lootCoins += coins;
      caveLog(`Você encontra um baú escondido com ${coins} ◈.`, "good");
      saveState();
      renderCaveRun();
    } else {
      // passagem vazia, pequeno risco de armadilha
      if (Math.random() < 0.25) {
        const dmg = randInt(3, 10);
        run.hp = Math.max(0, run.hp - dmg);
        caveLog(`Uma armadilha de lanças causa ${dmg} de dano.`, "bad");
        if (run.hp <= 0) {
          const gladiator = state.gladiators.find((g) => g.id === run.gladiatorId);
          handleCaveDeath(gladiator);
          return;
        }
      } else {
        caveLog("A passagem segue vazia e silenciosa.", "neutral");
      }
      saveState();
      renderCaveRun();
    }
  }

  function makeCaveMonster(gladiator) {
    const power = 1 + Math.random() * 0.5;
    const stats = {};
    CONFIG.STAT_KEYS.forEach((k) => {
      stats[k] = clamp(Math.round(gladiator.stats[k] * rand(0.6, 1.05) * power), 1, 12);
    });
    const d = derive(stats);
    return {
      id: "mon-" + uid(),
      name: MONSTER_NAMES[randInt(0, MONSTER_NAMES.length - 1)],
      stats,
      hp: d.hpMax,
      isMonster: true,
    };
  }

  function handleCaveDeath(gladiator) {
    caveLog(`${gladiator.name} caiu em combate e mal consegue se levantar...`, "bad");
    const equippedSlots = Object.entries(gladiator.equipment).filter(([, v]) => v);
    if (equippedSlots.length) {
      const [slot] = equippedSlots[randInt(0, equippedSlots.length - 1)];
      const lostItem = gladiator.equipment[slot];
      gladiator.equipment[slot] = null;
      caveLog(`Ele perdeu ${lostItem} na fuga apressada.`, "bad");
    }
    gladiator.hp = 1;
    gladiator.alive = true;
    state.caveRun = null;
    saveState();
    renderRoster();
    renderCave();
    toast(`${gladiator.name} sobreviveu por pouco, mas voltou de mãos quase vazias.`, "bad");
  }

  function leaveCave() {
    const run = state.caveRun;
    const gladiator = state.gladiators.find((g) => g.id === run.gladiatorId);
    gladiator.hp = run.hp;
    state.coins += run.lootCoins;
    state.caveRun = null;
    saveState();
    renderWallet();
    renderRoster();
    renderCave();
    toast(`Você deixou as catacumbas com ${run.lootCoins} ◈.`, "good");
  }

  /* ---------------------------------------------------------------------
     COMBAT ENGINE (compartilhado por arena e caverna)
     Sem movimentação de bonecos: apenas feedback visual (shake/pulse) e
     barras de vida reagindo às decisões do jogador a cada rodada.
  --------------------------------------------------------------------- */
  let combat = null;

  function openCombat({ title, fighterA, fighterB, onEnd }) {
    const dA = derive(fighterA.stats);
    const dB = derive(fighterB.stats);
    combat = {
      a: { ref: fighterA, hp: fighterA.hp ?? dA.hpMax, hpMax: dA.hpMax, d: dA, guarding: false },
      b: { ref: fighterB, hp: fighterB.hp ?? dB.hpMax, hpMax: dB.hpMax, d: dB, guarding: false },
      onEnd,
      locked: false,
    };
    $("#combat-title").textContent = title;
    $("#fighter-a-name").textContent = fighterA.name;
    $("#fighter-b-name").textContent = fighterB.name;
    $("#combat-log").innerHTML = "";
    updateCombatUI();
    $("#combat-modal").classList.remove("hidden");
    $$("#combat-actions .btn-action").forEach((b) => (b.disabled = false));
  }

  function closeCombat() {
    $("#combat-modal").classList.add("hidden");
    combat = null;
  }

  function updateCombatUI() {
    const { a, b } = combat;
    $("#fighter-a-hp-value").textContent = Math.max(0, Math.round(a.hp));
    $("#fighter-a-hp-max").textContent = a.hpMax;
    $("#fighter-a-hp-fill").style.width = `${clamp((a.hp / a.hpMax) * 100, 0, 100)}%`;
    $("#fighter-b-hp-value").textContent = Math.max(0, Math.round(b.hp));
    $("#fighter-b-hp-max").textContent = b.hpMax;
    $("#fighter-b-hp-fill").style.width = `${clamp((b.hp / b.hpMax) * 100, 0, 100)}%`;
  }

  function combatLog(msg, kind = "") {
    const box = $("#combat-log");
    const p = document.createElement("p");
    p.className = kind ? `log-${kind}` : "";
    p.textContent = msg;
    box.appendChild(p);
    box.scrollTop = box.scrollHeight;
  }

  function playCombatAnim(fighterKey, animClass) {
    const portrait = $(`#fighter-${fighterKey} .fighter-portrait`);
    portrait.classList.remove("hit", "crit", "block");
    void portrait.offsetWidth; // reinicia a animação
    portrait.classList.add(animClass);
  }

  const ACTION_DEFS = {
    attack: { label: "ataca", missChance: 0.08, mult: 1 },
    special: { label: "desfere um golpe especial", missChance: 0.25, mult: 1.7 },
    defend: { label: "se defende", missChance: 0, mult: 0 },
  };

  function pickNpcAction() {
    const r = Math.random();
    if (r < 0.55) return "attack";
    if (r < 0.8) return "special";
    return "defend";
  }

  function resolveTurn(playerAction) {
    if (combat.locked) return;
    combat.locked = true;
    $$("#combat-actions .btn-action").forEach((b) => (b.disabled = true));

    const npcAction = pickNpcAction();
    const { a, b } = combat;

    a.guarding = playerAction === "defend";
    b.guarding = npcAction === "defend";

    // Jogador age sobre o oponente
    if (playerAction !== "defend") {
      applyAction("a", "b", playerAction);
    } else {
      combatLog(`${a.ref.name} se prepara para defender.`, "");
      playCombatAnim("a", "block");
    }

    // NPC age sobre o jogador (se ambos ainda vivos)
    setTimeout(() => {
      if (b.hp > 0 && a.hp > 0) {
        if (npcAction !== "defend") {
          applyAction("b", "a", npcAction);
        } else {
          combatLog(`${b.ref.name} se prepara para defender.`, "");
          playCombatAnim("b", "block");
        }
      }
      updateCombatUI();

      setTimeout(() => {
        if (a.hp <= 0 || b.hp <= 0) {
          endCombat();
        } else {
          combat.locked = false;
          $$("#combat-actions .btn-action").forEach((btn) => (btn.disabled = false));
        }
      }, 250);
    }, 350);

    updateCombatUI();
  }

  function applyAction(attackerKey, defenderKey, action) {
    const attacker = combat[attackerKey];
    const defender = combat[defenderKey];
    const def = ACTION_DEFS[action];

    if (Math.random() < def.missChance) {
      combatLog(`${attacker.ref.name} ${def.label}, mas erra o golpe.`, "");
      return;
    }

    let dmg = attacker.d.attackPower * def.mult * rand(0.8, 1.2) - defender.d.defense * 0.4;
    if (defender.guarding) dmg *= 0.4;
    dmg = Math.max(1, Math.round(dmg));

    defender.hp = Math.max(0, defender.hp - dmg);
    const kind = action === "special" ? "crit" : "hit";
    playCombatAnim(defenderKey, defender.guarding ? "block" : kind);

    const verb = action === "special" ? "acerta um golpe especial em" : "ataca";
    combatLog(`${attacker.ref.name} ${verb} ${defender.ref.name} causando ${dmg} de dano.`, "bad");
  }

  function endCombat() {
    const { a, b, onEnd } = combat;
    const playerWon = b.hp <= 0 && a.hp > 0;
    const finalHp = Math.max(0, Math.round(a.hp));
    combatLog(playerWon ? `${a.ref.name} venceu o combate!` : `${a.ref.name} foi derrotado.`, playerWon ? "good" : "bad");

    setTimeout(() => {
      closeCombat();
      onEnd(playerWon ? "win" : "loss", finalHp);
    }, 900);
  }

  /* ---------------------------------------------------------------------
     EVENTS / INIT
  --------------------------------------------------------------------- */
  function bindEvents() {
    $$(".tab").forEach((t) => t.addEventListener("click", () => goto(t.dataset.screen)));
    $$("[data-goto]").forEach((b) => b.addEventListener("click", () => goto(b.dataset.goto)));

    $("#btn-connect-wallet").addEventListener("click", connectWallet);
    $("#input-name").addEventListener("input", updateForgePreview);
    $("#btn-create-gladiator").addEventListener("click", createGladiator);

    $("#btn-enter-cave").addEventListener("click", enterCave);

    $("#btn-close-combat").addEventListener("click", () => {
      // Fuga de emergência: conta como derrota para não travar o jogo.
      if (combat) {
        const { a, onEnd } = combat;
        closeCombat();
        onEnd("loss", 0);
      }
    });

    $$("#combat-actions .btn-action").forEach((btn) => {
      btn.addEventListener("click", () => resolveTurn(btn.dataset.action));
    });
  }

  function init() {
    loadState();
    bindEvents();
    renderWallet();
    renderRoster();
    goto("ludus");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
