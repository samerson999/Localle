# Regras de densidade da UI (redução de texto) — referência Visor

> Referência de densidade: `/planejamento/referencia-ui-visor.md` (seções 2 e 7). Base de tokens/componentes já fechada em `/planejamento/adaptacao-ui-rastreio.md`. Esta rodada não mexe em token, lógica, dado, rota ou comportamento — só em quanto texto aparece e onde.

## Cards e KPIs

- **R1.** Cada card tem no máximo: 1 título curto, 1 valor principal e 1 linha de contexto (comparação, período ou meta).
- **R2.** Subtítulo/descrição embaixo do título só se mudar a leitura do número. Se só explica o óbvio ("Total de veículos cadastrados na frota"), sai.
- **R3.** Títulos com até 3–4 palavras, sem repetir o nome da página nem do período já mostrado no `PageHeader`.
- **R4.** Contexto inline, não em bloco: `"R$ 1.240 / R$ 2.000"` em vez de dois parágrafos.
- **R5.** Hint/texto de ajuda secundário: mover para tooltip/info do componente **existente**, se houver. Se não existir, listar como DECISÃO — não criar componente novo.

## Gráficos

- **R6.** Remover título de eixo quando a unidade já está no título do card ou no valor. Manter só rótulo de eixo indispensável.
- **R7.** Linha de grade: no máximo horizontais, discretas. Nenhuma vertical.
- **R8.** Legenda só com 2+ séries. Com 1 série, o título do card já basta.
- **R9.** Rótulo de dado em todo ponto/barra: remover, valor vai pro tooltip. Exceção: destacar só o último ponto ou o máximo, quando isso for o insight da tela.
- **R10.** Sparkline/minigráfico dentro de KPI: sem eixo, sem grade, sem legenda.
- **R13.** O período aparece **uma vez por tela**, no filtro/`PageHeader`. O `period` de `ChartCard` só aparece quando **difere** do período da página (ex.: janela fixa "Últimas 12 semanas"). Quando aparecer, só o período e a unidade — nunca explicação de ordenação ou de destaque visual.
- **R14.** `sentence` é a leitura-resumo do gráfico: no máximo 1 frase, 1 linha, sem repetir o título.
- **KpiHero**: no máximo 2 `rows` de detalhe.

## Texto em geral

- **R11.** Microcopy direto: cortar "Aqui você pode...", "Esta seção mostra...", "Clique para...".
- **R12.** Não repetir a mesma informação em dois lugares da mesma tela (ex. total no card E no rodapé da lista).

## O que nunca pode sair

- Alertas, status críticos, mensagens de erro e avisos de segurança ou operação.
- Unidades necessárias para interpretar o número (km, km/h, h, R$, %).
- Placa, motorista, horário de evento e qualquer identificador operacional.
- Labels de formulário e mensagens de validação.
- Texto legal ou de termos.
- `aria-label`/acessibilidade: se um texto visível sair e ele nomeava um controle ou gráfico, o nome é preservado via `aria-label`.
- Documentos de impressão (`doc-sheet`/`print-area`): fora do escopo.

## Ajustes após o piloto (Manutenção, 2026-10-22)

- **KpiHero**: se o `delta` (badge de variação) e a barra de meta já contam a mesma comparação que a `sentence` diria em palavras, remover a `sentence` (aplicação de R12 a este componente).
- **Barra de meta do `KpiHero`**: mostrar só o marcador da meta (`goal.label`); não rotular os extremos da escala (`scale[0]`/`scale[1]`) — eles não agregam informação e competem com o marcador.
- **Duas métricas da mesma condição**: quando uma condição tem dois critérios possíveis em unidades diferentes (ex. um prazo por km **e** por dias), não mostrar as duas ao mesmo tempo. Mostrar só a que **disparou** a condição (se já passou) ou a **proporcionalmente mais perto** de disparar (se nenhuma passou ainda) — nunca mexer no cálculo que decide o status, só no texto.
- **Listas de identificadores em frase-resumo** (placas, IDs, nomes): usar a contagem ("em 3 veículos"), não enumerar a lista inteira, **desde que a lista continue acessível** por uma ação/link na mesma tela (se não houver essa ação, registrar como melhoria futura, não aplicar).
- **Gráfico "perdas por causa" sem precisar da escala 0–100%**: quando o objetivo é só comparar causas entre si (não mostrar quanto "sobrou" de um total), o `RankBars` (barras por item, cada uma escalada ao próprio máximo) é mais simples que montar um `Waterfall` com âncoras de topo/base — usar esse padrão quando um card vizinho já mostra o total/escala.
- **`RankBars`**: a coluna de rótulo tem largura fixa no componente (~104px, não é prop) — rótulos têm que ser curtos (1–3 palavras) nos dados passados à tela, não dá para resolver só com CSS da página.

## Fora de escopo nesta rodada

- Páginas de showcase do design system (`Design.tsx`, `DesignSections.tsx`, `DesignSpacing.tsx`, `src/pages/design/*`).
- Tokens, lógica, dados, rotas, comportamento.
- Componentes novos (tooltip incluído) sem aprovação prévia.
- **Gráficos de barras verticais (`ColumnChart`): padrão aprovado, não alterar estrutura, escala nem estilo em nenhuma tela.** As regras R6–R10 não se aplicam a eles.
