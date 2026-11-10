# Diretrizes de experiência mobile — PWA do Localle

Base: a pesquisa em `01-home-revolut.md` e o estado atual de `apps/web` (lido em 10/11/2026, na
branch `main`; a `dev` está 55 commits à frente e pode diferir). Este documento **propõe**; nada foi
alterado no código. Onde contradiz `PRODUCT.md`, vale o `PRODUCT.md`.

Marcas: **[existe]** = já está no código; **[proposta]** = a implementar; **[H]** = hipótese de
produto a validar com uso real.

## 1. Ponto de partida

### 1.1 O que já existe e deve ser mantido

| Tema | Estado atual | Onde |
|---|---|---|
| Corte mobile/desktop | `md` (768 px): `useIsMobile()` com `(max-width: 767px)` e classes `max-md:` | `components/ui.tsx:120` |
| Toque | `@media (pointer: coarse)` sobe `--h-ctl` para 44 px e `--h-ctl-sm` para 40 px; campos com 16 px | `styles/tokens.css:267` |
| Barra inferior | Flutuante: cápsula de 62 px com até 4 itens + botão redondo de 62 px (busca), vidro (`dock-glass`), 24 px acima da área segura | `components/Sidebar.tsx:166–172` |
| Sobreposição no celular | `Sheet` é o padrão único abaixo de `md`; `Modal` vira folha inferior; arrastar para fechar | `components/ui.tsx` |
| Rolagem | Na janela; sobreposições travam o `html` | `components/Layout.tsx` |
| Movimento | Tokens `--t-row` 120 ms, `--t-page` 200 ms, `--t-pill` 250 ms, `--t-bar` 400 ms, `--t-exit` 140 ms; `--ease-out`, `--ease-dock`; `prefers-reduced-motion` tratado | `styles/tokens.css:251–261`, `styles/base.css` |
| Espaçamento | Escala de 4 px; `--page-x` 16 px no celular; `--pad-card` 24 / `--pad-card-sm` 16; `--gap-grid` 16 | `styles/tokens.css` |
| Raios | `--r-card` 12, `--r-panel` 16, `--r-pill` 999 | `styles/tokens.css` |
| Tipografia | Satoshi; `--fs-kpi` 43, `--fs-title` 34, `--fs-h2` 21, `--fs-h3` 17, `--fs-body` 15, `--fs-small` 14, `--fs-caption` 13; nada abaixo de 12 | `styles/tokens.css` |
| White label | `brandVars()` aplica a cor da revenda com fallback grafite | `lib/brand.ts` |
| Ícones | Solar, via `unplugin-icons` | `components/icons.tsx` |
| Bibliotecas de animação/gesto | Nenhuma: CSS puro e Pointer Events | `package.json` |

### 1.2 Lacunas que afetam a experiência mobile

| Lacuna | Consequência |
|---|---|
| Não há manifest, service worker nem ícones de instalação | Hoje é um site responsivo, não um PWA instalável |
| `viewport` sem `viewport-fit=cover` | No iOS, os `env(safe-area-inset-*)` já escritos valem 0 |
| Sem `theme-color` | A barra do navegador não acompanha a interface |
| O gestor cai em `/monitoramento` | Não existe tela de início; o "Precisa de você" só chega pelo item "Críticos" da barra |
| Sem tema escuro | Fora do escopo desta etapa |

Tornar o app instalável (manifest, service worker, ícones) é uma decisão de arquitetura separada e
**não** é pré-requisito para a Home de laboratório do § 9.

## 2. Tradução de medidas: do Android para o CSS

A pesquisa mediu em px físicos e dp numa tela de 490 dp de largura. No PWA:

| Origem | Regra de tradução |
|---|---|
| dp de **controle** (alvo de toque, ícone, altura de barra) | 1 dp ≈ 1 px CSS. Usar o token existente mais próximo, nunca o valor cru |
| dp de **layout** (larguras, posições) | Não transportar. Usar a proporção e deixar o layout fluir |
| Proporção da largura | `%`, `fr` ou `minmax()` dentro da largura útil (`100% − 2 × --page-x`) |
| Proporção da altura | Evitar altura fixa. Quando necessário, `svh`/`dvh` com fallback em `vh`, como já é feito |
| Tipografia | Tokens `--fs-*` (em px hoje). Não criar tamanhos novos; ver § 4.3 |

Correspondência dos valores recorrentes:

| Observado (dp) | Papel | No Localle |
|---|---|---|
| 16 | Margem de página, respiro de cartão, vão entre cartões | `--page-x`, `--pad-card-sm`, `--gap-grid` (16) **[existe]** |
| 24 | Ícone | 22–24 px, como já usa o `DockItem` |
| 40 | Botão pequeno | `--h-ctl-sm` no toque (40) **[existe]** |
| 44 | Controle de cabeçalho | `--h-ctl` no toque (44) **[existe]** |
| 48 | Círculo de ação | `--h-ctl-lg` (48) **[existe]** |
| 52 | Botão principal largo | `--h-ctl-lg` (48); não criar 52 |
| 60 | Barra inferior | 62 px **[existe]** |
| 72 / 56 | Linha com e sem subtítulo | `--h-row` é 48: propor `--h-row-touch` 56 e `--h-row-touch-lg` 72 **[proposta]** |
| ~24 | Raio de cartão | `--r-card` é 12. Ver § 4.2 |

Larguras de referência para validar: 360, 390 e 430 px CSS. A 360 px, quatro colunas de ação ficam
com 82 px cada — o rótulo tem de caber em uma linha ou truncar.

## 3. Arquitetura da tela mobile

### 3.1 Camadas

```
┌──────────────────────────────┐
│ área segura superior         │
│ Cabeçalho (fixo)             │  z acima do conteúdo
├──────────────────────────────┤
│ Bloco principal              │
│ Ações rápidas                │  rola com a página
│ Cartões                      │
│              …               │
├──────────────────────────────┤
│ Barra inferior (flutuante)   │  z-[1050] [existe]
│ área segura inferior         │
└──────────────────────────────┘
```

- A rolagem continua na **janela** **[existe]**. Não criar contêiner rolável próprio para a Home:
  isso quebraria a restauração de posição e o recolhimento da barra do navegador.
- O conteúdo reserva espaço para a barra inferior com o `padding-bottom` que já existe
  (`safe-area + 7.5rem`).

### 3.2 Navegação

| Padrão | Diretriz |
|---|---|
| Barra inferior | Manter o `SidebarDock`. Máximo de 4 itens na cápsula **[existe]** |
| Recolher ao rolar | **[proposta]** Ao rolar para baixo mais de ~60 px, a cápsula perde os rótulos e reduz a altura; ao rolar para cima, volta. Decidido por direção, não por posição |
| Tela empilhada | Telas de detalhe ocultam a barra inferior e mostram "voltar" no cabeçalho **[proposta]** |
| Voltar | O botão voltar do sistema e do navegador sempre desfaz a última camada (folha, menu, tela). Com `HashRouter`, cada tela empilhada precisa ser uma rota |
| Menu de ações secundárias | Abaixo de `md`, `Sheet`; a partir de `md`, `Menu` ancorado **[existe]**. Não introduzir menu flutuante no celular |
| Troca de contexto (cliente/grupo) | Por toque num seletor que abre `Sheet`. Deslize horizontal é opcional e nunca o único caminho |

### 3.3 Gestos

| Gesto | Diretriz |
|---|---|
| Deslize horizontal em carrossel | `overflow-x: auto` + `scroll-snap-type: x mandatory`; `overscroll-behavior-x: contain` para não disparar o voltar do navegador |
| Deslize a partir da borda | Reservado ao sistema. Nenhum gesto próprio começa a menos de 24 px das bordas laterais |
| Puxar para atualizar | Não implementar gesto próprio; `overscroll-behavior-y: contain` só dentro de folhas |
| Arrastar folha | Manter `useSheetDrag` **[existe]** |
| Toque longo | Não usar como único acesso a uma função |

## 4. Fundamentos visuais

### 4.1 Hierarquia

- Uma tela responde **uma pergunta** no topo. O dado dominante usa `--fs-kpi` (43) ou
  `--fs-display` (48); o resto usa `--fs-body`/`--fs-small`.
- Dois degraus de tamanho por tela. Evitar `--fs-h2` e `--fs-h3` competindo com o dado dominante.
- Contexto acima do dado, em `--fs-small` e `--ink-2`; ação abaixo.
- Vazio em volta do dado dominante: no mínimo `--sp-8` (32) acima e abaixo.
- Tudo que é tocável tem forma fechada ou seta. Texto solto não é tocável.

### 4.2 Superfícies, raios e sombra

- Fundo `--canvas`, cartões `--card`, opacos. Sem degradê de marca e sem translucidez sobre cor.
- Sombra só no que flutua (`PRODUCT.md`): barra inferior, folha, toast. Cartão usa `--shadow-card`.
- **Raio:** a pesquisa encontrou ~24 dp em cartões e cápsula em controles. O Localle usa 12.
  **[proposta]** manter 12 no desktop e avaliar `--r-panel` (16) para cartões **no celular**, na
  Home de laboratório, antes de qualquer mudança global. Controles de ação rápida e a barra inferior
  já são cápsula (`--r-pill`).
- Agrupamento por espaço e superfície. Divisor só dentro de lista longa.

### 4.3 Tipografia

| Papel | Token | Observação |
|---|---|---|
| Dado dominante | `--fs-kpi` 43 / `--fs-display` 48 | `.num` (algarismos tabulares) |
| Número de cartão | `--fs-title` 34 | `.num` |
| Título de cartão e de linha | `--fs-body` 15 ou `--fs-h3` 17, peso médio | — |
| Corpo, rótulo de ação, botão | `--fs-small` 14 | — |
| Apoio | `--fs-caption` 13 | Mínimo 4,5:1 sobre o fundo |
| Rótulo da barra inferior | 11 px **[existe]** | Exceção já presente no `DockItem`; a regra diz "nada abaixo de 12" — decidir se sobe para 12 |

Placas e códigos em mono; valores e quantidades na fonte normal com `.num` (`PRODUCT.md`).

### 4.4 Cor

- A cor da revenda entra só em: botão principal, controles de seleção, link, halo do veículo e card
  de dica. A aba ativa da barra já usa `bg-brand-soft` **[existe]**.
- Status: verde em movimento, laranja parado ligado/atenção, anel desligado, anel tracejado sem
  sinal, vermelho crítico. Sempre ponto + texto.
- Contador do "Precisa de você" em vermelho; os demais neutros.
- Ação destrutiva em vermelho, separada das demais.

## 5. Áreas seguras, alvos de toque e teclado

| Tema | Diretriz |
|---|---|
| `viewport-fit=cover` | **[proposta]** adicionar ao `meta viewport`; sem isso os `env()` valem 0 no iOS |
| Topo | Cabeçalho com `padding-top: env(safe-area-inset-top)` **[proposta]** (hoje não há uso do inset superior) |
| Base | Manter `env(safe-area-inset-bottom)` na barra, nas folhas e nos toasts **[existe]** |
| Laterais | Em paisagem, somar `env(safe-area-inset-left/right)` a `--page-x` **[proposta]** |
| Alvo mínimo | 44 × 44 px; 48 para ação principal. O alvo pode ser maior que o desenho (coluna inteira da ação) |
| Distância entre alvos | No mínimo 8 px |
| Teclado | Campos com 16 px **[existe]**; ação principal de formulário fica visível acima do teclado (`dvh`) |
| Alcance do polegar | Ações primárias na metade inferior; o topo fica para contexto e navegação |

## 6. Rolagem e movimento

| Tema | Diretriz |
|---|---|
| Cabeçalho da Home | Fixo (`position: sticky; top: 0`), sem mudar de altura. Ganha fundo de vidro (`dock-glass`) quando há conteúdo atrás |
| Cabeçalho de detalhe | Grande no topo, colapsa em título compacto ao rolar (Conta, veículo, motorista) |
| Detecção de rolagem | `IntersectionObserver` com sentinela ou ouvinte passivo com `requestAnimationFrame`. Nunca ler layout dentro do `scroll` |
| Animação ligada à rolagem | Opcional. `animation-timeline: scroll()` só com `@supports`; sem suporte, o estado troca em degrau |
| Propriedades animadas | Só `transform` e `opacity`. Não animar `height`, `width`, `top` |
| Recolher a barra | `transform: scale` + opacidade dos rótulos, `--t-pill` (250 ms), `--ease-dock` |
| Entrada/saída | Saída mais rápida que a entrada (`--t-exit` 140 ms) **[existe]** |
| Estado pressionado | Retorno em até 100 ms: `transform: scale(0.97)` e/ou mudança de superfície, `--t-row` (120 ms) |
| Movimento reduzido | Com `prefers-reduced-motion: reduce`: sem paralaxe, sem escala, barra não recolhe, trocas por opacidade |
| Um movimento por tipo de mudança | Empilhar tela: deslizar da direita. Trocar de aba ou de conteúdo no lugar: esmaecer (`--t-swap`). Mudar de estado: transformar o próprio elemento |
| Tempos | Usar os tokens do Localle. Da referência só se sabe que a navegação termina em menos de ~0,5 s; curvas não foram medidas e não devem ser supostas |

## 7. Desempenho em aparelho intermediário

Referência: Moto G24 (classe de entrada/intermediária).

| Tema | Diretriz |
|---|---|
| Desfoque | `backdrop-filter` em no máximo 2 elementos simultâneos (barra e cabeçalho) e em áreas pequenas |
| Listas | Acima de ~50 itens, paginar ou virtualizar; a frota chega a 600–2.000 veículos |
| Mapa | Não montar o Leaflet na Home; usar resumo e abrir o mapa sob demanda |
| Gráficos | Recharts sob demanda (`lazy`) nos cartões abaixo da dobra |
| Imagens | Dimensões declaradas, `loading="lazy"` abaixo da dobra |
| Estabilidade | Esqueleto com a mesma altura do conteúdo final; nada "pula" ao carregar |
| Rolagem | Ouvintes passivos; sem trabalho síncrono por evento |
| Fontes | `font-display: swap`; a Geist vem de rede externa — avaliar hospedar localmente |

## 8. Acessibilidade, desktop e white label

**Acessibilidade**

- Contraste: 4,5:1 para texto, 3:1 para componentes e ícones.
- Foco visível com o anel duplo já definido; ordem de foco igual à ordem visual.
- Barra inferior: `nav` com rótulo; item ativo com `aria-current="page"`. Recolhida, os itens mantêm
  nome acessível.
- Carrossel: itens alcançáveis por teclado; indicador não é o único sinal de posição.
- Contador de pendências com texto acessível ("3 itens críticos").
- Zoom do navegador até 200% sem perda de função; não bloquear `user-scalable`.
- Status nunca só por cor: ponto + texto.

**Compatibilidade com desktop**

- Tudo o que é novo fica atrás de `max-md:` ou `useIsMobile()`. A partir de `md`, sidebar e layout
  atuais não mudam.
- Componentes novos aceitam os dois contextos ou são montados só no celular.
- Tokens novos são aditivos. Nenhum token existente muda de valor nesta etapa.
- O `zoom: 0.9` a partir de 1024 px continua valendo e não afeta o celular.

**White label**

- Validar cada componente novo com três marcas: a padrão (azul), uma vermelha (cai no grafite) e
  uma verde (sem fallback).
- Nenhum componente pode depender de uma cor de marca para ser legível.
- Ilustrações e ícones não levam a cor da revenda.

## 9. Componentes propostos e critérios de aceitação

Todos **[proposta]**. Nomes sugeridos; a implementação reaproveita `ui.tsx` e `primitives.tsx`.

### 9.1 `MobileHeader`

Avatar/iniciais (abre Conta), busca em cápsula (abre a busca existente), até 2 atalhos.

- [ ] Avatar, busca e atalhos têm a mesma altura (`--h-ctl`, 44 px no toque).
- [ ] Fica fixo ao rolar e não muda de altura.
- [ ] Com conteúdo atrás, aplica fundo de vidro; no topo, é transparente.
- [ ] Respeita `env(safe-area-inset-top)`.
- [ ] A 360 px de largura, a busca não fica menor que 160 px.

### 9.2 `HeroStat`

Contexto (pequeno) → dado dominante → uma ação.

- [ ] Um único dado dominante, em `--fs-kpi` ou maior, com `.num`.
- [ ] Vazio de pelo menos 32 px acima e abaixo do conjunto.
- [ ] Com zero pendências, mostra o estado da frota, não "0".
- [ ] Vermelho só quando há item crítico.
- [ ] Legível com as três marcas de teste.

### 9.3 `QuickActions`

Até 4 ações; a 4ª é "Mais" e abre `Sheet`.

- [ ] Quatro colunas iguais ocupando a largura útil.
- [ ] O alvo de toque é a coluna inteira e tem pelo menos 72 px de altura.
- [ ] Círculo de 48 px, ícone de 24 px, rótulo em uma linha (trunca com reticências).
- [ ] Estado pressionado visível em até 100 ms.
- [ ] Funciona a 360 px sem quebra de linha nos rótulos.

### 9.4 `ActionCard` (aviso com decisão)

- [ ] Título, uma linha de explicação e no máximo 2 botões.
- [ ] O botão que resolve é o principal; o outro é `quiet`/`secondary`.
- [ ] Item crítico não oferece "dispensar"; oferece "ver" ou "adiar" com registro.
- [ ] Botões com pelo menos 40 px de altura e 8 px entre eles.

### 9.5 `SummaryCard`

Título com seta → número → até 3 linhas → "ver tudo".

- [ ] O número vem antes das linhas.
- [ ] Mostra variação de período como chip (verde bom, rosa ruim), nunca em vermelho.
- [ ] Linhas com 56 px (simples) ou 72 px (com subtítulo); valor alinhado à direita com `.num`.
- [ ] O cartão inteiro leva ao detalhe; o cabeçalho tem seta.

### 9.6 `HScroller` (carrossel dentro de cartão)

- [ ] `scroll-snap` por item; mostra parte do próximo item para indicar continuidade.
- [ ] `overscroll-behavior-x: contain`.
- [ ] Navegável por teclado; indicador de posição presente.
- [ ] Não captura a rolagem vertical da página.

### 9.7 Barra inferior que recolhe (evolução do `SidebarDock`)

- [ ] Recolhe após ~60 px de rolagem para baixo e expande ao rolar para cima.
- [ ] Recolhida, mantém os 4 itens tocáveis com pelo menos 44 px.
- [ ] Anima só `transform` e `opacity`.
- [ ] Com `prefers-reduced-motion`, não recolhe.
- [ ] Não recolhe enquanto a gaveta "Mais" está aberta nem com foco de teclado dentro dela.

### 9.8 `CollapsingHeader` (telas de detalhe)

- [ ] Título grande no topo; ao rolar, vira título compacto na barra.
- [ ] O botão voltar/fechar permanece no mesmo lugar nos dois estados.
- [ ] Sem salto de layout na transição.

## 10. Home de laboratório (próximo passo sugerido)

Uma única tela mobile, dentro do PWA atual, com **dados simulados** e interações funcionais, para
validar o acabamento antes de expandir.

**Escopo [H]**

- Rota nova (ex.: `/inicio`), visível só abaixo de `md`; `homeOf` não muda nesta etapa.
- `MobileHeader`, `HeroStat`, `QuickActions`, um `ActionCard`, um `SummaryCard`, um `HScroller` e a
  barra inferior que recolhe.
- Dados do simulador e de `useNeedsYou()` já existentes; nenhuma chamada nova de API.
- Sem dependência nova.

**Conteúdo [H]**

| Bloco | Conteúdo |
|---|---|
| Contexto | Cliente ou grupo ativo |
| Dado dominante | Itens do "Precisa de você" |
| Ação do bloco | "Tratar" → `/precisa-de-voce` |
| Faixa de estado | Em movimento, parado ligado, desligado, sem sinal |
| Ações | Mapa, Comando, Checklist, Mais |
| Cartões | Crítico aberto → documentos vencendo → manutenção próxima → resumo do dia com variação |

**Critérios de aceitação da tela**

- [ ] A 360, 390 e 430 px: sem rolagem horizontal e sem texto cortado.
- [ ] Primeira dobra mostra o dado dominante, as ações e o início do primeiro cartão.
- [ ] Todos os alvos de toque com 44 px ou mais.
- [ ] Rolagem fluida num aparelho da classe do Moto G24, sem travar ao recolher a barra.
- [ ] Legível com as três marcas de teste; nenhuma cor de marca fora dos lugares permitidos.
- [ ] Com movimento reduzido, nenhuma animação de escala ou deslocamento.
- [ ] A partir de `md`, nada muda no layout atual.
- [ ] `.\make.ps1 typecheck` e `.\make.ps1 test` passam.

**O que a tela precisa responder**

1. O dado dominante certo é a pendência ou o estado da frota?
2. Quais quatro ações o gestor realmente usa no celular?
3. O raio maior nos cartões melhora o acabamento sem destoar do desktop?
4. A barra que recolhe ajuda ou atrapalha em listas longas?

## 11. Fora do escopo desta etapa

- Tornar o app instalável (manifest, service worker, modo offline).
- Implementar o tema escuro (as diretrizes para quando ele entrar estão no § 12.4).
- Aplicativo nativo.
- Mudança da tela inicial do gestor em produção.
- Reprodução de curvas de animação da referência, que não foram medidas.

## 12. Dashboards, filtros, mapa e tema

Base: `03-dashboards-tema-motion-revolut.md`. Tudo **[proposta]**, salvo indicação.

### 12.1 Painéis (BI) no celular

| Tema | Diretriz |
|---|---|
| Grade | Duas colunas abaixo de `md`; um bloco ocupa 1 ou 2 colunas. Vão `--gap-grid` (16) |
| Proporção | Bloco de 1 coluna quadrado (`aspect-ratio: 1`); bloco de 2 colunas em 2:1 |
| Cabeça do bloco | Sempre: rótulo (`--fs-caption`/`--fs-small`, `--ink-2`), valor (`--fs-h2` ou maior, `.num`), gráfico embaixo |
| Variação | Chip ao lado do valor: verde bom, rosa ruim, nunca vermelho (`PRODUCT.md`) |
| Toque | O bloco inteiro abre o detalhe; nada de alvo pequeno dentro do bloco |
| Carrossel de páginas de blocos | Não usar no celular: esconde indicadores. Rolagem vertical |
| Estado vazio | O bloco mantém o tamanho; o gráfico vira silhueta neutra do próprio tipo e o valor vira uma frase curta |
| Detalhe | Contexto e período escritos acima do valor; gráfico; filtro de período; lista |
| Gráficos | Recharts **[existe]**; carregar sob demanda abaixo da dobra; azul para realizado, rosa para perda, hachura para meta |
| Toque em gráfico | Um toque fixa a dica; outro toque fora solta (já pedido em `docs/design-audit`) |

Critérios de aceitação:

- [ ] A 360 px, dois blocos de 1 coluna cabem lado a lado com o valor inteiro visível.
- [ ] Nenhum bloco muda de altura entre os estados carregando, vazio e com dados.
- [ ] Todo valor mostra de que período e de que escopo é.
- [ ] O bloco é alcançável e acionável por teclado, com nome acessível que inclui rótulo e valor.

### 12.2 Filtros

Um padrão por tipo de escolha:

| Tipo de escolha | Padrão | Componente |
|---|---|---|
| 2 a 4 opções fixas (período curto, forma de ver) | Controle segmentado, no lugar | `Tabs` **[existe]** |
| Valor livre ou raro (período personalizado) | Botão "…" ao lado do segmentado → `Sheet` com campos e botão fixo no rodapé | `Sheet` + `DateInput` **[existe]** |
| Vários filtros combinados (grupo, veículo, motorista, status) | Um botão "Filtros" com contador → `Sheet` em que cada filtro é uma linha com o valor atual e "Alterar" | `Sheet` + `DescRow` **[existe]** |
| Escopo da tela (cliente, grupo) | Rótulo com seta no topo → `Sheet` de seleção | `Sheet` + `List` |

Regras:

- O filtro ativo está sempre escrito na tela, perto do dado que ele afeta.
- Filtros aplicados aparecem como chips removíveis (`FilterChip` **[existe]**) quando não são o padrão.
- "Limpar filtros" visível sempre que houver filtro fora do padrão.
- Troca de filtro no lugar não rola a página nem perde a posição.
- Botão de confirmar fica fixo no rodapé da folha, acima da área segura.

Critérios de aceitação:

- [ ] Com qualquer combinação de filtros, a tela diz quais estão ativos sem abrir nada.
- [ ] O segmentado tem alvos de pelo menos 40 px de altura e opção ativa distinguível sem depender de cor.
- [ ] Trocar o período não desloca o conteúdo (esqueleto com a mesma altura).
- [ ] Voltar do sistema fecha a folha de filtros sem aplicar mudanças pendentes.

### 12.3 Mapa como bloco de painel **[H]**

- Bloco "Onde está a frota": silhueta da **região de operação** com pontos agregados, não interativa,
  mais três contadores (em movimento, parado ligado, sem sinal) nas cores fixas de status.
- O bloco é imagem estática ou SVG. **Não monta o Leaflet.**
- O toque abre o Monitoramento, que já é mapa em tela cheia com folha inferior (`Sheet modal={false}`)
  **[existe]**.
- No mapa, só o selecionado recebe destaque; o resto é neutro (já previsto: halo do veículo).
- Não adotar mapa escuro nem globo 3D: as cores de status foram definidas para mapa claro, e o globo
  não tem função numa frota regional.

Critérios de aceitação:

- [ ] O bloco aparece em menos de 1 s num aparelho intermediário, sem carregar a biblioteca de mapa.
- [ ] Os três contadores somam o total da frota visível para o usuário.
- [ ] Com 2.000 veículos, o bloco continua legível (agregação por área).
- [ ] O bloco tem alternativa textual com os mesmos números.

### 12.4 Tema claro e escuro (para quando entrar)

Hoje não existe tema escuro. A referência mostra que ele custa pouco quando os tokens são por papel —
e os do Localle já são (`--canvas`, `--card`, `--ink`, `--line`).

| Tema | Diretriz |
|---|---|
| Estrutura | Mesmo desenho nos dois modos; só os valores dos tokens mudam. Nenhum componente com cor literal |
| Onde definir | Um bloco `[data-theme="dark"]` em `tokens.css` redefinindo os tokens de superfície, texto e borda |
| Opções | Claro, Escuro, Automático (`prefers-color-scheme`) |
| Escolha | Prévia ao vivo ao tocar na opção; "Aplicar" desabilitado até haver mudança |
| Superfícies | Dois degraus (página e cartão). No escuro, cartão mais claro que a página, sem sombra |
| Botão principal | Continua na cor da revenda; o fallback grafite vira claro no escuro (oposto ao fundo) |
| Status e dados | As cores fixas precisam de variantes escuras com o mesmo significado e contraste de 3:1 |
| Marca | A verificação de contraste da cor da revenda tem de rodar contra o fundo de cada modo |
| Mapa | As cores de status dos veículos precisam ser revalidadas sobre um mapa escuro antes de qualquer decisão |
| `theme-color` | Acompanha o modo ativo |

Critérios de aceitação (quando implementado):

- [ ] Nenhuma cor literal fora de `tokens.css`.
- [ ] Todo par texto/fundo com 4,5:1 e todo componente com 3:1, nos dois modos.
- [ ] As três marcas de teste (azul, vermelha, verde) passam nos dois modos.
- [ ] Trocar de modo não altera posição, tamanho nem espaçamento de nenhum elemento.
- [ ] Documentos impressos continuam claros, independentemente do modo.
