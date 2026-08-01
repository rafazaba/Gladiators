/* =========================================================
   ARENA — lógica do jogo
   ========================================================= */
if (window.__debugLog) window.__debugLog("[log] script.js: topo do arquivo executando");


// ===================== DIAGNÓSTICO: erro global visível =====================
// Se qualquer erro no topo do script travar tudo (o que faz o formulário de
// login cair no submit padrão do navegador e "só recarregar a página"), isso
// aqui mostra um aviso vermelho fixo no topo, já que no celular não dá pra
// abrir o console fácil. Remova depois que o login estiver 100% ok.
window.addEventListener("error", (ev) => {
  console.error("Erro capturado pelo script.js:", ev.error || ev.message, ev);
  const banner = document.createElement("div");
  banner.style.cssText =
    "position:fixed;top:0;left:0;right:0;background:#c0392b;color:#fff;padding:10px 14px;" +
    "text-align:center;z-index:99999;font-family:sans-serif;font-size:13px;line-height:1.4;";
  banner.textContent = "⚠️ Erro no script.js: " + (ev.message || "veja detalhes no console") +
    (ev.filename ? ` (${ev.filename.split("/").pop()}:${ev.lineno})` : "");
  document.body.prepend(banner);
});

// ===================== CONFIGURAÇÃO SUPABASE =====================
const SUPABASE_URL = "https://hyaaehjpbuqavkosthbv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5YWFlaGpwYnVxYXZrb3N0aGJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0NTA1NjAsImV4cCI6MjEwMTAyNjU2MH0.69Dl4aNyMYMrvmu5PdwTnbVkNlH2rIar8ERiWiMf7uk";

if (!window.supabase || typeof window.supabase.createClient !== "function") {
  const banner = document.createElement("div");
  banner.style.cssText =
    "position:fixed;top:0;left:0;right:0;background:#c0392b;color:#fff;padding:10px 14px;" +
    "text-align:center;z-index:99999;font-family:sans-serif;font-size:13px;";
  banner.textContent = "⚠️ A biblioteca do Supabase (CDN) não carregou. Sem internet, CDN bloqueado, ou adblock. O login não vai funcionar.";
  document.body.prepend(banner);
  throw new Error("window.supabase indisponível — cdn.jsdelivr.net não carregou o supabase-js.");
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===================== PARÂMETROS DA ECONOMIA =====================
// Espelham o que foi definido na simulação — ajuste aqui se mudar lá.
const ECONOMIA = {
  taxaInscricaoArena: 2,       // token
  taxaCasaTorneio: 0.05,       // 5%
  bracketGrande: 16,
  bracketMedio: 8,
  bracketPequeno: 4,
  tetoDiarioMoeda: 30,
  taxaMinimaMarketplace: 0.03, // sobre o valor de referência do item
  taxaCambioTokenMoeda: 10,    // moeda por token convertido
};

const DISTRIBUICAO_PREMIO = { primeiro: 0.5, segundo: 0.25, terceiroQuarto: 0.125 };

const MONSTROS = [
  { nome: "Cão da Sarna", dificuldade: 12, moedaMin: 4, moedaMax: 9, chanceItem: 0.12 },
  { nome: "Bandido Ferido", dificuldade: 18, moedaMin: 6, moedaMax: 12, chanceItem: 0.18 },
  { nome: "Urso das Cavernas", dificuldade: 26, moedaMin: 9, moedaMax: 16, chanceItem: 0.22 },
  { nome: "Espectro de Ferro", dificuldade: 34, moedaMin: 12, moedaMax: 20, chanceItem: 0.28 },
];

const ITENS_LOOT = [
  { nome: "Bracelete de Bronze", tipo: "acessório", valor_referencia: 1.2, bonus_forca: 1, bonus_resistencia: 0, bonus_agilidade: 0 },
  { nome: "Grevas de Couro", tipo: "armadura", valor_referencia: 1.5, bonus_forca: 0, bonus_resistencia: 2, bonus_agilidade: -1 },
  { nome: "Adaga Serrilhada", tipo: "arma", valor_referencia: 2.0, bonus_forca: 2, bonus_resistencia: 0, bonus_agilidade: 1 },
  { nome: "Manto Rasgado", tipo: "acessório", valor_referencia: 1.0, bonus_forca: 0, bonus_resistencia: 1, bonus_agilidade: 1 },
];

// ===================== ESTADO LOCAL =====================
const state = {
  user: null,
  wallet: { token: 0, moeda: 0 },
  gladiator: null,
  items: [],
  todayMoedaEarned: 0,
};

// ===================== UTIL =====================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const fmt2 = (n) => Number(n ?? 0).toFixed(2);

function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.className = `toast ${type === "error" ? "toast-error" : type === "success" ? "toast-success" : ""}`;
  el.textContent = msg;
  $("#toast-container").appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

// ===================== NAVEGAÇÃO ENTRE ABAS =====================
$$(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".tab-btn").forEach((b) => b.classList.remove("is-active"));
    $$(".tab-panel").forEach((p) => p.classList.remove("is-active"));
    btn.classList.add("is-active");
    $(`#tab-${btn.dataset.tab}`).classList.add("is-active");
  });
});

// ===================== AUTENTICAÇÃO =====================
$("#btn-login").addEventListener("click", () => ($("#auth-modal").hidden = false));
$("#btn-fechar-modal").addEventListener("click", () => ($("#auth-modal").hidden = true));

$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (window.__debugLog) window.__debugLog("[log] submit do login interceptado");
  const email = $("#input-login-email").value.trim();
  const botao = e.target.querySelector('button[type="submit"]');

  botao.disabled = true;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  botao.disabled = false;

  if (error) {
    // Supabase retorna 429 quando o SMTP padrão (limite de ~2 e-mails/hora)
    // ou algum rate limit de auth é atingido. Isso NÃO é bug do app —
    // é preciso configurar um SMTP customizado (Resend/SendGrid/Mailtrap)
    // em Project Settings > Auth > SMTP Settings para resolver de vez.
    if (error.status === 429 || /rate limit/i.test(error.message)) {
      return toast("Muitas tentativas de envio. Aguarde alguns minutos ou configure um SMTP customizado no Supabase.", "error");
    }
    return toast(`Erro ao enviar link: ${error.message}`, "error");
  }
  toast("Link enviado! Confira seu e-mail (e a caixa de spam).", "success");
  $("#auth-modal").hidden = true;
});

supabase.auth.onAuthStateChange(async (_event, session) => {
  state.user = session?.user ?? null;
  if (state.user) {
    $("#btn-login").textContent = state.user.email;
    await carregarPerfilCompleto();
  } else {
    $("#btn-login").textContent = "Entrar";
  }
});

async function exigirLogin() {
  if (!state.user) {
    toast("Entre com seu e-mail primeiro.", "error");
    $("#auth-modal").hidden = false;
    return false;
  }
  return true;
}

// ===================== CARREGAR DADOS =====================
async function carregarPerfilCompleto() {
  await Promise.all([carregarWallet(), carregarGladiador(), carregarItens(), carregarFila(), carregarMercado()]);
}

async function carregarWallet() {
  const { data, error } = await supabase
    .from("wallets")
    .select("token, moeda")
    .eq("owner_id", state.user.id)
    .maybeSingle();
  if (error) return console.error(error);
  if (!data) {
    // primeira vez — cria carteira zerada
    await supabase.from("wallets").insert({ owner_id: state.user.id, token: 0, moeda: 0 });
    state.wallet = { token: 0, moeda: 0 };
  } else {
    state.wallet = data;
  }
  renderWallet();
}

function renderWallet() {
  $("#wallet-token").textContent = fmt2(state.wallet.token);
  $("#wallet-moeda").textContent = Math.floor(state.wallet.moeda ?? 0);
}

async function ajustarWallet({ token = 0, moeda = 0 }) {
  // 🔒 mover para backend antes de operar com dinheiro real.
  state.wallet.token = Number((state.wallet.token + token).toFixed(4));
  state.wallet.moeda = Math.max(0, state.wallet.moeda + moeda);
  renderWallet();
  const { error } = await supabase
    .from("wallets")
    .update({ token: state.wallet.token, moeda: state.wallet.moeda })
    .eq("owner_id", state.user.id);
  if (error) console.error(error);
}

async function carregarGladiador() {
  const { data, error } = await supabase
    .from("gladiators")
    .select("*")
    .eq("owner_id", state.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return console.error(error);
  state.gladiator = data ?? null;
  renderGladiador();
}

function renderGladiador() {
  const semGladiador = !state.gladiator;
  $("#card-criar-gladiador").hidden = !semGladiador;
  $("#card-gladiador-atual").hidden = semGladiador;
  if (semGladiador) return;

  const g = state.gladiator;
  const bonus = bonusDosItensEquipados();
  $("#glad-nome").textContent = g.nome;
  $("#glad-forca").textContent = g.forca + bonus.forca;
  $("#glad-resistencia").textContent = g.resistencia + bonus.resistencia;
  $("#glad-agilidade").textContent = g.agilidade + bonus.agilidade;
  $("#glad-poder").textContent = poderTotal(g);
  $("#glad-vitorias").textContent = g.vitorias ?? 0;
  $("#glad-derrotas").textContent = g.derrotas ?? 0;

  const equipados = state.items.filter((i) => i.gladiator_id === g.id && i.equipado);
  const ul = $("#glad-itens-equipados");
  ul.innerHTML = "";
  if (equipados.length === 0) {
    ul.innerHTML = '<li class="log-empty">Nenhum item equipado.</li>';
  } else {
    equipados.forEach((it) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${it.nome}</span><span class="item-value">US$${fmt2(it.valor_referencia)}</span>`;
      ul.appendChild(li);
    });
  }
}

function bonusDosItensEquipados() {
  if (!state.gladiator) return { forca: 0, resistencia: 0, agilidade: 0 };
  return state.items
    .filter((i) => i.gladiator_id === state.gladiator.id && i.equipado)
    .reduce(
      (acc, it) => ({
        forca: acc.forca + (it.bonus_forca || 0),
        resistencia: acc.resistencia + (it.bonus_resistencia || 0),
        agilidade: acc.agilidade + (it.bonus_agilidade || 0),
      }),
      { forca: 0, resistencia: 0, agilidade: 0 }
    );
}

function poderTotal(gladiador) {
  const bonus = bonusDosItensEquipados();
  return (
    gladiador.forca + bonus.forca + gladiador.resistencia + bonus.resistencia + gladiador.agilidade + bonus.agilidade
  );
}

// ===================== CRIAR GLADIADOR =====================
$("#form-gladiador").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!(await exigirLogin())) return;

  const nome = $("#input-nome").value.trim();
  const altura = Number($("#input-altura").value);
  const peso = Number($("#input-peso").value);

  // Stats base a partir de altura/peso + variação aleatória pequena,
  // conforme decidido: "altura, peso e outros dados dão um stats base".
  const forca = Math.max(1, Math.round(peso * 0.4 + altura * 0.15 + randInt(0, 8)));
  const resistencia = Math.max(1, Math.round(peso * 0.55 + randInt(0, 8)));
  const agilidade = Math.max(1, Math.round(altura * 0.35 - peso * 0.1 + randInt(0, 8)));

  const { data, error } = await supabase
    .from("gladiators")
    .insert({ owner_id: state.user.id, nome, altura, peso, forca, resistencia, agilidade, vitorias: 0, derrotas: 0 })
    .select()
    .single();

  if (error) return toast(`Erro ao forjar gladiador: ${error.message}`, "error");
  state.gladiator = data;
  renderGladiador();
  toast(`${nome} está pronto para a arena.`, "success");
});

// ===================== CAVERNA (PvE) =====================
function renderTetoCaverna() {
  const pct = Math.min(100, (state.todayMoedaEarned / ECONOMIA.tetoDiarioMoeda) * 100);
  $("#cap-bar-fill").style.width = `${pct}%`;
  $("#cap-meter-value").textContent = `${state.todayMoedaEarned} / ${ECONOMIA.tetoDiarioMoeda}`;
}

async function carregarItens() {
  if (!state.user) return;
  const { data, error } = await supabase.from("items").select("*").eq("owner_id", state.user.id);
  if (error) return console.error(error);
  state.items = data ?? [];
  renderInventarioSelect();
  renderGladiador();
}

$("#btn-explorar").addEventListener("click", async () => {
  if (!(await exigirLogin())) return;
  if (!state.gladiator) return toast("Forje um gladiador primeiro.", "error");
  if (state.todayMoedaEarned >= ECONOMIA.tetoDiarioMoeda) {
    return toast("Teto diário de moeda atingido — volte amanhã.", "error");
  }

  const monstro = MONSTROS[randInt(0, MONSTROS.length - 1)];
  const poderGladiador = poderTotal(state.gladiator) * rand(0.7, 1.3);
  const poderMonstro = monstro.dificuldade * rand(0.7, 1.3);
  const venceu = poderGladiador >= poderMonstro;

  let moedaGanha = 0;
  let itemGanho = null;
  let resultado;

  if (venceu) {
    moedaGanha = randInt(monstro.moedaMin, monstro.moedaMax);
    moedaGanha = Math.min(moedaGanha, ECONOMIA.tetoDiarioMoeda - state.todayMoedaEarned);
    if (Math.random() < monstro.chanceItem) {
      const template = ITENS_LOOT[randInt(0, ITENS_LOOT.length - 1)];
      itemGanho = await concederItem(template);
    }
    state.gladiator.vitorias = (state.gladiator.vitorias ?? 0) + 1;
    resultado = "vitoria";
  } else {
    moedaGanha = 0;
    state.gladiator.derrotas = (state.gladiator.derrotas ?? 0) + 1;
    resultado = "derrota";
  }

  state.todayMoedaEarned += moedaGanha;
  if (moedaGanha > 0) await ajustarWallet({ moeda: moedaGanha });

  await supabase
    .from("gladiators")
    .update({ vitorias: state.gladiator.vitorias, derrotas: state.gladiator.derrotas })
    .eq("id", state.gladiator.id);

  await supabase.from("cave_runs").insert({
    owner_id: state.user.id,
    gladiator_id: state.gladiator.id,
    resultado,
    loot_moeda: moedaGanha,
  });

  renderTetoCaverna();
  renderGladiador();
  adicionarLogCaverna({ monstro: monstro.nome, venceu, moedaGanha, itemGanho });
});

async function concederItem(template) {
  const { data, error } = await supabase
    .from("items")
    .insert({ owner_id: state.user.id, gladiator_id: null, equipado: false, ...template })
    .select()
    .single();
  if (error) {
    console.error(error);
    return null;
  }
  state.items.push(data);
  renderInventarioSelect();
  return data;
}

function adicionarLogCaverna({ monstro, venceu, moedaGanha, itemGanho }) {
  const lista = $("#log-caverna");
  if (lista.querySelector(".log-empty")) lista.innerHTML = "";
  const li = document.createElement("li");
  li.className = venceu ? "log-win" : "log-loss";
  const partes = [`${venceu ? "Venceu" : "Perdeu para"} ${monstro}`];
  if (moedaGanha > 0) partes.push(`+${moedaGanha} moeda`);
  if (itemGanho) partes.push(`item: ${itemGanho.nome}`);
  li.innerHTML = `<span>${partes[0]}</span><span class="item-value">${partes.slice(1).join(" · ") || "—"}</span>`;
  lista.prepend(li);
}

// ===================== ARENA (PvP em bracket) =====================
async function carregarFila() {
  const { count, error } = await supabase.from("arena_queue").select("*", { count: "exact", head: true });
  if (error) return console.error(error);
  $("#queue-count").textContent = count ?? 0;
}

$("#btn-entrar-arena").addEventListener("click", async () => {
  if (!(await exigirLogin())) return;
  if (!state.gladiator) return toast("Forje um gladiador primeiro.", "error");
  if (state.wallet.token < ECONOMIA.taxaInscricaoArena) {
    return toast("Token insuficiente para a inscrição.", "error");
  }

  await ajustarWallet({ token: -ECONOMIA.taxaInscricaoArena });
  await supabase.from("arena_queue").insert({ owner_id: state.user.id, gladiator_id: state.gladiator.id });
  toast("Inscrito na fila da arena.", "success");
  await tentarFecharBracket();
});

async function tentarFecharBracket() {
  const { data: fila, error } = await supabase
    .from("arena_queue")
    .select("id, owner_id, gladiator_id, gladiators(*)")
    .order("criado_em", { ascending: true });
  if (error) return console.error(error);

  let tamanho = 0;
  if (fila.length >= ECONOMIA.bracketGrande) tamanho = ECONOMIA.bracketGrande;
  else if (fila.length >= ECONOMIA.bracketMedio) tamanho = ECONOMIA.bracketMedio;
  else if (fila.length >= ECONOMIA.bracketPequeno) tamanho = ECONOMIA.bracketPequeno;

  if (tamanho === 0) {
    $("#queue-status").innerHTML = `Fila: <strong>${fila.length}</strong> gladiador(es) aguardando — faltam ${
      ECONOMIA.bracketPequeno - fila.length
    } para abrir a menor arena.`;
    return;
  }

  const participantes = fila.slice(0, tamanho);
  // remove os selecionados da fila
  await supabase.from("arena_queue").delete().in("id", participantes.map((p) => p.id));

  const resultado = rodarBracket(participantes.map((p) => ({
    owner_id: p.owner_id,
    gladiador: p.gladiators,
  })));

  await distribuirPremios(resultado, tamanho);
  await supabase.from("arena_matches").insert({
    bracket_size: tamanho,
    participantes: participantes.map((p) => p.gladiator_id),
    resultado,
  });

  renderBracket(resultado, tamanho);
  await carregarFila();
  await carregarWallet();
}

function rodarBracket(participantesIniciais) {
  // Single elimination com sorteio aleatório de confrontos.
  // 🔒 O RNG deve rodar no servidor num jogo real, para não poder ser manipulado no cliente.
  let atual = embaralhar([...participantesIniciais]);
  const rounds = [];
  let terceiroQuartoCandidatos = [];

  while (atual.length > 1) {
    const proximaRodada = [];
    const confrontosDaRodada = [];
    for (let i = 0; i < atual.length; i += 2) {
      const a = atual[i];
      const b = atual[i + 1];
      const vencedor = resolverCombate(a, b);
      const perdedor = vencedor === a ? b : a;
      confrontosDaRodada.push({ a, b, vencedor });
      proximaRodada.push(vencedor);
      if (atual.length === 4) terceiroQuartoCandidatos.push(perdedor); // semifinalistas perdedores
    }
    rounds.push(confrontosDaRodada);
    atual = proximaRodada;
  }

  return {
    campeao: atual[0],
    rounds,
    terceiroQuarto: terceiroQuartoCandidatos,
  };
}

function resolverCombate(a, b) {
  const poderA = poderDoParticipante(a) * rand(0.75, 1.25);
  const poderB = poderDoParticipante(b) * rand(0.75, 1.25);
  return poderA >= poderB ? a : b;
}

function poderDoParticipante(p) {
  const g = p.gladiador;
  return (g.forca ?? 0) + (g.resistencia ?? 0) + (g.agilidade ?? 0);
}

function embaralhar(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function distribuirPremios(resultado, tamanho) {
  // 🔒 Em produção, calcule e credite isso no backend, não no cliente.
  const poolTotal = tamanho * ECONOMIA.taxaInscricaoArena;
  const casa = poolTotal * ECONOMIA.taxaCasaTorneio;
  const distribuivel = poolTotal - casa;

  const premios = new Map();
  premios.set(resultado.campeao.owner_id, distribuivel * DISTRIBUICAO_PREMIO.primeiro);

  const finalRound = resultado.rounds[resultado.rounds.length - 1][0];
  const vice = finalRound.a === resultado.campeao ? finalRound.b : finalRound.a;
  premios.set(vice.owner_id, distribuivel * DISTRIBUICAO_PREMIO.segundo);

  resultado.terceiroQuarto.forEach((p) => {
    premios.set(p.owner_id, (premios.get(p.owner_id) ?? 0) + distribuivel * DISTRIBUICAO_PREMIO.terceiroQuarto);
  });

  for (const [ownerId, valor] of premios.entries()) {
    if (ownerId === state.user.id) {
      await ajustarWallet({ token: valor });
    } else {
      // outros jogadores: soma direto na wallet deles via update condicional
      const { data } = await supabase.from("wallets").select("token").eq("owner_id", ownerId).maybeSingle();
      if (data) {
        await supabase
          .from("wallets")
          .update({ token: Number((data.token + valor).toFixed(4)) })
          .eq("owner_id", ownerId);
      }
    }
  }
}

function renderBracket(resultado, tamanho) {
  const container = $("#bracket-container");
  container.innerHTML = "";
  resultado.rounds.forEach((rodada, idx) => {
    const col = document.createElement("div");
    col.className = "bracket-round";
    const titulo = document.createElement("div");
    titulo.className = "bracket-round-title";
    titulo.textContent = rodada.length === 1 ? "Final" : `Rodada ${idx + 1}`;
    col.appendChild(titulo);
    rodada.forEach((confronto) => {
      const div = document.createElement("div");
      div.className = "bracket-match";
      const nomeA = confronto.a.gladiador.nome;
      const nomeB = confronto.b.gladiador.nome;
      const vencedorNome = confronto.vencedor.gladiador.nome;
      div.innerHTML = `
        <div class="${vencedorNome === nomeA ? "winner" : "loser"}">${nomeA}</div>
        <div class="${vencedorNome === nomeB ? "winner" : "loser"}">${nomeB}</div>`;
      col.appendChild(div);
    });
    container.appendChild(col);
  });
  toast(`Torneio (${tamanho} gladiadores) encerrado — campeão: ${resultado.campeao.gladiador.nome}`, "success");
}

// ===================== MERCADO =====================
function renderInventarioSelect() {
  const select = $("#select-item-inventario");
  select.innerHTML = "";
  const disponiveis = state.items.filter((i) => !i.equipado);
  if (disponiveis.length === 0) {
    select.innerHTML = '<option value="">Nenhum item disponível</option>';
    return;
  }
  disponiveis.forEach((it) => {
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = `${it.nome} (ref. US$${fmt2(it.valor_referencia)})`;
    select.appendChild(opt);
  });
  atualizarPreviewTaxa();
}

$("#select-item-inventario").addEventListener("change", atualizarPreviewTaxa);
$("#input-preco-item").addEventListener("input", atualizarPreviewTaxa);

function atualizarPreviewTaxa() {
  const itemId = $("#select-item-inventario").value;
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return ($("#taxa-preview").textContent = "Taxa mínima do marketplace: —");
  const taxaMinima = item.valor_referencia * ECONOMIA.taxaMinimaMarketplace;
  $("#taxa-preview").textContent = `Taxa mínima do marketplace: US$${fmt2(taxaMinima)} (referenciada ao valor do item, não ao preço declarado)`;
}

$("#form-listar-item").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!(await exigirLogin())) return;
  const itemId = $("#select-item-inventario").value;
  const preco = Number($("#input-preco-item").value);
  if (!itemId) return toast("Selecione um item.", "error");

  const { error } = await supabase.from("marketplace_listings").insert({
    item_id: itemId,
    vendedor_id: state.user.id,
    preco,
    status: "ativo",
  });
  if (error) return toast(`Erro ao anunciar: ${error.message}`, "error");
  toast("Item anunciado no mercado.", "success");
  e.target.reset();
  await carregarMercado();
});

async function carregarMercado() {
  const { data, error } = await supabase
    .from("marketplace_listings")
    .select("id, preco, vendedor_id, items(*)")
    .eq("status", "ativo")
    .order("criado_em", { ascending: false });
  if (error) return console.error(error);

  const ul = $("#market-listings");
  ul.innerHTML = "";
  if (!data || data.length === 0) {
    ul.innerHTML = '<li class="log-empty">Nenhum item à venda no momento.</li>';
    return;
  }
  data.forEach((listing) => {
    const li = document.createElement("li");
    const podeComprar = state.user && listing.vendedor_id !== state.user.id;
    li.innerHTML = `
      <span>${listing.items.nome} <span class="item-value">US$${fmt2(listing.preco)}</span></span>
      ${podeComprar ? `<button class="btn btn-secondary" data-listing="${listing.id}">Comprar</button>` : ""}`;
    ul.appendChild(li);
  });

  ul.querySelectorAll("button[data-listing]").forEach((btn) => {
    btn.addEventListener("click", () => comprarItem(btn.dataset.listing));
  });
}

async function comprarItem(listingId) {
  if (!(await exigirLogin())) return;
  const { data: listing, error } = await supabase
    .from("marketplace_listings")
    .select("*, items(*)")
    .eq("id", listingId)
    .single();
  if (error || !listing) return toast("Anúncio não encontrado.", "error");
  if (state.wallet.token < listing.preco) return toast("Token insuficiente.", "error");

  // 🔒 Toda essa transação (pagamento + taxa + transferência) deve
  // rodar atômica no backend, não sequencialmente no cliente.
  const taxa = Math.max(listing.preco * 0.0, listing.items.valor_referencia * ECONOMIA.taxaMinimaMarketplace);
  const valorVendedor = listing.preco - taxa;

  await ajustarWallet({ token: -listing.preco });

  const { data: walletVendedor } = await supabase
    .from("wallets")
    .select("token")
    .eq("owner_id", listing.vendedor_id)
    .maybeSingle();
  if (walletVendedor) {
    await supabase
      .from("wallets")
      .update({ token: Number((walletVendedor.token + valorVendedor).toFixed(4)) })
      .eq("owner_id", listing.vendedor_id);
  }

  await supabase.from("items").update({ owner_id: state.user.id, gladiator_id: null, equipado: false }).eq("id", listing.items.id);
  await supabase.from("marketplace_listings").update({ status: "vendido" }).eq("id", listingId);

  toast(`Item comprado. Taxa retida: US$${fmt2(taxa)}.`, "success");
  await Promise.all([carregarItens(), carregarMercado()]);
}

// ===================== CONVERSÃO TOKEN → MOEDA =====================
$("#form-converter").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!(await exigirLogin())) return;
  const quantidade = Number($("#input-converter-token").value);
  if (quantidade <= 0) return;
  if (state.wallet.token < quantidade) return toast("Token insuficiente.", "error");

  const moedaRecebida = Math.round(quantidade * ECONOMIA.taxaCambioTokenMoeda);
  await ajustarWallet({ token: -quantidade, moeda: moedaRecebida });
  toast(`Convertido: -${fmt2(quantidade)} token → +${moedaRecebida} moeda.`, "success");
  e.target.reset();
});

// ===================== INIT =====================
renderTetoCaverna();
if (window.__debugLog) window.__debugLog("[log] script.js: terminou de rodar até o fim, listeners deveriam estar ativos");
