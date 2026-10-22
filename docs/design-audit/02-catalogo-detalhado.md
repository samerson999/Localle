# 02 — Catálogo detalhado de gráficos e KPIs

Fichas técnicas por componente. Como a biblioteca é compartilhada, cada ficha descreve o contrato do
componente (props) e, quando há instância real em produto, a leitura concreta feita naquele módulo.
Dados de exemplo preservam os nomes de campos do código; quando o dado vem de fixture/mock, isso é indicado.

---

## CHART-001 — `Waterfall` (cascata de disponibilidade)

**Arquivo:** `src/components/charts.tsx:24` · **Usado em:** `src/pages/Manutencao.tsx:93`

**Objetivo:** responder "por que a frota não ficou 100% disponível no período?". A barra do topo (hachurada)
é a meta teórica (100%), cada barra rosa seguinte é uma causa de indisponibilidade (quebra, agendada, etc.),
e a barra final (azul sólida) é o resultado líquido.

**Dados:** `top: {label, value}`, `causes: {label, value, detail?}[]`, `bottom: {label, value}`, `goal?:
{value, label}`, `scale: [min, max]`, `format`, `formatDelta`. Em Manutenção, `causes` vem de
`d.cur.causes.map(c => ({label: c.label, value: c.pts, detail: "{horas} h paradas"}))` — ou seja, cada causa
tem pontos percentuais de indisponibilidade e o detalhe em horas.

**Comportamento:** tooltip por linha (clique/hover) mostrando o valor e, nas causas, "depois desta causa";
linha tracejada de meta sobreposta quando houver `goal`. Sem drill-down nem filtro de período próprio (herda
o período da página). Responsivo (barras em `grid`, colapsam para 2 colunas no mobile).

**Exemplo:**
```json
{
  "top": { "label": "Frota toda disponível", "value": 100 },
  "causes": [
    { "label": "Manutenção corretiva", "value": 3.2, "detail": "18 h paradas" },
    { "label": "Manutenção preventiva", "value": 1.1, "detail": "6 h paradas" }
  ],
  "bottom": { "label": "Disponibilidade real", "value": 95.7 },
  "goal": { "value": 97, "label": "Meta 97%" }
}
```

---

## CHART-004 — `EstVsReal` (estimado × realizado)

**Arquivo:** `src/components/charts.tsx:124` · **Usado em:** `src/pages/Manutencao.tsx:232` (itens do
orçamento vencedor de uma OS)

**Objetivo:** comparar, item a item, quanto foi orçado (estimado, hachurado) contra quanto foi efetivamente
gasto (realizado, sólido); o excesso aparece como uma barra rosa hachurada emendada ao final.

**Dados:** `items: {key, label, sub?, est, real}[]`, `format`. Em Manutenção: `evItems` (itens de um
orçamento vencedor de ordem de serviço), `format = v => brl(v).replace(',00','')`.

**Comportamento:** tooltip por item com estimado/realizado; rodapé textual "+R$X acima do estimado" ou
"Dentro do estimado". Estado vazio tratado fora do componente (a página mostra texto explicativo quando não
há orçamento vencedor ainda).

**Regra de negócio identificada:** excesso = `real - est`; só é desenhado se `over > 0`.

---

## CHART-006 — `ColumnChart` (colunas mensais / evolução temporal)

**Arquivo:** `src/components/charts.tsx:273` · **É o gráfico mais reutilizado do sistema.**
**Usado em:** Manutenção (disponibilidade semanal), Combustível (gasto mensal, quando não há período
anterior), Jornada (descumprimentos), Multas (custo com multas), Pneus (gasto mensal com pneus), Localle
(faturamento mensal, com seleção de mês), Revenda (acessos por mês).

**Objetivo:** mostrar a evolução de um indicador ao longo de períodos (semanas/meses), com um período em
destaque (o mais recente, por padrão) e, opcionalmente, uma linha de meta tracejada.

**Dados:** `data: {label, value}[]`, `highlight?`, `goal?: {value, label?}`, `floor?` (base do eixo — usado em
Manutenção para "zoom" em disponibilidade 95–100%), `good?: 'up'|'down'` (direção boa, colore a variação no
tooltip), `onSelect?` (torna as barras clicáveis — usado em Localle para trocar o mês do ranking ao lado).

**Comportamento:** tooltip com valor do período, meta (se houver) e variação vs. período anterior; rótulos do
eixo X se auto-ajustam para não sobrepor (`stepFor`); valores acima das barras só aparecem todos se couberem,
senão só no destaque/hover; quando `onSelect` existe, a barra vira `role="button"` navegável por teclado.
Tabela oculta (`SrTable`) dá acessibilidade a leitor de tela.

**Exemplo (Multas):**
```json
{ "data": [{ "label": "jan/25", "value": 4200 }, { "label": "fev/25", "value": 3100 }], "good": "down" }
```

---

## CHART-007 — `CompareBars` (atual × anterior)

**Arquivo:** `src/components/charts.tsx:322` · **Usado em:** Combustível, Jornada, Pneus (todas alternam com
CHART-006 **somente quando existe período anterior para comparar** — ver `02a` abaixo).

**Objetivo:** comparar, grupo a grupo, o valor do período atual (barra azul sólida) contra o anterior (barra
hachurada), lado a lado.

**Dados:** `groups: {label, cur, prev}[]`, `curLabel`, `prevLabel`, `good?`. Eixo Y com `niceMax` arredondado;
rótulos de valor somem se não couberem (mantém só no hover).

**Comportamento:** legenda fixa no topo (hachura = anterior, sólido = atual); tooltip com os dois valores e a
variação (`DeltaText`).

**Regra identificada:** a própria página decide se renderiza `CompareBars` ou `ColumnChart` — ex. em
`Combustivel.tsx:295`: `{B ? <CompareBars .../> : <ColumnChart .../>}`, onde `B` é a existência de um período
B selecionado para comparação. Isso é uma decisão de produto (não visual) que o redesign precisa preservar:
o mesmo "slot" de gráfico troca de família conforme o filtro de período.

---

## CHART-008 — `StackedColumns` (colunas empilhadas)

**Arquivo:** `src/components/charts.tsx:368` · **Usado em:** Monitoramento (`em movimento` × `parados`),
Viagens (`em viagem` × `sem viagem`), BIManut (`preventiva` × `corretiva`).

**Objetivo:** decompor um total por período em duas categorias com tons semanticamente opostos (`tone:
'real'` = resultado desejável, `tone: 'loss'` = indesejável/perda).

**Dados:** `data: {label, values:number[]}[]`, `series: {label, tone:'real'|'loss'}[]`. O total empilhado é
calculado no próprio componente (`tot`).

**Comportamento:** tooltip mostra cada série + total + participação percentual de cada uma; total acima da
coluna some se não couber (ex. 30 dias). Mesmo princípio de régua/hover de `ColumnChart`.

---

## CHART-005 — `StackedBars` (barras 100% horizontais)

**Arquivo:** `src/components/charts.tsx:186` · **Usado em:** Telemetria (`rpmRows` — faixas de RPM por
veículo, `layout="horizontal" percent`).

**Objetivo:** mostrar, por item (linha = veículo/motorista), a composição percentual de até 4 categorias
(ex. faixas de RPM: econômica, normal, agressiva).

**Dados:** `data: {label, values: Record<string, number>}[]`, `series: {key, label, fill?}[]` (até 4,
cores `cat-1`..`cat-4`), `percent?`, `right?` (render customizado do valor à direita).

**Comportamento:** barra de 100% por linha com segmentos coloridos; tooltip com cada categoria e seu valor
(percentual quando `percent=true`); tabela `sr-only` para acessibilidade. **Nota do próprio código:** "o modo
vertical saiu" — ou seja, já existiu uma variante vertical que foi removida; usar `ColumnChart` /
`CompareBars` / `StackedColumns` no lugar dela.

---

## CHART-009 — `RankBars` (ranking horizontal)

**Arquivo:** `src/components/charts.tsx:420` · **Usado em:** Localle (`rank`, ranking ao lado do faturamento
mensal, sincronizado por `onSelect` do `ColumnChart`).

**Objetivo:** ranquear itens (ex. revendas, veículos) por um valor, com posição numerada, nome e barra
proporcional ao líder.

**Dados:** `items: {label, value}[]`, `highlight?` (posição em destaque), `max?` (teto da barra, por padrão o
maior item).

**Comportamento:** tooltip com posição, valor, % do total e "líder" ou "X abaixo do 1º lugar". Placas
(`isPlate`) ganham fonte mono automaticamente.

---

## CHART-011 — `LineChart` (linha/área)

**Arquivo:** `src/components/charts.tsx:471` · **Usado em:** Telemetria (rendimento km/L por dia, com
`format`), Pneus (evolução do sulco do pneu × linha de "retirada").

**Objetivo:** mostrar a trajetória de uma ou mais séries no tempo; série `tone:'real'` pode ter área
preenchida (gradiente); série `tone:'prev'` é tracejada (comparação); meta é uma linha horizontal tracejada.

**Dados:** `labels: string[]`, `series: {label, values:(number|null)[], tone:'real'|'prev'|'loss', area?}[]`,
`goal?`, `domain?` (força a escala — usado em Pneus para incluir o valor de retirada do pneu no topo da
escala).

**Comportamento:** régua vertical + ponto em cada série ao passar o mouse (não só na barra, como nos outros
gráficos); ponto final destacado quando não há hover; clique fixa o tooltip (`pin`). Eixo com `niceTicks`
(marcas redondas). Acessível via `SrTable`.

**Exemplo (Pneus, sulco):**
```json
{
  "labels": ["jan", "fev", "mar"],
  "series": [{ "label": "Sulco", "values": [9.1, 8.3, 7.6], "tone": "real", "area": true }],
  "goal": { "value": 1.6, "label": "Retirada 1,6 mm" }
}
```

---

## CHART-016 — `TipItem` (linha de lista com barra + tooltip padrão)

**Arquivo:** `src/components/charts.tsx:157` · **O padrão mais usado para "gráfico dentro de uma lista".**
**Usado em:** Telemetria (ranking por placa), Combustível (consumo × meta por veículo), Multas (ranking por
tipo de infração), Pneus (pneus por nível de sulco), Checklist (adesão por checklist e tempo médio por
etapa), BIManut (ranking de panes).

**Objetivo:** não é um "gráfico" no sentido de biblioteca de charting — é um padrão de composição: a página
desenha sua própria barra/elemento em `children`, e `TipItem` só fornece o highlight de linha + o tooltip
consistente (`rows`, `foot`) de todos os outros gráficos. Existe para que listas com barra embutida (muito
comuns neste produto) tenham o mesmo comportamento de hover/tooltip dos gráficos "de verdade".

**Dados:** `title?`, `rows: TipRow[]` (`{label, value, strong?, tone?, swatch?}`), `foot?`, `children`
(o conteúdo visual da linha, livre).

**Comportamento:** fundo da linha muda no hover; tooltip ancorado no topo da linha (`anchorTop`).

---

## Componentes só vistos no guia de estilo (sem instância de produto confirmada)

Para os componentes abaixo, a ficha documenta apenas o **contrato** (props) — não há dado real de produto
associado nesta varredura; exemplos usam os mesmos dados fictícios do guia de estilo (`Design.tsx` /
`DesignSections.tsx`), marcados como demonstração.

### CHART-002 — `HeatMatrix` (demonstração)
`cols: {key,label}[]`, `rows: {key,label,cells:number[],total:number}[]`. Intensidade de cor proporcional ao
maior valor da matriz inteira (`max`). Pensado para "categoria × causa" (ex. tipo de evento de telemetria ×
dia da semana).

### CHART-003 — `DotMatrix` (demonstração)
`cur: number[]`, `prev: number[]`, `labels: string[]`, `peakLabel?`. Um ponto por evento/dia; cinza =
anterior, rosa = atual; rotula o pico. Pensado para contagens de eventos (alertas, infrações) por dia.

### CHART-010 — `Bar100` (demonstração)
`parts: {label,value,tone,detail?}[]`. Barra única 100%, rótulo interno quando a fatia tem ≥12% do total.
Pensado para composição simples (ex. frota por status) quando não há necessidade do anel (`Donut`).

### CHART-012 — `ProjectionChart` (demonstração)
`labels`, `actual: number[]`, `projected: number`, `budget?`. Área do realizado + reta tracejada de projeção
até o fim do período + linha de orçamento, com tag "X abaixo/acima do orçamento". Pensado para
acompanhamento de gasto vs. orçamento mensal (ex. combustível, manutenção) — hoje essas telas usam
`ColumnChart`/`CompareBars` em vez deste, então é candidato natural de evolução (ver `05-briefing-redesign.md`).

### CHART-013 — `Gauge` (demonstração)
`value, goal?, unit, max, size`. Meio-círculo com marca de meta. Pensado para indicadores 0–100% com meta
única (ex. disponibilidade, adesão a checklist).

### CHART-014 — `Donut` (demonstração)
`parts: {label,value,color,kind?}[]`, `center?`, `centerLabel?`. Hover por ângulo do ponteiro no anel (não
pela fatia em si). Suporta cores de status (`StatusGlyph`) quando a composição é de status de frota
(movimento/parado/desligado/sem sinal) — **é a mesma linguagem de cor do mapa**, conforme comentário no
código (charts.tsx:627).

### CHART-015 — `Ring` (demonstração)
`value (0–1), size, thickness, center?, label?`. Anel de progresso simples (uma parte de um todo, ex.
disponibilidade), variante mais enxuta do `Gauge` (sem arco "meio-círculo", só o anel).

---

## KPI-001 — `KpiTile` (KPI compacto)

**Arquivo:** `src/components/story.tsx:381` · **O KPI mais usado em dashboards densos** (presente em quase
todas as páginas de produto).

**Objetivo:** mostrar um número com contexto mínimo em pouco espaço — rótulo, número (único protagonista do
cartão), chip de variação e uma linha de apoio.

**Dados:** `label, value, unit?, digits?, delta?: {value, unit?, digits?, good?}, sub?, status?, display?`
(permite substituir o número padrão por um nó customizado — ex. "de N" em preventivas com atraso).

**Regra de variação:** `good` define a direção boa (`'up'` ou `'down'`); a cor da seta/número não é
automática por sinal — é calculada por "é essa direção que é boa" (`DeltaChip`, ver KPI-004).

**Exemplo (BIManut — custo por km):**
```json
{ "label": "Custo por km", "value": 1.84, "unit": "R$", "delta": { "value": -6.2, "unit": "%", "good": "down" }, "sub": "12.400 km rodados" }
```

---

## KPI-002 — `KpiCard` (KPI com gráfico embutido)

**Arquivo:** `src/components/story.tsx:183`

**Objetivo:** KPI "âncora" de uma seção: número grande, delta ou status à direita, gráfico opcional embutido
(`children` — tipicamente um `ColumnChart`/`LineChart` com `height` reduzido) e rodapé com leitura/insight
("motivo da rota").

**Estados tratados no próprio componente:** `loading` (skeleton), `error` (mensagem + retry), `empty`
(quando `value == null`), `ready`. Isso cobre o requisito de "estados de loading, vazio e erro" para todos os
KPIs que o usam — é tratado uma vez na biblioteca, não em cada página.

---

## KPI-003 — `KpiHero` (KPI "herói")

**Arquivo:** `src/components/story.tsx:214`

**Objetivo:** o KPI mais importante de uma página/seção: número grande (`size="display"`), frase de contexto,
barra de meta (posição do valor atual vs. meta, numa escala `scale`) e linhas de detalhe (`rows`) cada uma
com seu próprio delta.

**Dados:** `value, unit, delta?, sentence?, goal?: {value,label}, scale?: [min,max], rows?: KpiRow[]`.

**Comportamento:** mesmos 4 estados de `KpiCard`. A barra de meta é a mesma metáfora visual usada em
`ColumnChart`/`LineChart` (traço de meta), reaproveitada aqui como barra horizontal.

---

## Pendências de regra de negócio (não documentadas no código revisado)

- Fórmula exata de "pontos de indisponibilidade" por causa (Waterfall/Manutenção) — vem pronta de `d.cur.causes`,
  calculada fora dos arquivos revisados (provável hook/serviço de dados).
  Ver `/*services/hooks de Manutenção*/`.
- Critério de "meta" por módulo (ex. meta de disponibilidade, meta de consumo km/L) — varia por frota/contrato
  e não está hardcoded nos componentes de gráfico (eles só desenham o que recebem).
- `isPlate()` (`src/lib/utils.ts`) decide se um rótulo vira chip mono de placa — não auditado em detalhe aqui.
