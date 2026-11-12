"""
testes.py - Reproduz os 3 exemplos dos slides da professora e compara com os
valores que ela espera. Rodar com:  python -m pytest testes.py -v
(ou simplesmente  python testes.py  , que também funciona sem pytest instalado).
"""

import math
from fractions import Fraction

import metodos as m


def aprox(a, b, tol_rel=1e-4):
    """Compara com tolerância relativa (os valores do slide são arredondados à mão)."""
    return abs(a - b) <= tol_rel * max(1, abs(b))


# ----------------------------------------------------------------------
# 1) FALSA POSIÇÃO - f(x) = x^3 - 9x + 3, [0, 1], ε = 1e-2
# Esperado (do slide):
#   it. 1: xr = 0,375       f(xr) = -0,32227
#   it. 2: xr = 0,338624    f(xr) = -0,00879   erro = 0,107422
#   it. 3: xr = 0,337635    f(xr) = -0,00023   erro = 0,00293  (< 1e-2 -> para)
# Com ε = 1e-4, deve continuar até a 4a linha: xr = 0,33761, f = -5,8E-06, erro = 7,53E-05
# ----------------------------------------------------------------------
def test_falsa_posicao_slide():
    r = m.falsa_posicao("x**3 - 9*x + 3", "0", "1", "1e-2", "50")
    assert r["ok"] is True
    assert r["iteracoes"] == 3

    l1, l2, l3 = r["tabela"]
    assert aprox(l1["x"], 0.375)
    assert aprox(l1["fx"], -0.32227, 1e-3)
    assert l1["erro"] is None  # 1a iteração não tem erro anterior

    assert aprox(l2["x"], 0.338624)
    assert aprox(l2["fx"], -0.00879, 1e-2)
    assert aprox(l2["erro"], 0.107422, 1e-3)

    assert aprox(l3["x"], 0.337635)
    assert aprox(l3["fx"], -0.00023, 1e-1)
    assert aprox(l3["erro"], 0.00293, 1e-2)
    assert l3["erro"] <= 1e-2  # critério de parada bateu aqui

    # com tolerância mais apertada, reproduz a 4a linha do slide
    r4 = m.falsa_posicao("x**3 - 9*x + 3", "0", "1", "1e-4", "50")
    assert r4["iteracoes"] == 4
    l4 = r4["tabela"][3]
    assert aprox(l4["x"], 0.33761, 1e-3)
    assert aprox(l4["fx"], -5.8e-6, 0.2)
    assert aprox(l4["erro"], 7.53e-5, 0.2)


# ----------------------------------------------------------------------
# 2) NEWTON-RAPHSON - f(x) = e^(-x) - x, f'(x) = -e^(-x) - 1, x0 = 0, ε = 1e-2 (%)
# Esperado (Exemplo 6 do slide):
#   i=0: x=0        -> x1 = 0,5
#   i=1: x=0,5      -> 0,566311003   (erro 11,70929098 %)
#   i=2: x=0,566311 -> 0,567143165   (erro  0,146728708 %)
#   i=3: x=0,567143 -> 0,56714329    (erro  2,21064E-05 %)
# ----------------------------------------------------------------------
def test_newton_slide():
    r = m.newton("exp(-x) - x", "0", "1e-2", "50")
    assert r["ok"] is True
    assert r["iteracoes"] == 4

    l0, l1, l2, l3 = r["tabela"]
    assert aprox(l0["x_seguinte"], 0.5)
    assert aprox(l1["x_seguinte"], 0.566311003)
    assert aprox(l1["erro_pct"], 11.70929098, 1e-3)
    assert aprox(l2["x_seguinte"], 0.567143165)
    assert aprox(l2["erro_pct"], 0.146728708, 1e-3)
    assert aprox(l3["x_seguinte"], 0.56714329)
    assert aprox(l3["erro_pct"], 2.21064e-05, 0.5)
    assert l3["erro_pct"] <= 1e-2  # critério de parada (em %) bateu aqui


# ----------------------------------------------------------------------
# 3a) GAUSS - Exemplo 1 do slide, SEM pivoteamento, frações exatas
#   3x1 + 2x2 + 4x3 = 1
#    x1 +  x2 + 2x3 = 2
#   4x1 + 3x2 - 2x3 = 3
# Esperado: m21=1/3, m31=4/3 -> [3 2 4|1; 0 1/3 2/3|5/3; 0 1/3 -22/3|5/3]
#           m32=1            -> [3 2 4|1; 0 1/3 2/3|5/3; 0 0 -8|0]
#           solução (-3, 5, 0)
# ----------------------------------------------------------------------
def test_gauss_exemplo1_fracoes_sem_pivoteamento():
    A = [["3", "2", "4"], ["1", "1", "2"], ["4", "3", "-2"]]
    b = ["1", "2", "3"]
    r = m.gauss(A, b, pivotear=False, modo_numero="fracao")
    assert r["ok"] is True
    assert r["solucao"] == [Fraction(-3), Fraction(5), Fraction(0)]

    passo1, passo2 = r["passos"][1], r["passos"][2]
    assert passo1["multiplicadores"][0]["m"] == Fraction(1, 3)
    assert passo1["multiplicadores"][1]["m"] == Fraction(4, 3)
    assert passo1["matriz"] == [
        [Fraction(3), Fraction(2), Fraction(4), Fraction(1)],
        [Fraction(0), Fraction(1, 3), Fraction(2, 3), Fraction(5, 3)],
        [Fraction(0), Fraction(1, 3), Fraction(-22, 3), Fraction(5, 3)],
    ]
    assert passo2["multiplicadores"][0]["m"] == Fraction(1)
    assert passo2["matriz"] == [
        [Fraction(3), Fraction(2), Fraction(4), Fraction(1)],
        [Fraction(0), Fraction(1, 3), Fraction(2, 3), Fraction(5, 3)],
        [Fraction(0), Fraction(0), Fraction(-8), Fraction(0)],
    ]


# ----------------------------------------------------------------------
# 3b) GAUSS - Exemplo 3 do slide, 3 algarismos significativos
#   0,0002 x1 + 2 x2 = 5
#   2      x1 + 2 x2 = 6
# SEM pivoteamento: m=10000, a22=-20000, b2=-50000 -> x2=2,5, x1=0 (prova real falha)
# COM pivoteamento: m=0,0001                       -> x2=2,5, x1=0,5
# ----------------------------------------------------------------------
def test_gauss_exemplo3_algarismos_significativos():
    A = [["0.0002", "2"], ["2", "2"]]
    b = ["5", "6"]

    sem_piv = m.gauss(A, b, pivotear=False, modo_numero="decimal", casas_sig=3)
    assert aprox(sem_piv["solucao"][1], 2.5, 1e-3)
    assert abs(sem_piv["solucao"][0]) < 1e-6
    assert not all(l["ok"] for l in sem_piv["prova_real"])  # a prova real deve falhar

    com_piv = m.gauss(A, b, pivotear=True, modo_numero="decimal", casas_sig=3)
    assert aprox(com_piv["solucao"][1], 2.5, 1e-3)
    assert aprox(com_piv["solucao"][0], 0.5, 1e-3)


def _rodar_sem_pytest():
    testes = [v for k, v in globals().items() if k.startswith("test_")]
    falhas = 0
    for teste in testes:
        try:
            teste()
            print(f"OK   {teste.__name__}")
        except Exception as e:  # noqa: BLE001
            falhas += 1
            print(f"FALHOU {teste.__name__}: {e}")
    print(f"\n{len(testes) - falhas}/{len(testes)} testes passaram.")
    if falhas:
        raise SystemExit(1)


if __name__ == "__main__":
    _rodar_sem_pytest()
