---
target: responsividade geral - rolamento lateral em zoom 100%
total_score: 3
max_score: 8
na_heuristics: 1,2,3,6,7,8,9,10
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\Samerson Silva\\Downloads\\rastreio\\responsividade geral - rolamento lateral em zoom 100%"
timestamp: 2026-10-22T18-33-21Z
slug: responsividade-geral-rolamento-lateral-em-zoom-100
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | n/a | not evaluated in this scoped pass (focus: responsividade) |
| 2 | Match System / Real World | n/a | not evaluated in this scoped pass |
| 3 | User Control and Freedom | n/a | not evaluated in this scoped pass |
| 4 | Consistency and Standards | 2 | `Cluster`/`Grid`/`Stack` (primitives.tsx) aplicam `min-w-0` e `flex-wrap` de forma consistente, mas várias telas usam `<div className="flex items-center gap-...">` cru, fora das primitivas, sem `flex-wrap` nem `min-w-0` nos filhos — o padrão de segurança contra overflow não é universal |
| 5 | Error Prevention | 1 | não existe nenhuma rede de segurança em nível de documento (`overflow-x: hidden` em `html`/`body`); o único contenção é `overflow-x-clip` em `<main>`, que não cobre popovers/dropdowns `fixed` nem o próprio `<main>` quando o estouro vem de um filho com `position: fixed` calculado errado perto da borda |
| 6 | Recognition Rather Than Recall | n/a | not evaluated |
| 7 | Flexibility and Efficiency | n/a | not evaluated |
| 8 | Aesthetic and Minimalist Design | n/a | not evaluated |
| 9 | Error Recovery | n/a | not evaluated |
| 10 | Help and Documentation | n/a | not evaluated |
| **Total** | | **3/8** | **Acceptable (scoped subset)** |

Esta rodada ficou focada no pedido do usuário (rolamento lateral em zoom 100%, desktop-first mas totalmente responsivo). Não pontuei os heurísticos que não tocam esse problema para não diluir o sinal.

## Design Specificity Verdict

Não se aplica a este foco — é uma auditoria técnica de responsividade, não de direção visual.

**Deterministic scan**: `impeccable detect --json` rodou sobre `src/components` e `src/pages` e voltou `[]` (limpo). O detector de Impeccable olha para padrões visuais genéricos, não para "elemento mais largo que o viewport" — por isso um resultado limpo aqui não significa ausência do bug relatado. Tratei isso como sinal "não aplicável", não como "sem problema".

**Visual overlays**: não disponível nesta sessão — por convenção já registrada do projeto, as checagens visuais ficam por sua conta no navegador; eu investiguei por leitura de código (grep estrutural + leitura de componentes-chave), não por captura de tela.

## Overall Impression

O sistema layout (Sidebar fixa + `SidebarInset` fluida, e as primitivas `Stack`/`Cluster`/`Grid` em `primitives.tsx`) está bem desenhado para responsividade: quase tudo usa `min-w-0`, grids com breakpoints progressivos, e `Cluster` já quebra linha por padrão. O problema não é um grid mal montado — é a ausência de uma rede de segurança no nível do documento, combinada com dezenas de ocorrências de `flex items-center gap-*` escritas à mão (fora das primitivas) que não garantem `flex-wrap` nem `min-w-0` nos filhos. Isso é consistente com o sintoma relatado: "algumas telas" (não todas) estouram, porque o estouro depende do conteúdo específico daquela tela (quantos filtros cabem na linha, quão longo é um rótulo, etc.), não de uma falha estrutural única e visível em todo lugar.

## What's Working

- **`min-w-0` disciplinado nas primitivas**: `Stack`, `Cluster` e `Grid` (`src/components/primitives.tsx:20,26,68`) sempre aplicam `min-w-0`, que é exatamente o que evita o estouro clássico de flexbox (filho que ignora `width` do pai porque o `min-width` padrão é `auto`).
- **`Table` já resolve o próprio overflow**: `src/components/ui.tsx:751` embrulha toda tabela em `overflow-x-auto -mx-bleed`, então tabelas largas rolam *dentro* delas mesmas — não é daí que vem o rolamento da página.
- **Sidebar com `position: fixed` + espaçador (`sidebar-gap`)**: padrão correto (igual ao shadcn), não deveria, por si só, empurrar a largura do documento.

## Priority Issues

**[P1] Nenhuma rede de segurança em nível de documento contra overflow horizontal**
- **Why it matters**: `src/index.css` não define `overflow-x: hidden` (ou `clip`) em `html`/`body`. A única contenção existente é `overflow-x-clip` em `<main>` (`src/components/Layout.tsx:207`), que não protege elementos `fixed`/`absolute` posicionados fora do fluxo de `main` (popovers do `Select`/`Combobox` em `src/components/ui.tsx:331,409`, o painel de ajuda em `Layout.tsx:164`, diálogos em `story.tsx:371`) nem protege a página quando o estouro vem de algo fora de `main` por engano de cálculo de posição perto da borda da tela. Hoje, qualquer regressão futura em qualquer tela vira rolamento lateral visível, porque não há rede de segurança.
- **Fix**: adicionar `html, body { overflow-x: clip; }` (ou `hidden`, mas `clip` preserva `position: sticky`) em `src/index.css` junto da regra `html, body, #root { height: 100%; }` já existente. É uma rede de segurança, não uma correção dos casos pontuais — deve vir acompanhada dos fixes pontuais abaixo, senão só esconde o sintoma.
- **Suggested command**: `$impeccable harden` (é uma correção de robustez estrutural, não uma questão estética)

**[P1] Dezenas de linhas `flex items-center gap-*` escritas fora das primitivas, sem `flex-wrap` garantido**
- **Why it matters**: encontrei 58 ocorrências em 20 arquivos de páginas (`Monitoramento.tsx`, `Pneus.tsx`, `Viagens.tsx`, `Ranking.tsx`, os relatórios `RelatorioCercas/PassouPorAqui/Posicoes/Velocidade`, etc.) de divs `flex items-center gap-N` cruas, em vez de `<Cluster>` (que já teria `wrap` por padrão). Algumas combinam `min-w-[140–200px]` em vários itens dentro da mesma linha (ex.: `Combustivel.tsx:152,347`, `Multas.tsx:111,237`, `Jornada.tsx:89`, `Ranking.tsx:122`, `Pneus.tsx:307`, `Viagens.tsx:99`) — a soma desses `min-w` mais os `gap` facilmente ultrapassa a largura disponível em notebooks de 1280–1366px (comuns no Brasil), e sem `flex-wrap` o navegador não quebra linha: ele estoura e cria o scroll lateral. É exatamente o padrão "algumas telas, não todas" — só aparece onde a soma dos `min-w` dessa linha específica excede a coluna.
- **Fix**: trocar essas divs cruas por `<Cluster rowGap="hair">` (já tem `wrap` por padrão) onde fazem sentido como lista de itens, ou adicionar `flex-wrap` manualmente onde o layout precisa ficar como `div` solta. Auditoria arquivo a arquivo é necessária; não é um find-and-replace cego porque algumas dessas linhas estão dentro de células de tabela (`Table` já rola) e não precisam de mudança.
- **Suggested command**: `$impeccable adapt` (ajuste de responsividade dirigido, usando esta lista de arquivos como ponto de partida)

**[P2] `main` com `overflow-x-clip` mascara, mas não impede, filhos de largura fixa**
- **Why it matters**: `overflow-x-clip` em `src/components/Layout.tsx:207` faz o conteúdo cortar em vez de rolar — ou seja, hoje, parte do conteúdo de uma tela "estourada" já está sendo cortada silenciosamente (sem scrollbar, sem aviso). Isso é melhor que rolamento lateral do documento, mas pior que o usuário perceber: se o usuário vê rolamento lateral mesmo assim, o estouro está acontecendo fora de `main` (num popover/modal/dropdown), não dentro — o que aponta o problema P1-dois para os componentes fixos/flutuantes, não para o conteúdo de página comum.
- **Fix**: depois de aplicar os dois fixes acima, testar especificamente: abrir um `Select`/`Combobox` perto da borda direita da tela em 1280px e em 1366px, e o diálogo de Ajuda da sidebar (`Layout.tsx:164`, `w-[260px]` fixo a partir de `left-0` do botão — pode sair da viewport se o botão estiver perto da borda, mas como é a sidebar fixa à esquerda isso é baixo risco).
- **Suggested command**: `$impeccable audit` (checagem técnica dirigida a responsividade, não a estética)

## Persona Red Flags

**Sam (usuário de acessibilidade, zoom até 200%/teclado)**: rolamento lateral inesperado é um dos piores sintomas para quem usa zoom de navegador ou tela pequena — quebra a leitura linear e esconde conteúdo à direita sem aviso. Qualquer um dos achados P1 acima piora exponencialmente acima de 100% de zoom, porque a largura disponível encolhe e os `min-w` fixos passam a dominar ainda mais rápido a linha.

**Alex (gestor de frota, operação diária em notebook)**: é o usuário mais comum do produto (a persona primária do PRODUCT.md). Um notebook corporativo típico roda em 1366×768 ou 1280×800 com zoom do SO em 100–125%. É exatamente a faixa onde a soma de `min-w` nas linhas sem `flex-wrap` mais aperta. Rolamento lateral numa ferramenta de uso diário é fricção recorrente, não um defeito cosmético isolado.

## Minor Observations

- `src/components/SimDock.tsx:48` e os popovers em `ui.tsx:331,409` já usam `max-w-[calc(100vw-Npx)]` corretamente — é o padrão certo a copiar para qualquer elemento `fixed`/`absolute` que hoje não tenha essa trava.
- Vale confirmar, depois do fix de P1-dois, se o detector volta a rodar limpo (ele não pega esse tipo de bug hoje, então não é sinal de validação — só não vai piorar o score dele).

## Questions to Consider

- Dá pra citar 1-2 telas específicas onde você viu o rolamento (ex.: Monitoramento, Multas, Viagens)? Isso me deixaria apontar o `min-w`/linha exatos em vez de uma varredura ampla.
- Faz sentido adicionar o guard de `overflow-x: clip` no `html`/`body` já nesta rodada, mesmo sem ainda ter corrigido as linhas sem `flex-wrap`? Ele evita o sintoma imediatamente (sem scroll lateral visível), mas corta silenciosamente até o fix pontual entrar.
