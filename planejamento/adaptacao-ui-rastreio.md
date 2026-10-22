# Plano de adaptação da UI do rastreio — referência Visor (Fase 2)

> Baseado em `/planejamento/referencia-ui-visor.md` (análise visual + medições computed-style do Visor) e na leitura da base atual (`src/styles/tokens.css`, `src/styles/base.css`, `tailwind.config.js`, `src/components/{primitives,ui,Sidebar,Layout,CommandPalette}.tsx`).
>
> **Stack real: React + Vite + Tailwind v3.4, componentes próprios (sem shadcn/ui, sem Radix).**

## 0. Achado que muda o enquadramento de tudo abaixo

A base do rastreio **não é um projeto novo precisando copiar padrões do Visor** — é um design system já maduro, com tokens centralizados (`tokens.css`), escala tipográfica própria com `tnum`/`tabular-nums`, raios/sombras/espaçamento 100% via variável (nenhum valor literal fora de `tokens.css`), sidebar já portada do shadcn/ui (documentado inline em `Sidebar.tsx`), command palette funcional com atalho real `⌘/Ctrl+K`, `EmptyState` com ilustrações 3D próprias, `Menu` (dropdown "⋮") com portal/teclado/posicionamento automático, `Skeleton`/`Table` com loading, sistema de cor de revenda (multi-tenant) com fallback de contraste calculado em runtime. Em vários pontos (tabs com FLIP real, ilustrações de vazio, paginação, cor de marca com guarda de contraste) o rastreio já está **à frente** do que foi observado no Visor.

**Correção de premissa do brief:** o brief descreve a stack-alvo como "React + Vite + shadcn/ui + Tailwind v4". A base real é **React + Vite + Tailwind v3.4** com componentes próprios *inspirados* em shadcn (sem a lib `shadcn/ui`, sem Radix, sem `cva`/`tailwind-merge`). Não há shadcn/ui instalado — ver **R-1**.

Consequência prática: esta Fase 2 não é "adotar os padrões do Visor", é um **ajuste fino e seletivo** de alguns valores (letter-spacing, duração de transição, normalização de radius) onde a medição do Visor aponta algo genuinamente diferente — e um registro explícito do que **não** se aplica porque o rastreio já resolve melhor ou de forma deliberadamente diferente.

---

## a. Tabela de tokens

| Token (tokens.css) | Valor atual | Referência medida (Visor) | Proposta | Justificativa |
|---|---|---|---|---|
| `--shadow-card` | `none` | `none` (confirmado) | **manter** `none` | Já alinhado. |
| borda do Card (`border border-line` em `ui.tsx`) | `1px solid var(--line)` | Visor: **sem borda** (só cor de fundo) | **[D-1, FIRME do usuário] remover borda do Card**, manter só contraste de fundo | Diretriz explícita do usuário. Risco: cards com `--card-2` de fundo (ex. dentro de superfície já branca) perdem a separação — ver **R-2**. |
| `--r-card` | `12px` (era 18px) | Visor: `11px` (mas não deve ser replicado) | **12px** (normalizado, por diretriz do usuário) — **APLICADO** | Usuário pediu 12 para card/botão/nav/input, não o 11 do Visor nem os 18 atuais. |
| `--r-panel` | `16px` | Visor (modal/⌘K): `16px` | **manter 16px** — **APLICADO** | Já bate com o medido e com a diretriz do usuário para modais. `Modal` corrigido para usar `rounded-panel` (antes usava `rounded-card`, efeito colateral da normalização do `--r-card`). |
| `--r-pop` (popover/dropdown "⋮") | `12px` | Visor (dropdown "⋮"): `8px`; Visor (⌘K/popover): `16px` | **12px**, alinhando com `--r-ctl`/`--r-btn` | **APLICADO.** Corrigido pelo próprio usuário durante a execução: não 16 (que alinharia com o modal), e sim 12, para bater com botões/controles — popover de menu é mais próximo de um controle do que de um modal. |
| `--r-ctl` / `--r-btn` | `12px` (era 10px) | Visor: `12px` (botão/nav item) | **12px** | **APLICADO.** Diretriz explícita do usuário. |
| `--r-tight` | `8px` | Visor: não equivalente direto | **manter 8px** | Fora do escopo das duas escalas citadas pelo usuário (chip de variação, miniatura — uso pontual, não card/botão/nav/input). |
| `--r-dock` | `12px` (era 14px) | — | **12px**, dock tratado como "controle" | **APLICADO (D-2 resolvido)**: o dock de simulação foi tratado como controle/popover (12px), não como modal (16px). |
| `--ls-kpi` | `-0.03em` (mantido) | Visor (número 32px): `-1.28px` em 32px ≈ **-0.04em** | **mantido -0.03em** | **Etapa removida (R-3 resolvido)**: a fonte do rastreio (Satoshi) não é a do Visor (DM Sans); o valor atual já é calibrado para a Satoshi. Ir para -0.04em uniforme não é neutro tipograficamente, então não foi aplicado. |
| `--ls-display` | `-0.035em` (mantido) | — | **mantido -0.035em** | Idem — mesma lógica de R-3. |
| `--ls-small` | `-0.02em` (criado) | Visor (texto 14px, ex. título de card): `-0.28px` em 14px = **-0.02em** | **`--ls-small: -0.02em`**, aplicado em `text-small` | **APLICADO.** Testado ao vivo pelo usuário entre -0.01em e -0.02em; valor final -0.02em. |
| Transição de cor (`duration-[120ms]` em `Button`/`IconButton`) | `120ms`, sem easing explícito (Tailwind `transition-colors` = `ease` por padrão, mas a classe usa `duration-[120ms]` isolado) | Visor: `150ms`, `cubic-bezier(0.4,0,0.2,1)` (Tailwind `ease` padrão) | **150ms** nas transições de cor (`Button`, `IconButton`, `TextButton`, item de sidebar) | Diretriz explícita do usuário — só para transições **de cor**; não mexe em `--t-pill` (250ms, slide de indicador), `--t-page` (200ms), `--t-bar` (400ms, mapa/gráfico), que são categorias diferentes (movimento de layout, não cor). |
| Item ativo da sidebar (`bg-graphite` fixo em `SidebarMenu`) | `--brand-soft` (fundo) + `text-brand-link` + `font-semibold` (texto e ícone, via `currentColor`) | Visor: azul do Visor a ~10% opacidade, texto azul em negrito | **Cor da revenda, com fallback automático** — **APLICADO (R-4 reaberto e revertido em 2026-10-22)** | Decisão trocada: o usuário pediu para replicar o visual do Visor. Em vez de lógica nova, reaproveitou-se `brandVars()` (`lib/brand.ts`), que já cai para grafite quando a cor da revenda é vermelha/baixo contraste — risco do R-4 original coberto sem código extra. Pílula FLIP mantida. Token `--surface-active-neutral` (da decisão anterior) removido de `tokens.css`/`tailwind.config.js` por ficar sem uso. |

---

## b. Por componente

### Shell / Sidebar
- **Estado atual**: sidebar própria (porte documentado do shadcn/ui Sidebar), 248px aberta / 72px recolhida (ícone), drawer no mobile (`<768px`), item ativo com fundo grafite sólido + pílula animada (FLIP, 250ms).
- **Gap vs. Visor**: Visor é mais simples (240px fixo, sem recolher, sem modo ícone) e usa opacidade baixa da cor da marca no item ativo, não grafite.
- **Mudança proposta**: nenhuma mudança estrutural (recolher/mobile já superam o Visor). Só a cor do item ativo é um ponto em aberto — **ver R-4**.
- **Impacto**: se a cor do item ativo mudar, afeta toda tela (componente global único).

### Header / PageHeader
- **Estado atual**: não há uma barra fixa de topo única para todas as páginas como a do Visor (64px, com título + sino + botão "+"); o `PageHeader` do rastreio é discreto e rola com o conteúdo, variando por página (alguns têm `period`, a maioria não tem ações fixas à direita).
- **Gap vs. Visor**: Visor tem uma barra persistente com ação rápida (+) sempre no mesmo lugar.
- **Mudança proposta**: **nenhuma por ora** — isso é uma decisão de arquitetura de informação (ter ou não uma ação global fixa), não um ajuste visual. Registrado como **D-4 [COND]**: perguntar se o usuário quer propor isso como mudança de produto (fora do escopo "UI visual").
- **Impacto**: se adotado, afetaria `Layout.tsx` globalmente.

### Card de destaque (KPI/Stat)
- **Estado atual**: `Stat` já existe (`bg-card border border-line rounded-card`, número com `clamp` e `CountText` animado contando até o valor).
- **Gap vs. Visor**: Visor não tem borda (D-1), radius 11 (não replicar), letter-spacing do número -0.04em (já endereçado na tabela de tokens).
- **Mudança proposta**: aplicar D-1 (remover borda). Sem alteração de tracking (`--ls-kpi`/`--ls-display` mantidos — ver R-3 na tabela acima). Nenhuma outra mudança — o `Stat` já conta com sparkline-like (via gráficos próprios) e hint abaixo, equivalente ao "Você ainda pode gastar" + tendência do Visor.
- **Impacto**: todas as telas de BI/KPI que usam `KpiHero`/`KpiTile` (mesma família de superfície que `Stat`; confirmado por auditoria: ambos ficam diretamente sobre `--canvas` em todas as páginas — Monitoramento, Manutenção, Ativos, etc.). `Stat` em si não tem uso ativo em nenhuma página hoje, só está exportado em `ui.tsx`.

### Card de distribuição (donut + lista lateral)
- **Estado atual**: não há um componente genérico "donut + legenda lateral com %, valor e badge de variação" no `ui.tsx` atual — gráficos ficam em `components/charts.tsx` (Recharts), compostos ad-hoc por tela.
- **Gap vs. Visor**: Visor tem esse padrão reutilizado (categoria → % → valor → badge). No domínio do rastreio isso mapearia a algo como "distribuição de alertas por tipo" ou "gasto por categoria de manutenção" (ver tradução de domínio, item c).
- **Mudança proposta**: **não criar um novo componente agora** — não há confirmação de que existe uma tela do rastreio que precise exatamente desse padrão. Registrar como oportunidade (**D-5 [COND]**: perguntar se alguma tela (ex. BI de Manutenção) deveria ganhar esse formato antes de desenhar o componente).
- **Impacto**: N/A até decisão.

### Lista agrupada por data (ex. "Transações recentes" do Visor)
- **Estado atual**: `Table` e `List`/`ListItem` existem, mas não há um padrão pronto de "cabeçalho de data sticky + itens abaixo" como o do Visor.
- **Gap**: real, mas de baixo impacto — poucas telas do rastreio listam eventos cronológicos soltos (a maioria usa `Table` paginada). Candidatos: `Alertas.tsx`, `Jornada.tsx`, feed de eventos.
- **Mudança proposta**: **não criar agora**; registrar como padrão disponível para quando uma tela de feed cronológico for desenhada. Não mexer em `Table`/`List` existentes.
- **Impacto**: nenhum até uma tela concreta pedir.

### Mestre-detalhe (ex. Categorias do Visor: resumo à esquerda, lista à direita)
- **Estado atual**: `Grid`/`GridItem` com `split` (`'3/9'`, `'4/8'` etc.) já cobre exatamente esse layout de forma genérica e mais flexível que o do Visor (que é fixo).
- **Mudança proposta**: nenhuma — já coberto e superior.
- **Impacto**: nenhum.

### Tabs
- **Estado atual**: `Tabs` (segmentado, indicador FLIP real — mais avançado que o Visor, que anima só `transform` sem recalcular tamanho de origem) e `PageTabs` (sublinhado). Durações: `--t-pill` 250ms.
- **Gap**: Visor usa 200ms `ease-out` no indicador; rastreio usa 250ms. Diferença pequena, categoria "movimento de layout" (não cor) — **fora** da diretriz D-FIRME de 150ms (que é só para cor).
- **Mudança proposta**: nenhuma — manter 250ms, documentado como `--t-pill`. Não alinhar ao Visor aqui, pois a diretriz do usuário foi explícita sobre "transições de cor", não sobre slide de indicador.
- **Impacto**: nenhum.

### Estado vazio (`EmptyState`)
- **Estado atual**: já tem ilustração 3D própria (`Illustration`), título, detalhe, ação, dois tamanhos (`page`/`panel`), dois layouts (`stack`/`row`) — mais rico que o padrão simples ícone+texto do Visor.
- **Mudança proposta**: nenhuma.
- **Impacto**: nenhum.

### Banner de onboarding (ex. "Veja como sua dashboard ficará" do Visor)
- **Estado atual**: não identificado um componente equivalente genérico; `TipCard`/`Callout` cobrem avisos pontuais, mas não um banner de "ative uma integração para ver dados reais".
- **Aplicabilidade ao rastreio**: **descartar** — o rastreio não tem um modelo de dado "de exemplo até conectar conta" (os dados vêm do rastreador/Traccar desde o início). Não há necessidade de porte.
- **Mudança proposta**: nenhuma.

### Command palette (⌘K)
- **Estado atual**: já existe, funcional, com atalho real, busca por placa/motorista/módulo, navegação por teclado.
- **Gap vs. Visor**: Visor usa `rounded-2xl` (16px) e abre só por clique na caixa de busca (não confirmamos atalho de teclado real no Visor); rastreio já usa `rounded-panel` (16px, igual) e tem atalho `⌘/Ctrl+K` real.
- **Mudança proposta**: nenhuma — já alinhado ou superior.

### Barra de progresso de navegação (topo, ao trocar de página)
- **Estado atual**: não identificada uma barra de progresso de navegação global (tipo NProgress) no rastreio.
- **Aplicabilidade**: **baixo valor** — é uma SPA React Router, não há full reloads como no Visor (Phoenix LiveView, que precisa desse feedback por fazer *patches* de servidor). Descartar como não aplicável ao modelo de navegação do rastreio.
- **Mudança proposta**: nenhuma.

---

## c. Tradução de domínio (Visor → rastreio)

| Padrão do Visor | Equivalente no rastreio | Observação |
|---|---|---|
| "Você ainda pode gastar" (orçamento restante) | KPI de destaque por tela (ex. "Veículos em dia", "Alertas críticos abertos", "Km rodado no período") via `Stat` | Já existe o componente; só trocar o dado. |
| Distribuição de gastos por categoria (donut) | Distribuição de alertas por tipo, ou de gastos de manutenção por categoria (pneu, combustível, peça) | Só construir se houver uma tela que peça (D-5). |
| "4 contas a pagar" (lista de pendências com prazo) | "Precisa de você" (`NeedsPanel.tsx`) — **já existe**, é o equivalente direto | Nenhuma ação necessária. |
| "Transações recentes" | Feed de eventos/alertas recentes | Candidato a usar o padrão de lista por data, se uma tela pedir (ver item b). |
| "Resultado" (receita/gasto/variação) | KPI comparativo (ex. custo por km, disponibilidade de frota) com badge de variação | `Stat` já suporta `tone` (ponto colorido, não badge com fundo — já conforme a restrição). |
| Paywall / upsell "Visor Pro" | **Descartar** — não há modelo de planos pagos por feature na UI hoje (billing existe em `lib/billing.ts`, mas não como paywall de tela) | Não portar o padrão de overlay borrado + CTA de plano. |
| Banner "dados de exemplo, conecte sua conta" | **Descartar** — ver seção b. | |
| "Transferências inteligentes" / ações financeiras | **Descartar** — fora do domínio. | |
| Ciclo financeiro (popover "Quando começa o seu ciclo") | **Descartar** — não há conceito de ciclo de orçamento no rastreio. | |
| Ícones de categoria em quadrado colorido pastel | **Já excluído por restrição permanente** (ícones sem fundo) — o rastreio já segue isso (`Icon` em `ui.tsx` não usa fundo). | Confirma alinhamento, nenhuma mudança. |

---

## d. Ordem de execução (etapas pequenas e independentes)

> **Status (2026-10-21): piloto aprovado e promovido a global.** Todas as etapas abaixo marcadas ✅ já estão em `tokens.css`/`tailwind.config.js`/`ui.tsx`/`Sidebar.tsx`/`story.tsx`. Sem git no projeto — não há commits separados por etapa, as mudanças já estão direto nos arquivos.

1. ✅ **`--ls-small` criado e aplicado** — testado ao vivo pelo usuário entre `-0.01em` e `-0.02em`; valor final **`-0.02em`** (2026-10-21). `tailwind.config.js` expõe o `letterSpacing` na entrada `small` de `fontSize`.

2. ~~Ajustar `--ls-kpi`/`--ls-display`~~ — **removida** (R-3: DM Sans ≠ Satoshi, valores atuais mantidos).

3. ✅ **Radius normalizado**: `--r-ctl`/`--r-btn` → `12px` (global, direto). `--r-card` 18→12 foi **piloto** em `Manutencao.tsx` (override local via CSS var), aprovado pelo usuário e **promovido a global** em `tokens.css` — o override local foi removido.

4. ✅ **`--r-pop` → `12px`** (corrigido pelo usuário: não 16, para alinhar com `--r-ctl`/`--r-btn`, não com o modal). `--r-dock` também → `12px` (D-2).

5. ✅ **Borda do `Card` removida** (D-1), só sobre `--canvas`. Criada `variant="inset"` (border + `bg-card-2`) para cards aninhados — **nenhum uso precisou dela** na auditoria (não há Card dentro de Card hoje); documentado em comentário no `ui.tsx` para quando surgir um caso real. `Stat`, `KpiTile` e `KpiHero` (mesma família de superfície) também perderam a borda por consistência.

6. ✅ **Transições de cor em `150ms`**: `Button`, `IconButton`, `SidebarMenuButton` (hover/estado ativo) com `duration-150`. `--t-pill` (250ms, slide da pílula/FLIP) **mantido** — é movimento de layout, não cor, fora da diretriz.

7. ~~Dark mode~~ — **removida** (fora de escopo, confirmado pelo usuário).

8. ✅ **Item ativo da sidebar**: trocado de grafite sólido para `--surface-active-neutral` (ink a 7% translúcido) + texto `text-ink`, independente da cor da revenda. Pílula FLIP mantida. Comentário em `Sidebar.tsx` reescrito.

9. ✅ **Fonte**: mantida Satoshi — encerrado, nenhuma mudança.

10. ✅ **Títulos em cinza médio**: aplicado só em `CardHeader` (título de card, `text-ink-2`, 6,9:1 sobre `--canvas`/`--card` — AA folgado). `PageHeader` (título de página) **não foi tocado**.

**D-4, D-5, D-6**: fora desta fase, mantidos como padrões disponíveis (ver seção b) — nenhuma ação de código.

---

## e. Riscos e decisões

- **R-1 [FIRME, correção de fato]**: A stack real é React + Vite + Tailwind v3.4 com componentes próprios, **não** shadcn/ui + Tailwind v4. Isso não bloqueia a adaptação (os tokens são compatíveis com qualquer versão do Tailwind), mas qualquer instrução futura que pressuponha `components/ui/*.tsx` gerados pelo CLI do shadcn ou sintaxe específica do Tailwind v4 (`@theme`, `color-mix` nativo do v4, etc.) precisa ser adaptada à realidade do projeto.

- **R-2 [RESOLVIDO]**: Decisão tomada — borda removida só nos cards diretamente sobre `--canvas` (`Card` default, `KpiHero`, `KpiTile`, `Stat`). Criada `variant="inset"` em `Card` (`bg-card-2` + borda) para o caso de card-dentro-de-card; nenhum uso precisou dela na auditoria atual (não há Card aninhado em Card hoje), documentada em comentário no `ui.tsx` para quando surgir.

- **R-3 [RESOLVIDO]**: Decisão tomada — **não aplicar** -0.04em uniforme. A Satoshi (fonte real do rastreio) não é a DM Sans (fonte do Visor usada na medição); os valores atuais (`--ls-kpi: -0.03em`, `--ls-display: -0.035em`) já são calibrados para a Satoshi e foram mantidos sem alteração.

- **R-4 [RESOLVIDO, revertido em 2026-10-22]**: Resolvido primeiro com `--surface-active-neutral` (neutro, independente da revenda). Depois o usuário pediu para replicar o item ativo do Visor (fundo + texto + ícone na cor da marca, em negrito). Em vez de reintroduzir o risco original ("vira rosa" com revenda vermelha), a implementação reaproveitou `brandVars()`/`--brand-soft`/`--brand-link` (já existentes, já com fallback para grafite nos casos de risco) — mesmo resultado visual do Visor para a maioria das revendas, sem lógica nova e sem o risco. Pílula FLIP mantida.

- **R-5 [RESOLVIDO após verificação visual, 2026-10-21]**: `--r-card`/`--r-ctl`/`--r-btn` em 12px, aplicado globalmente. Verificação visual por código (1440px e 390px) cobrindo monitoramento (mapa + painéis flutuantes + dock), formulário com input de ícone (`SearchInput`, `inputCls`), tabela paginada (`Table`/`Pagination`), modal (`Modal`) e ⌘K (`CommandPalette`): nenhum problema encontrado além do radius do `Modal` (ver correção abaixo). KPIs (`KpiHero`/`KpiTile`/`Stat`) confirmados diretamente sobre `--canvas` em todas as telas auditadas.

- **R-6 [RESOLVIDO — fora de escopo]**: Dark mode não existe hoje (sem `.dark`, sem toggle, sem variáveis duplicadas em `tokens.css`) e foi confirmado pelo usuário como fora do escopo desta adaptação. Nenhuma verificação de contraste em dark mode foi necessária.

- **D-6 [COND, novo, não estava no brief]**: Durante a auditoria, não encontrei um componente equivalente ao banner fixo "Resultado" (receita/gasto/variação em 3 colunas) nem ao card "Distribuição" com donut+lista. Antes de desenhá-los do zero, vale confirmar se alguma tela concreta do roadmap precisa exatamente desse formato — caso contrário, ficam como padrão disponível, não como trabalho desta fase.

---

**Status final (2026-10-21): fase concluída, verificada visualmente e reconciliada.** Todas as decisões em aberto (D-2 a D-6, R-2 a R-6) foram resolvidas — ver seções acima. Typecheck e build passam sem erros; sem suíte de testes no projeto. Verificação visual por código (não há acesso a browser automatizado nesta sessão; conferência final em 1440px/390px é feita pelo usuário) não encontrou problemas além de um ajuste de radius no `Modal`, já corrigido.

Arquivos alterados nesta fase:
- `src/styles/tokens.css` — `--r-card`, `--r-ctl`, `--r-btn`, `--r-pop`, `--r-dock`, `--ls-small`, `--surface-active-neutral`.
- `tailwind.config.js` — exposição de `--ls-small` na escala `fontSize.small`.
- `src/components/ui.tsx` — remoção de borda do `Card` (+ `variant="inset"`), `Stat`/`KpiTile`/`KpiHero` sem borda, `Button`/`IconButton` em `duration-150`, `CardHeader` com título em `text-ink-2`; correção pós-verificação: `Modal` usa `rounded-panel` em vez de `rounded-card`.
- `src/components/Sidebar.tsx` — item ativo em `--surface-active-neutral` (em vez de grafite sólido), `SidebarMenuButton` em `duration-150`.
- `src/components/story.tsx` — `KpiHero`/`KpiTile` sem borda, acompanhando `Card`.

---

## Migração (2026-10-22)

Varredura completa de `src/pages/` e `src/components/` (exceto os componentes padrão já cobertos acima) em busca de estilos ad hoc que escapam de `Card`/`CardHeader`/`Button`/`Stat`/`Sidebar`/`Modal`. Inventário detalhado, decisões e status item a item em `/planejamento/migracao-ui-inventario.md`. Backup do estado anterior em `../rastreio-backup-ui-2026-10-22` (cópia de `src/`).

18 ocorrências catalogadas contra os 8 padrões pedidos (cards ad hoc fora do `Card`, radius literal/fora da escala, grafite ativo fora da sidebar, transição de cor ≠150ms, sombra em card, título manual em vez de `CardHeader`, ícone/badge com fundo colorido indevido, valores literais inline). Resultado: 11 aplicadas, 3 mantidas por decisão explícita (nenhuma pendente). Typecheck e build passaram sem erros após a execução.

Arquivos alterados:
- `src/styles/tokens.css` — novo token `--r-swatch: 3px` (swatch de legenda, radius 3px já existente, só nomeado).
- `tailwind.config.js` — `rounded-swatch` exposto na escala `borderRadius`.
- `src/components/ui.tsx` — `Checkbox`/`Radio`/`Switch` (transição de cor) em `duration-150`.
- `src/components/charts.tsx`, `src/components/chartTip.tsx` — swatches de legenda/tooltip em `rounded-swatch` (era `rounded-[3px]`).
- `src/pages/Cercas.tsx` — painel "Nova cerca"/"Editar cerca" (era `<aside>` manual) agora é `<Card>`; legenda da tabela em `rounded-swatch`.
- `src/pages/Jornada.tsx` — prévia da folha de ponto (era `<div>` manual) agora é `<Card>`.
- `src/pages/Login.tsx` — borda removida do `<form>` de login (mantido como `<form>`, sobre `--canvas`).
- `src/pages/Replay.tsx` — overlay "sem posições no período" tratado como painel flutuante (`rounded-panel shadow-panel`, era `rounded-card shadow-pop`).
- `src/pages/design/KpiHeroDestaque.tsx` — borda removida (página de showcase).
- `src/pages/Pneus.tsx` — comentário explicando que `rounded-[10px]` da posição do pneu é forma ilustrativa, fora da escala de componentes (mantido sem mudança visual).

**Itens DECISÃO pendentes: nenhum.** Todos os 13 itens marcados como DECISÃO na Fase A já foram resolvidos pelo usuário (ver tabela em `migracao-ui-inventario.md`): 3 aplicados (Login, Replay, KpiHeroDestaque) e 3 mantidos sem alteração (PortariaApp, Pneus, animações de gráfico em `charts.tsx`).

---

## Densidade de texto (2026-10-22)

Rodada separada, voltada a reduzir texto em cards e gráficos (referência: Visor, seções 2 e 7 de `referencia-ui-visor.md`), não a estilo visual. Regras em `/planejamento/regras-densidade-ui.md`; diagnóstico, piloto e lotes de execução em `/planejamento/densidade-ui-diagnostico.md`. Backup do estado anterior em `../rastreio-backup-densidade-2026-10-22`.

**Piloto**: `Manutencao.tsx` (aprovado após 2 rodadas de ajuste). **Expansão**: 3 lotes cobrindo todas as telas de BI/gráfico do produto (`Combustivel`, `Checklist`, `Ranking`, `Viagens`, `Telemetria`, `Multas`, `Pneus`, `Relatorios`, `Jornada`, `Revenda`, `Locale`); as 7 telas restantes (`Ativos`, `Monitoramento`, `Alertas`, `PrecisaDeVoce`, `Replay`, `Cercas`, `PortariaApp`) foram varridas e já estavam compliant, sem mudanças. Typecheck e build passaram sem erros em todos os lotes.

Principais padrões corrigidos:
- `period` de `ChartCard` repetindo o período já visível no filtro/toolbar da tela (removido em ~15 ocorrências).
- `period`/`sentence` explicando em texto algo já óbvio no gráfico (destaque visual, ordenação, instrução de interação como "clique para…").
- `KpiHero`: `sentence` redundante com badge de variação + barra de meta; rótulos dos extremos da escala de meta (mantido só o marcador).
- Gráfico "Para onde foi o tempo da frota" (Manutenção): trocado de `Waterfall` (escala 0–100%) para `RankBars` (causas por hora, sem a âncora de topo/base) — ganho de simplicidade, sem tocar no componente compartilhado.
- `maintNeeds()` (`lib/insights.ts`): parou de mostrar duas métricas de prazo (km e dias) ao mesmo tempo quando o plano tem gatilho "ambos" — mostra só a vencida ou a mais perto de vencer. Afeta `Manutencao.tsx`, `PrecisaDeVoce.tsx`, `NeedsPanel.tsx` e os e-mails de escalonamento.
- `findPatterns()`: "Falha que se repete" parou de listar as placas na frase, só a contagem.

**Fora de escopo, por decisão explícita do usuário**: `ColumnChart` (gráfico de barras verticais) é um padrão aprovado — nenhuma tela teve sua estrutura, escala ou estilo alterados; as regras R6–R10 não se aplicam a ele.

**Itens em aberto (DECISÃO, sem aplicação)**:
- `Ranking.tsx`, card "Em atenção": título monta um `StatusDot` + contagem à mão em vez da estrutura padrão de título/sub — é mudança de composição do card, não de texto.
- Melhoria futura registrada (não é desta rodada): o botão "Revisar OS" do `PatternCard` (Manutenção) deveria abrir a lista de OS já filtrada pelo padrão identificado, em vez de só navegar para a aba geral.
