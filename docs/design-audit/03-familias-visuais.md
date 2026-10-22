# 03 — Famílias visuais

Agrupamento por função/estrutura, independente do módulo onde aparece.

| Família | Característica | Componentes | Aplicações atuais | Aplicações possíveis |
|---|---|---|---|---|
| **KPI simples** | Número + variação, sem gráfico | KPI-001 `KpiTile` | Custo, custo/km, MKBF, faturamento, consumo | Qualquer indicador de resumo em dashboard denso |
| **KPI com gráfico embutido** | Número + delta/status + mini-gráfico | KPI-002 `KpiCard` | Disponibilidade, consumo, custos por módulo | Indicadores que precisam de contexto temporal imediato |
| **KPI com meta (herói)** | Número grande + barra de meta + detalhes | KPI-003 `KpiHero` | Disponibilidade de frota (guia de estilo; não confirmado em produção) | Indicador único mais importante de uma página (ex. disponibilidade geral, adesão a checklist) |
| **Evolução temporal (coluna)** | Colunas por período, 1 destaque, meta opcional | CHART-006 `ColumnChart` | Disponibilidade semanal, faturamento, multas, pneus, acessos | Qualquer série temporal com 1 variável |
| **Evolução temporal (linha)** | Linha/área contínua, múltiplas séries | CHART-011 `LineChart` | Rendimento km/L, sulco de pneu | Séries contínuas (telemetria, temperatura, desgaste) |
| **Evolução + projeção** | Linha real + projeção tracejada + orçamento | CHART-012 `ProjectionChart` | Nenhuma em produção (só guia de estilo) | Acompanhamento de gasto/orçamento mensal em andamento |
| **Comparativo (atual×anterior)** | Pares de barra lado a lado | CHART-007 `CompareBars` | Combustível, Jornada, Pneus — alternam com ColumnChart conforme há período B | Qualquer métrica com comparação de período ativada pelo usuário |
| **Decomposição (causas)** | Cascata do total até o resultado, uma barra por causa | CHART-001 `Waterfall` | Disponibilidade (Manutenção) | Tempo parado, custo total decomposto por categoria |
| **Decomposição (empilhado)** | Colunas empilhadas, 2 categorias (bom/ruim) | CHART-008 `StackedColumns` | Movimento×parado, viagem×sem viagem, preventiva×corretiva | Qualquer binário bom/ruim ao longo do tempo |
| **Comparativo (estimado×real)** | Barra dupla por item, excesso em hachura rosa | CHART-004 `EstVsReal` | Orçamento de manutenção | Qualquer orçamento vs. execução por item |
| **Ranking** | Lista ordenada com barra proporcional | CHART-009 `RankBars`, CHART-016 `TipItem` (variante lista) | Faturamento por revenda, consumo por veículo, panes por tipo, multas por tipo | Qualquer comparação entre N entidades |
| **Distribuição (barra 100%)** | Composição percentual por linha ou única | CHART-005 `StackedBars`, CHART-010 `Bar100` | Faixas de RPM (StackedBars) | Composição de frota por status, motivos de parada |
| **Distribuição circular** | Composição com total ao centro | CHART-014 `Donut` | Nenhuma em produção (só guia de estilo) | Composição de frota por status (mesma cor do mapa) |
| **Indicador de progresso (meta única)** | Arco/anel 0–100% | CHART-013 `Gauge`, CHART-015 `Ring` | Nenhuma em produção (só guia de estilo) | Disponibilidade, adesão a checklist, SLA |
| **Matriz/heatmap** | Intensidade por célula (categoria × causa) | CHART-002 `HeatMatrix` | Nenhuma em produção (só guia de estilo) | Eventos de telemetria por dia da semana × tipo |
| **Distribuição ao longo do tempo (pontos)** | 1 ponto por evento, atual × anterior | CHART-003 `DotMatrix` | Nenhuma em produção (só guia de estilo) | Alertas/infrações por dia |

## O que pode compartilhar estrutura base

- **Todos os gráficos SVG próprios** (`ColumnChart`, `CompareBars`, `StackedColumns`, `LineChart`,
  `ProjectionChart`) já compartilham: `useWidth` (medição responsiva), `niceTicks`/`niceMax` (escalas
  arredondadas), `axisLeft`/`stepFor`/`showX` (rótulos sem sobreposição), e o tooltip único (`useChartTip`).
  Um redesign pode manter esse "motor" e só trocar a linguagem visual (cores, cantos, tipografia).
- **Donut, Gauge e Ring** compartilham a mesma lógica de arco/anel (`pt`, `arc`) — poderiam convergir para um
  único componente parametrizável (ângulo total 360° vs. 180°) se o novo design system não precisar
  distingui-los visualmente.
- **RankBars e TipItem (variante ranking)** resolvem o mesmo problema (lista ordenada com barra) de duas
  formas diferentes — candidatos a unificar numa única "família Ranking" com 1–2 variantes de densidade.

## O que precisa de identidade própria

- **Waterfall**: a única visualização de causa-e-efeito explícito (cascata). Não deve virar uma variação de
  coluna comum — é o componente que mais diretamente atende ao princípio "gráficos que expliquem o resultado
  e suas causas" do novo design system.
- **EstVsReal**: lógica de orçamento (estimado/realizado/excesso) é específica o suficiente (3 estados por
  item) para não caber em `CompareBars` sem perder clareza.
- **Gauge** (meio-círculo) carrega o número central como protagonista — função de "destaque", mais perto de
  um Card de Destaque do que de um gráfico analítico comum.
