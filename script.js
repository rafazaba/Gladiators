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

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===================== PARÂMETROS DA ECONOMIA =====================
// Só existe uma moeda no jogo: token (= USDT). Espelha o que foi definido
// na simulação — ajuste aqui se mudar lá.
const ECONOMIA = {
  taxaInscricaoArena: 2,        // token
  taxaCasaTorneio: 0.05,        // 5%
  bracketGrande: 16,
  bracketMedio: 8,
  bracketPequeno: 4,
  custoIncrementoDescida: 0.5,  // cada descida seguinte à primeira custa +0,5 token
  taxaMinimaMarketplace: 0.03,  // sobre o valor de referência do item
};

const DISTRIBUICAO_PREMIO = { primeiro: 0.5, segundo: 0.25, terceiroQuarto: 0.125 };

// Recompensas em token (antes eram em "moeda", convertidas aqui na razão
// antiga de 10:1 pra manter o mesmo equilíbrio econômico agora que só existe token).
const MONSTROS = [
  { nome: "Cão da Sarna", dificuldade: 12, tokenMin: 0.4, tokenMax: 0.9, chanceItem: 0.12 },
  { nome: "Bandido Ferido", dificuldade: 18, tokenMin: 0.6, tokenMax: 1.2, chanceItem: 0.18 },
  { nome: "Urso das Cavernas", dificuldade: 26, tokenMin: 0.9, tokenMax: 1.6, chanceItem: 0.22 },
  { nome: "Espectro de Ferro", dificuldade: 34, tokenMin: 1.2, tokenMax: 2.0, chanceItem: 0.28 },
];

// Tesouros: sem combate, recompensa garantida (menor que a média de um
// monstro vencido, já que não tem risco de derrota).
const TESOUROS = [
  { nome: "Bolsa de Moedas Antigas", tokenMin: 0.3, tokenMax: 0.6, chanceItem: 0.15 },
  { nome: "Baú Reforçado", tokenMin: 0.5, tokenMax: 0.9, chanceItem: 0.2 },
];
const CHANCE_TESOURO = 0.3; // 30% dos encontros são tesouro, 70% monstro

const ITENS_LOOT = [
  { nome: "Bracelete de Bronze", tipo: "acessório", valor_referencia: 1.2, bonus_forca: 1, bonus_resistencia: 0, bonus_agilidade: 0 },
  { nome: "Grevas de Couro", tipo: "armadura", valor_referencia: 1.5, bonus_forca: 0, bonus_resistencia: 2, bonus_agilidade: -1 },
  { nome: "Adaga Serrilhada", tipo: "arma", valor_referencia: 2.0, bonus_forca: 2, bonus_resistencia: 0, bonus_agilidade: 1 },
  { nome: "Manto Rasgado", tipo: "acessório", valor_referencia: 1.0, bonus_forca: 0, bonus_resistencia: 1, bonus_agilidade: 1 },
];

// ===================== ESTADO LOCAL =====================
const state = {
  user: null,
  profileUsername: null,
  wallet: { token: 0 },
  gladiator: null,
  items: [],
  descidasFeitas: 0,   // quantas descidas já pagas nessa sessão — define o preço da próxima
  emDescida: false,    // true enquanto o gladiador está dentro da caverna, podendo explorar
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
// URL completa de retorno do OAuth. Importante usar a URL completa (com o
// /Gladiators/ no final), não window.location.origin — origin sozinho corta
// o path e manda pra raiz do domínio, que não existe (site em subpasta no
// GitHub Pages). Essa URL precisa estar em Authentication > URL Configuration
// > Redirect URLs no painel do Supabase.
const AUTH_REDIRECT_URL = window.location.origin + window.location.pathname;

$("#btn-login").addEventListener("click", async () => {
  if (state.user) {
    if (confirm("Sair da conta?")) await supabaseClient.auth.signOut();
    return;
  }
  $("#auth-modal").hidden = false;
});
$("#btn-fechar-modal").addEventListener("click", () => ($("#auth-modal").hidden = true));

$("#btn-google-login").addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: AUTH_REDIRECT_URL },
  });
  // Em fluxo OAuth bem-sucedido o navegador é redirecionado pro Google antes
  // de qualquer resposta chegar aqui — só cai nesse erro se falhar de cara
  // (ex: provider Google não habilitado no Supabase).
  if (error) toast(`Erro ao entrar com Google: ${error.message}`, "error");
});

supabaseClient.auth.onAuthStateChange(async (_event, session) => {
  state.user = session?.user ?? null;
  if (state.user) {
    await garantirProfile();
    $("#btn-login").textContent = state.profileUsername || state.user.email;
    $("#auth-modal").hidden = true;
    await carregarPerfilCompleto();
  } else {
    $("#btn-login").textContent = "Entrar";
  }
});

// Cria o registro em profiles na primeira vez que o usuário loga com Google
// (username vem do nome da conta Google; dá pra editar depois no app).
async function garantirProfile() {
  const { data: perfilExistente } = await supabaseClient
    .from("profiles")
    .select("username")
    .eq("id", state.user.id)
    .maybeSingle();

  if (perfilExistente) {
    state.profileUsername = perfilExistente.username;
    return;
  }

  const usernameDesejado =
    state.user.user_metadata?.full_name ||
    state.user.user_metadata?.name ||
    state.user.email?.split("@")[0] ||
    "Gladiador";

  const { error } = await supabaseClient
    .from("profiles")
    .insert({ id: state.user.id, username: usernameDesejado });

  state.profileUsername = error ? (state.user.email || "Gladiador") : usernameDesejado;
}

async function exigirLogin() {
  if (!state.user) {
    toast("Entre com sua conta Google primeiro.", "error");
    $("#auth-modal").hidden = false;
    return false;
  }
  return true;
}

// ===================== CARREGAR DADOS =====================
async function carregarPerfilCompleto() {
  await Promise.all([carregarWallet(), carregarGladiador(), carregarItens(), carregarFila(), carregarMercado(), carregarProgressoCaverna()]);
}

// Data local do dispositivo em YYYY-MM-DD (não usa UTC, pra bater com o "dia"
// que o jogador realmente vive, considerando o fuso local do navegador).
function hojeISO() {
  return new Date().toLocaleDateString("en-CA");
}

async function carregarProgressoCaverna() {
  const { data, error } = await supabaseClient
    .from("cave_progresso")
    .select("dia, descidas")
    .eq("owner_id", state.user.id)
    .maybeSingle();

  if (error) {
    console.error(error);
    state.descidasFeitas = 0; // fallback seguro: não trava o jogo se a tabela ainda não existir
    renderStatusCaverna();
    return;
  }

  // Só pra exibir o preço estimado na tela — quem decide o preço de
  // verdade (imune a data do celular trocada) é a função registrar_descida()
  // no banco, chamada no clique de "Descer".
  const hoje = hojeISO();
  state.descidasFeitas = data && data.dia === hoje ? data.descidas : 0;
  renderStatusCaverna();
}

async function carregarWallet() {
  const { data, error } = await supabaseClient
    .from("wallets")
    .select("token")
    .eq("owner_id", state.user.id)
    .maybeSingle();
  if (error) return console.error(error);
  if (!data) {
    // primeira vez — cria carteira zerada
    await supabaseClient.from("wallets").insert({ owner_id: state.user.id, token: 0 });
    state.wallet = { token: 0 };
  } else {
    state.wallet = data;
  }
  renderWallet();
}

function renderWallet() {
  $("#wallet-token").textContent = fmt2(state.wallet.token);
}

async function ajustarWallet({ token = 0 }) {
  // 🔒 mover para backend antes de operar com dinheiro real.
  state.wallet.token = Number((state.wallet.token + token).toFixed(4));
  renderWallet();
  const { error } = await supabaseClient
    .from("wallets")
    .update({ token: state.wallet.token })
    .eq("owner_id", state.user.id);
  if (error) console.error(error);
}

async function carregarGladiador() {
  const { data, error } = await supabaseClient
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

  const { data, error } = await supabaseClient
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
function precoProximaDescida() {
  return Number((state.descidasFeitas * ECONOMIA.custoIncrementoDescida).toFixed(2));
}

function renderStatusCaverna() {
  const preco = precoProximaDescida();
  $("#cave-preco-descida").textContent = preco === 0 ? "grátis" : `US$${fmt2(preco)}`;
  $("#btn-descer").hidden = state.emDescida;
  $("#cave-actions").hidden = !state.emDescida;
}

async function carregarItens() {
  if (!state.user) return;
  const { data, error } = await supabaseClient.from("items").select("*").eq("owner_id", state.user.id);
  if (error) return console.error(error);
  state.items = data ?? [];
  renderInventarioSelect();
  renderGladiador();
}

$("#btn-descer").addEventListener("click", async () => {
  if (!(await exigirLogin())) return;
  if (!state.gladiator) return toast("Forje um gladiador primeiro.", "error");

  // Pré-checagem só pra UX (evitar uma chamada óbvia sem saldo). Quem decide
  // de verdade — e já debita o token — é a função no banco, atomicamente.
  const precoEstimado = precoProximaDescida();
  if (state.wallet.token < precoEstimado) return toast("Token insuficiente para descer.", "error");

  const botao = $("#btn-descer");
  botao.disabled = true;
  const { data: preco, error } = await supabaseClient.rpc("registrar_descida");
  botao.disabled = false;

  if (error) {
    if (/saldo insuficiente/i.test(error.message)) return toast("Token insuficiente para descer.", "error");
    return toast(`Erro ao descer: ${error.message}. Rodou o schema_cave_progresso.sql no Supabase?`, "error");
  }

  await carregarWallet(); // o token já foi debitado no servidor — só busca o saldo real pra exibir
  state.emDescida = true;
  await carregarProgressoCaverna(); // sincroniza o contador exibido com o que o servidor tem
  renderStatusCaverna();
  toast(preco === 0 ? "Descida grátis iniciada." : `Descida paga: -US$${fmt2(preco)}.`, "success");
});

$("#btn-subir").addEventListener("click", () => {
  state.emDescida = false;
  renderStatusCaverna();
  toast("Você subiu da caverna com o que ganhou.", "success");
});

$("#btn-explorar").addEventListener("click", async () => {
  if (!state.emDescida) return; // segurança extra; botão só aparece em descida
  if (!state.gladiator) return toast("Forje um gladiador primeiro.", "error");

  const ehTesouro = Math.random() < CHANCE_TESOURO;

  if (ehTesouro) {
    const tesouro = TESOUROS[randInt(0, TESOUROS.length - 1)];
    const tokenGanho = Number(rand(tesouro.tokenMin, tesouro.tokenMax).toFixed(2));
    let itemGanho = null;
    if (Math.random() < tesouro.chanceItem) {
      const template = ITENS_LOOT[randInt(0, ITENS_LOOT.length - 1)];
      itemGanho = await concederItem(template);
    }
    await ajustarWallet({ token: tokenGanho });
    // Nota: a coluna se chama "loot_moeda" no banco (schema antigo), mas
    // agora guarda o valor em token/USDT — renomeie a coluna quando puder.
    await supabaseClient.from("cave_runs").insert({
      owner_id: state.user.id,
      gladiator_id: state.gladiator.id,
      resultado: "tesouro",
      loot_moeda: tokenGanho,
    });
    adicionarLogCaverna({ monstro: tesouro.nome, venceu: true, tokenGanho, itemGanho, tipo: "tesouro" });
    // Continua em descida — jogador escolhe explorar de novo ou subir.
    return;
  }

  const monstro = MONSTROS[randInt(0, MONSTROS.length - 1)];
  const poderGladiador = poderTotal(state.gladiator) * rand(0.7, 1.3);
  const poderMonstro = monstro.dificuldade * rand(0.7, 1.3);
  const venceu = poderGladiador >= poderMonstro;

  let tokenGanho = 0;
  let itemGanho = null;

  if (venceu) {
    tokenGanho = Number(rand(monstro.tokenMin, monstro.tokenMax).toFixed(2));
    if (Math.random() < monstro.chanceItem) {
      const template = ITENS_LOOT[randInt(0, ITENS_LOOT.length - 1)];
      itemGanho = await concederItem(template);
    }
    state.gladiator.vitorias = (state.gladiator.vitorias ?? 0) + 1;
    await ajustarWallet({ token: tokenGanho });
  } else {
    state.gladiator.derrotas = (state.gladiator.derrotas ?? 0) + 1;
  }

  await supabaseClient
    .from("gladiators")
    .update({ vitorias: state.gladiator.vitorias, derrotas: state.gladiator.derrotas })
    .eq("id", state.gladiator.id);

  await supabaseClient.from("cave_runs").insert({
    owner_id: state.user.id,
    gladiator_id: state.gladiator.id,
    resultado: venceu ? "vitoria" : "derrota",
    loot_moeda: tokenGanho,
  });

  renderGladiador();
  adicionarLogCaverna({ monstro: monstro.nome, venceu, tokenGanho, itemGanho, tipo: "monstro" });

  if (!venceu) {
    // Derrota encerra a descida automaticamente — só dá pra subir depois de
    // matar o monstro ou coletar o tesouro, e aqui não houve nem um nem outro.
    state.emDescida = false;
    renderStatusCaverna();
    toast(`${monstro.nome} venceu o combate — você foi expulso da caverna.`, "error");
  }
});

async function concederItem(template) {
  const { data, error } = await supabaseClient
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

function adicionarLogCaverna({ monstro, venceu, tokenGanho, itemGanho, tipo }) {
  const lista = $("#log-caverna");
  if (lista.querySelector(".log-empty")) lista.innerHTML = "";
  const li = document.createElement("li");
  li.className = venceu ? "log-win" : "log-loss";
  const acao = tipo === "tesouro" ? "Encontrou" : venceu ? "Venceu" : "Perdeu para";
  const partes = [`${acao} ${monstro}`];
  if (tokenGanho > 0) partes.push(`+US$${fmt2(tokenGanho)}`);
  if (itemGanho) partes.push(`item: ${itemGanho.nome}`);
  li.innerHTML = `<span>${partes[0]}</span><span class="item-value">${partes.slice(1).join(" · ") || "—"}</span>`;
  lista.prepend(li);
}

// ===================== ARENA (PvP em bracket) =====================
async function carregarFila() {
  const { count, error } = await supabaseClient.from("arena_queue").select("*", { count: "exact", head: true });
  if (error) return console.error(error);
  $("#queue-count").textContent = count ?? 0;
  await atualizarBotaoArena();
}

$("#btn-entrar-arena").addEventListener("click", async () => {
  if (!(await exigirLogin())) return;
  if (!state.gladiator) return toast("Forje um gladiador primeiro.", "error");
  if (state.wallet.token < ECONOMIA.taxaInscricaoArena) {
    return toast("Token insuficiente para a inscrição.", "error");
  }

  // Bug corrigido: antes disso não havia checagem, então o mesmo usuário/
  // gladiador podia entrar na fila várias vezes (múltiplos cliques, abas
  // simultâneas) e ocupar mais de uma vaga no mesmo bracket.
  // 🔒 Essa checagem no cliente é só a primeira camada; o ideal é também ter
  // uma constraint UNIQUE(owner_id) na tabela arena_queue no banco, pra
  // bloquear de verdade mesmo se alguém chamar a API direto.
  const { data: jaNaFila, error: erroCheck } = await supabaseClient
    .from("arena_queue")
    .select("id")
    .eq("owner_id", state.user.id)
    .maybeSingle();
  if (erroCheck) return toast(`Erro ao checar fila: ${erroCheck.message}`, "error");
  if (jaNaFila) return toast("Seu gladiador já está na fila da arena.", "error");

  await ajustarWallet({ token: -ECONOMIA.taxaInscricaoArena });
  const { error } = await supabaseClient
    .from("arena_queue")
    .insert({ owner_id: state.user.id, gladiator_id: state.gladiator.id });
  if (error) {
    // Se a inserção falhar (ex: constraint UNIQUE do banco barrando),
    // devolve o token já debitado.
    await ajustarWallet({ token: ECONOMIA.taxaInscricaoArena });
    return toast(`Erro ao entrar na fila: ${error.message}`, "error");
  }
  toast("Inscrito na fila da arena.", "success");
  atualizarBotaoArena();
  await tentarFecharBracket();
});

async function atualizarBotaoArena() {
  if (!state.user) return;
  const { data } = await supabaseClient
    .from("arena_queue")
    .select("id")
    .eq("owner_id", state.user.id)
    .maybeSingle();
  const botao = $("#btn-entrar-arena");
  if (data) {
    botao.disabled = true;
    botao.textContent = "Aguardando bracket fechar...";
  } else {
    botao.disabled = false;
    botao.textContent = "Entrar na arena";
  }
}

async function tentarFecharBracket() {
  const { data: fila, error } = await supabaseClient
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
  await supabaseClient.from("arena_queue").delete().in("id", participantes.map((p) => p.id));

  const resultado = rodarBracket(participantes.map((p) => ({
    owner_id: p.owner_id,
    gladiador: p.gladiators,
  })));

  await distribuirPremios(resultado, tamanho);
  await supabaseClient.from("arena_matches").insert({
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
      const { data } = await supabaseClient.from("wallets").select("token").eq("owner_id", ownerId).maybeSingle();
      if (data) {
        await supabaseClient
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

  const { error } = await supabaseClient.from("marketplace_listings").insert({
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
  const { data, error } = await supabaseClient
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
  const { data: listing, error } = await supabaseClient
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

  const { data: walletVendedor } = await supabaseClient
    .from("wallets")
    .select("token")
    .eq("owner_id", listing.vendedor_id)
    .maybeSingle();
  if (walletVendedor) {
    await supabaseClient
      .from("wallets")
      .update({ token: Number((walletVendedor.token + valorVendedor).toFixed(4)) })
      .eq("owner_id", listing.vendedor_id);
  }

  await supabaseClient.from("items").update({ owner_id: state.user.id, gladiator_id: null, equipado: false }).eq("id", listing.items.id);
  await supabaseClient.from("marketplace_listings").update({ status: "vendido" }).eq("id", listingId);

  toast(`Item comprado. Taxa retida: US$${fmt2(taxa)}.`, "success");
  await Promise.all([carregarItens(), carregarMercado()]);
}

// ===================== INIT =====================
renderStatusCaverna();
if (window.__debugLog) window.__debugLog("[log] script.js: terminou de rodar até o fim, listeners deveriam estar ativos");
