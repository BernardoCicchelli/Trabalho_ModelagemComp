"""
metodos.py - Métodos numéricos do trabalho de Cálculo Numérico.

Conteúdo:
  1. Leitura segura de funções e números digitados pelo usuário.
  2. Falsa posição.
  3. Newton-Raphson.
  4. Eliminação de Gauss com pivoteamento parcial.

Regra do arquivo: cada método é UMA função. Quando algo dá errado, a função
levanta ErroCalculo com três partes: o que aconteceu, por que o método não
aceita o caso (teoria) e o que o usuário pode fazer.

Cada método devolve um HISTÓRICO estruturado (lista de passos com todos os
valores intermediários e, em cada passo, uma string "formula" já com os
números substituídos). O front-end (static/script.js) só renderiza esse
histórico: nenhuma conta é refeita em JavaScript.
"""

import math
import re
from fractions import Fraction

import numpy as np
import sympy as sp
from sympy.parsing.sympy_parser import parse_expr, standard_transformations


# ----------------------------------------------------------------------
# Erro "amigável": vira um JSON {ok: false, titulo, explicacao, dica}
# ----------------------------------------------------------------------
class ErroCalculo(Exception):
    def __init__(self, titulo, explicacao, dica, extra=None):
        super().__init__(titulo)
        self.titulo = titulo
        self.explicacao = explicacao
        self.dica = dica
        # 'extra' guarda dados úteis mesmo na falha (tabela, gráfico...)
        self.extra = extra or {}


# ----------------------------------------------------------------------
# 1. LEITURA SEGURA
# ----------------------------------------------------------------------
X = sp.Symbol("x", real=True)

# Lista branca: são os ÚNICOS nomes aceitos. Qualquer outro é recusado.
NOMES_PERMITIDOS = {
    "x": X,
    "sin": sp.sin, "sen": sp.sin, "cos": sp.cos, "tan": sp.tan,
    "asin": sp.asin, "acos": sp.acos, "atan": sp.atan,
    "sinh": sp.sinh, "cosh": sp.cosh, "tanh": sp.tanh,
    "exp": sp.exp, "log": sp.log, "ln": sp.log,
    "log10": lambda u: sp.log(u) / sp.log(10),
    "sqrt": sp.sqrt, "abs": sp.Abs,
    "pi": sp.pi, "e": sp.E,
}

TAMANHO_MAXIMO = 200
CARACTERES_OK = re.compile(r"^[0-9A-Za-z+\-*/^().,\s]+$")


# Tokens: número, nome (letras/dígitos), operador, parênteses e vírgula
TOKEN = re.compile(r"(?P<num>\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|(?P<id>[A-Za-z][A-Za-z0-9]*)"
                   r"|(?P<op>\*\*|[+\-*/])|(?P<par>[()])|(?P<vir>,)")
FUNCOES = {n for n, v in NOMES_PERMITIDOS.items() if n not in ("x", "pi", "e")}
LISTA_FUNCOES = ("sin/sen, cos, tan, asin, acos, atan, sinh, cosh, tanh, exp, log/ln, log10, sqrt, abs")


def separar_nome(palavra):
    """Quebra 'xcos' em ['x', 'cos'] usando só nomes permitidos (None se não der)."""
    if palavra == "":
        return []
    for nome in sorted(NOMES_PERMITIDOS, key=len, reverse=True):
        if palavra.startswith(nome):
            resto = separar_nome(palavra[len(nome):])
            if resto is not None:
                return [nome] + resto
    return None


def sintaxe(titulo, explicacao, dica="Exemplo válido: x**3 - 2*x + cos(x)"):
    return ErroCalculo(titulo, explicacao, dica)


def tokenizar(texto, permitir_x):
    """Divide o texto em tokens (tipo, valor), recusando nomes desconhecidos."""
    tokens, pos = [], 0
    while pos < len(texto):
        if texto[pos].isspace():
            pos += 1
            continue
        m = TOKEN.match(texto, pos)
        if not m:
            raise sintaxe("Caractere inesperado", f"Não entendi o símbolo '{texto[pos]}' na posição {pos + 1}.")
        pos = m.end()
        if m.group("num"):
            tokens.append(("NUM", m.group("num")))
        elif m.group("id"):
            partes = separar_nome(m.group("id"))
            if partes is None or (not permitir_x and "x" in partes):
                nome = m.group("id")
                raise ErroCalculo(
                    "Nome desconhecido: '" + nome + "'",
                    "O nome '" + nome + "' não é aceito. Funções permitidas: " + LISTA_FUNCOES +
                    "; constantes: pi, e; variável: x" + ("" if permitir_x else " (não vale neste campo)") + ".",
                    "Confira a digitação. Multiplicação precisa de * entre números e nomes que não " +
                    "sejam colados (ex.: 2*x).")
            for nome in partes:
                tokens.append(("FUNC" if nome in FUNCOES else "VAR", nome))
        elif m.group("op"):
            tokens.append(("OP", m.group("op")))
        elif m.group("par"):
            tokens.append(("LP" if m.group("par") == "(" else "RP", m.group("par")))
        else:
            tokens.append(("VIR", ","))
    return tokens


def validar_tokens(tokens):
    """Procura erros comuns de digitação e explica cada um."""
    nivel = 0
    for i, (tipo, valor) in enumerate(tokens):
        ant = tokens[i - 1] if i > 0 else None
        prox = tokens[i + 1] if i + 1 < len(tokens) else None
        if tipo == "VIR":
            raise sintaxe("Vírgula na expressão",
                          "Dentro da função a vírgula não é aceita. Para decimais use ponto (1.5) e para "
                          "outras bases use log10(x) em vez de log(x, 10).",
                          "Troque a vírgula por ponto: 1.5*x")
        if tipo == "LP":
            nivel += 1
            if prox and prox[0] == "RP":
                if ant and ant[0] == "FUNC":
                    raise sintaxe(f"Função '{ant[1]}' sem argumento",
                                  f"Escreveu {ant[1]}() com os parênteses vazios. Toda função precisa de um argumento.",
                                  f"Escreva {ant[1]}(x), por exemplo.")
                raise sintaxe("Parênteses vazios", "Há um par de parênteses sem nada dentro: ().")
        if tipo == "RP":
            nivel -= 1
            if nivel < 0:
                raise sintaxe("Parêntese ')' sem abertura", "Há um ')' que não tem '(' correspondente.")
        if tipo == "FUNC" and not (prox and prox[0] == "LP"):
            raise sintaxe(f"Função '{valor}' sem parênteses",
                          f"Depois de '{valor}' é preciso abrir parênteses com o argumento.",
                          f"Escreva {valor}(x).")
        if tipo == "NUM" and ant and ant[0] in ("NUM", "VAR", "RP"):
            raise sintaxe("Falta um operador", f"Entre '{ant[1]}' e '{valor}' falta um operador (+, -, *, /).",
                          "Coloque o operador, por exemplo 2*3 ou 2 + 3.")
        if tipo == "OP":
            if valor in ("*", "/", "**"):
                if ant is None or ant[0] == "LP":
                    raise sintaxe("Operador no lugar errado", f"A expressão não pode começar (ou abrir parêntese) com '{valor}'.")
                if ant[0] == "OP":
                    raise sintaxe("Dois operadores seguidos", f"Aparece '{ant[1]}' seguido de '{valor}'. Falta um número ou nome entre eles.")
            if prox is None or prox[0] in ("RP",):
                raise sintaxe("Expressão termina em operador", f"Depois de '{valor}' falta um número, nome ou parêntese.")
    if nivel > 0:
        raise sintaxe("Parêntese '(' não foi fechado", f"Faltam {nivel} parêntese(s) ')' para fechar a expressão.")


def analisar_texto(texto, permitir_x=True):
    """Transforma um texto em expressão sympy, sem usar eval livre."""
    if texto is None or str(texto).strip() == "":
        raise ErroCalculo(
            "Campo vazio",
            "Nenhuma expressão foi digitada.",
            "Digite uma expressão, por exemplo: cos(x) - x")
    texto = str(texto).strip()

    if len(texto) > TAMANHO_MAXIMO:
        raise ErroCalculo(
            "Expressão grande demais",
            f"O texto tem mais de {TAMANHO_MAXIMO} caracteres. Esse limite existe por segurança.",
            "Use uma expressão mais curta.")

    if not CARACTERES_OK.match(texto):
        raise ErroCalculo(
            "Caractere não permitido",
            "A expressão contém símbolos que não são aceitos (só números, letras, + - * / ^ ( ) . ,).",
            "Remova colchetes, aspas, underscores e outros símbolos.")

    texto = texto.replace("^", "**")

    # Bloqueia torres de potência como 9**9**9 (o sympy tentaria calcular um número gigante).
    if re.search(r"\*\*\s*[\w.]+\s*\*\*", texto):
        raise ErroCalculo(
            "Torre de potências bloqueada",
            "Expressões como 9**9**9 geram números gigantes e travariam o servidor.",
            "Use parênteses e expoentes menores, por exemplo (x**2)**3.")
    for expoente in re.findall(r"\*\*\s*\(?\s*(\d+)", texto):
        if int(expoente) > 1000:
            raise ErroCalculo(
                "Expoente grande demais",
                "Expoentes acima de 1000 são bloqueados por segurança.",
                "Use um expoente menor.")

    tokens = tokenizar(texto, permitir_x)
    validar_tokens(tokens)

    # Multiplicação implícita: 2x -> 2*x, 1cos(x) -> 1*cos(x), (x+1)(x-1) -> (x+1)*(x-1)
    partes = []
    for i, (tipo, valor) in enumerate(tokens):
        if i > 0:
            ant = tokens[i - 1][0]
            if ant in ("NUM", "VAR", "RP") and tipo in ("VAR", "FUNC", "LP"):
                partes.append("*")
        partes.append(valor)
    texto_final = " ".join(partes)

    try:
        expr = parse_expr(texto_final, local_dict=NOMES_PERMITIDOS,
                          transformations=standard_transformations, evaluate=True)
        expr = sp.sympify(expr)
    except Exception:
        raise sintaxe("Sintaxe inválida", "Não foi possível interpretar a expressão '" + texto + "'.",
                      "Confira parênteses e operadores. Exemplo válido: x**3 - x - 2")
    if not isinstance(expr, sp.Expr):
        raise sintaxe("Sintaxe inválida", "A expressão '" + texto + "' não resulta em um único valor.")
    if expr.has(sp.zoo, sp.nan, sp.oo, -sp.oo):
        raise sintaxe("Divisão por zero na expressão",
                      "A expressão contém uma divisão por zero ou um log de zero que não depende de x (resulta em infinito).",
                      "Revise a expressão.")
    if expr.has(sp.I):
        raise sintaxe("Valor complexo na expressão",
                      "A expressão contém um valor não real (por exemplo raiz quadrada de número negativo constante).",
                      "Use apenas funções reais.")
    return expr


def ler_funcao(texto):
    """Lê f(x). Recusa funções constantes (não há o que resolver)."""
    expr = analisar_texto(texto)
    if X not in expr.free_symbols:
        raise ErroCalculo(
            "Função constante",
            "f(x) não depende de x. Se for diferente de zero nunca tem raiz; se for zero, "
            "todo x é raiz. Em ambos os casos o método não faz sentido.",
            "Digite uma função que dependa de x, por exemplo x**2 - 2.")
    return expr


def criar_avaliador(expr):
    """Devolve uma função python f(x) -> float, ou None se f(x) não é um real finito."""
    try:
        funcao = sp.lambdify(X, expr, "numpy")
    except Exception:
        funcao = None

    def avaliar(valor):
        if funcao is None:
            return None
        try:
            with np.errstate(all="ignore"):
                r = funcao(np.float64(valor))
            r = complex(r)
            if r.imag != 0 or not math.isfinite(r.real):
                return None
            return r.real
        except Exception:
            return None
    return avaliar


def ler_numero(texto, nome):
    """Aceita 0,5 ; 1e-8 ; 1/3 ; pi/2."""
    if texto is None or str(texto).strip() == "":
        raise ErroCalculo("Campo vazio", f"O campo '{nome}' está vazio.", "Preencha o campo com um número.")
    t = str(texto).strip().replace(",", ".")
    try:
        expr = analisar_texto(t, permitir_x=False)
        valor = float(expr.evalf())
    except ErroCalculo as e:
        raise ErroCalculo("Campo não numérico",
                          f"O campo '{nome}' contém '{texto}', que não é um número válido ({e.titulo.lower()}: {e.explicacao})",
                          "Use números como 0,5 ; 1e-8 ; 1/3 ; pi/2.")
    except Exception:
        raise ErroCalculo("Campo não numérico",
                          f"O campo '{nome}' contém '{texto}', que não é um número real.",
                          "Use números como 0,5 ; 1e-8 ; 1/3 ; pi/2.")
    if not math.isfinite(valor):
        raise ErroCalculo("Número inválido", f"O campo '{nome}' não é um número finito.", "Digite um valor finito.")
    return valor


def ler_fracao(texto, nome):
    """Igual a ler_numero, mas devolve uma fractions.Fraction EXATA (para o modo 'frações exatas' do Gauss)."""
    if texto is None or str(texto).strip() == "":
        raise ErroCalculo("Campo vazio", f"O campo '{nome}' está vazio.", "Preencha o campo com um número.")
    t = str(texto).strip().replace(",", ".")
    expr = analisar_texto(t, permitir_x=False)
    aproximado = float(expr.evalf(30))
    if not math.isfinite(aproximado):
        raise ErroCalculo("Número inválido", f"O campo '{nome}' não é um número finito.", "Digite um valor finito.")
    valor = expr if expr.is_Rational else sp.nsimplify(expr.evalf(30), rational=True)
    exato = getattr(valor, "is_Rational", False) and abs(float(valor) - aproximado) <= 1e-9 * max(1.0, abs(aproximado))
    if not exato:
        raise ErroCalculo(
            "Valor não é uma fração exata",
            f"O campo '{nome}' contém '{texto}', que não representa um número racional exato "
            "(π, e e raízes irracionais não têm fração exata — só números inteiros e frações do tipo p/q).",
            "No modo 'frações exatas', use números racionais: 1/3, 0,5, 7, etc. Ou troque para o modo decimal.")
    return Fraction(int(valor.p), int(valor.q))


def ler_tolerancia(texto):
    tol = ler_numero(texto, "tolerância")
    if tol <= 0 or tol < 1e-15:
        raise ErroCalculo(
            "Tolerância inválida",
            "A tolerância deve ser positiva e não menor que cerca de 1e-15: abaixo disso ela fica "
            "menor que o erro de arredondamento do computador (epsilon de máquina ≈ 2.2e-16) e o critério de parada nunca seria atingido.",
            "Use algo como 1e-6 ou 1e-8.")
    return tol


def ler_max_iter(texto):
    n = ler_numero(texto, "máximo de iterações")
    if n != int(n) or n <= 0:
        raise ErroCalculo("Máximo de iterações inválido",
                          "O número máximo de iterações precisa ser um inteiro positivo.",
                          "Use um valor como 50 ou 100.")
    if n > 10000:
        raise ErroCalculo("Máximo de iterações grande demais",
                          "O limite deste programa é 10000 iterações.", "Use um valor menor.")
    return int(n)


# Erro usado na falsa posição: ERRO RELATIVO (fração)  |x_k - x_(k-1)| / |x_k|
NOME_ERRO = "|x_k − x_(k−1)| / |x_k|"
# Erro usado no Newton: mesma ideia, mas em PORCENTAGEM (como no pseudocódigo do slide)
NOME_ERRO_NEWTON = "|x_(i+1) − x_i| / |x_(i+1)| × 100 (%)"


def calcular_erro(xk, x_anterior):
    """Erro relativo (fração) entre dois valores. Devolve None se x_anterior for None."""
    if x_anterior is None:
        return None
    if xk == 0:                       # evita dividir por zero: usa o erro absoluto
        return abs(xk - x_anterior)
    return abs(xk - x_anterior) / abs(xk)


def ordem_convergencia(xs):
    """p = ln(d_{k+1}/d_k) / ln(d_k/d_{k-1}), com d_k = |x_{k+1} - x_k|."""
    ds = [abs(xs[i + 1] - xs[i]) for i in range(len(xs) - 1)]
    ds = [d for d in ds if d > 1e-13]  # descarta ruído de arredondamento
    if len(ds) < 3:
        return None
    d0, d1, d2 = ds[-3], ds[-2], ds[-1]
    try:
        den = math.log(d1 / d0)
        if den == 0:
            return None
        p = math.log(d2 / d1) / den
        return p if math.isfinite(p) else None
    except (ValueError, ZeroDivisionError):
        return None


def gerar_curva(avaliar, inicio, fim, n=600):
    """Pontos [x, f(x)] para o gráfico (None onde f não existe)."""
    if fim <= inicio:
        fim = inicio + 1
    passo = (fim - inicio) / n
    return [[inicio + i * passo, avaliar(inicio + i * passo)] for i in range(n + 1)]


# ----------------------------------------------------------------------
# Formatação "em português" dos números dentro das fórmulas substituídas
# (vírgula decimal). Usada só nos textos; os campos numéricos do JSON
# continuam números normais (o front-end decide como exibi-los).
# ----------------------------------------------------------------------
def fmt_fracao(fr):
    if fr.denominator == 1:
        return str(fr.numerator)
    return f"{fr.numerator}/{fr.denominator}"


def fmt_br(v, sig=6):
    """Formata um número para as strings de fórmula: vírgula decimal, poucos dígitos."""
    if v is None:
        return "—"
    if isinstance(v, Fraction):
        return fmt_fracao(v)
    if v == 0:
        return "0"
    a = abs(v)
    if a < 1e-4 or a >= 1e7:
        texto = f"{float(v):.{max(sig - 1, 0)}e}"
        base, expo = texto.split("e")
        base = base.rstrip("0").rstrip(".") if "." in base else base
        return f"{base}e{int(expo):+d}".replace(".", ",")
    texto = f"{float(v):.{sig}g}"
    return texto.replace(".", ",")


def fmt_br_op(v):
    """fmt_br, mas entre parênteses quando for fração não-inteira ou negativo (legibilidade dentro de contas)."""
    texto = fmt_br(v)
    precisa_parenteses = isinstance(v, Fraction) and v.denominator != 1
    if not precisa_parenteses:
        try:
            precisa_parenteses = v < 0
        except TypeError:
            pass
    return f"({texto})" if precisa_parenteses else texto


def arredondar_sig(v, casas):
    """Arredonda v para 'casas' algarismos significativos (modo do Gauss). None/0/Fraction passam direto."""
    if casas is None or isinstance(v, Fraction) or v == 0:
        return v
    d = casas - 1 - math.floor(math.log10(abs(v)))
    fator = 10.0 ** d
    return round(v * fator) / fator


# ----------------------------------------------------------------------
# 2. FALSA POSIÇÃO
# ----------------------------------------------------------------------
def verificar_continuidade(avaliar, a, b):
    """Procura sinais de descontinuidade/domínio em [a, b]."""
    # (1) amostragem: se algum ponto dá nan/inf, f não está definida ali
    for xi in np.linspace(a, b, 1001):
        if avaliar(float(xi)) is None:
            raise ErroCalculo(
                "Função não definida / descontínua no intervalo",
                f"Passo 1: o programa testou vários pontos dentro de [{a:g}, {b:g}] e achou um onde f "
                f"não existe: em x ≈ {xi:.6g}, f(x) não é um número real finito. "
                "Passo 2: o Teorema de Bolzano (do valor intermediário) exige f CONTÍNUA em TODO o "
                "intervalo [a, b], sem exceção nenhuma. "
                "Passo 3: como há um ponto sem continuidade, a mudança de sinal entre f(a) e f(b) deixa "
                "de garantir raiz — o 'cruzamento' pode ser só uma assíntota, não um zero de f.",
                "Escolha um intervalo que não contenha pontos onde f não existe (divisão por zero, log de não positivo...).")
    # (2) bisseção interna: numa raiz verdadeira |f| fica ~0; numa assíntota fica enorme
    lo, hi, flo = a, b, avaliar(a)
    for _ in range(200):
        mid = (lo + hi) / 2
        fm = avaliar(mid)
        if fm is None:
            lo = hi = mid
            break
        if fm == 0:
            lo = hi = mid
            break
        if flo * fm < 0:
            hi = mid
        else:
            lo, flo = mid, fm
        if hi - lo <= 1e-15 * max(1.0, abs(mid)):
            break
    c = (lo + hi) / 2
    fc = avaliar(c)
    if fc is None or abs(fc) > 1e-3:
        raise ErroCalculo(
            "A mudança de sinal não é uma raiz (função descontínua)",
            "Passo 1: f(a) e f(b) têm sinais opostos, então o programa foi bissectando o intervalo pra "
            "conferir se existe mesmo uma raiz ali. "
            f"Passo 2: ao fechar o intervalo bem de perto, em x ≈ {c:.6g}, o valor de |f| continua "
            f"grande ({'indefinido' if fc is None else format(abs(fc), '.3g')}) em vez de ir a zero. "
            "Passo 3: numa raiz de verdade |f| teria que se aproximar de zero conforme o intervalo "
            "encolhe; como isso não acontece, o que parecia mudança de sinal é, na verdade, uma "
            "assíntota ou um salto — e o Teorema de Bolzano exige f CONTÍNUA, hipótese que falha aqui.",
            "Escolha um intervalo onde f seja contínua (por exemplo, sem conter o ponto da assíntota).")


def falsa_posicao(texto_f, texto_a, texto_b, texto_tol, texto_max):
    """Chama o método; se falhar depois de ter a curva, anexa o gráfico ao erro."""
    ctx = {}
    try:
        return _falsa_posicao(texto_f, texto_a, texto_b, texto_tol, texto_max, ctx)
    except ErroCalculo as e:
        if "curva" in ctx and "curva" not in e.extra:
            e.extra.update({"metodo": "falsa_posicao", "curva": ctx["curva"], "pontos": [], "tabela": []})
        raise


def _falsa_posicao(texto_f, texto_a, texto_b, texto_tol, texto_max, ctx):
    expr = ler_funcao(texto_f)
    avaliar = criar_avaliador(expr)
    a0 = ler_numero(texto_a, "a")
    b0 = ler_numero(texto_b, "b")
    tol = ler_tolerancia(texto_tol)
    max_iter = ler_max_iter(texto_max)

    margem = (b0 - a0) * 0.1 if b0 > a0 else 1
    curva = gerar_curva(avaliar, a0 - margem, b0 + margem)
    ctx["curva"] = curva

    if a0 >= b0:
        raise ErroCalculo(
            "Intervalo inválido (a ≥ b)",
            f"Passo 1: a falsa posição parte de um INTERVALO [xl, xu], não de um ponto só. "
            f"Passo 2: aqui xl = {a0:g} e xu = {b0:g}, ou seja xl não é menor que xu. "
            "Passo 3: sem xl < xu não existe um intervalo de verdade para aplicar o Teorema de Bolzano "
            "nem para traçar a reta secante entre (xl, f(xl)) e (xu, f(xu)).",
            "Troque os valores de a e b para que a seja menor que b.")

    fa, fb = avaliar(a0), avaliar(b0)
    for nome, v, fv in (("a", a0, fa), ("b", b0, fb)):
        if fv is None:
            raise ErroCalculo(
                f"f({nome}) fora do domínio",
                f"Passo 1: para começar, o programa precisa calcular f({nome}) = f({v:g}). "
                "Passo 2: esse valor não é um número real finito — pode ser log de número ≤ 0, raiz "
                "quadrada de negativo ou divisão por zero, por exemplo. "
                "Passo 3: como o método usa f(a) e f(b) só para checar o sinal e montar a reta secante, "
                "se um dos dois nem existe não há como nem começar a iterar.",
                "Escolha um intervalo inteiramente dentro do domínio de f.")

    avisos = []
    if fa == 0 or fb == 0:
        raiz = a0 if fa == 0 else b0
        return {
            "ok": True, "metodo": "falsa_posicao", "convergiu": True, "raiz": raiz, "fraiz": 0.0,
            "iteracoes": 0, "tabela": [], "ordem": None,
            "nome_erro": NOME_ERRO, "curva": curva, "pontos": [raiz],
            "avisos": [{"titulo": "O extremo já é raiz",
                        "explicacao": f"f({raiz:g}) = 0: o próprio extremo é a raiz, então não foi preciso iterar. "
                                      "Isto não é um erro."}],
            "conclusao": f"O extremo {fmt_br(raiz)} já é raiz exata (f = 0). Nenhuma iteração foi necessária.",
            "mensagem": f"O extremo {raiz:g} já é raiz exata (f = 0). Nenhuma iteração necessária.",
        }

    # (a) hipóteses da teoria: continuidade e mudança de sinal
    for xi in np.linspace(a0, b0, 1001):
        if avaliar(float(xi)) is None:
            verificar_continuidade(avaliar, a0, b0)  # levanta o erro explicativo
    if fa * fb > 0:
        raise ErroCalculo(
            "f(xl)·f(xu) ≥ 0: não há garantia de raiz no intervalo",
            f"Passo 1: o programa calculou f(xl) = {fa:.4g} e f(xu) = {fb:.4g}. "
            "Passo 2: os dois têm o MESMO sinal, ou seja f(xl)·f(xu) > 0. "
            "Passo 3: o Teorema de Bolzano só garante uma raiz entre xl e xu quando f é contínua E "
            "f(xl)·f(xu) < 0 (sinais opostos) — e essa segunda condição falhou aqui. "
            "Passo 4: isso não prova que não exista raiz no intervalo: pode haver um número par de "
            "raízes (a curva cruza o eixo duas vezes e volta ao mesmo sinal) ou a curva apenas tocar o "
            "eixo sem cruzar.",
            "Escolha xl e xu onde f tenha sinais opostos (olhe o gráfico abaixo).")
    verificar_continuidade(avaliar, a0, b0)

    # (b) iteração: cada linha mostra xl, xu, xr = (xl·f(xu) − xu·f(xl)) / (f(xu) − f(xl))
    a, b = a0, b0
    x_anterior = None
    tabela, xs = [], []
    convergiu = False
    criterio = None
    x = fx = None
    for k in range(1, max_iter + 1):
        x = (a * fb - b * fa) / (fb - fa)          # ponto onde a reta (xl,f(xl))-(xu,f(xu)) corta o eixo x
        fx = avaliar(x)
        if fx is None:
            raise ErroCalculo("f deixou de ser calculável", f"f({x:g}) não é finito.", "Revise o intervalo.")
        erro = calcular_erro(x, x_anterior)
        erro_pct = None if erro is None else erro * 100
        produto = fa * fx
        extremo = "xu" if produto < 0 else ("xl" if produto > 0 else None)
        formula = (
            f"xr = (xl·f(xu) − xu·f(xl)) / (f(xu) − f(xl)) "
            f"= ({fmt_br(a)}·f({fmt_br(b)}) − {fmt_br(b)}·f({fmt_br(a)})) / (f({fmt_br(b)}) − f({fmt_br(a)})) "
            f"= ({fmt_br(a)}·({fmt_br(fb)}) − {fmt_br(b)}·({fmt_br(fa)})) / ({fmt_br(fb)} − {fmt_br(fa)}) "
            f"= {fmt_br(x)}"
        )
        tabela.append({"k": k, "a": a, "b": b, "x": x, "fa": fa, "fb": fb, "fx": fx,
                       "produto": produto, "erro": erro, "erro_pct": erro_pct,
                       "extremo_substituido": extremo, "largura_intervalo": abs(b - a),
                       "formula": formula})
        xs.append(x)
        if fx == 0:
            convergiu, criterio = True, "raiz_exata"
            break
        if erro is not None and erro <= tol:
            convergiu, criterio = True, "erro"
            break
        if produto < 0:       # raiz entre xl e xr
            b, fb = x, fx
        else:                 # raiz entre xr e xu
            a, fa = x, fx
        x_anterior = x

    p = ordem_convergencia(xs)
    dados = {"metodo": "falsa_posicao", "tabela": tabela, "curva": curva, "pontos": xs,
             "nome_erro": NOME_ERRO}

    if not convergiu:
        raise ErroCalculo(
            "Não convergiu no máximo de iterações",
            f"Passo 1: o programa rodou as {max_iter} iterações permitidas e o erro relativo ainda é "
            f"maior que a tolerância {tol:g}. "
            "Passo 2: a falsa posição tem convergência apenas LINEAR (ordem ≈ 1) — mais lenta do que, "
            "por exemplo, Newton. "
            "Passo 3: além disso, é comum um dos extremos do intervalo nunca ser substituído (ficar "
            "'preso'), o que deixa os passos ainda mais lentos nesse caso.",
            "Aumente o máximo de iterações ou a tolerância.", extra=dados)

    if abs(fx) > max(10 * tol, 1e-6):
        avisos.append({
            "titulo": "Critério de parada atingido, mas |f(x)| ainda é grande",
            "explicacao": "Passo 1: o método parou porque o erro relativo entre iterações ficou ≤ "
                          "tolerância. "
                          f"Passo 2: mas |f(x)| = {abs(fx):.3g} ainda está longe de zero, o que seria "
                          "estranho se x já estivesse perto da raiz. "
                          "Passo 3: isso acontece porque, na falsa posição, um dos extremos pode ficar "
                          "'preso', fazendo os passos encolherem mesmo com x ainda longe da raiz — por "
                          "isso aqui o erro pequeno não garante uma boa aproximação."})

    # Nota sobre o critério |b - a| < ε citado no slide (não é usado aqui: ver critério de parada abaixo)
    trocados = {row["extremo_substituido"] for row in tabela if row["extremo_substituido"]}
    if trocados in ({"xl"}, {"xu"}):
        lado_fixo = "xu" if trocados == {"xl"} else "xl"
        nota_intervalo = (
            f" O slide também cita |xu − xl| ≤ tolerância como critério alternativo de parada; aqui ele "
            f"NÃO é usado porque o extremo {lado_fixo} nunca foi substituído durante a execução — o "
            f"intervalo não encolhe até zero, só até |raiz − {lado_fixo}| ≈ {fmt_br(abs(b - a))}. Por isso "
            "o critério de parada adotado é o erro relativo entre xr consecutivos."
        )
    else:
        nota_intervalo = (
            " O slide também cita |xu − xl| ≤ tolerância como critério alternativo; aqui o critério de "
            "parada usado é o erro relativo entre xr consecutivos, como no exemplo do slide."
        )

    criterio_txt = {"erro": "o erro relativo entre xr consecutivos ficou ≤ tolerância",
                    "raiz_exata": "f(xr) = 0 (raiz exata encontrada)"}[criterio]
    verificacao = (", valor próximo de zero — confirma a raiz."
                   if abs(fx) <= max(10 * tol, 1e-6) else
                   ", ainda afastado de zero (veja o aviso acima sobre o extremo preso).")
    conclusao = (f"Critério de parada: {criterio_txt} (parou na iteração k = {len(tabela)}). "
                 f"Raiz aproximada: xr ≈ {fmt_br(x)}. Verificação: f(xr) = {fmt_br(fx)}" + verificacao
                 + nota_intervalo)

    dados.update({
        "ok": True, "convergiu": True, "raiz": x, "fraiz": fx, "iteracoes": len(tabela), "ordem": p,
        "avisos": avisos, "criterio_parada": criterio, "conclusao": conclusao,
        "tolerancia_pct": tol * 100,
        "mensagem": f"Convergiu em {len(tabela)} iterações. Raiz ≈ {x:.10g}, f(raiz) = {fx:.3g}."
                    + (f" Ordem de convergência observada p ≈ {p:.2f}." if p is not None else ""),
    })
    return dados


# ----------------------------------------------------------------------
# 3. NEWTON-RAPHSON
#
# Cada linha i mostra xi, f(xi), f'(xi) e xi+1 = xi - f(xi)/f'(xi) JUNTOS
# (como no slide), e o erro relativo da linha é |xi+1 - xi|/|xi+1| x 100,
# EM PORCENTAGEM. A tolerância digitada é comparada direto com esse valor
# percentual (ex.: ε = 1e-2 significa "1e-2 %"), igual ao pseudocódigo do
# slide (que usa ea = ABS(...) * 100 e compara com es).
# ----------------------------------------------------------------------
def newton(texto_f, texto_x0, texto_tol, texto_max):
    expr = ler_funcao(texto_f)
    derivada = sp.diff(expr, X)
    f = criar_avaliador(expr)
    df = criar_avaliador(derivada)
    x = ler_numero(texto_x0, "x0")
    tol_pct = ler_tolerancia(texto_tol)
    max_iter = ler_max_iter(texto_max)

    tabela, xs = [], [x]
    dados = {"metodo": "newton", "tabela": tabela, "pontos": xs,
             "nome_erro": NOME_ERRO_NEWTON, "derivada": str(derivada)}

    def com_curva():
        """Completa os dados (gráfico) para a falha ou o sucesso."""
        validos = [v for v in xs if math.isfinite(v)]
        if max(validos) - min(validos) > 1e6:
            validos = [v for v in validos if abs(v) < 1e3] or [0.0]
        lo, hi = min(validos), max(validos)
        margem = max((hi - lo) * 0.2, 1.0)
        dados["curva"] = gerar_curva(f, lo - margem, hi + margem)
        return dados

    if f(x) is None:
        com_curva()
        raise ErroCalculo(
            "x0 fora do domínio",
            "Passo 1: antes de iterar, o programa calcula f(x0) para dar o primeiro passo. "
            f"Passo 2: f({x:g}) não é um número real finito — ou seja, x0 não pertence ao domínio de f. "
            "Passo 3: sem f(x0) não há como montar a reta tangente nem calcular x1.",
            "Escolha um x0 onde f esteja definida.", extra=dados)

    convergiu = False
    criterio = None
    raiz = fraiz = None
    for i in range(0, max_iter):
        fx = f(x)
        if fx is None:
            tabela.append({"i": i, "x": x, "fx": None, "dfx": None, "x_seguinte": None,
                           "erro_pct": None, "formula": None})
            com_curva()
            raise ErroCalculo(
                "x_i saiu do domínio de f",
                f"Passo 1: na iteração {i}, o método calculou x_{i} = {x:.6g}. "
                "Passo 2: f(x_i) não é um número real — x_i caiu fora do domínio de f. "
                "Passo 3: isso acontece porque o passo de Newton vem da reta TANGENTE (a aproximação de "
                "Taylor de 1ª ordem de f em x_i), que não 'sabe' onde f existe ou não; dependendo da "
                "inclinação, o passo pode empurrar x_i para fora do domínio (por exemplo, log(x) com um "
                "x0 ruim pode gerar um x_1 negativo).",
                "Escolha um x0 mais próximo da raiz (olhe o gráfico).", extra=dados)

        if fx == 0:
            convergiu, criterio = True, "raiz_exata"
            raiz, fraiz = x, fx
            tabela.append({"i": i, "x": x, "fx": fx, "dfx": df(x), "x_seguinte": x,
                           "erro_pct": 0.0,
                           "formula": f"f(x_{i}) = 0 — x_{i} = {fmt_br(x)} já é raiz exata."})
            break

        if abs(x) > 1e6:
            com_curva()
            raise ErroCalculo(
                "Divergência",
                f"Passo 1: a sequência de x_i não parou de crescer em módulo (x_{i} ≈ {x:.3g}). "
                "Passo 2: Newton só tem convergência GARANTIDA quando x0 já está perto o bastante da "
                "raiz (convergência local) — não há garantia nenhuma partindo de qualquer ponto. "
                "Passo 3: fora dessa vizinhança, a reta tangente pode apontar cada vez mais para longe "
                "da raiz em vez de se aproximar (ex.: atan(x) com |x0| grande, onde a tangente fica "
                "quase horizontal).",
                "Escolha um x0 mais próximo da raiz.", extra=dados)

        dfx = df(x)
        # tangente (quase) horizontal: f'(x_i) minúsculo comparado a f(x_i)
        if dfx is None or abs(dfx) < 1e-14 * max(abs(fx), 1e-300):
            com_curva()
            raise ErroCalculo(
                "Derivada nula: f'(x_i) = 0",
                f"Passo 1: em x_i = {x:.6g}, a derivada vale "
                f"{'indefinida' if dfx is None else format(dfx, '.3g')} — praticamente zero. "
                "Passo 2: a fórmula de Newton é x_(i+1) = x_i − f(x_i)/f'(x_i); ela divide por f'(x_i). "
                "Passo 3: com a tangente horizontal (f'(x_i) = 0) ela não corta o eixo x (ou corta "
                "infinitamente longe), então não existe um x_(i+1) para continuar — o método não pode "
                "continuar.",
                "Escolha outro x0 onde f' ≠ 0.", extra=dados)

        x_seguinte = x - fx / dfx
        if not math.isfinite(x_seguinte):
            com_curva()
            raise ErroCalculo(
                "Divergência",
                "Passo 1: ao calcular o próximo x_i, o resultado deixou de ser um número finito "
                "(overflow). "
                "Passo 2: é um caso extremo de divergência — a tangente empurrou x_i para um valor tão "
                "grande que o computador não consegue mais representá-lo.",
                "Escolha um x0 mais próximo da raiz.", extra=dados)

        # ciclo: o novo valor já apareceu antes (numa iteração ANTERIOR, não a mais recente —
        # ficar perto do x mais recente é só convergência normal) e ainda não convergimos
        for antigo in xs[:-1]:
            if abs(x_seguinte - antigo) <= 1e-12 * max(1.0, abs(antigo)):
                xs.append(x_seguinte)
                com_curva()
                raise ErroCalculo(
                    "Ciclo detectado",
                    f"Passo 1: o novo valor x_(i+1) = {x_seguinte:.6g} já havia aparecido antes nesta "
                    "mesma sequência. "
                    "Passo 2: isso significa que as iterações entraram num CICLO, alternando para "
                    "sempre entre os mesmos pontos (exemplo clássico: f(x) = x³ − 2x + 2 com x0 = 0 "
                    "alterna 0, 1, 0, 1, ...). "
                    "Passo 3: Newton não garante convergência quando x0 está longe da raiz — um ciclo "
                    "é uma forma de nunca convergir, mesmo sem nenhuma derivada nula no caminho.",
                    "Escolha outro x0 (olhe o gráfico).", extra=dados)

        erro_frac = calcular_erro(x_seguinte, x)
        erro_pct = erro_frac * 100
        formula = (f"x_{i + 1} = x_{i} − f(x_{i})/f'(x_{i}) = "
                   f"{fmt_br(x)} − ({fmt_br(fx)})/({fmt_br(dfx)}) = {fmt_br(x_seguinte)}")
        tabela.append({"i": i, "x": x, "fx": fx, "dfx": dfx, "x_seguinte": x_seguinte,
                       "erro_pct": erro_pct, "formula": formula})
        xs.append(x_seguinte)

        if erro_pct <= tol_pct:
            convergiu, criterio = True, "erro"
            raiz, fraiz = x_seguinte, f(x_seguinte)
            break
        x = x_seguinte

    com_curva()
    if not convergiu:
        raise ErroCalculo(
            "Não convergiu no máximo de iterações",
            f"Passo 1: o programa rodou as {max_iter} iterações permitidas e o erro ainda é maior que "
            f"{tol_pct:g}%. "
            "Passo 2: isso costuma ter uma destas causas: (a) f não tem raiz real, como exp(x) > 0 "
            "para todo x; (b) x0 estava mal escolhido e a sequência anda sem convergir; ou (c) a raiz "
            "é múltipla (f(r) = f'(r) = 0), e nesse caso a convergência vira linear e bem mais lenta.",
            "Verifique no gráfico se f cruza o eixo x; tente outro x0 ou mais iterações.", extra=dados)

    p = ordem_convergencia(xs)
    avisos = []
    if p is not None and 0.7 <= p <= 1.3 and len(tabela) >= 4:
        avisos.append({
            "titulo": "Convergência linear: provável raiz múltipla",
            "explicacao": f"Passo 1: a ordem de convergência observada é p ≈ {p:.2f}, ou seja, "
                          "próxima de 1 (linear). "
                          "Passo 2: numa raiz SIMPLES, Newton deveria convergir com ordem 2 "
                          "(quadrática) — bem mais rápido. "
                          "Passo 3: quando a raiz é múltipla (f(r) = f'(r) = 0), a prova da "
                          "convergência quadrática deixa de valer e o método cai para convergência "
                          "linear, que é exatamente o que está sendo observado aqui."})

    criterio_txt = "f(x_i) = 0 exatamente (raiz exata)" if criterio == "raiz_exata" else "o erro relativo (%) ficou ≤ tolerância"
    verificacao = (", valor próximo de zero — confirma a raiz."
                   if fraiz is not None and abs(fraiz) < 1e-6 else ", veja os avisos acima.")
    conclusao = (f"Critério de parada: {criterio_txt} (i = {len(tabela) - 1}, {len(tabela)} iterações). "
                 f"Raiz aproximada: x ≈ {fmt_br(raiz)}. Verificação: f(raiz) = {fmt_br(fraiz)}" + verificacao)

    dados.update({
        "ok": True, "convergiu": True, "raiz": raiz, "fraiz": fraiz, "iteracoes": len(tabela),
        "ordem": p, "avisos": avisos, "conclusao": conclusao, "tolerancia_pct": tol_pct,
        "mensagem": f"Convergiu em {len(tabela)} iterações. Raiz ≈ {raiz:.10g}, f(raiz) = {fraiz:.3g}."
                    + (f" Ordem de convergência observada p ≈ {p:.2f}." if p is not None else ""),
    })
    return dados


# ----------------------------------------------------------------------
# 4. ELIMINAÇÃO DE GAUSS COM PIVOTEAMENTO PARCIAL
#
# Opções:
#   pivotear     -> True (padrão) usa pivoteamento parcial; False usa sempre
#                   a linha k como pivô (ordem natural), igual ao Exemplo 1
#                   do slide ("sem pivoteamento").
#   modo_numero  -> "decimal" (padrão, float) ou "fracao" (fractions.Fraction,
#                   aritmética exata — reproduz o Exemplo 1 do slide).
#   casas_sig    -> None (padrão, sem arredondar) ou um inteiro 1..15: depois
#                   de CADA operação elementar o valor é arredondado para
#                   esse número de algarismos significativos (reproduz o
#                   efeito de pivô pequeno dos Exemplos 3/4 do slide).
# ----------------------------------------------------------------------
def gauss(A_texto, b_texto, pivotear=True, modo_numero="decimal", casas_sig=None):
    """A_texto: lista de linhas (cada uma lista de textos); b_texto: lista de textos."""
    if modo_numero not in ("decimal", "fracao"):
        raise ErroCalculo("Modo numérico inválido", f"'{modo_numero}' não é reconhecido.",
                          "Use 'decimal' ou 'fracao'.")
    if casas_sig is not None:
        try:
            casas_sig = int(casas_sig)
        except (TypeError, ValueError):
            casas_sig = None
        if casas_sig is not None and not (1 <= casas_sig <= 15):
            raise ErroCalculo("Número de algarismos significativos inválido",
                              "O modo de arredondamento aceita de 1 a 15 algarismos significativos.",
                              "Use um valor nesse intervalo, ou desligue esse modo.")
    usa_fracao = modo_numero == "fracao"

    # --- validações de formato ---
    if not isinstance(A_texto, list) or len(A_texto) == 0:
        raise ErroCalculo("Matriz vazia", "Nenhuma matriz foi informada.", "Escolha n ≥ 1 e preencha os campos.")
    n = len(A_texto)
    if n > 20:
        raise ErroCalculo("Matriz grande demais", "Este programa aceita sistemas de ordem até 20.", "Use n ≤ 20.")
    if any(not isinstance(l, list) for l in A_texto) or len({len(l) for l in A_texto}) > 1:
        raise ErroCalculo("Linhas de tamanhos diferentes", "As linhas da matriz não têm o mesmo número de colunas.",
                          "Todas as linhas devem ter o mesmo tamanho.")
    if len(A_texto[0]) != n:
        raise ErroCalculo("Matriz não quadrada",
                          f"A matriz tem {n} linhas e {len(A_texto[0])} colunas. A eliminação de Gauss para "
                          "resolver Ax = b com solução única exige matriz quadrada (n equações, n incógnitas).",
                          "Use o mesmo número de linhas e colunas.")
    if not isinstance(b_texto, list) or len(b_texto) != n:
        raise ErroCalculo("Vetor b incompatível",
                          f"A matriz é {n}×{n}, então b precisa ter {n} elementos.", "Ajuste o tamanho de b.")

    ler = ler_fracao if usa_fracao else ler_numero
    A = [[ler(A_texto[i][j], f"A[{i + 1}][{j + 1}]") for j in range(n)] for i in range(n)]
    b = [ler(b_texto[i], f"b[{i + 1}]") for i in range(n)]

    if any(abs(v) > 1e100 for v in b + [v for linha in A for v in linha]):
        raise ErroCalculo("Valores grandes demais",
                          "Há números com módulo acima de 1e100: as contas estourariam o limite do computador (overflow).",
                          "Use valores menores ou mude a escala do sistema.")
    if all(v == 0 for linha in A for v in linha):
        raise ErroCalculo("Matriz toda nula",
                          "Todos os coeficientes são zero: não existe pivô nenhum (posto 0).",
                          "Informe uma matriz com algum coeficiente diferente de zero.")

    def arred(v):
        return arredondar_sig(v, casas_sig) if not usa_fracao else v

    # --- eliminação ---
    M = [A[i][:] + [b[i]] for i in range(n)]               # matriz aumentada [A | b]
    escala = float(max(abs(v) for linha in M for v in linha))
    if usa_fracao:
        tol_piv = Fraction(0)                               # fração: "zero" só quando é exatamente zero
    else:
        tol_piv = np.finfo(float).eps * n * max(abs(v) for linha in A for v in linha)
    passos = [{"titulo": "Matriz aumentada inicial", "pivo": None, "troca": None,
               "multiplicadores": [], "operacoes": [], "matriz": [l[:] for l in M]}]
    pivos, trocas, linha = [], 0, 0

    for col in range(n):
        if linha >= n:
            break
        if pivotear:
            # pivoteamento parcial: maior |elemento| da coluna, da linha atual para baixo
            p = max(range(linha, n), key=lambda i: abs(M[i][col]))
        else:
            p = linha  # sem pivoteamento: usa sempre a linha k (ordem natural), igual ao Exemplo 1 do slide
        if abs(M[p][col]) <= tol_piv:
            if not pivotear:
                raise ErroCalculo(
                    "Pivô nulo (pivoteamento desligado)",
                    f"Passo 1: na coluna {col + 1}, o elemento a{linha + 1}{col + 1} é zero (ou "
                    "numericamente zero). "
                    "Passo 2: sem pivoteamento, o método usa sempre a linha k como pivô da etapa k; com "
                    "pivô zero, o multiplicador m = a_ik/a_kk ficaria indefinido (divisão por zero). "
                    "Passo 3: isso não significa necessariamente que o sistema é singular — pode haver "
                    "uma linha abaixo com elemento não nulo nessa coluna; só o pivoteamento está "
                    "desligado.",
                    "Ligue o pivoteamento parcial, ou reordene as equações manualmente.",
                    extra={"passos": passos, "metodo": "gauss"})
            continue                                        # coluna sem pivô -> matriz singular
        troca = None
        if p != linha:
            M[linha], M[p] = M[p], M[linha]
            troca = [linha + 1, p + 1]
            trocas += 1
        pivo = M[linha][col]
        mults, operacoes = [], []
        for i in range(linha + 1, n):
            m = arred(M[i][col] / pivo)
            mults.append({"linha": i + 1, "m": m,
                          "formula": f"m{i + 1}{col + 1} = a{i + 1}{col + 1}/a{col + 1}{col + 1} = "
                                     f"{fmt_br_op(M[i][col])}/{fmt_br_op(pivo)} = {fmt_br(m)}"})
            contas = []
            for j in range(col + 1, n + 1):
                antes = M[i][j]
                novo = arred(antes - m * M[linha][j])
                destino = f"b{i + 1}" if j == n else f"a{i + 1}{j + 1}"
                origem_piv = f"b{linha + 1}" if j == n else f"a{linha + 1}{j + 1}"
                contas.append({
                    "coluna": j, "antes": antes, "depois": novo,
                    "formula": f"{destino} = {destino} − ({fmt_br(m)})·{origem_piv} = "
                               f"{fmt_br_op(antes)} − ({fmt_br(m)})·{fmt_br_op(M[linha][j])} = {fmt_br(novo)}",
                })
                M[i][j] = novo
            M[i][col] = type(M[i][col])(0) if not usa_fracao else Fraction(0)
            operacoes.append({"linha": i + 1, "pivo_linha": linha + 1,
                              "formula_linha": f"L{i + 1} ← L{i + 1} − ({fmt_br(m)})·L{linha + 1}",
                              "contas": contas})
        pivos.append(pivo)
        passos.append({"titulo": f"Passo {len(pivos)}: coluna {col + 1}",
                       "pivo": {"linha": linha + 1, "coluna": col + 1, "valor": pivo},
                       "troca": troca, "multiplicadores": mults, "operacoes": operacoes,
                       "matriz": [l[:] for l in M]})
        linha += 1

    posto = linha
    if posto < n:
        # Rouché-Capelli: compara posto(A) com posto([A|b])
        tol_b = Fraction(0) if usa_fracao else 1e-9 * max(1.0, escala)
        impossivel = any(abs(M[i][n]) > tol_b for i in range(posto, n))
        base = {"passos": passos, "posto": posto, "metodo": "gauss"}
        if impossivel:
            raise ErroCalculo(
                "Sistema IMPOSSÍVEL (sem solução)",
                "Passo 1: depois do pivoteamento, sobrou uma linha do tipo 0 = c, com c ≠ 0 — uma "
                "afirmação impossível de ser verdadeira. "
                f"Passo 2: isso faz posto(A) = {posto} ficar menor que posto([A|b]) = {posto + 1}. "
                "Passo 3: pelo Teorema de Rouché-Capelli, quando posto(A) < posto([A|b]) o sistema é "
                "IMPOSSÍVEL: as equações se contradizem e não existe nenhum vetor x que satisfaça "
                "Ax = b ao mesmo tempo.",
                "Revise os coeficientes e o vetor b.", extra=base)
        raise ErroCalculo(
            "Sistema INDETERMINADO (infinitas soluções)",
            "Passo 1: a matriz é singular — mesmo com o pivoteamento parcial, não sobrou pivô para "
            "uma ou mais colunas. "
            "Passo 2: mas, ao chegar nessa coluna, a linha correspondente ficou 0 = 0 (verdadeira, em "
            "vez de contraditória). "
            f"Passo 3: isso dá posto(A) = posto([A|b]) = {posto}, só que menor que n = {n} incógnitas. "
            "Passo 4: pelo Teorema de Rouché-Capelli, posto igual mas menor que n significa sistema "
            f"possível e INDETERMINADO: sobram {n - posto} grau(s) de liberdade, logo existem "
            "infinitas soluções.",
            "Remova equações redundantes ou acrescente equações independentes.", extra=base)

    # substituição retroativa: xi = (bi − soma a_ij·xj) / a_ii, linha por linha, com fórmula substituída
    sol = [None] * n
    substituicao = []
    for i in range(n - 1, -1, -1):
        termos_txt = []
        soma = M[i][n] * 0 if usa_fracao else 0.0
        for j in range(i + 1, n):
            termo = arred(M[i][j] * sol[j])
            termos_txt.append(f"{fmt_br_op(M[i][j])}·{fmt_br_op(sol[j])}")
            soma = arred(soma + termo)
        xi = arred((M[i][n] - soma) / M[i][i])
        sol[i] = xi
        if termos_txt:
            formula = (f"x{i + 1} = (b{i + 1} − ({' + '.join(termos_txt)})) / a{i + 1}{i + 1} = "
                       f"({fmt_br_op(M[i][n])} − {fmt_br_op(soma)}) / {fmt_br_op(M[i][i])} = {fmt_br(xi)}")
        else:
            formula = f"x{i + 1} = b{i + 1} / a{i + 1}{i + 1} = {fmt_br_op(M[i][n])} / {fmt_br_op(M[i][i])} = {fmt_br(xi)}"
        substituicao.append({"i": i + 1, "formula": formula, "valor": xi})
    substituicao.reverse()  # ordem x1, x2, ..., xn para exibição

    det = pivos[0]
    for pv in pivos[1:]:
        det = det * pv
    det = det * ((-1) ** trocas)

    An = np.array([[float(v) for v in linha] for linha in A])
    bn = np.array([float(v) for v in b])
    xn = np.array([float(v) for v in sol])
    residuo = float(np.linalg.norm(An @ xn - bn))
    try:
        x_numpy = np.linalg.solve(An, bn)
    except np.linalg.LinAlgError:
        x_numpy = np.full(n, np.nan)
    diferenca = float(np.max(np.abs(x_numpy - xn)))
    cond = float(np.linalg.cond(An))

    # prova real: A·x comparado com b, equação por equação (com os coeficientes ORIGINAIS de A)
    prova_real = []
    todas_ok = True
    for i in range(n):
        termos_txt = [f"{fmt_br_op(A[i][j])}·{fmt_br_op(sol[j])}" for j in range(n)]
        soma = A[i][0] * 0 if usa_fracao else 0.0
        for j in range(n):
            soma = arred(soma + A[i][j] * sol[j]) if not usa_fracao else soma + A[i][j] * sol[j]
        if usa_fracao:
            ok_linha = (soma == b[i])
        else:
            ok_linha = abs(soma - b[i]) <= 1e-6 * max(1.0, abs(b[i]))
        todas_ok = todas_ok and ok_linha
        prova_real.append({
            "i": i + 1, "ok": ok_linha, "calculado": soma, "esperado": b[i],
            "formula": f"{' + '.join(termos_txt)} = {fmt_br(soma)}  (b{i + 1} = {fmt_br(b[i])}) "
                       + ("✓" if ok_linha else "✗"),
        })

    avisos = []
    if cond > 1e10:
        avisos.append({
            "titulo": "Matriz mal condicionada",
            "explicacao": f"Passo 1: o número de condição calculado é cond(A) ≈ {cond:.3g}, bem acima "
                          "de 1e10. "
                          "Passo 2: esse número mede quanto um erro relativo pequeno em A ou em b pode "
                          "ser amplificado na solução x. "
                          "Passo 3: com cond(A) tão grande, até o arredondamento normal de ponto "
                          "flutuante pode virar um erro grande na resposta — por isso a solução pode "
                          "ter poucos dígitos corretos mesmo que o resíduo ‖Ax − b‖ pareça pequeno."})
    if not todas_ok:
        avisos.append({
            "titulo": "A prova real não bateu em todas as equações",
            "explicacao": "Passo 1: ao substituir a solução calculada nas equações ORIGINAIS, uma ou "
                          "mais não resultaram em b (veja a tabela 'Prova real' abaixo). "
                          "Passo 2: isso costuma acontecer quando um pivô muito pequeno (sem "
                          "pivoteamento) amplifica o erro de arredondamento, ou quando o modo de "
                          "algarismos significativos está arredondando agressivamente demais. "
                          "Passo 3: ligue o pivoteamento parcial e/ou use mais algarismos significativos "
                          "(ou o modo de frações exatas) para evitar isso."})

    conclusao = (f"O sistema é possível e determinado (posto = {n} = número de incógnitas). Solução: "
                 + "; ".join(f"x{i + 1} = {fmt_br(v)}" for i, v in enumerate(sol)) + ". Prova real: "
                 + ("todas as equações bateram com b (ver tabela abaixo)." if todas_ok else
                    "uma ou mais equações NÃO bateram com b — ver aviso e a tabela da prova real abaixo."))

    return {
        "ok": True, "metodo": "gauss", "n": n, "solucao": sol, "determinante": det, "posto": posto,
        "residuo": residuo, "solucao_numpy": [float(v) for v in x_numpy], "diferenca_numpy": diferenca,
        "condicao": cond, "passos": passos, "substituicao": substituicao, "prova_real": prova_real,
        "avisos": avisos, "conclusao": conclusao, "pivotear": pivotear, "modo_numero": modo_numero,
        "casas_sig": casas_sig,
        "mensagem": f"Sistema com solução única. Resíduo ||Ax − b|| = {residuo:.3g}; "
                    f"diferença máxima para numpy.linalg.solve = {diferenca:.3g}.",
    }
