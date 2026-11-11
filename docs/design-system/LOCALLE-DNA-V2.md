# Localle DNA V2 — reorientação de design (proposta)

Status: **proposta para aprovação**. Nada em `apps/web` foi alterado por este documento. Nenhuma tela
foi implementada. `PRODUCT.md` não foi editado — este documento é a revisão explícita pedida antes de
qualquer mudança nele.

Base de leitura: `docs/pesquisa-ux/01-home-revolut.md`, `02-diretrizes-pwa-localle.md`,
`03-dashboards-tema-motion-revolut.md`; estado do código em `apps/web/src` na branch `dev`
(lido em 10/11/2026); `PRODUCT.md` § Brand Commitments e Product Principles.

Convenção: **MANTER** / **EVOLUIR** / **SUBSTITUIR** / **CRIAR**, como pedido no briefing.

---

## 1. Diagnóstico crítico do design system atual

O Localle hoje é, declaradamente, uma reinterpretação do Visor: ícones Solar Bold Duotone "mesmo
conjunto usado pelo Visor" (`icons.tsx:3-4`), raio de card "piloto aprovado em Manutenção... agora
global" (`tokens.css:206`), sombra de card com nota "ref. Visor" (`tokens.css:225`), faixa de leitura
de card (`TipBand`) com nota "referência Visor" (`tokens.css:155`). Isso não é um defeito de execução —
é consistente e bem documentado —, mas é uma **linguagem emprestada de um dashboard financeiro-SaaS
genérico**, não uma identidade própria.

Pontos fortes reais, que a V2 precisa preservar:

- **Disciplina de token único.** Todo valor literal de cor/fonte/raio/sombra vive em `tokens.css`; zero
  cor hardcoded nas telas. Isso é raro e é a maior vantagem estrutural do Localle sobre a maioria dos
  produtos B2B — a V2 deve ser uma **evolução dos valores dentro desse mesmo mecanismo**, não uma fuga
  dele.
- **Regras semânticas de cor já maduras e corretas** (status fixo, dado fixo, marca restrita a 5 usos,
  fallback grafite, vermelho só para crítico). Isto já é mais rigoroso que a Revolut em um eixo: a
  Revolut usa cor de fundo para indicar contexto (§ 4.2 de `01-home-revolut.md`) — padrão explicitamente
  incompatível com white-label e corretamente descartado em `02-diretrizes-pwa-localle.md` § 4.4.
- **Escala de espaçamento com nomes semânticos** (`primitives.tsx`, `tokens.css` § espaçamento) — mais
  madura que o observado na Revolut (que usa poucos valores repetidos, mas sem nomes/papéis).
- Testes de isolamento e cobertura de contraste já documentados como processo.

Pontos que marcam a linguagem como "dashboard SaaS genérico", a trocar:

| Sintoma | Evidência |
|---|---|
| Raio pequeno e uniforme (12px) em tudo — cartão, botão, campo, popover | `--r-card/--r-ctl/--r-btn: 12px` |
| Sombra quase ausente — ok como princípio, mas combinada ao raio pequeno dá efeito "tabela com bordas", não "superfície com profundidade" | `--shadow-card: ...1px + 2px` |
| Tipografia com só 8 degraus numéricos sem per­sonalidade (escala quase linear, sem salto expressivo no dado dominante) | `tokens.css` § tipografia |
| Motion documentado como existente mas pouco expressivo: 1 curva de saída (`ease-out`), nenhuma de entrada com overshoot, nenhuma coreografia declarada além de fade/slide | `--ease-out`, `--t-*` |
| Mobile hoje é desktop encolhido: não há tela de início própria, hierarquia de "uma pergunta por tela", nem bloco principal com vazio ao redor (diagnosticado no próprio `02-diretrizes-pwa-localle.md` § 1.2) | `02-diretrizes-pwa-localle.md` |
| Zero diferenciação de superfície por grau (page/card/card-2 existem como token, mas raramente usados para criar profundidade perceptível — tudo fica quase branco sobre quase branco) | `--canvas #F2F4F7` vs `--card #FFFFFF` vs `--card-2 #F8F9FB` — diferença de luminosidade pequena demais para ler como dois planos |

Conclusão do diagnóstico: o sistema **não precisa ser refeito em sua lógica** (tokens únicos, cor
semântica fixa, espaçamento nomeado, white-label por fallback). Precisa de uma **segunda geração de
valores** dentro da mesma lógica — tipografia com mais personalidade e contraste de escala, geometria
com identidade (não só "12px em tudo"), um sistema de elevação real, e
motion com assinatura própria. É uma reforma de acabamento e expressão, não de arquitetura.

## 2. Princípios de experiência derivados da pesquisa

Da pesquisa Revolut (`01`, `02`, `03`), filtrando o que é **princípio** (transporta) do que é
**execução específica da Revolut** (não transporta — marca, cor de fundo contextual, globo 3D):

1. **Uma tela, uma pergunta.** O dado dominante não compete com mais nada no mesmo plano — resolvido
   por tamanho (salto grande, não gradual) e por vazio, não por decoração (`01` § 2.2, § 9.5).
2. **Poucos valores, repetidos sempre.** A "qualidade" percebida vem de consistência insistente de
   poucos números (16/24/40/44/48/60), não de variedade (`01` § 9.2). O Localle já faz isso em
   espaçamento; precisa estender a raio e a alvo de toque.
3. **Alvo de toque maior que o desenho.** Área clicável ≠ área visual; a visual pode ficar pequena e
   elegante enquanto a tocável respeita 44px (`01` § 3.3, § 9.7).
4. **Superfícies por degrau de luminosidade da mesma cor, sem contorno.** Hierarquia por clareamento
   progressivo, não por borda (`01` § 4.2, § 9.6). O Localle usa borda (`--card-edge`) hoje; manter
   borda sutil é uma escolha válida (ajuda impressão e acessibilidade), mas o **degrau de superfície**
   precisa ficar mais perceptível também.
5. **Peso de botão coerente com a consequência.** Opaco = age; translúcido/quieto = dispensa;
   vermelho = destrói. Já é regra do Localle (`PRODUCT.md`); reforçar visualmente com mais contraste
   entre os três.
6. **Um movimento por tipo de mudança, nunca um movimento genérico para tudo.** Empilhar = deslizar;
   trocar aba/conteúdo no lugar = esmaecer; mudar de estado = transformar o próprio elemento (`03` § 5,
   § 6 item 11). Hoje o Localle tem os tokens de tempo mas não essa taxonomia declarada.
7. **O filtro ativo está sempre escrito na tela, nunca escondido.** (`03` § 2.4, § 6 item 4) — já é
   quase universal no Localle (`DescRow`, chips); formalizar como regra de todo filtro novo.
8. **Vazio com a forma do conteúdo.** Estado vazio/carregando preserva tamanho e posição; o gráfico
   vazio vira silhueta do próprio tipo, não cai para "sem dados" solto (`01` § 1.3). Hoje o
   `EmptyState`/`Skeleton` do Localle fazem parte disso; estender a todo bloco de BI.
9. **Prévia antes de confirmar.** Mudança visível reversível (tema, cor de marca) deve mostrar o
   resultado antes do usuário confirmar (`03` § 4.1, § 6 item 10) — aplicável ao futuro seletor de
   tema e ao painel de marca da revenda.
10. **Cabeçalho fixo que não muda de tamanho na Home; cabeçalho que colapsa em título nas telas de
    detalhe.** Dois padrões distintos e intencionais, não um único comportamento para tudo (`01` § 6.1,
    § 7).

Princípios da Revolut que **não** se transportam e por quê:

- Fundo em degradê que muda com o contexto → quebra white-label (marca é da revenda, não um gradiente
  fixo de produto).
- Globo 3D e mapa sempre escuro → sem função para frota regional; cores de status do Localle foram
  calibradas para mapa claro.
- Paginação por deslize horizontal como único caminho → conflita com gesto de voltar do navegador na
  borda; manter como complemento, nunca único acesso.

## 3. Auditoria da interface existente

### 3.1 Tokens (`styles/tokens.css`)

| Elemento | Classificação | Nota |
|---|---|---|
| Mecanismo (token único, sem cor solta) | **MANTER** | É a maior vantagem estrutural; a V2 muda valores, não o mecanismo |
| Cor semântica fixa (status/dado/marca) | **MANTER** | Já mais rigorosa que a referência |
| Escala de espaçamento nomeada | **MANTER** | Base 4px com papéis; estender, não substituir |
| Escala de raio (12 em quase tudo) | **SUBSTITUIR** | Falta hierarquia de geometria — ver § 5 |
| Sistema de sombra/elevação | **EVOLUIR** | Princípio "sombra só no que flutua" é correto e fica; os valores (3 degraus quase idênticos) precisam de mais amplitude |
| Escala tipográfica (tamanhos) | **EVOLUIR** | Papéis corretos; valores precisam de salto maior no topo (dado dominante) — ver § 4 |
| Tokens de movimento (`--t-*`, `--ease-*`) | **EVOLUIR** | Nomes e papéis corretos; faltam curva de entrada com leve overshoot e nomeação por tipo de mudança — ver § 7 |
| Tokens de superfície (`--canvas/--card/--card-2`) | **EVOLUIR** | Mesma ideia, maior separação perceptível |

### 3.2 Tipografia

- **MANTER:** Satoshi como fonte de interface, mono só para identificadores, `.num` com algarismos
  tabulares — já é uma decisão de qualidade, documentada e correta (`tokens.css:1-18`).
- **EVOLUIR:** a progressão de tamanhos (48→43→34→21→17→15→14→13) é quase linear; falta um salto maior
  entre o dado dominante e o resto, no espírito do "dois degraus, com salto grande" da Revolut (`01`
  § 9.4). Avaliar levar `--fs-display` para algo entre 56–64px nas telas que hoje a usam de verdade
  (KPI hero) e manter os demais degraus como estão.

### 3.3 Iconografia (`components/icons.tsx`)

- **MANTER (decidido em 11/11/2026).** Solar Bold Duotone, o mesmo conjunto do Visor, é o conjunto
  único da plataforma. A proposta anterior desta seção (trocar por um conjunto de traço) foi descartada
  pelo usuário: a regra é **não desenhar ícone à mão** e seguir o conjunto do Visor. Ver § 6.

### 3.4 Primitivos e componentes (`primitives.tsx`, `ui.tsx`)

| Componente | Classificação | Nota |
|---|---|---|
| `Stack`/`Cluster`/`Grid`/`Section`/`PageBody` (layout) | **MANTER** | Mecanismo de espaçamento correto e já bom; não é "estética", é arquitetura de layout |
| `Card`/`CardHeader`/`CardFooter` | **EVOLUIR** | Anatomia (rótulo → valor → conteúdo) já é o padrão Revolut; falta hierarquia de superfície mais nítida e raio maior (§ 5) |
| `Button`/`IconButton`/`TextButton` | **EVOLUIR** | Lógica de variante correta; geometria (raio, altura) muda com § 5 |
| `Stat`, KPI | **EVOLUIR** → ver `HeroStat` (§ 6 de `02-diretrizes-pwa-localle.md`) como evolução natural | |
| `Sheet`, `Modal`, `Menu`, `ContextMenu` | **MANTER o padrão** (Sheet no celular, Menu/Modal no desktop) | Já é a decisão certa documentada em `02-diretrizes-pwa-localle.md` § 3.2; evoluir só a geometria interna |
| `Tabs`/`NavTabs`/`Pills` (controle segmentado) | **MANTER o padrão** | Controle segmentado é exatamente o que a Revolut usa para período (`03` § 2.2); já existe no Localle |
| `FilterButton`/`FilterChip`/`FilterSheet` | **MANTER** | Já implementa "filtro sempre visível" (§ 2 acima) |
| `EmptyState`/`ErrorState`/`Skeleton`/`Illustration` | **EVOLUIR** | Mecanismo correto (`PRODUCT.md`: 3D só em página/painel principal); a ilustração em si pode evoluir de estilo na V2 (§ 8) |
| `Toaster`/`confirmAction` | **MANTER** | Sem relação com a reorientação |
| `Table` | **MANTER o mecanismo, EVOLUIR o traço** | Denso e funcional; aplicar raio/linha novos |

### 3.5 Cards, KPIs, gráficos (`charts.tsx`, `chartTip.tsx`)

- **MANTER:** paleta de dado fixa (azul realizado / rosa perda / hachura meta), chip de variação
  verde/rosa nunca vermelho. Está certo e é mais disciplinado que a maioria dos produtos BI.
- **EVOLUIR:** estado vazio do gráfico — hoje é texto/ícone (correto para card secundário, por
  `PRODUCT.md`); adotar a "silhueta do próprio tipo de gráfico" (`01` § 1.3) como refinamento do
  mecanismo já existente, sem contradizer a regra de ilustração 3D só em página/painel principal.

### 3.6 Barra de navegação e sidebar (`Sidebar.tsx`)

- **MANTER a arquitetura:** sidebar fixa no desktop, barra flutuante (`SidebarDock`) com vidro no
  celular, recolhimento já com vidro (`dock-glass`) — já é o padrão certo e mais sofisticado que muitos
  SaaS. Evidência: `02-diretrizes-pwa-localle.md` § 1.1 já lista isso como "existe" e correto.
- **EVOLUIR:** geometria (raio da cápsula, altura), e adicionar o comportamento de recolher por
  direção de rolagem, hoje marcado como `[proposta]` em `02-diretrizes-pwa-localle.md` § 9.7.

### 3.7 Headers, sheets, modais, interações

- **MANTER o padrão arquitetural** descrito em `02-diretrizes-pwa-localle.md` (Sheet único abaixo de
  `md`, arrastar para fechar, rolagem na janela). Nada aqui precisa mudar de mecanismo.
- **CRIAR:** `CollapsingHeader` para telas de detalhe (conta, veículo, motorista) — já especificado
  como proposta em `02` § 9.8; adotar na V2 como peça de identidade (cabeçalho grande → título
  compacto é um dos "momentos de assinatura" do produto).

### 3.8 Animações (`base.css`, tokens de tempo)

- **MANTER:** `prefers-reduced-motion` tratado, animar só `transform`/`opacity`, saída mais rápida que
  entrada.
- **EVOLUIR:** falta uma curva de entrada com leve overshoot (sensação de "vida"); falta uma
  taxonomia explícita de movimento por tipo de mudança (empilhar/trocar/transformar) amarrada aos
  tokens existentes — ver § 7.

### 3.9 Layout mobile e desktop

- **Desktop: MANTER.** Grade de 12 colunas, densidade e diagramação atuais já funcionam bem para o uso
  em mesa do gestor; a reorientação é sobre acabamento (raio, sombra, tipografia, ícone, motion), não
  sobre reestruturar o desktop.
- **Mobile: CRIAR.** Hoje não existe uma Home mobile própria — é desktop encolhido (`02` § 1.2). Esta é
  a maior lacuna estrutural, já diagnosticada e com componentes propostos (`HeroStat`, `QuickActions`,
  `ActionCard`, `SummaryCard`, `HScroller`, barra que recolhe) em `02-diretrizes-pwa-localle.md` § 9.
  A V2 adota esses componentes como parte da nova linguagem, com a geometria revisada em § 5–7 deste
  documento.

## 4. Direção visual proposta

**Uma frase:** confiança operacional com acabamento de produto premium — a frota de 2.000 veículos
precisa parecer tão sob controle quanto uma conta bancária de uma pessoa, sem imitar o vocabulário
literal de nenhuma das duas.

Três movimentos concretos a partir do diagnóstico:

1. **Geometria com identidade.** Sair de "12px em tudo" para uma escala de raio com dois registros
   claros: contêiner (maior, ~16–20px) vs. controle (cápsula ou raio pequeno). Hoje o Localle já tem
   essa distinção em nome (`--r-card` vs `--r-pill`) mas não em grau — os valores ficam próximos demais
   para o olho notar. Ver § 5.
2. **Iconografia de um conjunto só.** Solar Bold Duotone (o do Visor) em toda a interface, sem ícone
   desenhado à mão. Ver § 6.
3. **Motion com assinatura.** Uma curva de saída (já existe) mais uma de entrada com leve overshoot,
   e uma taxonomia declarada de "que tipo de mudança usa que movimento". Ver § 7.

Tudo o que já é correto por regra de negócio (branding restrito a 5 usos, status fixo, vermelho só
crítico, sombra só no que flutua) permanece — a V2 é sobre o "como desenha", não sobre "o que a cor
significa".

## 5. Fundamentos: tipografia, cores, superfícies, geometria

### 5.1 Tipografia — proposta de ajuste

| Papel | Hoje | V2 (proposta) | Razão |
|---|---|---|---|
| `--fs-display` (número principal de tela) | 48px | 56–60px | Salto maior do dado dominante, no espírito "dois degraus com salto grande" |
| `--fs-kpi` (card de KPI) | 43px | 40px | Recua levemente para abrir mais distância do `--fs-display` |
| `--fs-title` … `--fs-caption` | mantidos | mantidos | Já são degraus corretos; o problema era só o topo da escala |
| Peso do título de card | `font-semibold` variável | padronizar `--fw-semibold` (600) em todo título de card, nunca 700 | Consistência "poucos valores, repetidos sempre" |

Satoshi, mono para identificadores e `.num` continuam exatamente como estão — não são o problema
diagnosticado.

### 5.2 Cores — ajuste, não substituição

Toda a seção de cor semântica de `PRODUCT.md` (status fixo, dado fixo, marca em 5 lugares, fallback
grafite) **permanece inalterada** — é a parte mais madura do sistema atual e não tem equivalente a
"copiar" da Revolut (a Revolut usa cor de fundo contextual, que é descartada por quebrar white-label).

Ajuste proposto, só em superfície neutra:

| Token | Hoje | V2 (proposta) | Razão |
|---|---|---|---|
| `--canvas` | `#F2F4F7` | manter | |
| `--card` | `#FFFFFF` | manter | |
| `--card-2` | `#F8F9FB` | aprofundar levemente (ex. `#F3F5F8`) | Hoje a diferença `--card` → `--card-2` é quase imperceptível; separar os dois planos sem precisar de mais borda, no espírito "superfícies em degraus da mesma cor" (`01` § 9.6) |
| `--card-edge`/`--line` | mantidos | mantidos | Borda sutil continua útil para impressão e para quem usa zoom alto; não é "ruído" como na Revolut, é acessibilidade |

### 5.3 Geometria — raio por registro

| Registro | Hoje | V2 (proposta) |
|---|---|---|
| Contêiner (card, painel, modal, sheet) | `--r-card` 12 / `--r-panel` 16 | `--r-card` 16 / `--r-panel` 20 |
| Controle (botão, campo, chip) | `--r-ctl`/`--r-btn` 12 | manter 12 — distinção fica mais nítida justamente por o contêiner crescer |
| Pílula (barra, badge, segmentado) | `--r-pill` 999 | manter |
| Miniatura/chip de variação | `--r-tight` 8 | manter |

A mudança é pequena em valor absoluto e grande em efeito: aumentar só o raio de **contêiner** cria a
distância perceptível entre "isto é um cartão" e "isto é um controle dentro do cartão" que falta hoje.

### 5.4 Elevação — três degraus com amplitude real

Hoje `--shadow-card`, `--shadow-seg`, `--shadow-float` são próximos entre si (1–3px de alcance). Propor
três degraus com amplitude clara, mantendo o princípio "sombra só no que flutua" (nada muda na
regra — página e card continuam sem sombra de elevação artificial; a sombra marca **o que realmente
está sobre outra camada**: dock, sheet, popover, modal):

| Degrau | Uso | Direção |
|---|---|---|
| Contorno (sem sombra) | Card no canvas | `--shadow-card` continua anel de 1px, sem alterar |
| Flutuante curto | Dock, chip ativo, popover pequeno | Leve aumento de alcance (hoje `--shadow-float`) |
| Flutuante longo | Sheet, modal | Alcance maior, mais opacidade — hoje `--shadow-modal`/`--shadow-sheet` já têm essa direção; aumentar a diferença em relação ao degrau anterior |

## 6. Estratégia de iconografia

Decidido em 11/11/2026, substituindo a proposta anterior de trocar por um conjunto de traço:

- **Conjunto único: Solar Icons, variante Bold Duotone** — o mesmo que o Visor usa. Vale para sidebar,
  ações, controles pequenos (chevron, fechar, mais), feedback e cabeçalho de card.
- **Nenhum ícone desenhado à mão.** Ícone novo = importar do Solar (`~icons/solar/<nome>-bold-duotone`,
  via `unplugin-icons`) em `components/icons.tsx` e dar um nome em português. Nenhuma tela importa o
  Solar direto nem escreve `<svg><path>` de ícone: tudo passa por `<Icon name>`.
- **Nome fechado.** `IconName` é a lista de chaves de `icons.tsx`; um nome que não existe quebra o
  typecheck (antes caía em silêncio num triângulo de alerta).
- Tamanho e alvo de toque não mudam: ícone de sidebar continua ~22–24px dentro do alvo de 44px já
  definido.
- **Fora da regra** (não são ícone de interface): gráficos, pontos de status (`StatusGlyph`), spinner de
  carregamento, silhuetas de veículo (`assetArt.tsx`), glifos e pino do marcador do mapa (HTML do
  Leaflet, `MAP_GLYPH`/`MapBits.tsx`) e as artes do login.
- Ilustrações 3D (onboarding, vazio de página, erro) continuam como estão por regra de `PRODUCT.md` —
  não fazem parte da troca de ícone de interface; são uma linguagem à parte e já corretamente restrita.

## 7. Arquitetura de componentes

Sem reescrita: evolução de valor dentro de `primitives.tsx`/`ui.tsx` (regra de "sem abstração
especulativa" do `CLAUDE.md` do repositório se aplica igual a design — reusar a estrutura existente).

**Novo, a criar** (já especificado em `02-diretrizes-pwa-localle.md` § 9, adotado aqui como parte da
V2 e não como experimento à parte):

- `MobileHeader`, `HeroStat`, `QuickActions`, `ActionCard`, `SummaryCard`, `HScroller`,
  `CollapsingHeader`, barra inferior que recolhe por direção de rolagem.

**A evoluir** (mesmo componente, novos valores de token): `Card`, `Button`, `IconButton`, `Panel`,
`Sheet`, `Modal`, `Table`, `EmptyState`/`ErrorState`.

**A manter sem mudança**: `Stack`/`Cluster`/`Grid`/`Section` (layout), `Tabs`/`Pills`
(segmentado), `FilterButton`/`FilterChip`/`FilterSheet`, `Toaster`, `confirmAction`.

## 8. Sistema de motion e interações

Taxonomia proposta, amarrada aos tokens já existentes (`--t-*`, `--ease-out`) mais uma curva nova:

| Tipo de mudança | Movimento | Token |
|---|---|---|
| Empilhar tela (navegação para frente/trás) | Deslizar da direita/para a direita | `--t-page` (200ms) + `--ease-out` |
| Trocar aba ou conteúdo no mesmo lugar | Esmaecer | `--t-swap` (150ms) |
| Mudar de estado de um elemento (selecionar, expandir, pressionar) | Transformar o próprio elemento (`scale`/`transform`), nunca o layout ao redor | `--t-row`/`--t-pill` conforme o alvo |
| Entrar (toast, sheet, popover, card novo numa lista) | Nova curva de entrada com leve *overshoot* — **CRIAR** `--ease-in-soft` | a definir em protótipo, não em valor arbitrário agora |
| Sair (toast, sheet, popover) | Mais rápida que a entrada, sem overshoot | `--t-exit` (140ms) + `--ease-in` |
| Barra inferior recolher/expandir | Só `transform`/`opacity`, nunca largura/altura | `--t-pill` + `--ease-dock` |

Regra geral mantida sem mudança: `prefers-reduced-motion` sempre respeitado; nunca animar
`width`/`height`/`top`.

A curva de entrada com overshoot é a única peça nova de tokens de movimento proposta aqui — tudo o
resto já existe e só ganha nome de uso explícito. Ela deve ser prototipada visualmente (não definida
por número adivinhado) antes de entrar em `tokens.css`.

## 9. Comportamento mobile e desktop

Sem mudança de arquitetura de corte (`md`, `useIsMobile()`) nem de navegação (Sheet abaixo de `md`,
Menu a partir de `md`) — já corretos e documentados em `02-diretrizes-pwa-localle.md` §§ 3, 5, 8.
A V2 adota integralmente esse documento como a camada de comportamento mobile; este documento (V2) é a
camada de **acabamento visual** que se aplica por cima dele. Não há contradição a resolver entre os
dois: `02` fala de arquitetura/interação, este fala de tipografia/cor/geometria/ícone/motion.

Compatibilidade com desktop: nenhuma mudança de valor de token é exclusiva do desktop ou do mobile — os
tokens de § 5 (tipografia, raio, elevação) se aplicam aos dois; o que é exclusivo do mobile são os
**componentes novos** do § 7 (`HeroStat` etc.), que só existem abaixo de `md`.

## 10. Estratégia de white-label

Sem mudança de regra — reafirmada:

- A cor da revenda continua restrita aos 5 usos de `PRODUCT.md` (botão principal, controle de seleção,
  link, halo do veículo, card de dica). Nenhuma mudança deste documento adiciona um sexto lugar.
- Verificação automática de contraste e fallback grafite continuam como estão.
- Qualquer componente novo (`HeroStat`, `ActionCard` etc.) deve ser validado com as três marcas de
  teste já em uso (padrão azul, vermelha com fallback grafite, verde sem fallback) antes de aceitar —
  critério já presente em `02-diretrizes-pwa-localle.md` § 8.
- A iconografia (§ 6) não introduz cor de marca no ícone — ícones de interface continuam
  neutros (`--ink`/`--ink-2`), como já é regra.

## 11. Plano de migração incremental

Nada muda de uma vez; cada etapa é independente e reversível, seguindo a mesma disciplina de "mudança
pequena e coesa" do `CLAUDE.md` deste repositório.

| Etapa | Escopo | Risco | Critério de aceite |
|---|---|---|---|
| 0 — Aprovação | Este documento, discutido e aprovado/ajustado antes de qualquer código | — | Decisão explícita do usuário por item da matriz § 12 |
| 1 — Geometria e tipografia | Só `tokens.css`: raio de contêiner, `--fs-display`, `--card-2` | Baixo — valores aditivos/ajuste fino, zero mudança estrutural | Nenhuma tela quebra; checagem visual com as 3 marcas de teste; `pnpm typecheck` |
| 2 — Iconografia | **Feita em 11/11/2026**: ícones desenhados à mão de `icons.tsx` trocados pelo Solar Bold Duotone; `IconName` fechado | Médio — toca todas as telas que usam `Icon`/sidebar | `pnpm typecheck` sem nome inválido; conferência visual no navegador |
| 3 — Elevação | Ajustar `--shadow-*` | Baixo | Checagem visual em dock, sheet, modal, popover |
| 4 — Motion | Nova curva de entrada + taxonomia declarada nos componentes que já animam | Médio — requer prototipagem da curva, não só editar token | Prova visual da curva antes de fixar valor; `prefers-reduced-motion` revalidado |
| 5 — Home mobile de laboratório | Implementar `MobileHeader`, `HeroStat`, `QuickActions`, `ActionCard`, `SummaryCard`, `HScroller`, `CollapsingHeader` numa rota nova (`/inicio`, só abaixo de `md`), com os valores de geometria/motion da V2 | Médio — componentes novos, mas isolados (rota nova, sem mudar `homeOf`) | Critérios já listados em `02-diretrizes-pwa-localle.md` § 9–10, mais legibilidade com as 3 marcas |
| 6 — Extensão a dashboards/detalhe | Levar `CollapsingHeader`, grade 2 colunas de blocos (`02` § 12.1) às telas de BI existentes | Alto — toca telas de produção | Por módulo, um de cada vez; nunca todos juntos |

Nenhuma etapa depende de app nativo, service worker ou tema escuro — fora de escopo, como já definido
em `02-diretrizes-pwa-localle.md` § 11.

## 12. Matriz: regra visual atual → decisão proposta

| Regra/decisão atual | Decisão V2 | Justificativa |
|---|---|---|
| Ícones Solar Bold Duotone (estilo Visor) misturados com ícones de traço desenhados à mão | **Manter o Solar Bold Duotone como conjunto único**; eliminar os desenhados à mão | Decisão do usuário (11/11/2026): seguir os ícones do Visor, nada feito à mão |
| `--r-card`/`--r-ctl`/`--r-btn` todos em 12px | **Diferenciar**: contêiner sobe para 16–20, controle mantém 12 | Cria hierarquia de geometria perceptível sem introduzir valor novo arbitrário em cada componente |
| `--fs-display` 48px | **Subir** para 56–60px nas telas de KPI hero | Dois degraus com salto grande, não escala quase linear |
| `--card-2` quase idêntico a `--card` | **Aprofundar levemente** | Superfícies em degrau perceptível, sem precisar de mais borda |
| Sombra em 3 degraus próximos | **Ampliar a distância** entre os degraus "flutuante curto" e "flutuante longo" | Elevação real só no que flutua, mas com amplitude que se note |
| 1 curva de movimento (`--ease-out`) para tudo que entra e sai | **Adicionar** curva de entrada com leve overshoot; manter `--ease-out`/`--ease-in` para saída | Assinatura de movimento, sem perder o que já funciona |
| Mobile = desktop encolhido | **Criar** Home mobile própria com os componentes já especificados em `02` | Maior lacuna de experiência hoje; já tem plano pronto |
| Cor semântica de status/dado fixa, marca em 5 usos | **Manter sem mudança** | Já mais madura que a referência estudada; mudar aqui destruiria valor, não criaria |
| Sheet abaixo de `md`, Menu a partir de `md` | **Manter sem mudança** | Arquitetura de interação correta, independente de acabamento visual |
| Ilustração 3D só em página/painel principal | **Manter sem mudança** | Regra de `PRODUCT.md` já coerente com o objetivo de não "poluir" cards de BI |
| `prefers-reduced-motion` respeitado, animar só transform/opacity | **Manter sem mudança** | Correto e não é fonte da percepção "genérica" |

## 13. Prova de conceito visual proposta (descrição, sem implementação)

Como pedido: descrição da PoC a prototipar depois da aprovação deste documento — **nenhuma tela foi
construída**. Três telas, usando os valores da matriz § 12:

### 13.1 Home mobile

- `MobileHeader` fixo, vidro ao rolar, avatar + busca em cápsula + 1 atalho, altura única de 44px
  (toque).
- `HeroStat`: contexto pequeno (cliente/grupo) → dado dominante em `--fs-display` 56–60px (pendências
  do "Precisa de você") → ação "Tratar". Vazio de `--sp-8` acima/abaixo. Vermelho só se houver crítico;
  caso contrário, mostra estado da frota (em movimento / parado ligado / sem sinal), nunca "0".
- `QuickActions`: 4 colunas (Mapa, Comando, Checklist, Mais), círculo com ícone Solar Bold Duotone (§ 6),
  coluna inteira como alvo de toque (≥72px).
- Um `ActionCard` (crítico aberto, agir/ver — nunca "dispensar" em item crítico).
- Um `SummaryCard` (resumo do dia com variação, chip verde/rosa).
- Fundo `--canvas`, cards com raio de contêiner novo (16–20px), ícones Solar Bold Duotone, sem degradê de marca.

### 13.2 Dashboard (ex.: Manutenção ou Combustível)

- Grade de 2 colunas de blocos (1× e 2×), cabeça padrão (rótulo pequeno → valor em `.num` → gráfico),
  bloco inteiro tocável.
- Estado vazio: silhueta cinza do próprio tipo de gráfico, mantendo tamanho do bloco.
- Filtro de período como controle segmentado (já existe, `Tabs`), com "…" para período livre abrindo
  `Sheet`.
- Elevação nova (§ 5.4) visível só no popover de detalhe do ponto do gráfico, não no card em si.

### 13.3 Detalhe de veículo

- `CollapsingHeader`: placa/identificação grande no topo, colapsando em título compacto na barra ao
  rolar, botão voltar fixo nos dois estados.
- Corpo com `DescList`/`DescRow` existentes, geometria de contêiner nova.
- Ícones de ação (comando, replay, checklist) do conjunto Solar Bold Duotone (§ 6).
- Motion: entrada de tela desliza da direita (`--t-page`); colapso do cabeçalho só `transform`/`opacity`.

Cada uma das três telas deve ser validada, antes de seguir para as demais, com: as 3 marcas de teste
(§ 10), `prefers-reduced-motion`, e larguras 360/390/430px — critérios já formalizados em
`02-diretrizes-pwa-localle.md` §§ 9–10.

---

## O que este documento não decide

- Valor exato da curva de entrada com overshoot (prototipar visualmente, não adivinhar número).
- Tema escuro (fora de escopo, ver `02-diretrizes-pwa-localle.md` § 11 e § 12.4).
- Qualquer mudança em `apps/api`, dados, ou regra de negócio — este documento é só UI/UX.
