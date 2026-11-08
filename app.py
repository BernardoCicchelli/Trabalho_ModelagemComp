"""
app.py - Servidor Flask. Só recebe os dados, chama metodos.py e devolve JSON.
Rodar: python app.py   (abre em http://127.0.0.1:5001)
"""

import math

import numpy as np
from flask import Flask, jsonify, render_template, request

import metodos

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 1_000_000  # recusa pedidos gigantes


def limpar(obj):
    """Deixa o resultado seguro para JSON: NaN/Infinity viram None (null)."""
    if isinstance(obj, dict):
        return {k: limpar(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [limpar(v) for v in obj]
    if isinstance(obj, np.generic):
        obj = obj.item()
    if isinstance(obj, float) and not math.isfinite(obj):
        return None
    return obj


def executar(funcao, *args):
    """Roda um método e converte qualquer falha em JSON. Nada derruba o servidor."""
    try:
        resultado = funcao(*args)
    except metodos.ErroCalculo as e:
        resultado = {"ok": False, "titulo": e.titulo, "explicacao": e.explicacao, "dica": e.dica}
        resultado.update(e.extra)
    except Exception as e:  # último recurso
        resultado = {"ok": False, "titulo": "Erro inesperado",
                     "explicacao": "Algo deu errado ao calcular (" + type(e).__name__ + ").",
                     "dica": "Confira os dados digitados."}
    return jsonify(limpar(resultado))


@app.errorhandler(413)
def muito_grande(_):
    return jsonify({"ok": False, "titulo": "Pedido grande demais", "explicacao": "Os dados enviados passam de 1 MB.",
                    "dica": "Envie menos dados."}), 413


def pegar_json():
    """Lê o JSON do pedido; se não for um objeto, usa um dicionário vazio."""
    d = request.get_json(silent=True)
    return d if isinstance(d, dict) else {}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/falsa-posicao", methods=["POST"])
def api_falsa_posicao():
    d = pegar_json()
    return executar(metodos.falsa_posicao, d.get("f"), d.get("a"), d.get("b"),
                    d.get("tol"), d.get("max_iter"))


@app.route("/api/newton", methods=["POST"])
def api_newton():
    d = pegar_json()
    return executar(metodos.newton, d.get("f"), d.get("x0"),
                    d.get("tol"), d.get("max_iter"))


@app.route("/api/gauss", methods=["POST"])
def api_gauss():
    d = pegar_json()
    return executar(metodos.gauss, d.get("A"), d.get("b"))


if __name__ == "__main__":
    app.run(port=5001, debug=False)
