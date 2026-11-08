// script.js - Front-end puro (sem bibliotecas). Funciona offline.
// Partes: utilidades, abas, exemplos, resultados, gráficos, formulários, Gauss.

// ---------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const reduzirMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Escapa HTML para o texto digitado pelo usuário não virar código
function esc(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Formata número (null vira traço)
function fmt(v) {
  if (v === null || v === undefined) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a < 1e-4 || a >= 1e7) return v.toExponential(4);
  return String(Number(v.toPrecision(10)));
}

async function chamarApi(url, dados) {
  try {
    const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
    return await resp.json();
  } catch (e) {
    return { ok: false, titulo: "Servidor indisponível", explicacao: "Não foi possível falar com o servidor Flask.", dica: "Confira se 'python app.py' está rodando." };
  }
}

// Lê uma cor definida no CSS (variável) para usar no canvas
const cor = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();

// Valor de f(x) por interpolação linear na curva enviada pelo servidor
function interpolar(curva, x) {
  for (let i = 1; i < curva.length; i++) {
    if (curva[i][0] >= x && curva[i][1] !== null && curva[i - 1][1] !== null) {
      const t = (x - curva[i - 1][0]) / (curva[i][0] - curva[i - 1][0] || 1);
      return curva[i - 1][1] + t * (curva[i][1] - curva[i - 1][1]);
    }
  }
  return null;
}

// ---------------------------------------------------------------
// Abas
// ---------------------------------------------------------------
document.querySelectorAll(".aba").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".aba").forEach((x) => {
      x.classList.toggle("ativa", x === b);
      x.setAttribute("aria-selected", x === b ? "true" : "false");
    });
    document.querySelectorAll(".painel").forEach((p) => (p.hidden = p.id !== b.dataset.alvo));
  });
});

// ---------------------------------------------------------------
// Botões "Inserir": colocam texto no campo f(x), na posição do cursor
// ---------------------------------------------------------------
document.querySelectorAll(".insere button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const campo = btn.closest(".campo").querySelector("input");
    const ins = btn.dataset.ins;
    const ini = campo.selectionStart ?? campo.value.length, fim = campo.selectionEnd ?? ini;
    campo.value = campo.value.slice(0, ini) + ins + campo.value.slice(fim);
    const pos = ini + (ins.endsWith("()") ? ins.length - 1 : ins.length); // cursor dentro dos parênteses
    campo.focus();
    campo.setSelectionRange(pos, pos);
  });
});

// ---------------------------------------------------------------
// Exemplos prontos: [nome, tipo ("bom" funciona / "ruim" falha), valores, o que esperar]
// ---------------------------------------------------------------
const EX_FP = [
  ["x³ − x − 2, [1, 2]", "bom", { f: "x**3 - x - 2", a: "1", b: "2" }, "raiz ≈ 1,5214"],
  ["cos(x) − x, [0, 1]", "bom", { f: "cos(x) - x", a: "0", b: "1" }, "raiz ≈ 0,7391"],
  ["exp(x) − 3x, [0, 1]", "bom", { f: "exp(x) - 3*x", a: "0", b: "1" }, "raiz ≈ 0,6191"],
  ["log(x) + x − 2, [1, 3]", "bom", { f: "log(x) + x - 2", a: "1", b: "3" }, "raiz ≈ 1,5571"],
  ["x·sen(x) − 1, [0, 2]", "bom", { f: "x*sin(x) - 1", a: "0", b: "2" }, "raiz ≈ 1,1142"],
  ["x² + 1, [−1, 1]", "ruim", { f: "x**2 + 1", a: "-1", b: "1" }, "f(a)·f(b) > 0: Bolzano não garante raiz"],
  ["1/x, [−1, 1]", "ruim", { f: "1/x", a: "-1", b: "1" }, "assíntota em x = 0 (descontínua)"],
  ["tan(x), [1, 2]", "ruim", { f: "tan(x)", a: "1", b: "2" }, "assíntota em π/2 dentro do intervalo"],
  ["log(x), [−1, 2]", "ruim", { f: "log(x)", a: "-1", b: "2" }, "−1 está fora do domínio"],
];
const EX_NEWTON = [
  ["x³ − x − 2, x₀ = 1,5", "bom", { f: "x**3 - x - 2", x0: "1,5" }, "converge com ordem 2"],
  ["cos(x) − x, x₀ = 1", "bom", { f: "cos(x) - x", x0: "1" }, "converge rápido"],
  ["exp(x) − 3x, x₀ = 0", "bom", { f: "exp(x) - 3*x", x0: "0" }, "converge para uma raiz"],
  ["log(x) + x − 2, x₀ = 1", "bom", { f: "log(x) + x - 2", x0: "1" }, "converge"],
  ["x·sen(x) − 1, x₀ = 1", "bom", { f: "x*sin(x) - 1", x0: "1" }, "converge"],
  ["(x − 1)², x₀ = 3", "bom", { f: "(x-1)**2", x0: "3" }, "raiz dupla: convergência só linear"],
  ["x² − 2, x₀ = 0", "ruim", { f: "x**2 - 2", x0: "0" }, "f′(0) = 0: tangente horizontal"],
  ["x³ − 2x + 2, x₀ = 0", "ruim", { f: "x**3 - 2*x + 2", x0: "0" }, "ciclo 0 → 1 → 0 → 1"],
  ["atan(x), x₀ = 2", "ruim", { f: "atan(x)", x0: "2" }, "diverge: x₀ longe da raiz"],
  ["log(x), x₀ = 3", "ruim", { f: "log(x)", x0: "3" }, "x₁ cai fora do domínio"],
  ["exp(x), x₀ = 0", "ruim", { f: "exp(x)", x0: "0" }, "exp(x) > 0: não existe raiz real"],
];
const EX_GAUSS = [
  ["Sistema 2×2", "bom", { A: [[2, 1], [1, 3]], b: [3, 5] }, "x = (0,8; 1,4)"],
  ["Sistema 3×3", "bom", { A: [[2, 1, -1], [-3, -1, 2], [-2, 1, 2]], b: [8, -11, -3] }, "x = (2, 3, −1)"],
  ["Sistema 4×4", "bom", { A: [[4, 1, 2, 1], [1, 5, 1, 2], [2, 1, 6, 1], [1, 2, 1, 7]], b: [9, 9, 10, 11] }, "solução única"],
  ["[[0, 1], [1, 1]]", "bom", { A: [[0, 1], [1, 1]], b: [1, 2] }, "pivô zero, resolvido pela troca de linhas"],
  ["[[1, 2], [2, 4]], b = (1, 2)", "ruim", { A: [[1, 2], [2, 4]], b: [1, 2] }, "indeterminado: aparece 0 = 0"],
  ["[[1, 2], [2, 4]], b = (1, 3)", "ruim", { A: [[1, 2], [2, 4]], b: [1, 3] }, "impossível: aparece 0 = c, c ≠ 0"],
  ["[[1,2,3],[4,5,6],[7,8,9]]", "ruim", { A: [[1, 2, 3], [4, 5, 6], [7, 8, 9]], b: [1, 2, 3] }, "matriz singular (det = 0)"],
];

// Monta dois quadros: "Casos que funcionam" e "Casos em que o método falha"
function montarExemplos(idDiv, lista, aoClicar) {
  const div = $(idDiv);
  div.innerHTML = "";
  [["bom", "Casos que funcionam", "Clique em um exemplo para preencher o formulário e calcular."],
   ["ruim", "Casos em que o método falha", "Servem para estudar cada aviso explicativo."]].forEach(([tipo, titulo, ajuda]) => {
    const g = document.createElement("div");
    g.className = "grupo " + tipo;
    g.innerHTML = `<h4>${titulo}</h4><p>${ajuda}</p>`;
    const ul = document.createElement("ul");
    lista.filter((e) => e[1] === tipo).forEach(([nome, , valores, desc]) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = nome;
      b.addEventListener("click", () => aoClicar(valores));
      li.appendChild(b);
      li.insertAdjacentHTML("beforeend", `<span>${esc(desc)}</span>`);
      ul.appendChild(li);
    });
    g.appendChild(ul);
    div.appendChild(g);
  });
}

// ---------------------------------------------------------------
// Blocos de resultado
// ---------------------------------------------------------------
function vazio(div, verbo) {
  div.innerHTML = `<p class="vazio">O resultado aparecerá aqui. Escolha um exemplo acima ou preencha os passos e clique em “${verbo}”.</p>`;
}

function blocoErro(r) {
  return `<div class="aviso erro" role="alert">
    <span class="rotulo" style="margin-top:0">O que aconteceu</span>
    <h4>${esc(r.titulo)}</h4>
    <span class="rotulo">Por quê</span><p>${esc(r.explicacao)}</p>
    <span class="rotulo">O que fazer</span><p>${esc(r.dica)}</p></div>`;
}

function blocoAtencao(a) {
  return `<div class="aviso atencao"><h4>Aviso: ${esc(a.titulo)}</h4><p>${esc(a.explicacao)}</p></div>`;
}

function resumo(itens) {
  return '<dl class="resumo">' + itens.map(([nome, valor]) => `<dt>${nome}</dt><dd>${valor}</dd>`).join("") + "</dl>";
}

// Tabela com legenda; a última linha recebe ✓ (convergiu) ou ✗ (falhou)
function tabelaHtml(legenda, colunas, linhas, classeFinal) {
  let h = `<p class="legenda-tab">${legenda}</p><div class="tabela-rolagem"><table><thead><tr>`;
  colunas.forEach((c) => (h += `<th>${c[0]}</th>`));
  h += "</tr></thead><tbody>";
  linhas.forEach((l, i) => {
    const final = i === linhas.length - 1 ? classeFinal : "";
    h += `<tr class="${final}">`;
    colunas.forEach((c) => (h += `<td>${c[1] === "k" ? l[c[2]] : fmt(l[c[2]])}</td>`));
    h += "</tr>";
  });
  return h + "</tbody></table></div>";
}

const opcoesGrafico = { geo: false }; // "mostrar construção geométrica"

function renderizar(div, r) {
  let h = `<h3 class="passo"><span class="num">${r.metodo === "gauss" ? 2 : 3}</span> Resultado</h3>`;
  if (r.ok) {
    if (r.metodo !== "gauss") {
      h += `<div class="resposta"><span class="rotulo-res">Raiz aproximada</span><span class="valor-res">x ≈ ${fmt(r.raiz)}</span></div>`;
      h += `<p class="conclusao">${r.iteracoes === 0 ? esc(r.mensagem) : `O método convergiu em ${r.iteracoes} iterações: o erro relativo ficou menor ou igual à tolerância.`}</p>`;
      h += resumo([["f(x) na raiz", fmt(r.fraiz)], ["Iterações", r.iteracoes],
        ["Ordem de convergência observada", r.ordem === null || r.ordem === undefined ? "—" : "p ≈ " + r.ordem.toFixed(2)]]);
    }
    (r.avisos || []).forEach((a) => (h += blocoAtencao(a)));
  } else {
    h += blocoErro(r);
  }

  const classeFinal = r.ok ? "final-ok" : "final-erro";
  if (r.metodo === "falsa_posicao" && r.tabela && r.tabela.length) {
    h += tabelaHtml("Tabela 1 – Iterações da falsa posição (erro relativo " + esc(r.nome_erro) + ")",
      [["k", "k", "k"], ["a", "n", "a"], ["b", "n", "b"], ["x<sub>k</sub>", "n", "x"], ["f(x<sub>k</sub>)", "n", "fx"], ["erro", "n", "erro"]], r.tabela, classeFinal);
  }
  if (r.metodo === "newton" && r.tabela && r.tabela.length) {
    h += `<p class="nota">Derivada simbólica usada: <b>f′(x) = ${esc(r.derivada)}</b></p>`;
    h += tabelaHtml("Tabela 1 – Iterações de Newton-Raphson (erro relativo " + esc(r.nome_erro) + ")",
      [["k", "k", "k"], ["x<sub>k</sub>", "n", "x"], ["f(x<sub>k</sub>)", "n", "fx"], ["f′(x<sub>k</sub>)", "n", "dfx"], ["erro", "n", "erro"]], r.tabela, classeFinal);
  }
  if (r.metodo === "gauss") h += renderGauss(r);

  const temErros = (r.tabela || []).some((l) => l.erro !== null && l.erro !== undefined);
  const temConstrucao = r.curva && (r.metodo === "newton" || r.metodo === "falsa_posicao") && (r.tabela || []).length > 0;
  if (r.curva) {
    h += `<div class="barra-graficos"><h3>Gráficos</h3><div class="controles">
        ${temConstrucao ? `<label><input type="checkbox" class="chk-geo"> Mostrar ${r.metodo === "newton" ? "retas tangentes" : "retas secantes"}</label>` : ""}
        <button type="button" class="secundario btn-replay">Reproduzir iterações</button></div></div>
      <div class="graficos">
        <figure><canvas class="cv-f"></canvas><figcaption>Figura 1 – f(x), iterações (pontos azuis numerados) e raiz (ponto vermelho).</figcaption></figure>
        ${temErros ? '<figure><canvas class="cv-e"></canvas><figcaption>Figura 2 – Erro relativo por iteração, em escala logarítmica.</figcaption></figure>' : ""}
      </div>`;
  }
  div.innerHTML = h;

  graficosAtuais = null;
  opcoesGrafico.geo = false;
  if (r.curva) {
    const desloca = r.metodo === "newton" ? 0 : 1; // numeração das iterações (Newton começa em k = 0)
    const pts = (r.pontos || []).map((x, i) => ({ x, y: r.tabela && r.tabela[i] ? r.tabela[i].fx : null, k: i + desloca }));
    const erros = (r.tabela || []).filter((l) => l.erro !== null && l.erro !== undefined && l.erro >= 0).map((l) => [l.k, l.erro]);
    graficosAtuais = [criarGraficoFuncao(div.querySelector(".cv-f"), r.curva, pts, r.ok ? r.raiz : null, segmentosConstrucao(r))];
    if (temErros) graficosAtuais.push(criarGraficoErro(div.querySelector(".cv-e"), erros));
    animar(graficosAtuais, 700);
    div.querySelector(".btn-replay").addEventListener("click", () => animar(graficosAtuais, 3500));
    const chk = div.querySelector(".chk-geo");
    if (chk) chk.addEventListener("change", () => { opcoesGrafico.geo = chk.checked; animar(graficosAtuais, 0); });
  }
  // Gauss: expandir/recolher todos os passos
  const abrir = div.querySelector("[data-abrir]");
  if (abrir) {
    abrir.addEventListener("click", () => {
      const abrirTudo = abrir.dataset.abrir === "1";
      div.querySelectorAll("details").forEach((d) => (d.open = abrirTudo));
      abrir.dataset.abrir = abrirTudo ? "0" : "1";
      abrir.textContent = abrirTudo ? "Recolher todos" : "Expandir todos";
    });
  }
}

// Segmentos da "construção geométrica": tangentes (Newton) ou secantes (falsa posição)
function segmentosConstrucao(r) {
  const seg = [], t = r.tabela || [];
  if (r.metodo === "newton") {
    for (let i = 0; i < t.length - 1; i++) {
      if (t[i].fx === null) continue;
      seg.push({ x1: t[i].x, y1: t[i].fx, x2: t[i + 1].x, y2: 0, tipo: "reta" });          // tangente
      seg.push({ x1: t[i + 1].x, y1: 0, x2: t[i + 1].x, y2: t[i + 1].fx || 0, tipo: "guia" }); // guia vertical
    }
  } else if (r.metodo === "falsa_posicao") {
    t.forEach((l) => {
      const fa = interpolar(r.curva, l.a), fb = interpolar(r.curva, l.b);
      if (fa !== null && fb !== null) seg.push({ x1: l.a, y1: fa, x2: l.b, y2: fb, tipo: "reta" }); // secante
    });
  }
  return seg;
}

// ---------------------------------------------------------------
// Gauss: solução, resumo e passos em <details>
// ---------------------------------------------------------------
function renderGauss(r) {
  let h = "";
  if (r.ok) {
    h += `<div class="aviso sucesso"><h4>Sistema com solução única</h4><p>As equações são compatíveis e determinadas: existe exatamente um vetor x que as satisfaz.</p></div>`;
    h += '<ul class="solucao">' + r.solucao.map((v, i) => `<li>x<sub>${i + 1}</sub> = ${fmt(v)}</li>`).join("") + "</ul>";
    h += resumo([["Determinante", fmt(r.determinante)], ["Posto de A", r.posto], ["Número de condição cond(A)", fmt(r.condicao)],
      ["Resíduo ‖Ax − b‖", fmt(r.residuo)],
      ["Conferência com numpy.linalg.solve", `diferença máxima ${fmt(r.diferenca_numpy)}`]]);
  }
  if (r.passos) {
    h += `<div class="passos-barra"><h3>Passo a passo (matriz aumentada [A | b])</h3><button type="button" class="secundario" data-abrir="1">Expandir todos</button></div>`;
    r.passos.forEach((p, i) => {
      h += `<details class="passo-gauss"${i === 0 ? " open" : ""}><summary>${esc(p.titulo)}</summary>`;
      if (p.pivo) h += `<p class="nota">Pivô: linha ${p.pivo.linha}, coluna ${p.pivo.coluna}, valor <b>${fmt(p.pivo.valor)}</b></p>`;
      if (p.troca) h += `<p class="nota">Troca de linhas: L${p.troca[0]} ↔ L${p.troca[1]}</p>`;
      if (p.multiplicadores.length)
        h += '<p class="nota">Multiplicadores: ' + p.multiplicadores.map((m) => `m<sub>${m.linha}</sub> = ${fmt(m.m)}`).join(" · ") + "</p>";
      h += '<div class="tabela-rolagem"><table><tbody>';
      p.matriz.forEach((linha, li) => {
        h += "<tr>";
        linha.forEach((v, cj) => {
          const ePivo = p.pivo && li === p.pivo.linha - 1 && cj === p.pivo.coluna - 1;
          h += `<td class="${ePivo ? "pivo" : ""}${cj === linha.length - 1 ? " col-b" : ""}">${fmt(v)}</td>`;
        });
        h += "</tr>";
      });
      h += "</tbody></table></div></details>";
    });
  }
  return h;
}

// ---------------------------------------------------------------
// Gráficos em <canvas> puro (t vai de 0 a 1: traçado rápido da curva e dos pontos)
// ---------------------------------------------------------------
let graficosAtuais = null; // gráficos da tela (para "reproduzir" e para redesenhar)
let tokenAnimacao = 0;     // cancela animações antigas

// Ajusta o canvas à largura da tela, nítido em telas retina
function prepararCanvas(cv) {
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(280, Math.round(cv.getBoundingClientRect().width));
  const H = Math.round(W * 0.58);
  cv.style.height = H + "px";
  cv.width = W * dpr;
  cv.height = H * dpr;
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.font = "12px system-ui, sans-serif";
  return { g, W, H };
}

function criarGraficoFuncao(cv, curva, pts, raiz, construcao) {
  const { g, W, H } = prepararCanvas(cv);
  const mE = 52, mD = 14, mT = 22, mB = 30;

  // Corta valores extremos (assíntotas): limite = 3 × percentil 90 de |y|
  const ys = curva.filter((p) => p[1] !== null).map((p) => p[1]);
  if (!ys.length) {
    return { desenhar() { g.clearRect(0, 0, W, H); g.fillStyle = cor("--grafico-texto"); g.fillText("f não está definida neste intervalo", 20, 30); } };
  }
  const absOrd = ys.map(Math.abs).sort((a, b) => a - b);
  const lim = Math.max(3 * absOrd[Math.floor(0.9 * (absOrd.length - 1))], 1e-9);
  let ymin = Math.max(Math.min(...ys), -lim), ymax = Math.min(Math.max(...ys), lim);
  ymin = Math.min(ymin, 0); ymax = Math.max(ymax, 0);
  const pad = (ymax - ymin) * 0.08 || 1;
  ymin -= pad; ymax += pad;
  const xmin = curva[0][0], xmax = curva[curva.length - 1][0];
  const X = (x) => mE + ((x - xmin) / (xmax - xmin)) * (W - mE - mD);
  const Y = (y) => H - mB - ((y - ymin) / (ymax - ymin)) * (H - mT - mB);

  // Segmentos da curva: quebra onde f não existe, sai do limite ou cruza uma assíntota
  const segs = [];
  let anterior = null;
  curva.forEach((p) => {
    const y = p[1];
    if (y === null || y > ymax || y < ymin) { anterior = null; return; }
    const assintota = anterior && Math.sign(anterior[1]) !== Math.sign(y) && Math.abs(anterior[1]) > lim / 2 && Math.abs(y) > lim / 2;
    segs.push({ x: X(p[0]), y: Y(y), mover: !anterior || assintota });
    anterior = p;
  });

  // Posição em pixels de cada iteração
  const marcas = pts.filter((p) => p.x >= xmin && p.x <= xmax).map((p) => {
    const yv = p.y === null ? 0 : Math.min(ymax, Math.max(ymin, p.y));
    return { px: X(p.x), py: Y(yv), k: p.k, x: p.x, y: p.y };
  });

  function desenhar(t) {
    g.clearRect(0, 0, W, H);
    // grade, eixos e rótulos
    g.strokeStyle = cor("--grafico-grade"); g.fillStyle = cor("--grafico-texto"); g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const x = xmin + ((xmax - xmin) * i) / 4, y = ymin + ((ymax - ymin) * i) / 4;
      g.beginPath(); g.moveTo(X(x), mT); g.lineTo(X(x), H - mB); g.stroke();
      g.beginPath(); g.moveTo(mE, Y(y)); g.lineTo(W - mD, Y(y)); g.stroke();
      g.fillText(fmt(Number(x.toPrecision(3))), X(x) - 14, H - 14);
      g.fillText(fmt(Number(y.toPrecision(3))), 4, Y(y) + 4);
    }
    g.strokeStyle = cor("--grafico-texto"); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(mE, Y(0)); g.lineTo(W - mD, Y(0)); g.stroke();
    if (xmin < 0 && xmax > 0) { g.beginPath(); g.moveTo(X(0), mT); g.lineTo(X(0), H - mB); g.stroke(); }
    g.fillStyle = cor("--grafico-texto"); g.font = "italic 12px Georgia, serif";
    g.fillText("x", W - mD - 8, Y(0) - 6); g.fillText("f(x)", mE + 6, mT - 6);
    g.font = "12px system-ui, sans-serif";

    // curva (traçada até a fração t/0.6)
    const n = Math.floor(segs.length * Math.min(1, t / 0.6));
    g.strokeStyle = cor("--grafico-linha"); g.lineWidth = 2; g.lineJoin = "round";
    g.beginPath();
    for (let i = 0; i < n; i++) (segs[i].mover ? g.moveTo(segs[i].x, segs[i].y) : g.lineTo(segs[i].x, segs[i].y));
    g.stroke();

    const progresso = t <= 0.6 ? 0 : (t - 0.6) / 0.4;

    // construção geométrica (tangentes / secantes), se o usuário pediu
    if (opcoesGrafico.geo && construcao.length) {
      g.save();
      g.beginPath(); g.rect(mE, mT, W - mE - mD, H - mT - mB); g.clip();
      g.lineWidth = 1;
      construcao.slice(0, Math.ceil(construcao.length * progresso)).forEach((s) => {
        g.strokeStyle = s.tipo === "reta" ? cor("--grafico-ponto") : cor("--grafico-grade");
        g.setLineDash(s.tipo === "reta" ? [] : [3, 3]);
        g.beginPath(); g.moveTo(X(s.x1), Y(s.y1)); g.lineTo(X(s.x2), Y(s.y2)); g.stroke();
      });
      g.restore();
    }

    // iterações aparecem uma a uma depois da curva
    const mostrar = Math.ceil(progresso * marcas.length);
    for (let i = 0; i < mostrar; i++) {
      const m = marcas[i];
      g.fillStyle = cor("--grafico-ponto");
      g.beginPath(); g.arc(m.px, m.py, 4, 0, 7); g.fill();
      if (i < 10) g.fillText(String(m.k), m.px + 6, m.py - 7);
    }
    if (t >= 1 && raiz !== null && raiz !== undefined && raiz >= xmin && raiz <= xmax) {
      g.fillStyle = cor("--grafico-raiz");
      g.beginPath(); g.arc(X(raiz), Y(0), 5.5, 0, 7); g.fill();
    }
  }
  // dica ao passar o mouse: iteração mais próxima
  ligarDica(cv, (mx, my) => {
    let melhor = null, dist = 14;
    marcas.forEach((m) => {
      const d = Math.hypot(m.px - mx, m.py - my);
      if (d < dist) { dist = d; melhor = `k = ${m.k}   x = ${fmt(m.x)}   f(x) = ${fmt(m.y)}`; }
    });
    return melhor;
  });
  return { desenhar };
}

// Erro relativo por iteração, em escala log
function criarGraficoErro(cv, erros) {
  const { g, W, H } = prepararCanvas(cv);
  const mE = 58, mD = 14, mT = 22, mB = 30;
  if (erros.length < 1) {
    return { desenhar() { g.clearRect(0, 0, W, H); g.fillStyle = cor("--grafico-texto"); g.fillText("Sem dados de erro para mostrar", 20, 30); } };
  }
  const ls = erros.map((e) => Math.log10(Math.max(e[1], 1e-17)));
  let lmin = Math.floor(Math.min(...ls)), lmax = Math.ceil(Math.max(...ls));
  if (lmax === lmin) lmax += 1;
  const kmin = erros[0][0], kmax = erros[erros.length - 1][0];
  const X = (k) => mE + ((k - kmin) / Math.max(kmax - kmin, 1)) * (W - mE - mD);
  const Y = (l) => H - mB - ((l - lmin) / (lmax - lmin)) * (H - mT - mB);
  const pos = erros.map((e, i) => ({ px: X(e[0]), py: Y(ls[i]), k: e[0], erro: e[1] }));

  function desenhar(t) {
    g.clearRect(0, 0, W, H);
    g.strokeStyle = cor("--grafico-grade"); g.fillStyle = cor("--grafico-texto"); g.lineWidth = 1;
    const passo = Math.max(1, Math.ceil((lmax - lmin) / 6));
    for (let l = lmin; l <= lmax; l += passo) {
      g.beginPath(); g.moveTo(mE, Y(l)); g.lineTo(W - mD, Y(l)); g.stroke();
      g.fillText("1e" + l, 6, Y(l) + 4);
    }
    g.fillText("k = " + kmin, mE, H - 14);
    g.fillText("k = " + kmax, W - mD - 42, H - 14);
    g.font = "italic 12px Georgia, serif";
    g.fillText("erro", mE + 6, mT - 6); g.fillText("iteração k", W / 2 - 24, H - 3);
    g.font = "12px system-ui, sans-serif";

    const n = Math.max(1, Math.ceil(pos.length * t));
    g.strokeStyle = cor("--grafico-linha"); g.lineWidth = 2; g.lineJoin = "round";
    g.beginPath();
    for (let i = 0; i < n; i++) (i ? g.lineTo(pos[i].px, pos[i].py) : g.moveTo(pos[i].px, pos[i].py));
    g.stroke();
    g.fillStyle = cor("--grafico-linha");
    for (let i = 0; i < n; i++) { g.beginPath(); g.arc(pos[i].px, pos[i].py, 3, 0, 7); g.fill(); }
  }
  ligarDica(cv, (mx, my) => {
    let melhor = null, dist = 14;
    pos.forEach((p) => {
      const d = Math.hypot(p.px - mx, p.py - my);
      if (d < dist) { dist = d; melhor = `k = ${p.k}   erro = ${fmt(p.erro)}`; }
    });
    return melhor;
  });
  return { desenhar };
}

// Dica flutuante ao passar o mouse sobre um ponto do gráfico
function ligarDica(cv, procurar) {
  const dica = $("#dica");
  cv.addEventListener("mousemove", (e) => {
    const r = cv.getBoundingClientRect();
    const texto = procurar(e.clientX - r.left, e.clientY - r.top);
    if (!texto) { dica.hidden = true; return; }
    dica.textContent = texto;
    dica.hidden = false;
    dica.style.left = e.clientX + 14 + "px";
    dica.style.top = e.clientY + 14 + "px";
  });
  cv.addEventListener("mouseleave", () => (dica.hidden = true));
}

// Anima de 0 a 1 em 'dur' ms (0 = desenha o final direto)
function animar(graficos, dur) {
  const token = ++tokenAnimacao;
  if (dur === 0 || reduzirMovimento) { graficos.forEach((gr) => gr.desenhar(1)); return; }
  const inicio = performance.now();
  function quadro(agora) {
    if (token !== tokenAnimacao) return; // outra animação começou
    const t = Math.min(1, (agora - inicio) / dur);
    graficos.forEach((gr) => gr.desenhar(1 - Math.pow(1 - t, 2)));
    if (t < 1) requestAnimationFrame(quadro);
  }
  requestAnimationFrame(quadro);
}

// ---------------------------------------------------------------
// Formulários: validação ao lado do campo, envio e resultado
// ---------------------------------------------------------------
function limparMensagem(inp) {
  inp.classList.remove("invalido");
  const prox = inp.nextElementSibling;
  if (prox && prox.classList.contains("msg-campo")) prox.remove();
}
function marcarInvalido(inp, texto) {
  limparMensagem(inp);
  inp.classList.add("invalido");
  inp.insertAdjacentHTML("afterend", `<small class="msg-campo" role="alert">${texto}</small>`);
}

// Campos vazios: avisa ao lado do campo e não envia
function camposPreenchidos(form) {
  let primeiro = null;
  form.querySelectorAll(".campo input").forEach((inp) => {
    if (inp.value.trim() === "") { marcarInvalido(inp, "Preencha este campo."); primeiro = primeiro || inp; }
  });
  if (primeiro) primeiro.focus();
  return !primeiro;
}

function dadosForm(form) {
  const d = {};
  new FormData(form).forEach((v, k) => (d[k] = v));
  return d;
}

function preencher(form, valores) {
  Object.keys(valores).forEach((k) => { if (form.elements[k]) { form.elements[k].value = valores[k]; limparMensagem(form.elements[k]); } });
}

// Envia ao servidor mostrando "Calculando…" no botão
async function enviar(botao, url, dados, divRes) {
  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = "Calculando…";
  const resposta = await chamarApi(url, dados);
  botao.disabled = false;
  botao.textContent = rotulo;
  renderizar(divRes, resposta);
  divRes.scrollIntoView({ behavior: reduzirMovimento ? "auto" : "smooth", block: "start" });
}

function ligarFormulario(idForm, idRes, url) {
  const form = $(idForm), divRes = $(idRes);
  const botao = form.querySelector("button[type=submit]");
  form.querySelectorAll(".campo input").forEach((inp) => inp.addEventListener("input", () => limparMensagem(inp)));
  const executar = () => {
    if (camposPreenchidos(form)) enviar(botao, url, dadosForm(form), divRes);
    else vazio(divRes, "Calcular");   // não deixa um resultado antigo na tela
  };
  form.addEventListener("submit", (e) => { e.preventDefault(); executar(); });
  vazio(divRes, "Calcular");
  return { form, executar };
}

const fp = ligarFormulario("#form-fp", "#res-fp", "/api/falsa-posicao");
montarExemplos("#ex-fp", EX_FP, (v) => { preencher(fp.form, v); fp.executar(); });

const nw = ligarFormulario("#form-newton", "#res-newton", "/api/newton");
montarExemplos("#ex-newton", EX_NEWTON, (v) => { preencher(nw.form, v); nw.executar(); });

// ---------------------------------------------------------------
// Gauss: grade dinâmica n × n (+ coluna b)
// ---------------------------------------------------------------
function montarGrade(n, A, b) {
  let h = "<table><thead><tr>";
  for (let j = 0; j < n; j++) h += `<th>x<sub>${j + 1}</sub></th>`;
  h += "<th></th><th>b</th></tr></thead><tbody>";
  for (let i = 0; i < n; i++) {
    h += "<tr>";
    for (let j = 0; j < n; j++) h += `<td><input aria-label="A linha ${i + 1} coluna ${j + 1}" data-i="${i}" data-j="${j}" value="${A ? A[i][j] : ""}" placeholder="0"></td>`;
    h += `<td class="sep">|</td><td><input aria-label="b linha ${i + 1}" data-b="${i}" value="${b ? b[i] : ""}" placeholder="0"></td></tr>`;
  }
  $("#gauss-grade").innerHTML = h + '</tbody></table><div class="msg-campo" id="gauss-msg" role="alert"></div>';
  $("#gauss-grade").querySelectorAll("input").forEach((inp) => inp.addEventListener("input", () => { inp.classList.remove("invalido"); $("#gauss-msg").textContent = ""; }));
}

function lerGrade() {
  const n = parseInt($("#gauss-n").value, 10) || 0;
  const A = Array.from({ length: n }, () => Array(n).fill(""));
  const b = Array(n).fill("");
  document.querySelectorAll("#gauss-grade input").forEach((inp) => {
    if (inp.dataset.b !== undefined) b[inp.dataset.b] = inp.value;
    else A[inp.dataset.i][inp.dataset.j] = inp.value;
  });
  return { A, b };
}

function resolverGauss() {
  // células vazias: avisa e não envia
  let primeira = null;
  document.querySelectorAll("#gauss-grade input").forEach((inp) => {
    const vazia = inp.value.trim() === "";
    inp.classList.toggle("invalido", vazia);
    if (vazia && !primeira) primeira = inp;
  });
  if (primeira) {
    $("#gauss-msg").textContent = "Preencha todos os campos da matriz A e do vetor b (os campos em vermelho estão vazios).";
    vazio($("#res-gauss"), "Resolver");
    primeira.focus();
    return;
  }
  enviar($("#form-gauss button[type=submit]"), "/api/gauss", lerGrade(), $("#res-gauss"));
}

$("#gauss-n").addEventListener("change", () => {
  const n = Math.min(10, Math.max(1, parseInt($("#gauss-n").value, 10) || 1));
  $("#gauss-n").value = n;
  montarGrade(n);
});
$("#gauss-limpar").addEventListener("click", () => {
  montarGrade(parseInt($("#gauss-n").value, 10) || 1);
  vazio($("#res-gauss"), "Resolver");
});
$("#form-gauss").addEventListener("submit", (e) => { e.preventDefault(); resolverGauss(); });
montarExemplos("#ex-gauss", EX_GAUSS, (v) => {
  $("#gauss-n").value = v.A.length;
  montarGrade(v.A.length, v.A, v.b);
  resolverGauss();
});
montarGrade(3, EX_GAUSS[1][2].A, EX_GAUSS[1][2].b);
vazio($("#res-gauss"), "Resolver");
