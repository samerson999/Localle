# 07 — Refinamento de KPIs e gráficos (demonstração isolada em `/design`)

> Escopo: só `/design` e os componentes/arquivos em `src/pages/design/`. Nenhuma tela de produto,
> regra de negócio, endpoint ou componente compartilhado de produção foi alterado. `KpiTile`/`KpiCard`
> (produção) são usados só como leitura (consumidos, não modificados); `KpiHero` de produção não foi
> tocado — a variante de destaque com superfície de marca é uma anatomia nova, isolada em
> `src/pages/design/KpiHeroDestaque.tsx`, conforme a regra 3 do briefing ("se for necessário
> experimentar uma nova anatomia, criar uma implementação de demonstração isolada").

## 1. Inspeção (`PRODUCT.md`, `tokens.css`, componentes atuais)

- `PRODUCT.md` já define, como regra de produto, que a cor da revenda só entra em: botão principal,
  controles de seleção, link, halo do veículo selecionado e **card de dica** (no máximo um por tela),
  sempre com fallback grafite calculado por contraste (`src/lib/brand.ts`). Cores de dado (azul/rosa/
  hachura) e de status são fixas, nunca seguem a revenda.
- O "card de dica" já existe: `TipCard` (`src/components/ui.tsx:211`), usando os tokens
  `--brand-tip`/`--brand-tip-line`, calculados em `brandVars()` (`src/lib/brand.ts:51-77`) com fallback
  para `--graphite-soft`/`--line-strong` quando a cor da revenda é inadequada.
- `KpiHero` de produção (`src/components/story.tsx:214`) hoje não tem nenhuma seção com cor de marca —
  é inteiramente branco/neutro. A demonstração adiciona essa seção **sem tocar no arquivo**.

## 2. Tokens reais usados (nenhum valor literal novo)

| Uso na demonstração | Token citado | Onde está definido |
|---|---|---|
| Superfície da "Leitura da frota" | `--brand-tip` | `tokens.css:136`, recalculado em `brand.ts:63` |
| Borda da "Leitura da frota" | `--brand-tip-line` | `tokens.css:137`, recalculado em `brand.ts:64` |
| Fallback grafite da superfície | `--graphite-soft` | `tokens.css:67` |
| Fallback grafite da borda | `--line-strong` | `tokens.css:51` |
| Símbolo de rota (dois nós) | componente `RouteMotif` (`ui.tsx:193`), cor `var(--real)` e `var(--ink-3)` já fixas no próprio SVG | — |
| Resultado favorável (barra divergente, chip) | `--real` | `tokens.css:72` |
| Resultado desfavorável | `--loss` / `--loss-ink` | `tokens.css:77-78` |
| Resultado neutro (sem meta ou exatamente na meta) | `--target` (traço de meta/neutro) e `--ink-2` (texto) | `tokens.css:82` |
| Raio do card de destaque | `rounded-card` → `--r-card` | `tokens.css:201` |
| Raio da caixa de leitura/itens | `rounded-ctl` → `--r-ctl` | `tokens.css:205` |
| Espaçamento interno compacto | `p-card-sm` → `--pad-card-sm` | `tokens.css:171` |
| Espaçamento entre blocos do card | `gap-stack`, `mt-kpi-chart` → `--gap-stack`, `--kpi-chart` | `tokens.css:175,181` |
| Tipografia do número de destaque | `size="display"` (`Num`) → `--fs-display` | `tokens.css:24` |
| Sombra | nenhuma nova — `KpiHeroDestaque` não usa sombra (`--shadow-card: none`, regra "sombra só no que flutua") | `tokens.css:219` |

**Lacunas de token identificadas:** nenhuma. Todos os tokens necessários para esta demonstração já
existem em `tokens.css`. Se o redesign de produção precisar de uma superfície de marca mais "escura"
("grafite" citado no briefing como opção de superfície de card de destaque, diferente do fallback
grafite da revenda), **não existe token para isso hoje** — seria preciso propor um novo (ex.
`--surface-dark`/`--on-dark-tip`) antes de usá-lo; esta demonstração não o criou, só sinaliza a lacuna.

## 3. Anatomia comum dos cards (documentação)

Os três componentes de KPI de produção (`KpiTile`, `KpiCard`, `KpiHero`, em `src/components/story.tsx`)
compartilham a mesma anatomia em três densidades:

1. **Cabeçalho** — rótulo/título (+ ícone e ↗ nos dois últimos).
2. **Número** — sempre o protagonista (`Num`, tamanhos `kpi`/`display`), nunca dividindo destaque com
   ícone ou chip.
3. **Contexto imediato** — chip de variação (`DeltaChip`) ou status, ao lado do número.
4. **Conteúdo adicional** — opcional: linha de apoio (`sub`), gráfico embutido (`KpiCard`), barra de
   meta + linhas de detalhe (`KpiHero`).
5. **Leitura** — só no analítico e no destaque, nunca no compacto:
   - Analítico: `insight` neutro, rodapé com `Insight`/`ChartFoot` (fundo branco, igual ao resto do card).
   - Destaque: nesta demonstração, passa a ter uma caixa própria (`Leitura da frota`) com superfície de
     marca — a única diferença de anatomia proposta em relação ao `KpiHero` atual.

Regra confirmada no código (`KpiTile`, `story.tsx:378-394`): "o número é o único protagonista do
cartão" — a demonstração não altera isso.

## 4. Gramática dos gráficos (documentação)

Já em vigor (`charts.tsx:1-2,221-223`, `PRODUCT.md:86-87`) e preservada integralmente:

- Azul (`--real`) = realizado; rosa (`--loss`) = perda/desvio; hachura = estimado/meta/anterior.
- A barra em destaque é sempre azul, boa ou ruim — quem diz "bom ou ruim" é o chip de variação, nunca a
  barra do dado em si.
- Vermelho nunca aparece em gráfico.

**Extensão proposta nesta demonstração (barra divergente):** para rankings com meta, a gramática ganha
uma segunda dimensão, **posição geométrica**, independente da cor:

| | Posição | Cor |
|---|---|---|
| Significado | onde o valor está em relação à meta (esquerda = abaixo, centro = na meta, direita = acima) | se esse resultado é bom ou ruim (`--real` favorável, `--loss` desfavorável, `--target`/`--ink-2` neutro) |
| Depende de | só aritmética (`valor − meta`) | do contrato de polaridade da métrica (`direction`) |

Isso é uma extensão da gramática existente, não uma contradição: a cor continua tendo exatamente os
mesmos dois significados (`--real`/`--loss`) de todos os outros gráficos do produto; só passa a
depender do contrato da métrica em vez de ser sempre "azul = valor, rosa = desvio negativo fixo".

## 5. Contrato centralizado de polaridade

Implementado em `src/pages/design/metricPolarity.ts` (demonstração — não consumido por produção):

```ts
interface MetricContract {
  id: string; label: string; unit?: string;
  type: 'volume' | 'eficiencia' | 'custo' | 'disponibilidade' | 'ocorrencia';
  direction: 'up' | 'down' | 'neutral';
  digits: number;
  goalKind?: 'min' | 'max' | 'faixa';
  goalSource?: string;
  noGoalBehavior: string;
  missingDataBehavior: string;
}
```

`evaluateMetric(contract, {value, goal})` é a única função que decide `favoravel | desfavoravel | neutro`
— nenhum componente visual (`DivergentBars`, `KpiTile`, `KpiCard` na demonstração) tem `if` de polaridade
próprio. Regra-chave implementada exatamente como pedido: **indicadores de volume são neutros por
padrão**; a existência de uma meta não basta — o contrato também precisa dizer se é mínima, máxima ou
faixa, e qual direção é desejável.

As três situações pedidas estão demonstradas em `/design` (e nos exports `DEMO_VOLUME`,
`DEMO_EFICIENCIA_META_MINIMA`, `DEMO_CUSTO_META_MAXIMA`):
1. Volume sem meta → neutro.
2. Eficiência com meta mínima (quanto maior, melhor).
3. Custo com meta máxima/teto (quanto menor, melhor).

Nenhum cálculo ou configuração real de métrica foi alterado — os três contratos são fixtures da
demonstração, com `goalSource` apontando para onde a meta *deveria* vir no Setup real (texto apenas).

## 6–10. O que foi construído em `/design`

Nova seção **"Refinamento de KPIs"** (`id="refinamento-kpi"`, entre "Cards e KPIs" e "Gráficos"),
implementada em `src/pages/design/KpiRefinementSection.tsx`:

- **KPIs compactos** (`KpiTile` de produção) para as 3 métricas-contrato, sem rodapé de leitura.
- **KPIs analíticos** (`KpiCard` de produção) com leitura neutra vinda do contrato (`evaluateMetric(...).reason`).
- **Contrato de polaridade**: as três situações exibidas lado a lado com o texto de leitura gerado.
- **Card de destaque**: duas variantes do novo `KpiHeroDestaque` lado a lado, rotuladas "cor da revenda
  pinta" e "fallback grafite" — nunca como dois destaques simultâneos de uma tela real (cada `<div>` tem
  seu próprio escopo de `brandVars()`, simulando duas revendas diferentes só para a demonstração).
- **Ranking divergente**: `DivergentBars` (`src/pages/design/DivergentBar.tsx`) com os 4 exemplos do
  briefing (rendimento abaixo/acima da meta, custo abaixo/acima da meta), tooltip padrão (reaproveita
  `useChartTip`/`TipBody`/`Swatch` de `chartTip.tsx`, só leitura) e valor/meta/desvio sempre em texto —
  a cor nunca é a única pista.
- **Estados e responsividade**: a seção usa o mesmo seletor "Dados" (Com dados/Carregando/Vazio/Erro) já
  presente no topo de `/design`, aplicado aos novos KPIs; os `Grid`/`Card` reaproveitados já são
  responsivos (mesma grade do restante da página).
- **Acessibilidade**: `DivergentBars` tem `aria-label` por linha com valor, meta e leitura por extenso
  (não só a cor), e o tooltip é o mesmo mecanismo acessível (clique fixa no touch, Esc fecha) do resto do
  produto.

## Critérios de aceite — checagem

| Critério | Status |
|---|---|
| Nenhum estilo novo depende de valor literal que deveria vir de token | ✅ — ver tabela de tokens acima |
| Superfície especial usa cor da revenda ou fallback adequado | ✅ — reaproveita `--brand-tip`/`--brand-tip-line` calculados por `brandVars()` |
| KPIs de volume são neutros sem contexto de desempenho | ✅ — `DEMO_VOLUME` sempre retorna `neutro` em `evaluateMetric` |
| Interpretação de polaridade vem do contrato centralizado | ✅ — `evaluateMetric()` é o único ponto de decisão |
| Barras divergentes representam posição e desempenho independentemente | ✅ — `DivergentBars` calcula lado por `valor−meta` e cor por `evaluateMetric().polarity` separadamente |
| Card de destaque continua branco na área analítica | ✅ — só a caixa de "Leitura da frota" leva `bg-brand-tip` |
| "Leitura da frota" preserva o símbolo de rota (dois nós) | ✅ — `RouteMotif` reaproveitado de `ui.tsx` |
| Compacto sem rodapé de leitura | ✅ — `KpiTile` não ganhou `insight`/rodapé |
| Analítico com leitura neutra | ✅ — `insight` vem de `evaluateMetric(...).reason` |
| Destaque com leitura em superfície especial | ✅ |
| Valores e gráficos matematicamente consistentes | ✅ — `DivergentBars` usa a mesma escala compartilhada entre os itens comparados (maior desvio absoluto do conjunto) |
| Telas de produto inalteradas | ✅ — nenhum arquivo de `src/pages/*.tsx` de produto, `src/components/charts.tsx` ou `src/components/story.tsx` foi modificado; só `Design.tsx` (import + 1 `Section` nova) e arquivos novos em `src/pages/design/` |
| Tudo disponível em `/design` para conferência | ✅ — seção "Refinamento de KPIs", acessível pelo menu de navegação da página |

## Pendente (fora do escopo desta fase)

- Aprovação visual do usuário (abrir `/design` e conferir a seção "Refinamento de KPIs").
- Decisão de produto: migrar `KpiHeroDestaque` para `src/components/story.tsx` (substituindo/estendendo
  `KpiHero`) só depois da aprovação — não feito nesta entrega, conforme regra 3.
- Caso o redesign queira uma superfície "grafite" de destaque diferente do fallback de marca, propor o
  token novo antes de usá-lo (lacuna registrada na seção 2).
