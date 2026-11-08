# Estudo de caso — mobile da Localle vs. referência Visor

Documento de análise, não de implementação: registra o que já existe no código hoje, o que a
referência (app Visor, telas enviadas em 08/11/2026) faz de diferente, e o que vale adaptar — sem
copiar 1:1. Decisões concretas de execução (o quê, em que ordem) ficam para quando este caso for
discutido e aprovado.

## Contexto

O usuário já validou a direção visual de desktop (migração por fases, `docs/` e `.claude/rules/`
cobrem isso). O mobile, porém, "deixa muito a desejar" segundo o próprio usuário, principalmente em:
**filtros, botões de ação, KPIs**. Ele mandou 6 capturas do app Visor (tema escuro) como referência de
patamar de polimento, mais uma captura do meio de uma transição de rolagem do cabeçalho.

## Metodologia

1. Levantamento do código atual (`apps/web/src/components/{ui,story,Layout,Sidebar}.tsx`,
   `tokens.css`) — o que já está implementado, não suposição.
2. Leitura visual das 6 capturas do Visor (Visão geral, transição de scroll, Metas, Contas,
   Recorrências, Perfil) — hierarquia, alinhamento, espaçamento, estados vazios.
3. Comparação elemento a elemento, com recomendação e nível de esforço.

## O que já existe hoje (não é greenfield)

| Elemento | Implementação atual | Arquivo |
|---|---|---|
| Barra superior mobile | `sticky top-0`, logo + nome da seção atual, 56px, não encolhe/colapsa no scroll | `Layout.tsx:273-276` |
| Navegação inferior | Dock flutuante (pílula, 62px), 3 atalhos + "Mais" que expande um drawer | `Sidebar.tsx:142-188` |
| Alvo de toque | 44px global via `@media (pointer: coarse)` — não é um breakpoint de viewport, é por tipo de ponteiro | `tokens.css:269-278` |
| Safe area | `env(safe-area-inset-bottom)` no dock e no padding do conteúdo; **sem** `inset-top` | `Sidebar.tsx:166`, `Layout.tsx:301` |
| Filtros | Inline, `flex flex-wrap`, sem sheet dedicado; viram `w-full` empilhados abaixo de `md` | `Combustivel.tsx:49` |
| KPIs | `Grid cols={5}` → 2 colunas no mobile, 3 em `sm`, só 5 em `xl` (1280px) | `primitives.tsx:36-45` |
| Botão de ação primária | Fica dentro do card, ao lado do filtro, cada um `max-md:w-full` (empilhados, no topo do card) | `Combustivel.tsx:49` |
| Tabelas | Abaixo de `md`, viram lista de cards (`ui.tsx:1074-1104`) | `ui.tsx` |

Ou seja: a base mobile (dock, sheet, 44px, tabela→card) já é md­ura e **recente** (comentários no
código datam o dock de 03/11/2026 e o alvo de 44px de 07/11/2026 — já citando "Visor" como
referência). O gap que o usuário sente não é "não existe nada", é que **três áreas específicas**
ainda seguem o padrão desktop reaproveitado (empilhar, encolher, truncar) em vez de um padrão mobile
próprio: cabeçalho, filtros, KPIs — exatamente os três que ele citou.

## Comparação por elemento

### 1. Cabeçalho e transição de rolagem

**Visor**: título grande ("Visão geral", ~28–32px) alinhado à esquerda no topo, com bastante
respiro. Ao rolar, o título grande desaparece e um título pequeno, **centralizado**, aparece fixo no
topo (estilo "large title → compact title" do iOS). A troca é uma transição suave de opacidade +
posição, não um corte abrupto.

**Localle hoje**: o título da página nem aparece visualmente no mobile — é só `sr-only` (decisão
registrada: "o menu já diz onde se está"). A barra fixa mostra o nome da seção pequeno, mas **estático
desde o primeiro frame** — não existe o momento "título grande" que o Visor usa pra dar identidade à
tela logo na entrada.

**Avaliação**: a decisão de não duplicar o título (já aparece no menu/dock) é defensável e evita
redundância — mas joga fora a oportunidade de hierarquia que o Visor explora: um título grande dá
"peso" de entrada de tela que o usuário sente falta. Não precisa ser scroll-driven (mais complexo,
exige `IntersectionObserver` ou `onScroll` com throttle, nenhum dos dois existe hoje) para já
resolver 80% do problema.

**Recomendação** (esforço crescente):
- **Baixo**: trazer o título de volta, visível, grande, acima do KPI principal da tela — não na barra
  fixa (que continua pequena e sticky), mas como um H1 real na primeira dobra do conteúdo que rola
  junto. Resolve a falta de hierarquia sem scroll-driven.
- **Médio**: se quiser a transição do Visor de verdade — título grande que esmaece e dá lugar ao
  título pequeno da barra fixa conforme rola — precisa de `IntersectionObserver` observando um
  sentinel logo abaixo do título grande, alternando uma classe/opacity na barra fixa. Vale a pena só
  se o usuário achar que a hierarquia sozinha (opção baixo esforço) não resolve.

### 2. Filtros

**Visor**: não aparece filtro complexo nas telas enviadas (Visor é B2C, menos superfícies de filtro
que uma frota B2B) — mas os controles de alternância que aparecem (`Contas | Cartões`,
`Despesas | Receitas`) são **segmented control pill, largura total, 2 opções, alto contraste da opção
ativa**. É o padrão para "ver uma coisa ou outra", não "filtrar uma lista".

**Localle hoje**: filtros de lista (grupo, operação, marca, modelo — ex. `Combustivel.tsx`) são
`Select`s lado a lado que quebram linha (`flex flex-wrap`) no mobile. Em telas com 4 filtros (caso do
BI de combustível), isso vira 4 selects um embaixo do outro, cada um ocupando a largura toda — uma
pilha longa antes do usuário chegar ao conteúdo.

**Avaliação**: aqui a referência do Visor não cobre diretamente o caso (lista de frota com múltiplos
filtros), mas o princípio de "não empilhar tudo verticalmente antes do conteúdo" vale. O padrão mobile
mais comum pra isso (que o próprio design system já tem meio caminho andado, via `Sheet`) é: botão
"Filtros" único e compacto que abre um `Sheet` com os `Select`s dentro, e chips do que está ativo
fora do sheet, roláveis na horizontal.

**Recomendação**:
- **Baixo**: nas telas com 2 filtros, `grid-cols-2` em vez de empilhar — já corta a pilha pela metade.
- **Médio**: nas telas com 3+ filtros (BI de combustível é o caso mais extremo hoje), um botão
  "Filtros" (ícone `filtro` + contagem de filtros ativos) que abre `FloatingPanel`/`Sheet` — o
  componente já existe e já vira sheet sozinho abaixo de `md` (`FloatingPanel`, `ui.tsx:100-121`), só
  falta a tela de filtros usá-lo em vez de inline.
- Segmented control (`Contas | Cartões`) já existe como padrão? Verificar se `Pills`/`Tabs` cobre esse
  caso visualmente (parece que sim, `Pills` é citado em `PeriodCompare`) — se cobrir, é reaproveitar,
  não criar.

### 3. KPIs

**Visor**: um único KPI "herói" por tela (o número grande, R$ 0, label "igual" ao lado, delta chip
embaixo) — não uma grade de 5 KPIs pequenos. Quando há mais indicadores, eles viram atalhos
pequenos com ícone + label (Fluxo de Caixa, Categorias, Faturas), não números.

**Localle hoje**: grades de 5–7 `KpiTile`s que, no mobile, encolhem para 2 colunas — cada tile fica
estreito, a fonte do número já usa `clamp()` pra não estourar, mas o resultado ainda é "muitos números
pequenos competindo por atenção" em vez de "um número grande que importa".

**Avaliação**: isso é uma diferença de **modelo de produto**, não só de componente — o Visor é pessoal
(1 saldo), a Localle é fleet (N indicadores igualmente relevantes: gasto, consumo, custo/km,
veículos na meta). Não dá pra simplesmente "ter 1 KPI" sem perder informação que o gestor usa. Mas dá
pra aplicar o princípio de hierarquia: **1 KPI em destaque (o mais acionável da tela) + os demais como
uma faixa compacta**, em vez de todos do mesmo tamanho.

**Recomendação**:
- **Médio**: em cada tela de BI, escolher o KPI mais acionável (ex. Combustível → "Gasto" ou "Ainda
  cabe no teto") e renderizá-lo como `KpiHero` (componente já existe, `story.tsx:214`, usado em
  outro lugar) acima da grade; os demais continuam em `Grid cols={5}`, mas agora são "contexto", não
  "a tela toda".
- **Baixo** (alternativa mais barata): manter a grade, mas em 1 coluna no mobile em vez de 2 —
  cada `KpiTile` fica largo o bastante pra não precisar do `clamp()` forçar a fonte pra baixo. Troca
  "ver tudo numa olhada" por "legibilidade" — só vale se o usuário preferir isso ao `KpiHero`.

### 4. Botões de ação

**Visor**: botão de ação principal (`+`) fica **fixo no canto superior direito da barra**, pequeno,
quadrado azul arredondado — não é um FAB flutuante sobre o conteúdo nem um botão full-width dentro do
card. É sempre o mesmo lugar em toda tela (Visão geral, Metas, Contas, Recorrências), o que cria
previsibilidade: "a ação de criar está sempre ali".
Ações secundárias dentro do conteúdo (ex. "Nova meta", "Criar Reserva") **são** full-width, mas dentro
de cards de estado vazio — fazem sentido como call-to-action de conteúdo, não como ação de navegação.

**Localle hoje**: a ação primária (`+ Lançar abastecimento`) fica dentro do card, ao lado do filtro de
busca, cada um full-width empilhado — ou seja, o botão de ação **muda de lugar e de forma** conforme a
tela, e só aparece depois de rolar até o card certo.

**Avaliação**: aqui o padrão do Visor é claramente melhor e barato de adotar — um lugar fixo e
pequeno pra ação de criar, consistente em todas as telas, é exatamente o tipo de coisa que "parece
polido" sem mudar a arquitetura da informação.

**Recomendação**:
- **Baixo/Médio**: mover a ação primária "+" de cada tela mobile para a barra superior fixa
  (`Layout.tsx:273-276`, hoje só tem logo + nome da seção) — um botão quadrado azul, mesmo
  tamanho/posição em toda tela que tiver uma ação de criação clara (lançar abastecimento, nova meta,
  novo ativo, etc.). Isso dá consistência cross-tela que hoje não existe (cada página decide onde
  pôr o botão).
- Manter os CTAs full-width que já existem, mas só para estados vazios/onboarding dentro do conteúdo
  (que é o que o Visor também faz) — não para a ação "comum" da tela.

### 5. Hierarquia e espaçamento geral

Pontos menores observados nas capturas, pra registrar mesmo sem virar seção própria:

- **Muito respiro vertical** entre o número principal e o gráfico/CTA seguinte na Visão geral do
  Visor — não tem medo de espaço vazio. A Localle tende a ser mais densa mesmo no mobile (herda a
  densidade do desktop). Vale avaliar se os cards do mobile merecem um padding maior que os do
  desktop (hoje usam o mesmo `p-card`/`p-card-sm`).
- **Cards de estado vazio com ilustração ao lado do texto** (ex. "Você ainda não está protegido" +
  saco de dinheiro) — a Localle já tem `EmptyState` com ícone, mas em formato vertical centralizado;
  o Visor usa formato horizontal (texto à esquerda, ilustração à direita) em alguns casos. Não é
  prioridade, é nuance.
- **Perfil como bottom sheet** com seções bem demarcadas (cartão de perfil, código de indicação,
  coleção/gamificação, preferências com toggle) — a Localle já usa `Sheet` para isso
  provavelmente; conferir se a organização em blocos com headers (`PREFERÊNCIAS` em caps, cinza,
  menor) está sendo seguida ou se é uma lista plana.

## Prioridade sugerida (impacto × esforço)

1. **Botão de ação consistente na barra superior** — baixo esforço, alto impacto de "sensação de
   polimento" (resolve a queixa de "botões de ação").
2. **Filtros em sheet nas telas com 3+ filtros** — esforço médio, resolve a queixa de "filtros"
   diretamente, reaproveita `FloatingPanel` que já existe.
3. **Hierarquia nos KPIs (1 hero + grade de contexto)** — esforço médio, mas é a mudança mais visível
   de "parece outro produto"; vale validar com 1 tela (Combustível) antes de replicar.
4. **Título visível no topo do conteúdo (sem scroll-driven ainda)** — baixo esforço, resolve parte da
   falta de hierarquia de entrada de tela.
5. Scroll-driven large-title → compact title — só depois do item 4, se ainda sentir falta.

## Decisões (08/11/2026)

- **Botão de ação fixo**: só aparece nas telas que têm uma ação de criação clara (lançar
  abastecimento, nova meta, novo ativo...). Nas demais, a barra superior fica só com o título — não
  reserva o espaço à toa.
- **Critério do KPI hero**: o mais acionável da tela, escolhido caso a caso por quem conhece o
  módulo (ex. "Ritmo do mês" em Combustível, não necessariamente o indicador mais consultado).
- **Escopo do sheet de filtros**: vale para toda tela de lista com filtros (Ativos, Motoristas,
  etc.), não só o caso mais extremo (BI de combustível) — aplicar de uma vez, não validar isolado
  primeiro.

Com essas decisões tomadas, a lista de prioridade acima vira o próximo plano de implementação —
ainda não iniciado.
