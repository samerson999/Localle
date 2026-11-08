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

### 0. Base: feedback de toque no `Button`/`IconButton` (pré-requisito)

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

### 1. Botão de ação fixo na barra superior mobile

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

### 2. Sheet de filtros em toda tela de lista com filtros

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

### 3. KPI hero por tela de BI

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

### 4. Título visível no topo do conteúdo

- **Arquivos**: `apps/web/src/components/ui.tsx` (`PageHeader:1021-1036`, hoje `sr-only`).
- **Passos**: decidir se o H1 visível entra dentro do `PageHeader` (condicional só mobile) ou se
  cada página põe o próprio título grande acima do primeiro KPI/conteúdo. Mais simples e consistente:
  `PageHeader` ganha uma variante mobile que mostra o título (deixa de ser `sr-only` abaixo de `md`).
- **Critério de pronto**: toda tela mobile abre com um H1 visível antes do conteúdo rolar — sem
  scroll-driven ainda (isso é o item 5, só se ainda fizer falta depois deste).
- **Risco**: baixo, mas conferir que não duplica visualmente com o nome da seção que já aparece na
  barra fixa — são dois lugares diferentes (barra fixa pequena vs. título grande no conteúdo), não
  deveria ler redundante, mas vale olhar ao vivo.

### 5. Scroll-driven large title → compact title (condicional)

Só avaliar depois do item 4 — se a hierarquia já resolver a queixa, não faz.

- Precisa de `IntersectionObserver` observando um sentinel logo abaixo do título grande, alternando
  classe/opacidade na barra fixa — nenhuma das duas peças existe hoje no código (nenhum
  `onScroll`/`IntersectionObserver` usado para header).
- Maior risco de performance mal feita (scroll handler mexendo em layout) — se for adiante, aplicar
  `/emil-design-eng`: só animar `opacity`/`transform`, nunca propriedades de layout, e usar
  `requestAnimationFrame`/CSS puro em vez de `onScroll` direto no React state a cada pixel.

## Fora de escopo deste plano

- Mudanças de desktop (o caso de uso e as decisões são só mobile).
- Qualquer novo dado/endpoint de backend — tudo aqui é casca visual sobre dado que já existe.
