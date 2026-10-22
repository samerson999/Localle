# Referência de UI/UX — Visor Finance (dashboard.visorfinance.app)

> Análise visual do dashboard do Visor (app de clareza financeira) feita ao vivo, logado na conta do usuário, em 2026-10-21. Objetivo: extrair padrões de UI/UX reaproveitáveis para o projeto **rastreio** (layout, hierarquia de informação, componentes de dados financeiros/numéricos, estados vazios, paywall).

## 1. Estrutura geral do shell

- **Sidebar fixa à esquerda** (~196px), fundo branco, dividida em grupos com rótulo cinza pequeno em maiúsculas/caps leve:
  - **Organização**: Visão Geral, Transações, Recorrentes, Fluxo de Caixa
  - **Controle Financeiro**: Contas e Cartões, Categorias, Metas
  - **Visão Estratégica**: Projeção, Patrimônio
  - Rodapé fixo: "Suporte" + card do usuário (avatar, nome da organização "Pessoal", ícone de troca de workspace, ícone de configurações)
- Item ativo do menu: fundo azul muito claro + texto azul + ícone azul (mesmo padrão azul usado nos CTAs).
- **Topo da área de conteúdo**: breadcrumb/título da página à esquerda (ícone de colapsar sidebar + nome da página), ações à direita (sino de notificações, botão "+" azul de ação rápida — sempre no mesmo lugar em todas as páginas).
- Uma barra de progresso azul fininha no topo da viewport aparece durante navegação/loading entre páginas (feedback de transição).
- Busca global no topo da sidebar com atalho de teclado visível (⌘K), sugerindo command palette.

## 2. Visão Geral (home/dashboard)

Layout em grid de cards, 2 colunas principais:

- **Card de destaque "Você ainda pode gastar"**: valor grande (R$ 3.078,79) + "/ R$ 5.000" em cinza menor ao lado — mostra progresso dentro do orçamento. Abaixo, um **sparkline/linha de tendência** simples (sem eixos visíveis), com ponto final destacado. Dentro do mesmo card, um carrossel inferior de "Dica do Visor" (insight textual gerado, com dots de paginação e setas), fundo azul contrastante dentro do card branco.
- **Card "Distribuição dos gastos"**: donut chart central com valor total no meio ("Gasto total / R$ 2.140") + lista lateral de categorias com ícone colorido, nome, percentual (badge cinza) e valor; badges verdes/vermelhos pequenos ao lado do valor (indicam tendência vs. período anterior).
- **Card "4 contas a pagar"**: lista compacta estilo "pill" com ícones de bandeira/instituição sobrepostos, total e prazo, seta de navegação à direita.
- **Card "Transações recentes"**: lista com data-cabeçalho ("QUI, OUT 22"), por item: nome do estabelecimento, badge de categoria colorido, valor. Link "Ver todas" no canto superior direito do card.
- **Card "Resultado"**: valor de resultado do mês + badge percentual de variação (verde, "+18%"), comparação textual com mês anterior, e duas colunas inferiores (Receita / Gasto) com ícones e valores.
- Banner de **ativação condicionado** no topo da área de conteúdo ("Veja como sua dashboard ficará... Conecte sua conta") quando a conta ainda não tem integração bancária — dados de exemplo ficam visíveis mas identificados como ilustrativos.

## 3. Padrão de paywall / upsell (Visor Pro)

Página bloqueada por plano (visto em Fluxo de Caixa, Categorias — parcial, e Patrimônio) usa o **mesmo modal/overlay reutilizável**:

- Conteúdo real da página fica **desfocado/esmaecido ao fundo** (blur + opacidade reduzida), preservando contexto sem vazar dado sensível.
- Modal centralizado com:
  1. Ilustração/gráfico temático no topo (ex.: barras verdes/vermelhas para fluxo de caixa; ícones flutuantes de "Ações", "Fundos Imobiliários", "Poupança", "Caixinhas" para patrimônio).
  2. Título curto em negrito (benefício, não feature): "Saiba se o seu mês fecha no positivo e veja quanto você pode guardar".
  3. Subtítulo explicativo de 1-2 linhas.
  4. Lista de 4 bullets com ícone + benefício (reaproveitada em todas as variantes, apenas reordenada).
  5. Toggle "Mensal / Anual" com badge de desconto ("17% off") no plano anual.
  6. CTA primário azul full-width com preço embutido ("Ativar o Visor Pro por R$ 29,08 / mês →").
  7. Link secundário texto simples "Ver todos os planos".

Esse padrão é consistente — um único componente de paywall parametrizado por conteúdo (ilustração, título, bullets).

## 4. Estados vazios

Usados de forma consistente em várias páginas (Transações, Contas e Cartões, Metas):

- Ícone ilustrativo simples (não genérico, com leve contexto: caixa vazia, saquinho de dinheiro, ícones de categoria).
- Título curto e direto ("Nenhuma transação encontrada", "Sua próxima meta começa aqui!").
- Linha de apoio explicando o próximo passo ("As transações aparecerão aqui após sincronizar").
- CTA quando aplicável (ex.: "+ Criar meta").

## 5. Páginas de listagem (Transações, Categorias, Recorrentes)

- **Sub-navegação em abas** dentro da própria página (pill tabs brancas com uma ativa destacada): ex. "Extrato / Categoria / Tipo de gasto" em Transações; "Categorias / Tipo de Gasto / Tags / Automações / Filtros" em Categorias; "Despesas / Receitas" em Recorrentes.
- Barra de busca local + filtros (ícone de slider) acima da lista.
- Resumo numérico no cabeçalho da lista (contadores de entrada/saída, totais) alinhado à direita, com ícones coloridos por tipo (verde entrada, vermelho saída, azul saldo).
- Em Categorias: layout mestre-detalhe — coluna esquerda com resumo do mês (toggle Despesas/Receitas, seletor de mês com setas, "Gasto total" grande) e coluna direita com lista expansível de categorias (ícone colorido redondo, nome, contador entre parênteses, valor, menu de contexto "⋮").
- Em Recorrentes: gráfico de barras temporal "Próximos 6 meses" com legenda de cor por tipo (Parcelas laranja / Contas fixas azul), cards de resumo do mês abaixo, e duas colunas específicas "Contas fixas" / "Parcelas" com contadores.

## 6. Contas e Cartões

- Abas "Contas / Cartões".
- "Saldo total" como número grande no topo (mesmo padrão de hierarquia tipográfica usado em outros resumos).
- Agrupamento por origem ("Contas manuais") com lista de linhas: ícone, nome + tipo (texto secundário cinza), valor à direita, "Sem movimentação" como estado informativo inline.
- Ação secundária no header da página ("Transferências inteligentes") ao lado do sino e do botão "+".

## 7. Padrões visuais transversais (tokens implícitos)

- **Tipografia de valores monetários**: números grandes em preto/quase-preto, moeda e casas decimais em peso normal, contexto comparativo em cinza menor na mesma linha.
- **Cores semânticas**: verde = positivo/receita/alta; vermelho = negativo/gasto/baixa; azul = ação primária, marca, item ativo. Badges arredondados pequenos para variação percentual e contagem.
- **Cards**: fundo branco, cantos arredondados grandes (~16px), sombra bem sutil, padding generoso; grid responsivo de 2 colunas no desktop.
- **Ícones de categoria**: quadrado arredondado colorido (pastel) com ícone central — reaproveitado em categorias, transações e distribuição de gastos (mesmo componente em contextos diferentes).
- **Botão de ação flutuante** (canto inferior direito, azul, ícone de "assistente"/chat) presente em todas as páginas — parece ser um atalho de IA/suporte sempre acessível.
- **Microcopy**: tom direto e pessoal ("Você ainda pode gastar", "Sua próxima meta começa aqui!"), sem jargão técnico.

## 7b. Valores medidos (computed styles via Claude in Chrome, 2026-10-21)

> Medido com `getComputedStyle`/`getBoundingClientRect` diretamente no DOM renderizado, viewport ~1907×1304 (janela maximizada do usuário). Não foi possível testar 1440/1024/768/390px fisicamente (sem controle de resize da janela real do usuário) — breakpoints marcados **[COND]**.

**Stack real do Visor (achado importante):** o app **não é React/shadcn**. É servido com **Phoenix LiveView** (classe `phx-connected` no body) + Tailwind utilitário com nomes de classe no estilo **DaisyUI** (`bg-base-100`, `sidebar-nav-item`). Há atributos `data-state` isolados (padrão Radix-like), mas não há `__NEXT_DATA__`, nem `data-radix-collection-item`. Isso não muda a análise de layout/proporção, mas significa que **não existe um "código-fonte React" do Visor para comparar 1:1** — a adaptação no rastreio (React + shadcn/ui + Tailwind v4) será sempre uma tradução de padrão visual, nunca port de componente.

| Item | Valor medido | Observação |
|---|---|---|
| Fonte | `"DM Sans", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif` | `font-family` do `body`; sem `@font-face` custom acessível (sheet de fontes bloqueada por CORS) |
| Título de página (header, ex. "Visão Geral") | 14px / peso 500 / line-height 20px / cor `rgb(109,109,109)` | é um `<span>` dentro do header, cinza médio, não preto |
| Título de card (ex. "Distribuição dos gastos") | `<h3>` 14px / peso 400 / line-height 20px / letter-spacing -0.28px / cor `rgb(109,109,109)` | mesmo tom de cinza do título de página |
| Valor de destaque (ex. "R$ 3.078,79") | 32px / peso 500 / line-height 41.6px / letter-spacing **-1.28px** / cor `rgb(16,24,40)` (quase preto) | tracking bem negativo em fonte grande — característico |
| Valor secundário em linha (ex. "R$ 320" num badge de lista) | 14px / peso 500 / line-height 20px / letter-spacing -0.28px / cor `rgb(26,26,26)` | |
| Texto terciário/comparativo (ex. "- R$ 3.350,00") | 12px / peso 400 / line-height 16px / cor `rgb(26,26,26)` | |
| Rótulo de grupo da sidebar (ex. "Organização") | 12px / peso 500 / line-height 16px / cor preto a 50% de opacidade (`oklab(... / 0.5)`) | |
| Card padrão (container da home) | `bg-white dark:bg-[#1a1a1a]` · `rounded-[11px]` · `p-6` (24px) · **sem box-shadow** (`none`) · **sem borda** (`0px`) | diferenciação de card é só a cor de fundo branca sobre fundo cinza da página — não há sombra nem borda |
| Fundo da página (atrás dos cards) | `rgb(248, 249, 250)` | cinza muito claro |
| Sidebar (container) | **largura 240px**, 100% da altura, `bg-white`, padding interno `p-2` (8px), sem borda direita visível | |
| Item de navegação da sidebar (link) | `px-2 py-2` (8px) · `gap-2` · `rounded-xl` (12px computado) · altura ~40px · item ativo: fundo azul a 10% de opacidade (`oklab(... -0.03 -0.24 / 0.1)`, i.e. azul translúcido, não azul sólido) | classe utilitária própria `.sidebar-nav-item` (não é componente shadcn) |
| Header (barra superior) | altura **64px**, padding `0 32px` | |
| Botão de ação (ex. "+" do header) | `rounded-xl` (12px) · padding 8px · `transition: color/background-color/border-color/outline-color/text-decoration-color/fill/stroke/--tw-gradient-* 0.15s cubic-bezier(0.4,0,0.2,1)` | **150ms, easing padrão do Tailwind** (`ease` = `cubic-bezier(0.4,0,0.2,1)`) — confirma uso de `transition-colors` utilitário do Tailwind, não CSS custom |
| ⌘K / command palette | existe um `input[placeholder="Buscar comandos..."]` já no DOM, oculto por padrão (`display/visibility` controlado), dentro de um modal `rounded-2xl` com borda, `max-h-[75vh]`, overlay `fixed inset-0 z-[100]` | confirma padrão modal centralizado com overlay; não testado abrir/fechar via teclado nesta passada **[COND]** |
| Border-radius geral observado | 11px (card) · 12px (botão/nav item/modal pequenos) · 16px (modal grande, `rounded-2xl`) | não há um único valor de radius — há pelo menos 3 escalas em uso |
| Box-shadow | `none` em todos os elementos inspecionados (cards, botões) | a separação visual vem de cor de fundo, não de elevação — contradiz a suposição inicial da seção 7 de "sombra bem sutil" |
| Breakpoints | **medido estruturalmente** (classes Tailwind lidas no DOM, não só visual) | A sidebar (240px) e o grid de 2 colunas dos cards da Visão Geral usam o breakpoint **`lg` (1024px, padrão Tailwind)**: classe do grid é `grid gap-6 lg:grid-cols-2` (1 coluna abaixo de 1024px, 2 colunas a partir de 1024px); a sidebar fixa vira uma **barra de navegação inferior fixa** (`fixed bottom-0 inset-x-0 lg:hidden`, altura 86px, ícones + indicador azul no item ativo) abaixo de 1024px. Abaixo de ~900px aparece também um banner fixo de app mobile ("Visor — Disponível no Google Play / OBTER") no topo. Não foi necessário chegar a 768/390px pixel-perfect porque o comportamento é por classe utilitária padrão (`lg:`), não por media query customizada — ou seja, abaixo de 1024px o layout já é "modo mobile" até onde foi testado (teste real em 898px). Resíduo **[COND]**: não confirmamos se há um ponto intermediário (`md:768`) com comportamento próprio, nem o layout exato em 390px (provavelmente igual ao de 898px, já que não há classe `md:` encontrada nos elementos-chave inspecionados).
| Tooltip do gráfico (donut "Distribuição dos gastos") | **não confirmado** | Tentativa via hover sintético (CDP) duas vezes, sem tooltip aparente. Pode exigir `mousemove` contínuo que o gráfico (provavelmente Chart.js/ECharts) só captura via eventos reais do navegador — **[COND] permanece**, mas por limitação da ferramenta de automação, não por falta de tentativa. |
| ⌘K (abrir/fechar) | **medido** | Acionado clicando na caixa "Buscar" (não é `Ctrl/Cmd+K` nesta sessão — atalho exibido é "⌘x"). Modal: `576×505px` (no viewport testado), `rounded-2xl` (16px), borda `0.8px solid rgb(229,231,235)`, `box-shadow` = Tailwind `shadow-2xl` (`0 25px 50px -12px rgba(0,0,0,.25)`), fundo branco. Fecha com `Escape`. |
| Dropdown "⋮" (ex.: linha de conta em Contas e Cartões) | **medido** | Menu: `208×82px`, `rounded-lg` (8px), borda `0.8px solid rgb(229,231,235)`, `box-shadow` = Tailwind `shadow-lg` (`0 10px 15px -3px rgba(0,0,0,.08), 0 4px 6px -2px rgba(0,0,0,.04)`), fundo branco, padding vertical `4px 0`. Item: padding `8px 16px`, fonte 14px, sem radius próprio (herda do container). |
| Seletor de mês (ex. Recorrentes) | **medido** | **Correção de hipótese**: o "Outubro ▾" do header da Visão Geral **não é** o navegador de mês — é um popover de configuração do "ciclo financeiro" (dia de corte do orçamento), com botão "Salvar" (não acionado, apenas aberto/fechado para leitura). O navegador de mês real (◀ "Seu mês" / "Novembro de 2026" ▶) aparece em páginas como Recorrentes: troca via clique nas setas, atualiza a URL (`?month=2026-11`) — comportamento de **LiveView patch** (sem reload completo), e exibe um botão "Hoje" quando o mês atual não é o exibido. |
| Popover de configuração (ciclo financeiro) | **medido** (aberto só para leitura, não salvo) | `rounded-2xl` (16px), borda `0.8px solid rgb(229,231,235)`, `shadow-2xl` — mesmo padrão de elevação do ⌘K/modal. |
| Abas pill (ex. "Extrato / Categoria / Tipo de gasto") | **medido** | É um indicador deslizante: `<nav>` com altura **44px** contém um `div` absoluto (`bg-white`, `rounded-full`, `shadow-sm` = `0 1px 2px rgba(0,0,0,.05)`) que se move atrás do botão ativo com `transition: transform 0.2s cubic-bezier(0,0,0.2,1)` (Tailwind `ease-out`, 200ms). Os botões em si são transparentes (`bg-transparent`), só o indicador tem cor. |
| Skeleton / transição de página | **observado parcialmente** | Ao navegar para uma página com paywall (ex. Categorias), a animação de entrada do overlay de upsell é visível (ícones flutuantes entrando com leve atraso/parallax) — não foi possível isolar um "skeleton" de lista comum (placeholder cinza pulsante) nas páginas sem paywall testadas, pois os dados carregam quase instantaneamente (conta sem integração = poucos dados). **[COND]** para telas com volume real de dados. |
| Foco por teclado (outline) | **medido** | `Tab` em um item de navegação da sidebar aplica `outline: rgb(16,16,16) auto 0.8px` com `outline-offset: 0.8px` — é o outline **padrão do navegador** (`outline: auto`), não um anel customizado (`--tw-ring-*`/`focus-visible` próprio). Ou seja, o Visor não estilizou foco — usa o default do Chrome. |

**Correções importantes vs. seção 7 original (estimada visualmente):**
- Não há sombra sutil nos cards — é `box-shadow: none`. A separação é só branco-sobre-cinza.
- Não há uma única escala de radius — há 11px / 12px / 16px coexistindo.
- O item ativo da sidebar não é um "azul claro sólido" — é azul com alpha baixo (~10%) sobre fundo branco.
- A stack real por trás do Visor é Phoenix LiveView + Tailwind (não React/Next/shadcn) — reforça que a Fase 2 deve tratar isso como referência de **padrão visual**, não de implementação a copiar.

## 8. Oportunidades de aplicação no rastreio

- Adotar o padrão de **card de destaque com valor grande + contexto secundário + sparkline** para métricas-chave do rastreio (ex.: status de veículos, km rodado, alertas).
- Padronizar **estados vazios** com ícone + título + explicação + CTA, hoje provavelmente inconsistentes.
- Considerar um **componente de resumo mestre-detalhe** (coluna esquerda = totais/filtros, direita = lista detalhada) para telas de listagem.
- Reaproveitar a ideia de **badge de variação colorido** (verde/vermelho) para indicadores de tendência, se fizer sentido no domínio de rastreamento.
- Botão de ação flutuante fixo pode inspirar um atalho rápido global (ex. adicionar veículo/ocorrência) — avaliar se cabe no produto.

## 9. Limitações da análise

- Conta logada é de um usuário sem integração bancária conectada (muitos valores em R$ 0 ou dados de exemplo), então estados de "dados reais ricos" (ex. Fluxo de Caixa e Patrimônio completos) não foram vistos — essas páginas estavam atrás do paywall Visor Pro.
- Não foi feita inspeção de código/CSS (sem DOM/devtools), apenas observação visual via screenshots — tokens de cor/espaçamento acima são estimativas visuais, não valores exatos extraídos do CSS.
- Não foram exploradas telas de configurações, onboarding completo, nem fluxos mobile/responsivos.
