# Cálculo Numérico: Falsa posição, Newton-Raphson e Gauss

App web (Flask + HTML/CSS/JS puros, funciona offline).

## Como rodar
```
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```
Abra http://127.0.0.1:5001

## Arquivos
- `app.py`: rotas Flask; converte qualquer falha em JSON `{ok:false, titulo, explicacao, dica}` e troca NaN/Infinity por `null`.
- `metodos.py`: leitura segura (lista branca, sem `eval` livre), `falsa_posicao`, `newton` e `gauss`.
- `templates/index.html`, `static/style.css`, `static/script.js`: interface, tabelas e gráficos em `<canvas>`.

## Erro
Todo o programa usa o erro relativo `|x_k − x_(k−1)| / |x_k|` (definição confirmada pela professora). O critério de parada é erro ≤ tolerância.

## Exemplos
Cada aba tem botões verdes (funcionam) e vermelhos (pegadinhas que devem mostrar um aviso explicado).
