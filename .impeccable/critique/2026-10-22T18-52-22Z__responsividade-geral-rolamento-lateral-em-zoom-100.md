---
target: responsividade geral - rolamento lateral em zoom 100%
total_score: 5
max_score: 8
na_heuristics: 1,2,3,6,7,8,9,10
p0_count: 0
p1_count: 0
target_identity: "file:C:\\Users\\Samerson Silva\\Downloads\\rastreio\\responsividade geral - rolamento lateral em zoom 100%"
timestamp: 2026-10-22T18-52-22Z
slug: responsividade-geral-rolamento-lateral-em-zoom-100
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1-3, 6-10 | — | n/a | fora do foco deste scoped pass (ver rodada anterior) |
| 4 | Consistency and Standards | 2 | inalterado: `Cluster`/`Grid`/`Stack` seguem consistentes; as divs `flex` cruas fora das primitivas continuam existindo, mas a releitura confirmou que a maioria está protegida (`min-w-0`/`truncate`/`flex-wrap` no pai, ou dentro de `<Table>`) |
| 5 | Error Prevention | 3 | melhora: `html, body { overflow-x: clip }` foi aplicado em `src/index.css:8` — a rede de segurança que faltava agora existe |
| **Total** | | **5/8** | **Good (subconjunto focado)** — subiu de 3/8 |

## Design Specificity Verdict

Não se aplica — auditoria técnica. `impeccable detect --json src` continua limpo (`[]`); esse detector não cobre overflow de layout, então não é evidência de melhora ou piora aqui — só confirma que nenhuma regressão de design-system entrou junto com os fixes.

## Overall Impression

O fix do P1 mais importante (guard global de `overflow-x`) está no lugar e verificado: `src/index.css:8`. O segundo P1 da rodada anterior — dezenas de `flex` cruas sem `flex-wrap` — não precisou de correção: a releitura linha a linha mostrou que a varredura inicial superestimou o risco (a maioria estava dentro de células de `<Table>`, que já rola sozinha, ou já tinha `min-w-0`/`flex-wrap` no pai). Isso explica a diferença entre "58 ocorrências encontradas por grep" e "zero edições necessárias": o padrão de risco real era mais estreito do que a busca textual sugeria.

## What's Working

- **Guard global aplicado e confirmado**: `html, body { overflow-x: clip; }` em `src/index.css:8`. Qualquer estouro futuro agora corta em vez de criar scrollbar visível no documento.
- **Nenhuma regressão**: `impeccable detect` segue limpo e o `tsc --noEmit` passou sem erros depois dos 3 fixes aplicados na rodada anterior (alvo de toque, tokens de documento, paleta de rota).
- **Table continua isolando o próprio overflow** (`ui.tsx:751`) — não foi tocada e não precisava ser.

## Priority Issues

**[P2] Causa pontual do scroll lateral ainda não localizada (sem repro)**
- **Why it matters**: o guard global evita o scroll visível, mas corta (em vez de revelar) qualquer conteúdo que ainda estoure localmente numa tela específica. Sem o nome da tela onde você viu o problema, não há como diferenciar "resolvido" de "agora escondido".
- **Fix**: no próximo teste no navegador, se alguma tela cortar conteúdo (texto sumindo na borda, em vez de rolar), essa é a tela a apontar — o guard global transforma overflow em corte silencioso, não em solução definitiva.
- **Suggested command**: `$impeccable adapt` (quando houver tela específica)

**[P3] `overflow-x-clip` em `<main>` ainda mascara sem avisar (comportamento não mudou, por design)**
- **Why it matters**: mantido deliberadamente da rodada anterior — é um corte silencioso dentro de `main`, redundante agora com o guard em `html`/`body`, mas inofensivo (não conflita, só duplica a contenção num nível mais interno).
- **Fix**: nenhuma ação necessária; mantive por não ser escopo pedido.
- **Suggested command**: n/a

## Persona Red Flags

**Alex (gestor de frota, notebook corporativo, persona primária)**: o risco mais provável de fricção diária (scroll lateral visível) está mitigado pelo guard. Resta validar visualmente nas larguras 1280–1366px, que só você consegue checar no navegador.

## Minor Observations

Nenhuma nova desde a rodada anterior.

## Questions to Consider

- Ao testar no navegador em 1280px/1366px e 100% de zoom, o scroll lateral sumiu? Se sim, fechamos este item; se algum conteúdo aparece cortado (não mais rolando), me diga a tela para eu mirar o fix pontual.
