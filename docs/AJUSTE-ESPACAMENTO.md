# Ajuste de espaçamento e hierarquia visual

Data: 21/10/2026. Feito só no código; a conferência visual fica com você (roteiro no fim).
Valem, nesta ordem: PRODUCT.md, a página /design e a referência de acabamento do Visor.

## 1. Como ficou montado

- **Tokens semânticos** em `src/styles/tokens.css` (seção "espaçamento"), expostos ao Tailwind em `tailwind.config.js` com o nome de uso: `gap-section`, `p-card`, `mb-card-head`, `mt-kpi-title`, `gap-field`…
- **Primitivas** em `src/components/primitives.tsx`, reexportadas por `ui.tsx`: `Stack`, `Cluster`, `Grid`/`GridItem`, `Section`, `PageBody`, `Heading`/`HeadingLevel`.
- **Componentes base** em `src/components/ui.tsx`: `PageHeader`, `Card` + `CardHeader` + `CardFooter`, `FormField` (o `Field` antigo é o mesmo componente), `FormGroup`, `Form`, `FormActions`, `Table`, `Modal`, `Stat`. Em `story.tsx`: `KpiCard`, `KpiTile`, `KpiHero`, `ChartCard`, `NeedsList`, `DeadlineRow`.
- **/design › Espaçamento e hierarquia** (`src/pages/DesignSpacing.tsx`): a tabela de tokens e as 8 regras, cada uma com um exemplo certo e um errado.
- Duas utilidades em `src/styles/base.css`:
  - `.ico-line`: caixa com a altura de uma linha de texto (`1lh`) e o ícone centrado nela. Substitui os `mt-[2px]`, `mt-0.5` e `mt-[5px]` usados para alinhar o ícone à primeira linha.
  - `.bleed-card` e `.bleed-card-sm`: definem `--bleed` com o padding do contêiner.
- **Alinhamento de tabelas e listas:** a tabela dentro de um card encosta nas bordas dele (`-mx-bleed`), e a primeira e a última célula recuam pelo padding do card. Assim o texto da 1ª coluna alinha com o título do card. É a única margem negativa do sistema, e sai de token.

## 2. Tabela de tokens

| Token | Valor | Quem aplica | Uso |
|---|---|---|---|
| `--page-x` / `--page-x-md` | 16 / 40 | Layout (`<main>`) | margem lateral da página (celular / a partir de md) |
| `--page-top` / `--page-top-md` | 24 / 24 | Layout | topo do conteúdo; no desktop, o título fica na linha do botão "Precisa de você" |
| `--page-head` | 40 | `PageHeader` | cabeçalho da página → conteúdo |
| `--gap-section` | 40 | `PageBody`, `Stack gap="section"` | entre seções |
| `--gap-grid` | 16 | `Grid`, `Stack gap="grid"` | entre cards |
| `--page-end` | 96 | Layout | respiro no fim da página (simulador, avisos) |
| `--pad-card` / `--pad-card-sm` | 24 / 16 | `Card` / `Card dense`, `KpiTile`, `Stat` | padding do card |
| `--card-head` / `--card-head-sm` | 16 / 12 | `CardHeader` | cabeçalho do card → conteúdo |
| `--card-foot` | 16 | `CardFooter` | acima e abaixo do divisor do rodapé |
| `--gap-stack` | 12 | `Stack` | entre blocos dentro do card |
| `--gap-tight` | 8 | `Cluster` | chips, botões, status em linha |
| `--gap-hair` | 4 | `Stack gap="hair"` | título e apoio de um mesmo item |
| `--kpi-title` | 12 | `KpiCard`, `KpiTile`, `KpiHero` | título → número |
| `--kpi-meta` | 8 | idem | número → apoio (chip, meta) |
| `--kpi-chart` | 20 | `KpiCard`, `KpiHero` | apoio → gráfico |
| `--h-row` / `--h-row-sm` | 48 / 40 | `Table`, `Table dense`, listas | altura da linha |
| `--cell-x` | 12 | `Table` | entre colunas |
| `--bleed` | padding do card | `Card`, `Panel`, `Modal`, `FloatingPanel` | recuo da 1ª e da última célula |
| `--field-label` | 6 | `FormField` | rótulo → campo |
| `--gap-field` | 16 | `FormGroup`, conteúdo do `Modal` | entre campos |
| `--gap-group` | 32 | `Form` | entre grupos de campos |
| `--form-actions` | 24 | `FormActions`, rodapé do `Modal` | último campo → ações |
| `--gap-icon` / `--gap-icon-head` | 8 / 12 | botões, itens / `CardHeader` | ícone → texto |

A escala é de 4 px: 4, 8, 12, 16, 20, 24, 32, 40, 48 e 96. A única exceção é `--field-label` (6), que o brief pede.

## 3. O que mudou nos componentes base

- **PageHeader:** o cabeçalho discreto da outra sessão (ícone 15 + nome) foi mantido. Mudanças:
  - distância até o conteúdo agora é `--page-head` (40);
  - altura mínima de 40, para ficar centrado na linha do botão "Precisa de você";
  - reserva à direita a largura medida desse botão (`--top-reserve`).
- **Linha de abas e ações:** saiu de dentro do `PageHeader` (Ranking, Revenda e Viagens ainda estavam assim). Fica 40 abaixo do título e 16 acima do conteúdo que controla (proximidade).
- **Layout:**
  - no desktop, o botão "Precisa de você" flutua na linha do título e não ocupa mais uma faixa própria de 56 px; com o acesso de suporte aberto, volta a ter linha própria;
  - o `<main>` usa os tokens de página;
  - o conteúdo sobe cerca de 70 px.
- **Card:**
  - o cabeçalho fica a 16 do conteúdo (antes 20);
  - o rodapé tem divisor com 16 acima e abaixo (antes 20/16);
  - o título é `h2` direto na página e `h3` dentro de uma `Section` (nível pelo contexto, sem pular);
  - novo `subtitle`.
- **ChartCard:** passou a ser um `Card`, com os mesmos espaços. O período virou o apoio do cabeçalho. A leitura (`sentence`) vai no `CardFooter`; antes eram 24 + 20 de margem.
- **KpiCard / KpiTile / Stat:**
  - título → número 12, número → apoio 8, apoio → gráfico 20;
  - o número do `KpiTile` e do `Stat` passou a `text-kpi` (encolhe até 28 px em cartão estreito); antes era um tamanho próprio de 26–28 px;
  - padding de 16 (antes 20 × 16).
- **`Num size="lg"`:** virou `text-h2` (20 px). É o tamanho dos números secundários, nunca o do protagonista.
- **PatternCard:** número de `display` para `text-kpi`. O `text-display` fica só no `KpiHero`, um por tela.
- **Negrito:** o `DeltaChip`, o `TextButton`, os status em KPI e a ação do toast passaram de semibold para medium. Negrito fica no título e no número principal.
- **Table:**
  - cabeçalho e células alinham com o título do card;
  - linha de 48 (compacta 40);
  - esqueleto com a mesma altura da linha;
  - paginação com divisor de borda a borda.
- **Modal:** padding de 24; título a 16 do conteúdo; campos a 16 entre si; ações a 24 do último campo, com divisor.
- **Formulários:** `FormField` (rótulo → campo 6), `FormGroup` (campos a 16, com título opcional), `Form` (grupos a 32) e `FormActions` (24).
- **Listas** (`NeedsList`, `DeadlineRow`, Precisa de você): linha mínima de 48, de borda a borda do card. O ícone e o › ficam alinhados à primeira linha (`.ico-line`).
- **Controles:** paddings internos de botões, abas, menus, select, chips e toasts saíram de 6/10/14 px para a escala. O trilho do controle segmentado ficou com 40 px, a mesma altura do campo.

## 4. O que mudou em cada tela

| Tela (rota) | Mudanças |
|---|---|
| Precisa de você (`/precisa-de-voce`) | `PageBody`: os dois cards a 40. Grupos de críticos a 16 entre si e 8 do título. Linhas de 48 de borda a borda, com o › na primeira linha. Contador em peso médio. |
| Monitoramento (`/monitoramento`) | Faixa de KPIs (`Grid cols={6}`) a 16 da lista + mapa. Os cards de baixo vão para outra seção (40), alinhados ao topo e não esticados. Botões do mapa (`top-14`) sem valor solto. Painel do veículo: placa, modelo e motorista a 4; métricas com divisor 16/16. |
| Replay, Cercas, Telemetria, Alertas, Relatórios (`/monitoramento/*`) | Título → 40 → abas → 16 → conteúdo. Filtros, KPIs, mapa e tabela a 16 (`Stack gap="grid"`). Cartões de KPI em `Grid` com a mesma altura (conteúdo equivalente). Formulário de cerca com campos a 16 e ações a 24. Modal de regra de alerta em grupos (`FormGroup`) a 32. |
| Ativos (`/ativos`) | Faixa de resumo com padding de card e grupos a 40. Ficha do ativo: blocos da coluna principal a 32, painéis laterais a 16, campos a 16. Corrigido um `col-span-2` em grade de 1 coluna no modal de motorista, que criava uma coluna extra no celular. |
| Manutenção (`/manutencao`) | Linha de abas e ações a 16 do conteúdo. "Últimas 12 semanas" e "Precisa de você" em `Grid split="7/5"` alinhados ao topo. Já não estica o card do gráfico (era o vão vazio citado). Plano de manutenção em `FormGroup` de 4 colunas. |
| Combustível, Checklist, Multas, Pneus, Jornada, Viagens, Ranking (`/combustivel` …) | KPIs em `Grid cols={4/5}` com a mesma altura. Dois gráficos lado a lado (`Grid cols={2} wide`, só a partir de xl, como antes) com a mesma altura. Um gráfico ao lado de uma lista ou tabela (Pneus › Vidas, Ranking › Destaques, BI de manutenção › Na oficina) fica alinhado ao topo, sem esticar. Divisões desiguais em `Grid split` (7/5, 8/4, 5/7) nas mesmas colunas de 12. Pilhas de cards a 16. Formulários a 16. |
| Revenda (`/revenda`) | Abas fora do cabeçalho; cards de módulos a 16. |
| Locale (`/locale`) | Seções "Cliente da simulação e acesso de suporte" e "Faturamento" (`Section`, título h2) a 40. Os dois gráficos de faturamento na mesma altura (mesma anatomia). Modal de cobrança em `FormGroup`. |
| /design | Seção nova "Espaçamento e hierarquia". As seções da vitrine usam a mesma `Section` das telas. O card "Precisa de você" da história de BI virou `Card` (antes tinha 15 e 13 px soltos). |
| Login, Portaria, Compartilhar | Só os valores fora da escala (busca da portaria: ícone e recuo do texto). |

## 5. Casos que precisam de decisão sua

1. **Título da página menor que o título do card.** O cabeçalho discreto (`h1` em `text-small`, 13 px, feito pela outra sessão a seu pedido) fica menor que o título do card (`text-h3`, 16 px). Os níveis de título (h1 → h2 → h3) estão corretos no código, mas a escala visual se inverte. Mantenho o cabeçalho discreto ou o título volta a `text-title`?
2. **Distância do cabeçalho ao conteúdo: 40.** Segui o seu pedido da outra sessão (abas são conteúdo), com 40 do título às abas e 16 das abas ao conteúdo. Se ficar longo demais com o título discreto, a alternativa é 24.
3. **Botão "Precisa de você" flutuando no desktop.** Ele não ocupa mais uma faixa própria e fica sobre o conteúdo quando a página rola (com sombra, como os outros elementos flutuantes). A faixa antiga tinha fundo do canvas e cobria o conteúdo ao rolar. Prefere a faixa de volta?
4. **Cards empilhados de assuntos diferentes** (Precisa de você › Críticos e Histórico; Locale) ficam a 40, como seções. Cards da mesma seção ficam a 16. Se preferir 16 entre todos os cards de página única, é só tirar o `PageBody`.
5. **Número do `KpiTile` em `text-kpi`.** Em faixas de 5 e 6 cartões ele fica no piso de 28 px (igual ao de antes); em 4 cartões a 1440 cresce para ~31 px. Confirme se o peso na faixa de KPIs está bom.
6. **Exceções de geometria que mantive** (não são espaçamento de layout):
   - a coluna de ícones da barra lateral (`pl-[14px]`, `px-[18px]`), que centra o ícone na coluna de 72 px recolhida;
   - o espaço entre barras de gráfico (`gap-[2px]`);
   - o ponto da linha do tempo (`ml-[3px]`);
   - o recuo de 18 px sob o ponto de status no painel de alertas;
   - o recuo de 4 a 8 px dos botões de ícone (↗, fechar) nos cantos do card, para o desenho alinhar com a borda do conteúdo (`-mr-1`);
   - o realce de hover que vaza 8 px nas linhas de gráfico.

   Quer que algum deles vire token?
7. **Documentos impressos** (`JornadaDocs`, `FolhaPonto`, fatura) ficaram de fora: seguem o padrão de documento A4, não o da tela.

## 6. Roteiro de conferência visual

Abra a 5174 com `gestor@demo.com` (o /design pede `locale@demo.com`). Confira cada rota em **1440**, **1024** e **390 px** de largura.

Em todas as telas:
- o título fica na mesma linha do botão "Precisa de você" (desktop);
- 40 do título às abas;
- 16 das abas ao conteúdo;
- cards de uma linha começam e terminam nas mesmas colunas;
- 16 entre cards e 40 entre seções;
- o último card não fica coberto pelo simulador nem pelos avisos;
- nada cortado ou sobreposto em 390.

| Rota | O que observar |
|---|---|
| `/precisa-de-voce` | Linhas de borda a borda do card, texto alinhado com o título do card; › na primeira linha; 40 entre "Críticos" e "Histórico". |
| `/monitoramento` | 6 KPIs com a mesma altura e um número cada; lista e mapa a 16 dos KPIs; "Últimos eventos" e "Movimentação" alinhados ao topo, sem vão. Em 390: KPIs em 2 colunas, lista acima do mapa. |
| `/monitoramento/replay` · `/cercas` · `/telemetria` · `/alertas` · `/relatorios` | Abas do monitoramento a 16 do conteúdo; KPIs alinhados; 1ª coluna das tabelas alinhada com o título do card; formulário da cerca com campos a 16. |
| `/ativos` | Faixa de resumo; tabela alinhada com a busca; abrir um ativo: blocos a 32, painéis laterais a 16, botões do rodapé a 24 do conteúdo. Em 390: modal de motorista sem coluna extra. |
| `/manutencao` (Visão geral) | Um único número grande (Disponibilidade). "Últimas 12 semanas" sem espaço vazio embaixo. "Precisa de você" ao lado, alinhado ao topo. |
| `/manutencao` (BI dono e gestor) | Faixa de KPIs com a mesma altura; pares de gráficos lado a lado só em 1440 (em 1024, um embaixo do outro). |
| `/combustivel` · `/checklist` · `/multas` · `/pneus` · `/jornada` · `/viagens` · `/ranking` | Abas fora do cabeçalho (Viagens, Ranking); KPIs; dois gráficos lado a lado com a mesma altura (Combustível › BI); gráfico ao lado de lista alinhado ao topo, sem vão (Pneus, Ranking); formulários nos modais (rótulo colado ao campo, campos a 16, ações a 24). |
| `/revenda` · `/locale` | Abas abaixo do título; seções a 40 com título h2; os dois gráficos de faturamento na mesma altura. |
| `/design` › Espaçamento e hierarquia | Tabela de tokens com os valores reais; as 8 regras, certo × errado lado a lado (empilhados em 1024 e 390). |
| Qualquer modal (Nova OS, Lançar abastecimento) | Título a 16 do primeiro campo; ações separadas por divisor, 24 abaixo do último campo. |
