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

// Formata número (null vira traço; fração exata {num,den} vira "n/d"; vírgula decimal na tela)
function fmt(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object" && "num" in v && "den" in v) {
    return v.den === 1 ? String(v.num) : `${v.num}/${v.den}`;
  }
  if (v === 0) return "0";
  const a = Math.abs(v);
  const texto = a < 1e-4 || a >= 1e7 ? v.toExponential(4) : String(Number(v.toPrecision(10)));
  return texto.replace(".", ",");
}

// Valor numérico por trás de fmt() (fração -> aproximação float), para contas internas do gráfico/tabela
function numDe(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "valor" in v) return v.valor;
  return v;
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
  ["Exemplo 1 do slide (frações exatas, sem pivoteamento)", "bom",
    { A: [[3, 2, 4], [1, 1, 2], [4, 3, -2]], b: [1, 2, 3], pivotear: false, modo_numero: "fracao" },
    "x = (−3, 5, 0), m21=1/3, m31=4/3, m32=1"],
  ["Exemplo 3 do slide, SEM pivoteamento (3 alg. sig.)", "bom",
    { A: [[0.0002, 2], [2, 2]], b: [5, 6], pivotear: false, casas_sig: 3 },
    "x1 = 0: pivô pequeno amplifica o erro (prova real falha)"],
  ["Exemplo 3 do slide, COM pivoteamento (3 alg. sig.)", "bom",
    { A: [[0.0002, 2], [2, 2]], b: [5, 6], pivotear: true, casas_sig: 3 },
    "x1 = 0,5: o pivoteamento corrige o problema do exemplo anterior"],
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

// ---------------------------------------------------------------
// Navegador de passos: "Passo anterior" / "Próximo passo" / "Mostrar tudo"
// Chama aoMudar(indice0based, mostrarTudo) sempre que o estado muda.
// A tabela completa continua sempre visível; o navegador controla o
// painel de fórmula substituída, o destaque da linha atual e a
// construção geométrica (secante/tangente) no gráfico.
// ---------------------------------------------------------------
function barraNavegacao(total) {
  if (total <= 0) return "";
  return `<div class="nav-passos">
    <button type="button" class="secundario nav-ant">◂ Passo anterior</button>
    <span class="nav-info">Passo <b class="nav-atual">1</b> de ${total}</span>
    <button type="button" class="secundario nav-prox">Próximo passo ▸</button>
    <button type="button" class="secundario nav-tudo">Mostrar tudo</button>
  </div>`;
}

function ligarNavegacao(container, total, aoMudar) {
  if (total <= 0) return;
  let atual = 0, tudo = false;
  const elAtual = container.querySelector(".nav-atual");
  const btnAnt = container.querySelector(".nav-ant");
  const btnProx = container.querySelector(".nav-prox");
  const btnTudo = container.querySelector(".nav-tudo");
  function atualizar() {
    elAtual.textContent = tudo ? total : atual + 1;
    btnAnt.disabled = tudo || atual <= 0;
    btnProx.disabled = tudo || atual >= total - 1;
    btnTudo.classList.toggle("ativo", tudo);
    btnTudo.textContent = tudo ? "Voltar ao passo a passo" : "Mostrar tudo";
    aoMudar(atual, tudo);
  }
  btnAnt.addEventListener("click", () => { atual = Math.max(0, atual - 1); tudo = false; atualizar(); });
  btnProx.addEventListener("click", () => { atual = Math.min(total - 1, atual + 1); tudo = false; atualizar(); });
  btnTudo.addEventListener("click", () => { tudo = !tudo; atualizar(); });
  atualizar();
}

const opcoesGrafico = { geo: false }; // "mostrar construção geométrica"

function renderizar(div, r) {
  let h = `<h3 class="passo"><span class="num">${r.metodo === "gauss" ? 2 : 3}</span> Resultado</h3>`;
  if (r.ok) {
    if (r.metodo !== "gauss") {
      h += `<div class="resposta"><span class="rotulo-res">Raiz aproximada</span><span class="valor-res">x ≈ ${fmt(r.raiz)}</span></div>`;
    }
    (r.avisos || []).forEach((a) => (h += blocoAtencao(a)));
  } else {
    h += blocoErro(r);
  }

  const classeFinal = r.ok ? "final-ok" : "final-erro";
  const temPassos = (r.metodo === "falsa_posicao" || r.metodo === "newton") && r.tabela && r.tabela.length > 0;
  if (temPassos) {
    h += `<h3 class="passo"><span class="num">P</span> Passo a passo</h3>`;
    h += barraNavegacao(r.tabela.length);
    h += '<div class="painel-passo"><div class="conteudo-passo"></div></div>';
  }

  if (r.metodo === "falsa_posicao" && r.tabela && r.tabela.length) {
    h += tabelaHtml("Tabela 1 – Iterações da falsa posição (erro relativo " + esc(r.nome_erro) + "; também em %)",
      [["iteração", "k", "k"], ["x<sub>l</sub>", "n", "a"], ["x<sub>u</sub>", "n", "b"], ["x<sub>r</sub>", "n", "x"],
       ["f(x<sub>l</sub>)", "n", "fa"], ["f(x<sub>u</sub>)", "n", "fb"], ["f(x<sub>r</sub>)", "n", "fx"],
       ["f(x<sub>l</sub>)·f(x<sub>r</sub>)", "n", "produto"],
       ["erro relativo", "n", "erro"], ["erro (%)", "n", "erro_pct"]], r.tabela, classeFinal);
    h += '<p class="tabela-acoes"><button type="button" class="secundario btn-csv">Baixar tabela (CSV)</button></p>';
  }
  if (r.metodo === "newton" && r.tabela && r.tabela.length) {
    h += `<p class="nota">Derivada simbólica usada: <b>f′(x) = ${esc(r.derivada)}</b></p>`;
    h += tabelaHtml("Tabela 1 – Iterações de Newton-Raphson",
      [["i", "k", "i"], ["x<sub>i</sub>", "n", "x"], ["f(x<sub>i</sub>)", "n", "fx"],
       ["f′(x<sub>i</sub>)", "n", "dfx"], ["x<sub>i+1</sub>", "n", "x_seguinte"],
       ["erro relativo (%)", "n", "erro_pct"]], r.tabela, classeFinal);
    h += '<p class="tabela-acoes"><button type="button" class="secundario btn-csv">Baixar tabela (CSV)</button></p>';
  }
  if (temPassos && r.conclusao) {
    h += `<h3 class="passo"><span class="num">C</span> Conclusão</h3><p class="conclusao">${esc(r.conclusao)}</p>`;
  }
  if (r.ok && r.metodo !== "gauss") {
    h += resumo([["f(x) na raiz", fmt(r.fraiz)], ["Iterações", r.iteracoes],
      ["Ordem de convergência observada", r.ordem === null || r.ordem === undefined ? "—" : "p ≈ " + r.ordem.toFixed(2)]]);
  }

  if (r.metodo === "gauss") h += renderGauss(r);

  const temErros = (r.tabela || []).some((l) => l.erro_pct !== null && l.erro_pct !== undefined);
  const temConstrucao = r.curva && (r.metodo === "newton" || r.metodo === "falsa_posicao") && (r.tabela || []).length > 0;
  if (r.curva) {
    h += `<div class="barra-graficos"><h3>Gráficos</h3><div class="controles">
        ${temConstrucao ? `<label><input type="checkbox" class="chk-geo" checked> Mostrar ${r.metodo === "newton" ? "retas tangentes" : "retas secantes"}</label>` : ""}
        <button type="button" class="secundario btn-replay">Reproduzir iterações</button>
        <button type="button" class="secundario btn-png-f">Baixar Figura 1 (PNG)</button>
        ${temErros ? '<button type="button" class="secundario btn-png-e">Baixar Figura 2 (PNG)</button>' : ""}</div></div>
      <p class="dica-zoom">Arraste sobre um gráfico pra dar zoom na região; duplo-clique ou "Resetar zoom" volta ao tamanho original.</p>
      <div class="graficos">
        <figure><canvas class="cv-f"></canvas><button type="button" class="btn-reset-zoom" hidden>↺ Resetar zoom</button><figcaption>Figura 1 – f(x), iterações (pontos azuis numerados) e raiz (ponto vermelho).</figcaption></figure>
        ${temErros ? '<figure><canvas class="cv-e"></canvas><button type="button" class="btn-reset-zoom" hidden>↺ Resetar zoom</button><figcaption>Figura 2 – Erro relativo (%) por iteração, em escala logarítmica; linha pontilhada = tolerância.</figcaption></figure>' : ""}
      </div>`;
  }
  div.innerHTML = h;

  // Navegador de passos: liga o painel de fórmula substituída, o destaque da linha na tabela
  // e o limite de quantas retas de construção aparecem no gráfico.
  if (temPassos) {
    const linhasTbody = div.querySelectorAll(".tabela-rolagem tbody tr");
    const segPorPasso = r.metodo === "newton" ? 2 : 1;
    ligarNavegacao(div, r.tabela.length, (atual, tudo) => {
      const alvo = div.querySelector(".conteudo-passo");
      if (tudo) {
        alvo.innerHTML = r.tabela.map((l) =>
          `<p class="formula-linha"><b>${r.metodo === "newton" ? "i = " + l.i : "k = " + l.k}.</b> ${esc(l.formula || "—")}</p>`).join("");
      } else {
        const linha = r.tabela[atual];
        alvo.innerHTML = `<p class="formula-linha">${esc((linha && linha.formula) || "—")}</p>`;
      }
      linhasTbody.forEach((tr, i) => tr.classList.toggle("linha-atual", !tudo && i === atual));
      opcoesGrafico.limite = tudo ? null : (atual + 1) * segPorPasso;
      if (graficosAtuais) animar(graficosAtuais, 0);
    });
  }

  // Baixar tabela de iterações como CSV (falsa posição / Newton)
  div.querySelectorAll(".btn-csv").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ehNewton = r.metodo === "newton";
      const cabecalhos = ehNewton
        ? ["i", "x_i", "f(x_i)", "f'(x_i)", "x_i+1", "erro_%"]
        : ["k", "xl", "xu", "xr", "f(xl)", "f(xu)", "f(xr)", "f(xl)_vezes_f(xr)", "erro", "erro_%"];
      const chaves = ehNewton
        ? ["i", "x", "fx", "dfx", "x_seguinte", "erro_pct"]
        : ["k", "a", "b", "x", "fa", "fb", "fx", "produto", "erro", "erro_pct"];
      baixarTexto(`${r.metodo}-iteracoes.csv`, linhasParaCSV(cabecalhos, chaves, r.tabela), "text/csv;charset=utf-8;");
    });
  });
  // Baixar solução do Gauss como CSV
  const btnCsvGauss = div.querySelector(".btn-csv-gauss");
  if (btnCsvGauss) {
    btnCsvGauss.addEventListener("click", () => {
      const linhas = r.solucao.map((v, i) => ({ variavel: `x${i + 1}`, valor: v }));
      baixarTexto("gauss-solucao.csv", linhasParaCSV(["variável", "valor"], ["variavel", "valor"], linhas), "text/csv;charset=utf-8;");
    });
  }

  graficosAtuais = null;
  opcoesGrafico.geo = false;
  opcoesGrafico.limite = null;
  if (r.curva) {
    const chk = div.querySelector(".chk-geo");
    opcoesGrafico.geo = !!(chk && chk.checked);
    const desloca = r.metodo === "newton" ? 0 : 1; // numeração das iterações (Newton começa em k = 0)
    const pts = (r.pontos || []).map((x, i) => ({ x, y: r.tabela && r.tabela[i] ? r.tabela[i].fx : null, k: i + desloca }));
    const erros = (r.tabela || [])
      .filter((l) => l.erro_pct !== null && l.erro_pct !== undefined && l.erro_pct >= 0)
      .map((l) => [l.k ?? l.i, l.erro_pct]);
    const rotuloConstrucao = r.metodo === "newton" ? "reta tangente" : "reta secante";
    graficosAtuais = [criarGraficoFuncao(div.querySelector(".cv-f"), r.curva, pts, r.ok ? r.raiz : null, segmentosConstrucao(r), rotuloConstrucao)];
    if (temErros) graficosAtuais.push(criarGraficoErro(div.querySelector(".cv-e"), erros, r.tolerancia_pct));
    animar(graficosAtuais, 700);
    div.querySelector(".btn-replay").addEventListener("click", () => animar(graficosAtuais, 3500));
    if (chk) chk.addEventListener("change", () => { opcoesGrafico.geo = chk.checked; animar(graficosAtuais, 0); });
    div.querySelector(".btn-png-f").addEventListener("click", () => baixarCanvasPNG(div.querySelector(".cv-f"), `${r.metodo}-grafico.png`));
    const btnPngE = div.querySelector(".btn-png-e");
    if (btnPngE) btnPngE.addEventListener("click", () => baixarCanvasPNG(div.querySelector(".cv-e"), `${r.metodo}-erro.png`));
  }
  // Gauss: navegador de passos (abre só o passo atual; "Mostrar tudo" abre todos de uma vez)
  if (r.passos && r.passos.length) {
    const detalhes = div.querySelectorAll(".passo-gauss");
    ligarNavegacao(div, r.passos.length, (atual, tudo) => {
      detalhes.forEach((d, i) => (d.open = tudo || i === atual));
      if (!tudo) detalhes[atual].scrollIntoView({ behavior: reduzirMovimento ? "auto" : "smooth", block: "nearest" });
    });
  }
}

// Segmentos da "construção geométrica": tangentes (Newton) ou secantes (falsa posição)
function segmentosConstrucao(r) {
  const seg = [], t = r.tabela || [];
  if (r.metodo === "newton") {
    t.forEach((linha, i) => {
      if (linha.fx === null || linha.x_seguinte === null) return;
      const fxSeguinte = i + 1 < t.length ? t[i + 1].fx : (r.ok ? r.fraiz : null);
      seg.push({ x1: linha.x, y1: linha.fx, x2: linha.x_seguinte, y2: 0, tipo: "reta" });            // tangente
      seg.push({ x1: linha.x_seguinte, y1: 0, x2: linha.x_seguinte, y2: fxSeguinte || 0, tipo: "guia" }); // guia vertical
    });
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
    h += '<p class="tabela-acoes"><button type="button" class="secundario btn-csv-gauss">Baixar solução (CSV)</button></p>';
  }
  if (r.passos && r.passos.length) {
    h += `<h3 class="passo"><span class="num">P</span> Passo a passo (eliminação, matriz aumentada [A | b])</h3>`;
    h += barraNavegacao(r.passos.length);
    r.passos.forEach((p, i) => {
      h += `<details class="passo-gauss" data-idx="${i}"${i === 0 ? " open" : ""}><summary>${esc(p.titulo)}</summary>`;
      if (p.pivo) h += `<p class="nota">Pivô: linha ${p.pivo.linha}, coluna ${p.pivo.coluna}, valor <b>${fmt(p.pivo.valor)}</b></p>`;
      if (p.troca) h += `<p class="nota">Troca de linhas: L${p.troca[0]} ↔ L${p.troca[1]}</p>`;
      (p.operacoes || []).forEach((op) => {
        h += `<p class="nota"><b>${esc(op.formula_linha)}</b></p>`;
        h += '<ul class="contas-linha">' + op.contas.map((c) => `<li>${esc(c.formula)}</li>`).join("") + "</ul>";
      });
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
  if (r.substituicao && r.substituicao.length) {
    h += `<h3 class="passo"><span class="num">S</span> Substituição regressiva</h3>`;
    h += r.substituicao.map((s) => `<p class="formula-linha">${esc(s.formula)}</p>`).join("");
  }
  if (r.prova_real && r.prova_real.length) {
    h += `<h3 class="passo"><span class="num">R</span> Prova real (A·x comparado com b, equação original por equação)</h3>`;
    h += r.prova_real.map((p) => `<p class="formula-linha${p.ok ? "" : " prova-falhou"}">${esc(p.formula)}</p>`).join("");
  }
  if (r.ok && r.conclusao) {
    h += `<h3 class="passo"><span class="num">C</span> Conclusão</h3><p class="conclusao">${esc(r.conclusao)}</p>`;
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

function criarGraficoFuncao(cv, curva, pts, raiz, construcao, rotuloConstrucao) {
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
  // xmin/xmax/ymin/ymax são "let": o zoom por arraste muda essa janela e redesenha
  let xmin = curva[0][0], xmax = curva[curva.length - 1][0];
  const vistaInicial = { xmin, xmax, ymin, ymax }; // pra "resetar zoom"
  const X = (x) => mE + ((x - xmin) / (xmax - xmin)) * (W - mE - mD);
  const Y = (y) => H - mB - ((y - ymin) / (ymax - ymin)) * (H - mT - mB);
  const Xinv = (px) => xmin + ((px - mE) / (W - mE - mD)) * (xmax - xmin);
  const Yinv = (py) => ymin + ((H - mB - py) / (H - mT - mB)) * (ymax - ymin);

  let marcas = []; // posição em pixels de cada iteração (recalculada a cada desenho, pro hover)

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

    // Segmentos da curva dentro da janela atual: quebra onde f não existe, sai da janela ou cruza uma assíntota
    const segs = [];
    let anterior = null;
    curva.forEach((p) => {
      const y = p[1];
      if (y === null || p[0] < xmin || p[0] > xmax || y > ymax || y < ymin) { anterior = null; return; }
      const assintota = anterior && Math.sign(anterior[1]) !== Math.sign(y) && Math.abs(anterior[1]) > lim / 2 && Math.abs(y) > lim / 2;
      segs.push({ x: X(p[0]), y: Y(y), mover: !anterior || assintota });
      anterior = p;
    });

    // curva (traçada até a fração t/0.6)
    const n = Math.floor(segs.length * Math.min(1, t / 0.6));
    g.strokeStyle = cor("--grafico-linha"); g.lineWidth = 2; g.lineJoin = "round";
    g.beginPath();
    for (let i = 0; i < n; i++) (segs[i].mover ? g.moveTo(segs[i].x, segs[i].y) : g.lineTo(segs[i].x, segs[i].y));
    g.stroke();

    const progresso = t <= 0.6 ? 0 : (t - 0.6) / 0.4;

    // construção geométrica (tangentes / secantes), se o usuário pediu; o navegador de passos
    // pode limitar quantas aparecem (opcoesGrafico.limite), pra não "pular" direto pro final
    if (opcoesGrafico.geo && construcao.length) {
      let quantos = Math.ceil(construcao.length * progresso);
      if (opcoesGrafico.limite !== null && opcoesGrafico.limite !== undefined) quantos = Math.min(quantos, opcoesGrafico.limite);
      g.save();
      g.beginPath(); g.rect(mE, mT, W - mE - mD, H - mT - mB); g.clip();
      g.lineWidth = 1;
      construcao.slice(0, quantos).forEach((s) => {
        g.strokeStyle = s.tipo === "reta" ? cor("--grafico-ponto") : cor("--grafico-grade");
        g.setLineDash(s.tipo === "reta" ? [] : [3, 3]);
        g.beginPath(); g.moveTo(X(s.x1), Y(s.y1)); g.lineTo(X(s.x2), Y(s.y2)); g.stroke();
      });
      g.restore();
    }

    // Posição em pixels de cada iteração dentro da janela atual; aparecem uma a uma depois da curva
    marcas = pts.filter((p) => p.x >= xmin && p.x <= xmax).map((p) => {
      const yv = p.y === null ? 0 : Math.min(ymax, Math.max(ymin, p.y));
      return { px: X(p.x), py: Y(yv), k: p.k, x: p.x, y: p.y };
    });
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

    // legenda (identidade das séries: nunca só por cor, aqui também pela forma/traço)
    const legenda = [{ texto: "f(x)", cor: cor("--grafico-linha"), tipo: "linha" },
                     { texto: "iterações", cor: cor("--grafico-ponto"), tipo: "ponto" }];
    if (raiz !== null && raiz !== undefined) legenda.push({ texto: "raiz", cor: cor("--grafico-raiz"), tipo: "ponto" });
    if (opcoesGrafico.geo && construcao.length && rotuloConstrucao) {
      legenda.push({ texto: rotuloConstrucao, cor: cor("--grafico-ponto"), tipo: "tracejada" });
    }
    g.font = "11px system-ui, sans-serif";
    let ly = mT + 6;
    legenda.forEach((it) => {
      const lx = W - mD - 100;
      if (it.tipo === "ponto") {
        g.fillStyle = it.cor; g.beginPath(); g.arc(lx, ly, 3.5, 0, 7); g.fill();
      } else {
        g.strokeStyle = it.cor; g.lineWidth = 2; g.setLineDash(it.tipo === "tracejada" ? [3, 3] : []);
        g.beginPath(); g.moveTo(lx - 6, ly); g.lineTo(lx + 6, ly); g.stroke(); g.setLineDash([]);
      }
      g.fillStyle = cor("--grafico-texto");
      g.fillText(it.texto, lx + 11, ly + 4);
      ly += 15;
    });
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
  ligarZoom(cv, { mE, mD, mT, mB, W, H }, g, desenhar, {
    inverterX: Xinv, inverterY: Yinv,
    aplicarZoom: (a, b, c, d) => { xmin = a; xmax = b; ymin = c; ymax = d; },
    resetarZoom: () => { ({ xmin, xmax, ymin, ymax } = vistaInicial); },
  });
  return { desenhar };
}

// Erro relativo (%) por iteração, em escala log; tolPct (se dado) desenha a linha de referência ε
function criarGraficoErro(cv, erros, tolPct) {
  const { g, W, H } = prepararCanvas(cv);
  const mE = 58, mD = 14, mT = 22, mB = 30;
  if (erros.length < 1) {
    return { desenhar() { g.clearRect(0, 0, W, H); g.fillStyle = cor("--grafico-texto"); g.fillText("Sem dados de erro para mostrar", 20, 30); } };
  }
  const temTol = typeof tolPct === "number" && Number.isFinite(tolPct) && tolPct > 0;
  const ltol = temTol ? Math.log10(tolPct) : null;
  const ls = erros.map((e) => Math.log10(Math.max(e[1], 1e-17)));
  let lmin = Math.floor(Math.min(...ls, ...(temTol ? [ltol] : []))), lmax = Math.ceil(Math.max(...ls, ...(temTol ? [ltol] : [])));
  if (lmax === lmin) lmax += 1;
  let kmin = erros[0][0], kmax = erros[erros.length - 1][0];
  const vistaInicial = { xmin: kmin, xmax: kmax, ymin: lmin, ymax: lmax }; // pra "resetar zoom"
  const X = (k) => mE + ((k - kmin) / Math.max(kmax - kmin, 1)) * (W - mE - mD);
  const Y = (l) => H - mB - ((l - lmin) / (lmax - lmin)) * (H - mT - mB);
  const Xinv = (px) => kmin + ((px - mE) / (W - mE - mD)) * Math.max(kmax - kmin, 1);
  const Yinv = (py) => lmin + ((H - mB - py) / (H - mT - mB)) * (lmax - lmin);

  let pos = [];

  function desenhar(t) {
    g.clearRect(0, 0, W, H);
    g.strokeStyle = cor("--grafico-grade"); g.fillStyle = cor("--grafico-texto"); g.lineWidth = 1;
    const passo = Math.max(1, Math.ceil((lmax - lmin) / 6));
    for (let l = lmin; l <= lmax; l += passo) {
      g.beginPath(); g.moveTo(mE, Y(l)); g.lineTo(W - mD, Y(l)); g.stroke();
      const l2 = Math.round(l * 10) / 10; // zoom pode deixar a escala fracionária
      g.fillText("1e" + (Number.isInteger(l2) ? l2 : l2.toFixed(1)), 6, Y(l) + 4);
    }
    g.fillText("k = " + fmt(Number(kmin.toPrecision(4))), mE, H - 14);
    g.fillText("k = " + fmt(Number(kmax.toPrecision(4))), W - mD - 54, H - 14);
    g.font = "italic 12px Georgia, serif";
    g.fillText("erro", mE + 6, mT - 6); g.fillText("iteração k", W / 2 - 24, H - 3);
    g.font = "12px system-ui, sans-serif";

    // Pontos dentro da janela atual (recalculado a cada desenho, pro zoom e pro hover)
    pos = erros
      .filter((e) => e[0] >= kmin && e[0] <= kmax && Math.log10(Math.max(e[1], 1e-17)) >= lmin && Math.log10(Math.max(e[1], 1e-17)) <= lmax)
      .map((e) => ({ px: X(e[0]), py: Y(Math.log10(Math.max(e[1], 1e-17))), k: e[0], erro: e[1] }));
    const n = Math.max(1, Math.ceil(pos.length * t));
    g.strokeStyle = cor("--grafico-linha"); g.lineWidth = 2; g.lineJoin = "round";
    g.beginPath();
    for (let i = 0; i < n; i++) (i ? g.lineTo(pos[i].px, pos[i].py) : g.moveTo(pos[i].px, pos[i].py));
    g.stroke();
    g.fillStyle = cor("--grafico-linha");
    for (let i = 0; i < n; i++) { g.beginPath(); g.arc(pos[i].px, pos[i].py, 3, 0, 7); g.fill(); }

    // linha de referência da tolerância ε: mostra visualmente onde o erro "cruzou" e parou
    if (temTol && ltol >= lmin && ltol <= lmax) {
      g.save();
      g.strokeStyle = cor("--grafico-raiz"); g.lineWidth = 1.4; g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(mE, Y(ltol)); g.lineTo(W - mD, Y(ltol)); g.stroke();
      g.setLineDash([]);
      g.fillStyle = cor("--grafico-raiz"); g.font = "11px system-ui, sans-serif";
      g.fillText("ε = " + fmt(Number(tolPct.toPrecision(3))) + "%", W - mD - 92, Y(ltol) - 5);
      g.restore();
    }
  }
  ligarDica(cv, (mx, my) => {
    let melhor = null, dist = 14;
    pos.forEach((p) => {
      const d = Math.hypot(p.px - mx, p.py - my);
      if (d < dist) { dist = d; melhor = `k = ${p.k}   erro = ${fmt(p.erro)}`; }
    });
    return melhor;
  });
  ligarZoom(cv, { mE, mD, mT, mB, W, H }, g, desenhar, {
    inverterX: Xinv, inverterY: Yinv,
    aplicarZoom: (a, b, c, d) => { kmin = a; kmax = b; lmin = c; lmax = d; },
    resetarZoom: () => { ({ xmin: kmin, xmax: kmax, ymin: lmin, ymax: lmax } = vistaInicial); },
  });
  return { desenhar };
}

// Dica flutuante ao passar o mouse sobre um ponto do gráfico
function ligarDica(cv, procurar) {
  const dica = $("#dica");
  cv.addEventListener("mousemove", (e) => {
    if (cv.classList.contains("arrastando-zoom")) { dica.hidden = true; return; }
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

// Zoom por arraste: seleciona um retângulo sobre o gráfico e dá zoom nessa região.
// Duplo-clique (ou o botão "Resetar zoom" na figura) volta à janela original.
function ligarZoom(cv, caixa, g, desenhar, { inverterX, inverterY, aplicarZoom, resetarZoom }) {
  const { mE, mD, mT, mB, W, H } = caixa;
  const botaoReset = cv.closest("figure")?.querySelector(".btn-reset-zoom");
  let ix = 0, iy = 0;
  const limitar = (px, py) => [Math.min(Math.max(px, mE), W - mD), Math.min(Math.max(py, mT), H - mB)];
  const posRelativa = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  function mostrarSelecao(x0, y0, x1, y1) {
    desenhar(1);
    g.save();
    g.globalAlpha = 0.15; g.fillStyle = cor("--grafico-linha");
    g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    g.globalAlpha = 1; g.strokeStyle = cor("--grafico-linha"); g.lineWidth = 1; g.setLineDash([4, 3]);
    g.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    g.restore();
  }
  function aoMover(e) {
    const [px, py] = limitar(...posRelativa(e));
    mostrarSelecao(ix, iy, px, py);
  }
  function aoSoltar(e) {
    window.removeEventListener("mousemove", aoMover);
    window.removeEventListener("mouseup", aoSoltar);
    cv.classList.remove("arrastando-zoom");
    const [px, py] = limitar(...posRelativa(e));
    if (Math.abs(px - ix) < 12 || Math.abs(py - iy) < 12) { desenhar(1); return; } // arraste pequeno demais: ignora
    const xa = inverterX(ix), xb = inverterX(px), ya = inverterY(iy), yb = inverterY(py);
    aplicarZoom(Math.min(xa, xb), Math.max(xa, xb), Math.min(ya, yb), Math.max(ya, yb));
    desenhar(1);
    if (botaoReset) botaoReset.hidden = false;
  }
  cv.addEventListener("mousedown", (e) => {
    const [px, py] = posRelativa(e);
    if (px < mE || px > W - mD || py < mT || py > H - mB) return;
    ix = px; iy = py;
    cv.classList.add("arrastando-zoom");
    window.addEventListener("mousemove", aoMover);
    window.addEventListener("mouseup", aoSoltar);
    e.preventDefault();
  });
  function resetar() {
    resetarZoom();
    desenhar(1);
    if (botaoReset) botaoReset.hidden = true;
  }
  cv.addEventListener("dblclick", resetar);
  if (botaoReset) botaoReset.addEventListener("click", resetar);
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
// Download: gráfico em PNG e tabelas em CSV (pra colar no relatório)
// ---------------------------------------------------------------

// Baixa um <canvas> como arquivo PNG
function baixarCanvasPNG(canvas, nomeArquivo) {
  const link = document.createElement("a");
  link.download = nomeArquivo;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

// Monta um texto CSV (vírgula como separador, aspas quando necessário) a partir de linhas de objeto
function linhasParaCSV(cabecalhos, chaves, linhas) {
  const campo = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(typeof v === "object" && "valor" in v ? v.valor : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const corpo = linhas.map((l) => chaves.map((k) => campo(l[k])).join(",")).join("\n");
  return cabecalhos.map(campo).join(",") + "\n" + corpo;
}

// Baixa um texto como arquivo (usado pelo CSV). BOM no início: Excel mostra acentos certos.
function baixarTexto(nomeArquivo, conteudo, tipo) {
  const blob = new Blob(["﻿" + conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
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
  const sig = $("#gauss-sig").value.trim();
  return {
    A, b,
    pivotear: $("#gauss-pivotear").checked,
    modo_numero: $("#gauss-modo").value,
    casas_sig: sig === "" ? null : parseInt(sig, 10),
  };
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

$("#gauss-modo").addEventListener("change", () => {
  const ehFracao = $("#gauss-modo").value === "fracao";
  $("#gauss-sig").disabled = ehFracao;
  if (ehFracao) $("#gauss-sig").value = "";
});
$("#gauss-n").addEventListener("change", () => {
  const n = Math.min(10, Math.max(1, parseInt($("#gauss-n").value, 10) || 1));
  $("#gauss-n").value = n;
  montarGrade(n);
});
$("#gauss-limpar").addEventListener("click", () => {
  montarGrade(parseInt($("#gauss-n").value, 10) || 1);
  $("#gauss-pivotear").checked = true;
  $("#gauss-modo").value = "decimal";
  $("#gauss-sig").disabled = false;
  $("#gauss-sig").value = "";
  vazio($("#res-gauss"), "Resolver");
});
$("#form-gauss").addEventListener("submit", (e) => { e.preventDefault(); resolverGauss(); });
montarExemplos("#ex-gauss", EX_GAUSS, (v) => {
  $("#gauss-n").value = v.A.length;
  montarGrade(v.A.length, v.A, v.b);
  $("#gauss-pivotear").checked = v.pivotear !== undefined ? v.pivotear : true;
  $("#gauss-modo").value = v.modo_numero || "decimal";
  $("#gauss-modo").dispatchEvent(new Event("change"));
  $("#gauss-sig").value = v.casas_sig !== undefined && v.casas_sig !== null ? v.casas_sig : "";
  resolverGauss();
});
montarGrade(3, EX_GAUSS[1][2].A, EX_GAUSS[1][2].b);
vazio($("#res-gauss"), "Resolver");
