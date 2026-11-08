# Plano de implementação — mobile (fase pós-caso de uso)

Plano de execução para `docs/CASO-MOBILE.md` (diagnóstico + decisões de 08/11/2026). Ainda não
iniciado — este documento é o "como", não decide nada novo de design (isso já foi fechado).

## Convenção de execução

Cada item abaixo, ao ser implementado, passa pelas duas skills antes de considerar "pronto":

1. **`/emil-design-eng`** — no componente que está sendo criado/alterado, antes de dar como feito:
   feedback de toque (`active:scale`), easing/duração, transição interrompível vs. keyframe,
   `transform-origin` quando for popover. Ver achados já levantados em 08/11 (scale no `:active` do
   `Button`/`IconButton`, `transition-all` a evitar, popovers ancorados ao gatilho).
2. **`/impeccable`** — revisão da tela resultante (hierarquia, espaçamento, estado vazio, i18n de
   texto longo) antes de considerar o item fechado.

Não aplicar as duas num "pass" geral no fim — aplicar por item, porque cada um mexe em componente
compartilhado que outros itens também usam (ex. o botão de ação fixo reaproveita o mesmo `Button`
que ganha o `active:scale` no item 0).

## Ordem

### 0. Base: feedback de toque no `Button`/`IconButton` (pré-requisito) — ✅ feito 08/11

Não está na lista de prioridade do caso de uso porque é transversal — mas os itens 1 e 2 criam
componentes novos que *deveriam* nascer com isso certo, em vez de corrigir depois.

- **Arquivos**: `apps/web/src/components/ui.tsx` (`Button:59-66`, `IconButton:77-85`).
- **Mudança**: adicionar `active:scale-[0.97] transition-transform duration-150` (ou token
  equivalente, se fizer sentido criar `--press-scale` em `tokens.css` para reaproveitar em outros
  componentes pressionáveis). Conferir que não quebra o `transition-colors` já existente — são
  propriedades diferentes, podem conviver na mesma `transition` com lista explícita.
- **Critério de pronto**: todo `Button` e `IconButton` do app (não só mobile) reage visualmente ao
  toque/clique. Rodar visualmente em pelo menos 1 tela por variante (`primary`, `secondary`, `dark`).
- **Risco**: nenhum (puramente aditivo, não muda layout nem comportamento).

### 1. Botão de ação fixo na barra superior mobile — ✅ feito 08/11 (prova de conceito em Combustível)

Decisão: só nas telas com ação de criação clara (não em todas).

- **Arquivos**: `apps/web/src/components/Layout.tsx:273-276` (barra hoje só tem logo + nome da
  seção). Precisa de um jeito de cada página **declarar** sua ação primária mobile — provavelmente
  um contexto ou prop subindo até o `Layout` (ver como `PageHeader`/`actions` já resolve isso no
  desktop, reaproveitar o mecanismo em vez de inventar um novo).
- **Passos**:
  1. Decidir o mecanismo de "a página diz qual é sua ação primária mobile" — opção mais simples:
     `PageHeader` já recebe `children`/ações; expor essas mesmas ações (ou uma ação explícita
     `primaryAction`) também para a barra mobile via contexto, em vez de duplicar a lógica em cada
     página.
  2. Render do botão na barra (`Layout.tsx`): quadrado, cor da marca, mesmo tamanho/posição citado
     no caso de uso — nasce com o `active:scale` do item 0.
  3. Atualizar as páginas com ação clara (Combustível → lançar abastecimento; Metas de cada módulo;
     Ativos → novo ativo; etc.) para declarar a ação em vez de renderizar o botão full-width dentro
     do card. **Os full-width continuam existindo**, mas só dentro de estado vazio/onboarding (regra
     do caso de uso).
- **Critério de pronto**: nas telas listadas, o botão de criar só aparece na barra, não mais dentro
  do card ao lado do filtro; nas telas sem ação de criação, a barra fica só com o título.
- **Risco**: é o item que mais toca páginas diferentes — fazer 1 tela primeiro (Combustível, que já
  foi o campo de prova do caso de uso), confirmar visualmente, só depois replicar.
- **Implementado**: contexto `useMobilePageAction` + render em `Layout.tsx`. Auditoria
  `/impeccable audit` (manual, escopo deste componente) achou 1 P2: botão nascia com 36×36, abaixo
  do alvo de 44px que o resto do app já usa em `pointer: coarse` — corrigido para `w-11 h-11`.
  Replicado em 08/11 para: Combustível (Lançar abastecimento), Alertas (Nova regra), Ativos (Novo
  ativo / Novo grupo / Novo motorista, um por aba), Manutenção (Nova OS, fixo em todas as abas,
  igual ao desktop), Multas (Lançar multa), Pneus (Cadastrar pneu), Ranking (Nova campanha),
  Viagens (Nova viagem / Nova viagem recorrente). Confirmado por teste que a ação troca ao mudar de
  aba e some nas abas sem ação de criação (ex. Ativos → Operações).
  Deixados de fora por não serem a ação primária da página (são criação secundária dentro de uma
  lista aninhada, não de navegação de tela): "Novo plano" e "Adicionar orçamento" em Manutenção
  (convivem com o botão fixo "Nova OS" da mesma tela), estoque/documento em Ativos, e a tela
  `Revenda.tsx` (admin de revenda, fluxo majoritariamente desktop).

### 2. Sheet de filtros em toda tela de lista com filtros — ✅ feito 08/11 (só havia 1 tela qualificando)

Decisão: vale para todas, não só o caso mais extremo.

- **Arquivos**: `apps/web/src/components/ui.tsx` (`FloatingPanel:100-121`, já vira sheet sozinho
  abaixo de `md`). Páginas afetadas: qualquer uma com 2+ `Select`/filtro inline hoje — mapear a
  lista exata antes de começar (grep por `FilterButton`/`Select` dentro de linhas de filtro em
  `apps/web/src/pages/*.tsx`).
- **Passos**:
  1. Criar o padrão "botão Filtros com contagem" uma vez (componente novo ou variante de
     `FilterButton`) — contagem = quantos filtros não estão no valor padrão.
  2. No mobile (`useIsMobile()`), esse botão abre um `FloatingPanel`/`Sheet` com os mesmos
     `Select`s que hoje ficam inline; no desktop, os `Select`s continuam inline (não mexe no
     desktop).
  3. Aplicar primeiro em **1 tela** (Combustível → BI, 4 filtros, é o caso mais extremo) e só depois
     replicar para as demais (Ativos, Motoristas, Checklist, etc. — listar durante a implementação).
- **Critério de pronto**: nenhuma tela de lista empilha 3+ `Select`s verticalmente no mobile; todas
  usam o botão + sheet.
- **Risco**: comportamento de filtro (estado, URL params) não pode mudar — só a casca visual. Testar
  que os filtros aplicados sobrevivem ao fechar/abrir o sheet.
- **Implementado**: `FilterSheet` (`ui.tsx`, ao lado de `FilterButton`/`FilterChip`) — no desktop
  renderiza `children` direto (sem mudança); abaixo de `md` vira um `FilterButton` com contagem que
  abre os mesmos campos dentro de um `FloatingPanel` (que já é Sheet no mobile, nada novo ali).
  Aplicado em Combustível → BI (os 4 selects: grupo, operação, marca, modelo).
  **Achado ao levantar as outras telas**: nenhuma outra tela de lista do app empilha 2+ `Select`s de
  filtro hoje — Ativos, Rastreadores, Jornada, Checklist, Multas, Ranking etc. têm no máximo 1
  select de filtro (já vira `max-md:w-full` sozinho, sem precisar de sheet) ou os `Select`s que
  aparecem são campo de formulário dentro de modal, não filtro de lista. Envolver um filtro único
  num botão+sheet seria uma etapa a mais sem ganho (abre uma folha pra mostrar 1 campo). Por isso o
  item fica pronto com 1 tela real resolvida e o componente pronto para a próxima tela que acumular
  2+ filtros — não há mais nada para replicar hoje.
- **Correção 08/11**: `FilterSheet` usava `FloatingPanel`, que no mobile sempre abre `Sheet
  modal={false}` (painel de detalhe recolhido, pensado para o painel do veículo sobre o mapa — abre
  mostrando só o cabeçalho e expande ao arrastar/tocar a alça). Para um filtro isso é o
  comportamento errado: o usuário via a folha subir pela metade e precisava arrastar de novo para
  ver os campos. Trocado para `Sheet modal` direto (diálogo cheio, fecha arrastando para baixo ou
  tocando fora) — mesmo padrão do `Modal`.

### 3. KPI hero por tela de BI — ✅ feito 08/11 (prova de conceito em Combustível)

Decisão: o KPI mais acionável, escolhido por quem conhece o módulo (não configurável, não "o mais
usado" por padrão).

- **Arquivos**: `apps/web/src/components/story.tsx` (`KpiHero:214`, já existe, usado em outro
  lugar — reaproveitar, não recriar). Páginas de BI: Combustível, Manutenção, Jornada, etc.
- **Passos**:
  1. Por módulo, decidir qual KPI é o hero (ex. Combustível → "Ainda cabe no teto"/Ritmo do mês,
     não "Gasto" sozinho) — decisão de produto, registrar no commit por quê.
  2. No mobile, renderizar esse KPI como `KpiHero` acima da `Grid` de KPIs secundários; no desktop,
     avaliar se vale manter os KPIs todos do mesmo tamanho (o caso de uso não pediu mudar desktop) ou
     se o hero também faz sentido lá — **não assumir, perguntar quando chegar nesse item**.
  3. Ao trocar de período/filtro, aplicar a técnica do emil-design-eng (`blur(2px)` curto no
     crossfade do valor) para o número não "piscar" trocando de um estado pro outro.
- **Critério de pronto**: Combustível mobile tem 1 KPI hero + grade de contexto; outras telas de BI
  seguem depois de validar o padrão em Combustível.
- **Risco**: é o item de maior esforço e mais sujeito a ida-e-volta de aprovação visual — fazer 1
  tela, mostrar, só então replicar (já é a abordagem registrada no caso de uso).
- **Implementado**: `KpiHero` (`story.tsx`) ganhou `display` (mesmo escape-hatch que `KpiTile` já
  tinha) para aceitar `<Num prefix="R$" .../>` — faltava isso pra qualquer hero em reais. Em
  Combustível → BI, abaixo de `md` o primeiro `KpiTile` ("Gasto") vira `KpiHero` com o mesmo valor,
  acima de uma grade de 4 colunas com os demais indicadores; no desktop o `Grid cols={5}` continua
  idêntico (confirmado por captura — nenhuma mudança visual acima de `md`). Capturei o layout mobile
  uma vez num viewport estreito real (o emulador deste ambiente não mantém a largura de forma
  estável entre chamadas) e confirmei visualmente: hero com "Gasto" grande + período + "X litros no
  período", grade de contexto abaixo, botão "Filtros" com contagem funcionando. Não consegui manter
  o viewport estreito tempo suficiente para testar a abertura do sheet de filtros nessa mesma
  sessão — vale conferir ao vivo no celular.
  **Correção 08/11 (reportada pelo usuário)**: o "+" de Combustível (Lançar abastecimento) abria o
  form "parado na metade" — diferente dos outros botões fixos. Causa: `FuelForm` tinha `autoFocus`
  no campo "Litros"; no mobile isso sobe o teclado numérico assim que a folha abre, cobrindo a
  metade de baixo antes da altura (calculada em `vh`) reagir. Nenhum outro formulário de criação do
  app usa `autoFocus` (Novo ativo, Nova OS, Lançar multa...) — removido para igualar o padrão.
  Critério de escolha do hero: o indicador mais acionável da tela, não o mais consultado (decisão já
  fechada) — em Combustível isso é "Gasto" porque é o número que mais se conecta com o "Ritmo do
  mês" logo abaixo (mesma pergunta: "quanto já gastei, cabe no teto?").
  **Replicado 08/11 em Manutenção** (`BIManut.tsx`): `BIDono` → hero "Custo de manutenção" (mesma
  lógica do "Gasto" de Combustível — é o número que mais se conecta com o gráfico de preventiva ×
  corretiva logo abaixo); `BIGestor` → hero "Disponibilidade" (o indicador operacional que o gestor
  mais acompanha, "quantos veículos estão disponíveis agora"). Desktop confirmado idêntico por
  captura (grades de 4 e de 2/3 colunas sem mudança); o mobile não deu pra capturar de novo nessa
  sessão (mesmo problema de viewport instável), mas o código segue o padrão idêntico já verificado
  em Combustível — vale conferir ao vivo.
  **Replicado também em**: Multas (hero "Custo em multas"), Ranking (hero "Dentro do limite"),
  Jornada (hero "Descumprimentos"), Checklist (hero "Adesão ao preenchimento"), Viagens (hero
  "Rodando sem viagem"), Pneus (hero "Gasto com pneus" — `Money` ganhou `size="display"`). Com isso
  o item 3 está feito em todas as telas de BI do app.
  **Bug real encontrado e corrigido**: em Ranking e Checklist, o `useIsMobile()` foi inserido depois
  de `return`s condicionais que já existiam nessas telas (`if (d.err) return ...; if (!A) return
  ...`) — viola Rules of Hooks (o hook não roda em toda renderização) e quebrou a tela de verdade no
  navegador ("Rendered more hooks than during the previous render"). Corrigido movendo
  `useIsMobile()` para o topo da função, antes de qualquer `return` condicional, e conferido que as
  outras 4 telas replicadas não tinham o mesmo problema. **Lição para qualquer réplica futura**:
  sempre checar se a tela tem guarda de carregamento/erro antes de inserir um hook novo — ele
  precisa vir antes dela, nunca depois.
  Também encurtadas as legendas (`sub`) mais verbosas encontradas nesse pente-fino (Multas
  "Indicações a fazer", Manutenção "OS críticas no período") — pedido do usuário: "a legenda dos
  KPIs está muito poluída". Critério: 1 fato só, não frases encadeadas com "e"/parênteses; o detalhe
  completo já mora no "Precisa de você" ou na tela de detalhe.

### 4. Título visível no topo do conteúdo — ✅ feito 08/11

- **Arquivos**: `apps/web/src/components/ui.tsx` (`PageHeader:1021-1036`, hoje `sr-only`).
- **Passos**: decidir se o H1 visível entra dentro do `PageHeader` (condicional só mobile) ou se
  cada página põe o próprio título grande acima do primeiro KPI/conteúdo. Mais simples e consistente:
  `PageHeader` ganha uma variante mobile que mostra o título (deixa de ser `sr-only` abaixo de `md`).
- **Critério de pronto**: toda tela mobile abre com um H1 visível antes do conteúdo rolar — sem
  scroll-driven ainda (isso é o item 5, só se ainda fizer falta depois deste).
- **Risco**: baixo, mas conferir que não duplica visualmente com o nome da seção que já aparece na
  barra fixa — são dois lugares diferentes (barra fixa pequena vs. título grande no conteúdo), não
  deveria ler redundante, mas vale olhar ao vivo.
- **Implementado**: `PageHeader` (`ui.tsx`) — o `<h1>` continua `sr-only` no desktop (`md` pra cima,
  nada mudou lá) e vira visível abaixo de `md` (`max-md:not-sr-only`), como `text-h2 font-semibold`
  acima do conteúdo. Confirmado ao vivo (viewport 390px real desta vez) em Combustível: aparece
  "Gestão de combustível" logo abaixo da barra fixa (que continua só com "Combustível" pequeno) —
  não ficou redundante, são hierarquias diferentes.
  **Bônus da mesma verificação**: o botão "+" de Combustível reportado como quebrado pelo usuário
  (abria "parado na metade") tinha causa raiz no `autoFocus` do campo Litros — removido; confirmado
  visualmente que agora abre igual aos demais.

### 5. Cabeçalho único — título fluido no scroll + filtro no mesmo lugar — ✅ feito 08/11

Virou obrigatório (não condicional) depois do usuário ver o resultado do item 4 e comparar direto
com o scroll do Visor ("não está fluido igual ao Visor") e apontar a separação visível entre
cabeçalho e conteúdo ("no Visor parece tudo muito unitário"). Redesenho, não só animação:

- **Fusão item 1 + item 4 num cabeçalho só**: a barra pequena (logo + nome da seção) e o `<h1>`
  grande que o item 4 tinha posto *abaixo* dela viraram uma coisa só — a barra fixa cresceu
  (`h-16`), a logo saiu dela (continua acessível no menu "Mais", igual ao Visor não repetir marca no
  cabeçalho) e o título grande mora ali, à esquerda, com a ação de criar à direita.
  `PageHeader` (`ui.tsx`) voltou a ser `sr-only`/oculto nos dois tamanhos — o `<h1>` visível agora é
  só o do `Layout.tsx`, pra não duplicar heading.
- **Sem borda**: `border-b border-line` do cabeçalho foi removido — mesma cor de fundo (`bg-canvas`)
  do resto da página, sem linha separando. É o que fazia a tela "não parecer unitária".
- **Título fluido**: `requestAnimationFrame` num `useEffect` (só mobile) escreve `opacity`/`transform`
  direto nos dois elementos de título (grande à esquerda, pequeno centralizado) conforme
  `window.scrollY`, sem passar por estado do React —ande por quê: um scroll handler que chama
  `setState` a cada pixel re-renderiza a árvore inteira a 60fps; escrever o estilo direto no DOM via
  ref custa muito menos e é exatamente o padrão que `/emil-design-eng` pede (só
  opacity/transform, nunca layout). `prefers-reduced-motion` pula pro estado final sem a transição
  contínua.
- **Ícone de filtro no cabeçalho**: a pedido do usuário, saiu de dentro do conteúdo (onde `FilterSheet`
  desenhava seu próprio botão) e foi para o cabeçalho, ao lado do título e da ação de criar — mesmo
  padrão do "+". Registro por contexto (`MobileFilterCtx`, `ui.tsx`, consumido pelo `Layout.tsx`):
  `FilterSheet` já não renderiza nenhum botão sozinho no mobile, só registra `{count, onOpen}`
  enquanto a tela estiver montada. Como o `Sheet` já usa portal pro `document.body`, mover o gatilho
  de lugar não muda nada em como a folha abre.
- **Confirmado ao vivo** (viewport 390px real): header sem borda, título "Combustível" grande que
  encolhe e centraliza ao rolar, ícone de filtro abre o sheet cheio (modal), "+" só aparece onde tem
  ação de criação — tudo coerente com as decisões já fechadas.

## Ajustes de acabamento (08/11, depois da fusão do cabeçalho)

Encontrados comparando com o Visor print a print, não estavam nos itens originais:

- **Respiro entre abas e conteúdo**: `mb-card-head` sozinho (16px) deixava a barra de abas colada
  na grade de KPIs/card seguinte no mobile — faltava o "ar" que o Visor tem entre blocos. Adicionado
  `max-md:mb-page-head` (40px) nas 12 páginas que usam o padrão `Tabs` + `mb-card-head` (Ativos,
  Checklist, Combustível, Jornada, Manutenção, Multas, Pneus, Ranking, Rastreadores, Revenda, Setup,
  Viagens) — desktop não muda.
- **Ícone de filtro só onde tem filtro de verdade**: adicionado em Ativos (filtro de categoria, que
  existia no código — `cat`/`setCat` — mas não tinha nenhum controle de UI até agora; corrigido
  junto) além de Combustível → BI. Não adicionado às outras 10 páginas do item acima — a correção de
  respiro é geral, o ícone de filtro não.
- **Seletor de período poluído**: `PeriodButton` (`story.tsx`) sempre mostrava o período **e** "vs
  período de comparação" dentro do próprio botão fechado — ficava comprido ao lado dos outros
  controles. Abaixo de `md`, o "vs ..." some do botão (`max-md:hidden`); a comparação continua
  visível assim que a folha abre, só não precisa caber no botão.

## Fora de escopo deste plano

- Mudanças de desktop (o caso de uso e as decisões são só mobile).
- Qualquer novo dado/endpoint de backend — tudo aqui é casca visual sobre dado que já existe.
