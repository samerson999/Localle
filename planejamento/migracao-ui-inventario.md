# Inventário — migração da UI para o padrão aprovado (Fase A, somente leitura)

> Varredura de `src/pages/` e `src/components/` (exceto `Card`, `CardHeader`, `Button`, `Stat`, `Sidebar`, `Modal`, já no padrão novo), contra os 8 padrões pedidos. Referência de decisões: `/planejamento/adaptacao-ui-rastreio.md` (tabela a, seção e).
>
> **Fora de escopo, não listado abaixo**: páginas/componentes de **documento impresso** (`Locale.tsx` trecho de fatura, `Telemetria.tsx` trecho de relatório, `FolhaPonto.tsx`, `JornadaDocs.tsx`, trecho de `Jornada.tsx` com `id="termo-doc"`) — usam `style={{}}` com `px`/cores literais de propósito, porque são layout de impressão (`doc-sheet`/`print-area`), não telas do design system. Mexer neles mudaria o PDF gerado, fora do pedido "só apresentação" da tela.
> **Páginas de showcase do design system** (`Design.tsx`, `DesignSections.tsx`, `DesignSpacing.tsx`, `src/pages/design/*`) aparecem citadas quando batem um padrão, mas são baixa prioridade (não são tela usada por cliente final).

## Tabela

| # | Arquivo | Linha | Padrão | Trecho atual (resumo) | Correção aplicada | Status |
|---|---|---|---|---|---|---|
| 1 | `src/pages/Cercas.tsx` | 58 | 1 — card ad hoc | `<aside>` com `bg-card border border-line rounded-card` e `<h2>` de título à mão | Substituído por `<Card title="Nova cerca"/"Editar cerca">`; título agora em `text-ink-2` (CardHeader); botões movidos para `footer` do `Card` | **APLICADO** |
| 2 | `src/pages/Jornada.tsx` | 157 | 1 — card ad hoc | `<div className="bg-card border border-line rounded-card p-card overflow-x-auto">` (prévia da folha) | Substituído por `<Card className="overflow-x-auto">` | **APLICADO** |
| 3 | `src/pages/Login.tsx` | 32 | 1 — card ad hoc | `<form className="... bg-card border border-line rounded-card ...">` | Decisão do usuário: manter `<form>` nativo (não virar `<Card>`), só removida a borda (`border border-line`) — está sobre `--canvas` | **APLICADO** |
| 4 | `src/pages/PortariaApp.tsx` | 56 | 1 — card ad hoc | `<button className="... bg-card border border-line rounded-card ...">` item de lista | Decisão do usuário: manter como está — borda é sinal de item clicável | **MANTIDO** |
| 5 | `src/pages/Replay.tsx` | 128 | 1 + 5 — card ad hoc com shadow de popover | `rounded-card shadow-pop` (overlay "sem posições" sobre o mapa) | Decisão do usuário: tratar como painel flutuante — trocado para `rounded-panel shadow-panel` | **APLICADO** |
| 6 | `src/pages/design/KpiHeroDestaque.tsx` | 44 | 1 — card ad hoc | `bg-card border border-line rounded-card` reimplementando `Card`/`KpiHero` | Decisão do usuário: remover a borda, consistente com `KpiHero` real | **APLICADO** |
| 7 | `src/pages/Pneus.tsx` | 169 | 2 — radius literal | `rounded-[10px]` em botão de posição do pneu (60×96px) | Decisão do usuário: manter `rounded-[10px]`; adicionado comentário explicando que é forma ilustrativa do pneu, fora da escala de componentes | **MANTIDO (com comentário)** |
| 8 | `src/pages/Cercas.tsx` | 83 | 2 — radius literal | `rounded-[3px]` em swatch de legenda | Decisão do usuário: criar `--r-swatch: 3px` em `tokens.css` + `rounded-swatch` no Tailwind, substituindo o literal (valor visual inalterado) | **APLICADO** |
| 9 | `src/components/charts.tsx` | 205 | 2 — radius literal | `rounded-[3px]` em swatch de legenda de gráfico | Idem item 8 — `rounded-swatch` | **APLICADO** |
| 10 | `src/components/chartTip.tsx` | 87 | 2 — radius literal | `rounded-[3px]` em swatch de tooltip de gráfico | Idem item 8 — `rounded-swatch` | **APLICADO** |
| 11 | `src/components/ui.tsx` | 355 | 4 — transição de cor fora de 150ms | `Checkbox`: `transition-colors duration-[120ms]` | `duration-150` | **APLICADO** |
| 12 | `src/components/ui.tsx` | 370 | 4 — transição de cor fora de 150ms | `Radio` (anel): `transition-colors duration-[120ms]` | `duration-150` | **APLICADO** |
| 13 | `src/components/ui.tsx` | 384 | 4 — transição de cor fora de 150ms | `Switch`: `transition-colors duration-[120ms]` (trilho) | `duration-150` (o `transition-transform` do indicador deslizante foi mantido — é movimento, não cor) | **APLICADO** |
| 14 | `src/components/charts.tsx` | 303, 451, 612, 660, 686 | 4 — possível transição de cor (`fill`/`stroke`) em `duration-100` | `transition-[fill] duration-100` etc. em gráficos | Decisão do usuário: animação de gráfico fica fora da diretriz de 150ms — manter | **MANTIDO** |

### Padrões sem achados dentro do escopo

- **3 — estado ativo em grafite sólido fora da sidebar**: nenhum caso de item de lista/aba/menu/filtro usando `bg-graphite` como estado selecionado fora de `Sidebar.tsx`. Os únicos usos de `bg-graphite` fora da sidebar são o variant `dark` do `Button` (`ui.tsx:33`), o `Toast` (`ui.tsx:994`) e um indicador de "pressed" pontual em `MapBits.tsx:209` (bolinha de 8px, não um item selecionável) — nenhum deles é o padrão "item ativo" que a diretriz do usuário mirava.
- **6 — título de card montado à mão em vez de `CardHeader`**: os `<h3>`/`<h2>` com `text-ink-2` encontrados (`Manutencao.tsx`, `Monitoramento.tsx`, `PortariaApp.tsx`, `Telemetria.tsx`, `NeedsPanel.tsx`, `PrecisaDeVoce.tsx`) são **subtítulos internos** de dentro de um `Card`/seção já existente (ex. "Itens e serviços" dentro da OS, "Tratadas nas últimas 24h" dentro de um painel), não o header do próprio card — `CardHeader` não serve para esse caso (é para o topo da caixa). Nenhum achado real.
- **7 — ícone com fundo colorido / badge com fundo para variação-status**: `Badge` (`ui.tsx:398`) já usa só um ponto (`<circle>`), sem fundo — conforme a restrição. As únicas "badges com fundo colorido" encontradas são **contadores numéricos de notificação** (`CountBadge`, sino da sidebar, contagem de "Críticos"/"Alertas" em `NeedsPanel.tsx`, contagem em `PrecisaDeVoce.tsx`) — um padrão diferente (bolha de contagem), não o "badge de variação/status" que a restrição veda. Nenhum achado real.
- **8 — valores literais de cor/espaçamento/radius em `style={{}}`**: fora dos documentos de impressão (excluídos acima) e de cores *dinâmicas* vindas de dados (cor de revenda em `Revenda.tsx`/`Design.tsx`, cor de série de gráfico em `charts.tsx`/`chartTip.tsx`, que usam `tv()`/tokens ou a cor escolhida pelo usuário — não são "valores literais do design system"), não há `style={{}}` com cor/espaçamento/radius fixo fora de contexto. Nenhum achado real.

---

## Resumo

**Total por padrão:**
- Padrão 1 (card ad hoc fora do `<Card>`): 6 ocorrências (2 MECÂNICA, 4 DECISÃO)
- Padrão 2 (radius literal/fora da escala): 4 ocorrências (0 MECÂNICA, 4 DECISÃO)
- Padrão 3 (grafite ativo fora da sidebar): 0
- Padrão 4 (transição de cor ≠150ms): 8 ocorrências (3 MECÂNICA — `Checkbox`/`Radio`/`Switch`; 5 DECISÃO — gráficos)
- Padrão 5 (sombra em card): 1 ocorrência (dentro do item 5 da tabela, DECISÃO)
- Padrão 6 (título manual em vez de `CardHeader`): 0
- Padrão 7 (ícone/badge com fundo colorido indevido): 0
- Padrão 8 (valores literais inline): 0

**Total geral: 18 ocorrências catalogadas.**

## Status final (2026-10-22)

Todas as 18 ocorrências foram decididas e executadas em lote único: **11 APLICADO**, **3 MANTIDO** (decisão explícita de não mexer), nenhuma pendente. Typecheck e build passaram sem erros após a execução.

Arquivos alterados nesta migração: `src/styles/tokens.css`, `tailwind.config.js`, `src/components/ui.tsx`, `src/components/charts.tsx`, `src/components/chartTip.tsx`, `src/pages/Cercas.tsx`, `src/pages/Jornada.tsx`, `src/pages/Login.tsx`, `src/pages/Replay.tsx`, `src/pages/design/KpiHeroDestaque.tsx`, `src/pages/Pneus.tsx` (comentário).
