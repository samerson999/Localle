# 01 — Inventário de gráficos e KPIs (Localle DNA / rastreio)

> Levantamento feito por leitura de código (sem acesso ao navegador nesta sessão — ver `04-avaliacao-ux.md`
> sobre a ausência de capturas de tela). Todos os caminhos são relativos à raiz do projeto.

## Como o sistema está organizado

Diferente de um app com gráficos soltos por tela, este projeto tem uma **biblioteca central de visualização**:

- `src/components/charts.tsx` — 16 componentes de gráfico, todos em SVG próprio (sem Recharts/Chart.js/D3 em
  produção — `recharts` está no `package.json` mas não há import ativo nas páginas verificadas).
- `src/components/story.tsx` — vocabulário de "contar a história de uma tela": `Num`, `DeltaChip`, `StatusGlyph`,
  `KpiTile`, `KpiCard`, `KpiHero`, `ChartCard`.
- `src/components/chartTip.tsx` — tooltip único (`useChartTip`) compartilhado por todos os gráficos.

Cada página de módulo (Manutenção, Combustível, Pneus, Jornada, etc.) **instancia** esses componentes com os
dados daquele domínio. Por isso o catálogo abaixo documenta primeiro os componentes (famílias reutilizáveis)
e depois onde cada um é usado.

`src/pages/Design.tsx` e `src/pages/DesignSections.tsx` são o **guia de estilo vivo** (showroom de todos os
componentes com dados fictícios) — não são telas de produto e foram excluídas da contagem de "uso real".

## Componentes de gráfico (`src/components/charts.tsx`)

| ID | Nome no código | Tipo (família) | Biblioteca | Compartilhado? | Linha |
|---|---|---|---|---|---|
| CHART-001 | `Waterfall` | Decomposição / cascata | SVG próprio | Sim | charts.tsx:24 |
| CHART-002 | `HeatMatrix` | Heatmap (categoria × causa) | HTML table + CSS | Sim | charts.tsx:62 |
| CHART-003 | `DotMatrix` | Distribuição (matriz de pontos) | SVG próprio | Sim | charts.tsx:89 |
| CHART-004 | `EstVsReal` | Comparativo (estimado × realizado) | HTML/CSS (barras) | Sim | charts.tsx:124 |
| CHART-005 | `StackedBars` | Barras 100% horizontais | HTML/CSS | Sim | charts.tsx:186 |
| CHART-006 | `ColumnChart` | Evolução temporal (colunas mensais) | SVG próprio | Sim | charts.tsx:273 |
| CHART-007 | `CompareBars` | Comparativo (atual × anterior) | SVG próprio | Sim | charts.tsx:322 |
| CHART-008 | `StackedColumns` | Decomposição temporal (colunas empilhadas) | SVG próprio | Sim | charts.tsx:368 |
| CHART-009 | `RankBars` | Ranking horizontal | HTML/CSS | Sim | charts.tsx:420 |
| CHART-010 | `Bar100` | Distribuição (barra 100% única) | HTML/CSS | Sim | charts.tsx:443 |
| CHART-011 | `LineChart` | Evolução temporal (linha/área) | SVG próprio | Sim | charts.tsx:471 |
| CHART-012 | `ProjectionChart` | Evolução + projeção (linha/área) | SVG próprio | Sim | charts.tsx:533 |
| CHART-013 | `Gauge` | Indicador de progresso (meio-círculo) | SVG próprio | Sim | charts.tsx:600 |
| CHART-014 | `Donut` | Composição circular | SVG próprio | Sim | charts.tsx:629 |
| CHART-015 | `Ring` | Progresso (anel único) | SVG próprio | Sim | charts.tsx:678 |
| CHART-016 | `TipItem` | Linha de lista com barra própria da tela + tooltip padrão | HTML/CSS (wrapper) | Sim | charts.tsx:157 |

## Componentes de KPI (`src/components/story.tsx`)

| ID | Nome | Tipo | Compartilhado? | Linha |
|---|---|---|---|---|
| KPI-001 | `KpiTile` | KPI compacto (label + número + chip de variação + contexto) | Sim | story.tsx:381 |
| KPI-002 | `KpiCard` | KPI com cartão completo (número + delta/status + gráfico embutido + insight) | Sim | story.tsx:183 |
| KPI-003 | `KpiHero` | KPI "herói" (número grande + meta em barra + linhas de detalhe) | Sim | story.tsx:214 |
| KPI-004 | `DeltaChip` | Átomo de variação (seta + número, sem chip de fundo) | Sim — usado dentro de KPI-001/2/3 | story.tsx:60 |
| KPI-005 | `Num` | Átomo numérico (formatação pt-BR, tamanhos display/kpi/lg/body/small) | Sim — base de todos os números do produto | story.tsx:23 |

## Uso por módulo (instâncias reais em páginas de produto)

| Módulo | Página | Componentes de gráfico usados | KPIs usados |
|---|---|---|---|
| Manutenção | `src/pages/Manutencao.tsx` | CHART-001 (causas de indisponibilidade), CHART-006 (disponibilidade semanal), CHART-004 (orçamento estimado×realizado) | KPI-001/002 |
| Manutenção (BI) | `src/components/BIManut.tsx` | CHART-008 (preventiva×corretiva), CHART-016 (ranking de panes) | KPI-001 (custo, custo/km, MKBF, preventivas em atraso) |
| Telemetria | `src/pages/Telemetria.tsx` | CHART-005 (faixas de RPM), CHART-011 (rendimento km/L), CHART-016 (ranking por placa) | KPI-001/002 |
| Combustível | `src/pages/Combustivel.tsx` | CHART-006/CHART-007 (gasto mensal, alterna conforme há período anterior), CHART-016 (consumo × meta por veículo) | KPI-001/002 |
| Jornada | `src/pages/Jornada.tsx` | CHART-006/CHART-007 (descumprimentos por período) | KPI-001/002 |
| Pneus | `src/pages/Pneus.tsx` | CHART-006/CHART-007 (gasto mensal), CHART-016 (pneus por nível de sulco), CHART-011 (evolução do sulco × retirada) | KPI-001/002 |
| Multas | `src/pages/Multas.tsx` | CHART-006 (custo mensal com multas), CHART-016 (ranking por tipo) | KPI-001/002 |
| Localle (financeiro/revenda) | `src/pages/Locale.tsx` | CHART-006 (faturamento mensal, com seleção de mês), CHART-009 (ranking) | KPI-001/002 |
| Revenda | `src/pages/Revenda.tsx` | CHART-006 (acessos por mês) | KPI-001/002 |
| Monitoramento | `src/pages/Monitoramento.tsx` | CHART-008 (em movimento × parados) | KPI-001/002 |
| Viagens | `src/pages/Viagens.tsx` | CHART-008 (em viagem × sem viagem) | KPI-001/002 |
| Checklist | `src/pages/Checklist.tsx` | CHART-016 (adesão por checklist, tempo médio por etapa) | KPI-001 |
| Ativos / Ranking / Relatórios / Replay | `src/pages/{Ativos,Ranking,Relatorios,Replay}.tsx` | — (telas orientadas a KPI e lista, sem gráfico dedicado verificado) | KPI-001/002 |
| Guia de estilo (não é produto) | `src/pages/Design.tsx`, `DesignSections.tsx` | Todos os CHART-001…016 (showroom) | KPI-001/002/003 |

**Observação:** `CHART-002` (HeatMatrix), `CHART-003` (DotMatrix), `CHART-010` (Bar100), `CHART-012`
(ProjectionChart), `CHART-013` (Gauge), `CHART-014` (Donut) e `CHART-015` (Ring) só foram encontrados em uso
nas páginas de guia de estilo (`Design.tsx` / `DesignSections.tsx`) nesta varredura — ou seja, existem prontos
na biblioteca mas **não estão (ainda) instanciados em nenhuma tela de produto**. Isso pode significar: (a) são
componentes novos aguardando adoção, (b) são usados em telas não cobertas por esta varredura (ex.: dentro de
modais, Jornada/JornadaDocs, ou código muito recente), ou (c) ficaram órfãos de um redesign anterior. Vale
confirmar com quem mantém o código antes de descartar ou redesenhar.
