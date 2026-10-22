# Diagnóstico de densidade de texto (Fase A, somente leitura)

> Regras em `/planejamento/regras-densidade-ui.md`. Varredura de `src/pages/*.tsx` (exclui páginas de showcase: `Design.tsx`, `DesignSections.tsx`, `DesignSpacing.tsx`, `src/pages/design/*`). Foco pedido: cards e gráficos — não telas de formulário/cadastro.

## 1. Ranking das 5 telas mais densas

| # | Tela | Justificativa |
|---|---|---|
| 1 | **Manutenção** (`Manutencao.tsx`) | Mistura `ChartCard` com `period` + `sentence` redundantes entre si, subtítulo explicando o óbvio ("a semana atual em destaque"), e `KpiHero` com `rows` (4 linhas de detalhe) somado a `sentence` — maior concentração de texto por m² de tela dentre as telas com BI. |
| 2 | **Combustível** (`Combustivel.tsx`) | 5 `ChartCard`/gráficos na mesma tela, vários com `period` carregando explicação de ordenação ("pior em relação à meta primeiro") em vez de só o período; `KpiTile` com `sub` explicando meta em frase longa. |
| 3 | **Checklist** (`Checklist.tsx`) | 3 `ChartCard` seguidos (adesão, tempo médio, respostas), cada um com `period` + `sentence`; ganhlooser de contexto repetido entre o `sentence` e o gráfico abaixo dele. |
| 4 | **Ranking** (`Ranking.tsx`) | `ChartCard` "Destaques do período" com `sentence` + heatmap com `figcaption`/legenda própria; card "Em atenção" com título montado à mão duplicando informação do badge ao lado. |
| 5 | **Viagens** (`Viagens.tsx`) | Vários `KpiTile` com `sub` em frase completa (ex. "nas viagens externas", "sem viagem atribuída") que poderiam virar contexto inline mais curto; tabelas com legendas redundantes ao cabeçalho da coluna. |

## 2. Excessos encontrados (amostra representativa por tela)

| Arquivo | Card/gráfico | Texto atual | Regra violada | Proposta |
|---|---|---|---|---|
| `Manutencao.tsx:100` | `ChartCard` "Últimas 12 semanas" | `period="Disponibilidade semanal · a semana atual em destaque"` | R6/R11 (explica o óbvio do destaque visual, que já é visível no gráfico) | Encurtar para `period={rangeText(a)}` ou remover o trecho "· a semana atual em destaque" |
| `Manutencao.tsx:89` | `ChartCard` "Por que está abaixo da meta" | `period={rangeText(a)}` + `sentence={waterfallSentence(...)}` | R12 (o `sentence` já repete a causa principal que o waterfall mostra visualmente com rótulos) | Manter só o `sentence` (já é a leitura-resumo); não adicionar texto extra no gráfico |
| `Manutencao.tsx:80-88` | `KpiHero` "Disponibilidade da frota" | 4 `rows` (horas paradas, paradas por pane, tempo médio de reparo, custo corretivo) + `sentence` | R1 (mais de 1 linha de contexto) | DECISÃO — `rows` é uma tabela de detalhe do `KpiHero`, não um "subtítulo"; avaliar se cabe reduzir para 2-3 linhas mais relevantes |
| `Combustivel.tsx:298` | `ChartCard` "Consumo por veículo × meta" | `period={... · km/L, pior em relação à meta primeiro}` | R6/R11 (explica critério de ordenação em texto, não é dado) | Encurtar para só a unidade: `period={`${rangeText(a)} · km/L`}` |
| `Combustivel.tsx:106-108` | `KpiTile` "Meta de consumo" | `sub` com frase completa sobre de onde vem a meta (veículo/operação/grupo/empresa) | R4 (contexto em frase, não inline) | Encurtar para o essencial, ex. `Meta: operação` |
| `Checklist.tsx:159-178` | 3×`ChartCard` seguidos | cada um com `period={rangeText(a)}` + `sentence` própria | R12 (candidato a repetição: mesmo período escrito 3x na mesma tela) | DECISÃO — período já vem do filtro da tela (visível acima); avaliar se o `period` de cada `ChartCard` pode cair, deixando só `sentence` |
| `Ranking.tsx:104` | `Card` "Em atenção" | título monta `StatusDot` + contagem num `<span>` em vez de usar `sub`/`delta` padrão | R3 (título não deveria carregar a contagem; isso é dado, não rótulo) | DECISÃO — mudar estrutura do card foge de "só texto", listar para avaliação |
| `Viagens.tsx:76-79` | 4×`KpiTile` | `sub` em frase: "Origem, carga, descarga e destino", "sem viagem atribuída", "nas viagens externas", "Paradas no horário (±X min)" | R2 (alguns explicam o óbvio do título) / R4 | Caso a caso: manter as que mudam a leitura do número (ex. tolerância do horário), cortar as que só repetem o título |

## 3. Proposta de piloto

**Recomendo `Manutencao.tsx`** como piloto: concentra o maior número de violações num espaço pequeno (2 `ChartCard`, 1 `KpiHero` com `rows`, 1 `Card` de necessidades), tem comparação direta com o padrão do Visor (card de disponibilidade = equivalente ao "Você ainda pode gastar"), e as mudanças propostas são, em maioria, MECÂNICAS (encurtar string), com só 1 item DECISÃO (as `rows` do `KpiHero`).

Alternativa: `Combustivel.tsx` é mais longa e tem mais telas de BI, mas por isso também mais arriscada como primeiro piloto (mais texto pra revisar de uma vez).

---

**PARE AQUI.** Aguardando a escolha do piloto.

---

## Fase C — Lote 1 (2026-10-22): Combustível, Checklist, Ranking, Viagens

Typecheck e build passaram sem erros após o lote.

### Antes → depois

| Arquivo | Local | Antes | Depois |
|---|---|---|---|
| `Combustivel.tsx` | `ChartCard` "Gasto por mês" | `period={`${rangeText(a)} · R$`}` | removido (mesmo período do filtro da aba; "R$" já óbvio no título/sentence) |
| `Combustivel.tsx` | `ChartCard` "Consumo por veículo × meta" | `period={`${rangeText(a)} · km/L, pior em relação à meta primeiro`}` | removido (explicava critério de ordenação em texto; período repetia o filtro) |
| `Combustivel.tsx` | `ChartCard` "Preço e consumo por região" | `period={rangeText(a)}` | removido (mesmo período do filtro) |
| `Checklist.tsx` | 3× `ChartCard` ("Adesão", "Tempo médio", "Respostas mais frequentes") | cada um com `period={rangeText(a)}` | removido nos três (o `toolbar` da aba já mostra o período) |
| `Ranking.tsx` | `ChartCard` "Destaques do período" | `period={rangeText(a)}` | removido (mesmo período do `toolbar`) |
| `Viagens.tsx` | `KpiTile` "Viagens externas concluídas" | `sub="Origem, carga, descarga e destino"` | removido (definição de critério, não muda a leitura do número — R2) |
| `Viagens.tsx` | `ChartCard` "Km rodados por dia/semana" | `period={`${rangeText(a)} · km`}` | removido (mesmo período do filtro; "km" já no título) |

Não mexi em `ColumnChart` (fora de escopo), em `Field`/hints de formulário, nem em `Callout` (alertas).

### DECISÃO (não aplicado, registrado para resposta futura)

- **`Ranking.tsx`, card "Em atenção"** (linha ~104): o título é montado à mão combinando um `StatusDot` e a contagem num `<span>`, em vez de usar a estrutura padrão de título+sub. Mudar isso é alterar a composição do card, não só encurtar texto — fica como item em aberto, não é mecânico.
- **`Combustivel.tsx`, `ChartCard` "Índice de confiabilidade do motorista"** (linha 148): mantém `period={rangeText(a)}`, mas aqui o `PeriodCompare` do período é local ao próprio card (`aside`), não está em nenhum outro lugar da tela — não é repetição, por isso não foi removido.

## Fase C — Lote 2 (2026-10-22): Telemetria, Multas, Pneus, Relatórios

Typecheck e build passaram sem erros após o lote.

### Antes → depois

| Arquivo | Local | Antes | Depois |
|---|---|---|---|
| `Telemetria.tsx` | `ChartCard` "Rendimento da frota por dia" | `period={`${rangeText(ranges.a)} · km/L`}` | removido (repetia o período do `MonitorHeader`; km/L já aparece na sentence) |
| `Telemetria.tsx` | `ChartCard` "Rendimento por veículo" | `period={`${rangeText(ranges.a)} · km/L`}` | removido (idem) |
| `Telemetria.tsx` | `ChartCard` "Uso do motor por faixa de RPM" | `period={`${rangeText(ranges.a)} · tempo de motor ligado`}` | encurtado para `period="Tempo de motor ligado"` (período repetido removido; mantida a explicação da base do %, que muda a leitura — R2) |
| `Multas.tsx` | `ChartCard` "Custo por mês" | `period={`${rangeText(a)} · R$`}` | removido (repetia o período do toolbar da aba) |
| `Pneus.tsx` | `ChartCard` "Gasto mensal com pneus" | `period={`${rangeText(a)} · pneus novos e recapagem`}` | encurtado para `period="Pneus novos e recapagem"` (período repetido removido; mantida a composição do gasto, que muda a leitura — R2) |
| `Relatorios.tsx` | — | já compliant (KPIs sem `sub`, 1 nota de rodapé útil) | nenhuma mudança |

**Mantidos sem alteração** (não são repetição, R13 não se aplica): `Pneus.tsx` → `ChartCard` "Sulco dos pneus rodando" (`period="agora"`, é um ponto no tempo diferente do período filtrado) e "Sulco na vida atual" (`period="mm, a cada medição"`, descreve a granularidade do eixo, não o período da página).

## Fase C — Lote 3 (2026-10-22): Jornada, Revenda, Locale + varredura das 7 telas restantes

Typecheck e build passaram sem erros após o lote.

### Antes → depois

| Arquivo | Local | Antes | Depois |
|---|---|---|---|
| `Jornada.tsx` | `ChartCard` "Descumprimentos por dia/semana" | `period={`${rangeText(a)} · todos os tipos`}` | encurtado para `period="Todos os tipos"` (período repetido removido; mantido o escopo "todos os tipos", que desambigua vs. os KPIs por tipo acima) |
| `Revenda.tsx` | `ChartCard` "Acessos por mês" | `period="Últimos 12 meses · o mês atual em destaque"` | encurtado para `period="Últimos 12 meses"` (mesmo padrão já corrigido em Manutenção: explicava o destaque visual óbvio) |
| `Locale.tsx` | `ChartCard` "Faturamento mensal" | `period="Soma de todas as rastreadoras · R$ · clique num mês para ver o ranking ao lado"` | encurtado para `period="Soma de todas as rastreadoras"` (R$ óbvio; instrução de interação removida — R11) |
| `Locale.tsx` | `ChartCard` "Por rastreadora · {mês}" | `period="Faturamento previsto no mês, do maior para o menor"` | removido (ordenação explicada em texto — R6/R11; redundante com o título e com o KPI "Faturamento previsto" acima) |

### Varredura sem achados mecânicos

`Ativos.tsx`, `Monitoramento.tsx`, `Alertas.tsx`, `PrecisaDeVoce.tsx`, `Replay.tsx`, `Cercas.tsx`, `PortariaApp.tsx`: sem `ChartCard`/BI nessas telas (são operação/cadastro/monitoramento ao vivo); os `KpiTile` já estão sem `sub` supérfluo e os parágrafos encontrados são contexto operacional ou explicação de regra (não microcopy redundante) — nenhuma mudança mecânica identificada, nenhuma DECISÃO nova.

## Melhoria futura registrada (fora desta rodada)

Ao encurtar a frase de "Falha que se repete" em `findPatterns()` (`lib/insights.ts`), removendo a lista de placas do texto (2026-10-22), ficou pendente: o botão **"Revisar OS"** do `PatternCard` hoje só navega para a aba "Ordens de serviço" (`goTab('os')`), sem filtrar pelas OS do padrão identificado. A pessoa precisa procurar manualmente pelo título do serviço. O ideal seria abrir a lista já filtrada pelas OS específicas daquele padrão (ex. por `title` + `assetId`s envolvidos). Não é uma mudança de texto — é comportamento novo, fora do escopo desta rodada de densidade.
