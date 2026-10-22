# 04 — Avaliação visual e UX

> **Limitação desta auditoria:** por instrução do usuário, esta sessão não usa automação de navegador; a
> conferência visual é sempre feita pelo próprio usuário no app rodando. Portanto **não há capturas de tela**
> neste levantamento — a pasta `screenshots/` fica vazia (ver nota em `06-inventario.json`). A avaliação
> abaixo é baseada em leitura de código (classes, estrutura SVG, tokens de `styles/`), não em inspeção visual
> direta. Trate os pontos de "clareza visual" como hipóteses a confirmar olhando a tela real, e os pontos de
> "estrutura/dados/acessibilidade" como fatos verificados no código.

## Pontos fortes (já no padrão que o novo design system pede)

- **Um único vocabulário de cor de dado já está em vigor**: azul = realizado, rosa = perda/desvio, hachura =
  estimado/meta/anterior, vermelho nunca aparece em gráfico (comentário explícito em `charts.tsx:1-2,221-223`).
  Isso é exatamente o princípio "cor sólida para realizado / hachuras para estimativas" do novo DS — não
  precisa ser inventado, só **preservado e levado ao novo skin**.
- **Metas já são anotadas diretamente no gráfico** (linha tracejada + rótulo) em `ColumnChart`, `LineChart`,
  `ProjectionChart`, `Waterfall`, `Gauge`, `KpiHero` — outro princípio do novo DS já implementado.
  Comparações (atual×anterior) também já são integradas (`CompareBars`), não exigem acessar outra tela.
- **Tooltip único e consistente** (`chartTip.tsx`) em todos os gráficos: mesmo corpo (`TipBody`), mesmo
  comportamento de clique para fixar no touch, mesma régua vertical em linhas. Reduz risco de o redesign
  perder consistência componente a componente.
- **Acessibilidade tratada na base**: toda visualização SVG tem uma `<table class="sr-only">` equivalente
  (`SrTable`), `role="img"` com `aria-label` descritivo nos componentes circulares, e navegação por teclado
  nas colunas clicáveis (`onSelect` do `ColumnChart`). Isso deve ser um requisito não-negociável preservado
  no redesign (ver `05-briefing-redesign.md`).
- **Estados de loading/vazio/erro já são tratados na biblioteca**, não em cada página (`KpiCard`, `KpiHero`,
  `ChartCard`). Um redesign visual não precisa reinventar esses estados — só restilizá-los.

## Riscos e oportunidades de melhoria (hipóteses a confirmar visualmente)

| Observação | Onde | Prioridade | Por quê |
|---|---|---|---|
| `ColumnChart`/`StackedColumns` escondem o rótulo de valor quando não cabe, mostrando só no hover/destaque — em telas com muitos períodos (ex. 30 dias) a maioria das colunas fica "muda" até o usuário passar o mouse, o que falha em touch sem um estado persistente óbvio | charts.tsx:286,380 | Média | Em mobile/tablet (uso de campo, pátio) não há mouse; só clique fixa o tooltip (1 por vez) — compreensão do todo exige várias interações |
| `ProjectionChart`, `Gauge`, `Donut`, `Ring`, `HeatMatrix`, `DotMatrix` existem na biblioteca mas **não aparecem em nenhuma tela de produto** encontrada | `01-inventario.md` | Alta | Ou são oportunidades perdidas (telas que deveriam usá-los e não usam — ex. Gauge/Ring para disponibilidade, Donut para composição de frota) ou código morto; qualquer um dos dois merece decisão antes do redesign |
| Decisão de alternar `ColumnChart` ↔ `CompareBars` conforme existência de período B é feita individualmente em cada página (Combustível, Jornada, Pneus) — mesmo padrão repetido 3x | Combustivel.tsx:295, Jornada.tsx:82, Pneus.tsx:105 | Baixa (duplicação, não é bug visual) | Candidato a extrair um componente único "ColumnOrCompare" para o redesign não repetir a decisão |
| `RankBars` e a variante "ranking" de `TipItem` resolvem o mesmo problema com estruturas HTML diferentes | charts.tsx:420 vs. uso em Combustivel/Multas/Pneus/Telemetria | Média | Duas implementações do mesmo padrão aumentam o custo de manter consistência visual no redesign |
| `Donut` com `kind` de status reaproveita as cores do mapa de frota (`StatusGlyph`) mas não está em uso em nenhuma tela — a composição de frota por status hoje provavelmente aparece só como lista/mapa | charts.tsx:627, 642 | Média | Potencial "quick win" visual: dar à composição de frota um resumo circular consistente com o mapa |
| Tipografia de número já segue "grande com decimais/unidade menores" (`Num`, `NUM_SIZE`) — alinhado ao DS novo; mas o comentário no código (`story.tsx:15`) avisa que **páginas antigas sem `size` ainda usam o comportamento anterior** ("até as telas migrarem na Fase C") | story.tsx:15 | Alta | Há páginas em transição de design; o redesign de gráficos deve ser sequenciado depois (ou junto) dessa migração de tipografia de número, não antes — senão o mesmo gráfico terá números em dois estilos diferentes dependendo da tela |

## Dez componentes prioritários para redesign (critério: mais reutilizados × maior impacto em decisão do usuário)

1. **KPI-002 `KpiCard`** — presente em quase todo módulo; é o primeiro contato visual com cada indicador.
2. **CHART-006 `ColumnChart`** — gráfico mais reutilizado (7 módulos).
3. **KPI-001 `KpiTile`** — segundo mais onipresente; define a "textura" dos dashboards densos.
4. **CHART-016 `TipItem`** (variante ranking/lista) — usado em 6 módulos, mas com implementações levemente
   divergentes por página; bom candidato a consolidar visual e estruturalmente ao mesmo tempo.
5. **CHART-001 `Waterfall`** — único gráfico de causa-e-efeito; alto valor para "explicar a causa", mas só 1
   instância hoje (Manutenção) — vale avaliar replicar o padrão para outros módulos (ex. custo total, tempo
   parado) no mesmo redesign.
6. **CHART-008 `StackedColumns`** — usado em módulos operacionais de alta frequência de uso (Monitoramento,
   Viagens).
7. **CHART-007 `CompareBars`** — ativado por interação do usuário (seleção de período), merece atenção
   especial de transição/estado ao alternar com `ColumnChart`.
8. **KPI-003 `KpiHero`** — ainda não confirmado em produção; decidir se entra no redesign como peça nova a
   adotar ou se permanece só no guia de estilo.
9. **CHART-011 `LineChart`** — telemetria e pneus (dado técnico, usuário não-financeiro) — legibilidade de
   eixo precisa de atenção redobrada.
10. **CHART-004 `EstVsReal`** — orçamento de manutenção é uma decisão financeira direta (aprovar/questionar
    orçamento); merece clareza de hierarquia acima da média.

## Componentes cuja interpretação depende de regra de negócio específica

- `Waterfall` (Manutenção): fórmula de "pontos de indisponibilidade" por causa.
- `EstVsReal` (Manutenção): definição de "orçamento vencedor" e cálculo de excesso.
- `ColumnChart`/`CompareBars` em Combustível, Jornada, Pneus: a própria condição de qual gráfico renderizar
  (existência de período B) é regra de produto, não só de dado.
- `StackedColumns` (BIManut): classificação preventiva × corretiva de uma ordem de serviço.
- `TipItem` (Pneus, por nível de sulco): limites que definem cada "nível" (`LEVEL[k]`).
- `TipItem` (Checklist): fórmula de adesão (`r.done / r.expected`) e meta de tempo por etapa (`TIME_GOAL_MIN`).
- `DeltaChip`/KPIs: direção "boa" (`good: 'up'|'down'`) é definida por contrato de cada indicador, não
  inferida automaticamente — importante documentar essa lista por módulo antes de redesenhar a cor da seta.
