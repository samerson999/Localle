# 05 — Briefing para a IA de redesign

Este documento resume, por componente, o que pode mudar livremente e o que é regra fixa (dado, cálculo,
acessibilidade) que **não pode ser alterada** sem quebrar o produto. Use junto com `02-catalogo-detalhado.md`
(dados/props completos) e `03-familias-visuais.md` (agrupamento).

## Regras globais que valem para todos os componentes

**Não podem mudar:**
- Semântica de cor de dado: azul/realizado, rosa/perda-desvio, hachura/estimado-meta-anterior. Vermelho não
  é cor de gráfico.
- Toda visualização precisa de uma tabela equivalente para leitor de tela (hoje `SrTable`/`sr-only`).
- O tooltip deve continuar funcionando por hover (mouse) e por toque único que fixa (mobile) — não é
  cosmético, é o único mecanismo de drill-down nesses gráficos hoje.
- Direção "boa" de cada métrica (`good: 'up'|'down'`) é dado de contrato, não deve ser assumida pela cor
  "positivo = verde sempre".
- Metas anotadas diretamente no gráfico (linha + rótulo), não em legenda separada — já é o padrão do produto
  e é exigência do novo DS também.

**Pode evoluir livremente:**
- Cantos, sombras, espaçamento, densidade, família tipográfica, símbolos de ícone.
- Substituir SVG "desenhado à mão" por outra técnica de renderização, desde que mantenha responsividade
  (`useWidth`/ResizeObserver hoje) e o comportamento de tooltip/teclado.
- Unificar famílias (ex. Gauge+Ring, RankBars+TipItem-ranking) se o novo DS preferir menos variantes.

---

## CHART-001 `Waterfall` — cascata de causas
- **Objetivo:** explicar por que um resultado ficou abaixo da meta, causa a causa.
- **Elementos obrigatórios:** barra de topo (meta/100%), N barras de causa (rosa/hachura), barra de resultado
  final (azul sólido), linha de meta opcional.
- **Regra fixa:** ordem das causas é a ordem de impacto decrescente, como calculado na página (não reordenar
  visualmente sem preservar a leitura "causa a causa").
- **Evolução possível:** aplicar o mesmo padrão a outros totais decompostos (custo, tempo parado) — hoje só
  existe para disponibilidade.

## CHART-004 `EstVsReal` — estimado × realizado
- **Objetivo:** decisão financeira (aprovar orçamento, entender desvio).
- **Elementos obrigatórios:** barra de estimado (hachura), barra de realizado (sólida), excesso destacado
  separadamente quando `real > est`.
- **Regra fixa:** excesso só aparece quando positivo; "dentro do estimado" é um estado explícito, não ausência
  de elemento.

## CHART-006 `ColumnChart` — evolução em colunas
- **Objetivo:** ver evolução por período com 1 destaque (geralmente o mais recente) e meta opcional.
- **Elementos obrigatórios:** eixo de rótulos auto-espaçado, barra de destaque sempre azul "cheio", demais em
  tom mais claro, linha de meta tracejada quando houver.
- **Regra fixa:** quando `onSelect` existe, a barra é interativa (clique/Enter) e dispara navegação/seleção em
  outro componente da tela (ex. Localle: mês → ranking). Isso precisa continuar possível no redesign.
- **Evolução possível:** o maior ponto de atenção do redesign (ver `04-avaliacao-ux.md`) — rótulos que somem
  quando não cabem. Uma proposta pode reservar uma leitura por toque mais explícita (ex. sempre expor o
  último + destaque, nunca "mudo" por padrão).

## CHART-007 `CompareBars` — atual × anterior
- **Objetivo:** comparação explícita de dois períodos, ativada por escolha do usuário.
- **Elementos obrigatórios:** legenda (hachura=anterior, sólido=atual), ambas as barras por grupo.
- **Regra fixa:** a troca entre `ColumnChart` (sem período B) e `CompareBars` (com período B) é decidida pela
  página — o redesign deve prever as duas aparências para o mesmo "slot" de gráfico e, idealmente, uma
  transição suave entre elas.

## CHART-008 `StackedColumns` — colunas empilhadas (binário bom/ruim)
- **Objetivo:** decompor um total em "bom" (real) e "ruim" (loss) por período.
- **Elementos obrigatórios:** total acima da coluna (quando couber), participação percentual de cada parte no
  tooltip.

## CHART-005 `StackedBars` — barra 100% por linha
- **Objetivo:** composição percentual por item (até 4 categorias).
- **Regra fixa:** no máximo 4 categorias (`CATS` tem 4 tons); não assumir N categorias livres sem revisar a
  paleta.

## CHART-009 `RankBars` / CHART-016 `TipItem` (ranking) — ranking
- **Objetivo:** comparar N entidades por um valor, com destaque de posição.
- **Elementos obrigatórios:** posição numerada, barra proporcional ao líder, placa em chip mono quando
  aplicável (`isPlate`).
- **Evolução possível:** unificar as duas implementações (ver `04-avaliacao-ux.md`) numa única família com,
  no máximo, variante compacta/analítica.

## CHART-011 `LineChart` / CHART-012 `ProjectionChart` — linha/área
- **Objetivo:** trajetória contínua no tempo; `ProjectionChart` adiciona a reta de projeção e orçamento.
- **Elementos obrigatórios:** régua vertical + ponto por série no hover, área preenchida só na série
  principal (`tone:'real'`), linha de meta/orçamento tracejada.
- **Nota de produto:** `ProjectionChart` não está em uso — antes de redesenhar, confirmar com o time de
  produto se deve ser adotado (ex. acompanhamento de orçamento mensal de combustível/manutenção) ou
  descontinuado.

## KPI-001 `KpiTile`, KPI-002 `KpiCard`, KPI-003 `KpiHero`
- **Objetivo:** três densidades do mesmo "número + contexto": compacta (dashboard), com gráfico embutido
  (seção de módulo), e herói (indicador único mais importante da página).
- **Elementos obrigatórios:** número como protagonista absoluto (nunca o ícone ou o chip de variação disputa
  tamanho com o número); chip de variação com seta + direção boa/ruim contratada por indicador; os 4 estados
  (ready/loading/empty/error) sempre tratados.
- **Aplicação sugerida (compacta/analítica/destaque):**
  - **Compacta:** `KpiTile` continua sendo o certo para dashboards com muitos indicadores (ex. Monitoramento,
    visão geral).
  - **Analítica:** `KpiCard` para páginas de módulo único (Combustível, Manutenção, Pneus) onde o número
    precisa do mini-gráfico de contexto.
  - **Destaque:** `KpiHero` é a melhor base para os "Cards de destaque" pedidos pelo novo DS (superfície azul
    ou grafite, explicação contextual, ação) — hoje só existe no guia de estilo; o redesign pode usar esse
    componente como ponto de partida em vez de criar um novo do zero.

## Famílias sem instância de produto (decisão necessária antes de redesenhar)

`HeatMatrix`, `DotMatrix`, `Bar100`, `ProjectionChart`, `Gauge`, `Donut`, `Ring` — contratos de dados já
documentados em `02-catalogo-detalhado.md`. Recomenda-se à IA de design propor usos concretos (ex. `Donut`
para composição de frota por status, `Gauge`/`Ring` para disponibilidade/adesão com meta única) em vez de
redesenhar componentes sem aplicação real — o risco é investir em polimento visual de algo que o produto
talvez não precise manter.

## Possibilidades de evolução visual (não obrigatórias, para a IA de design explorar)

- Cards de destaque com símbolo de rota (dois nós) aplicados ao redor do `KpiHero`/`Waterfall` em telas de
  "resultado do mês".
- Unificar `Gauge`/`Ring`/`Donut` num único "arco" parametrizável (ângulo 360°/180°, 1 ou N partes).
- Dar ao par `ColumnChart`↔`CompareBars` uma transição visual (não só troca abrupta) quando o usuário ativa
  comparação de período.
- Avaliar se `RankBars` e a variante ranking de `TipItem` podem virar um único componente com duas
  densidades (compacta/analítica).
