# Pesquisa de UX — Jornada B: dashboards, filtros, mapa, tema e motion (referência: Revolut Android)

Continuação de `01-home-revolut.md`; mesmas regras de leitura (§ 0 daquele documento): **V**
verificada, **E** estimada, **H** hipótese de produto, **N** não investigada; medidas em
`px / dp / proporção` (tela de 720 × 1612 px, 490 × 1097 dp). Diretrizes para o PWA em
`02-diretrizes-pwa-localle.md`.

**Condições da coleta.** A conta observada não tem movimentação: um script conferiu, sem exibir os
valores, que todos os números das telas de Análise eram zero. Por isso os gráficos foram vistos em
**estado vazio** — a aparência de gráficos com dados reais é **N**. Valores continuaram cobertos nas
imagens. O modo do app foi trocado para Escuro para a observação e **restaurado para Claro** ao
final; a configuração do sistema não foi alterada.

**Motion.** Não houve gravação de vídeo. Os tempos vêm de quadros brutos capturados em sequência no
aparelho, a ~4 quadros por segundo (um a cada ~265 ms), dos quais só foram extraídos números (cor em
pontos fixos, extensão de uma faixa). Isso permite dizer **se** há animação e **entre que limites**
ela termina; não permite medir curva de aceleração.

## 1. Tela de Análise (dashboard)

### 1.1 Anatomia (V)

| Faixa | px | dp | Observação |
|---|---|---|---|
| Barra superior | 0–159 | 108 (com a de status) | Botão voltar circular de 64 px / 44 dp |
| Título grande | 159–228 | linha de 47 | "Análise", com seta: o título é um seletor |
| Linha de filtros | 252–332 | 54,5 | Escopo à esquerda, período à direita |
| Grade de blocos paginada | 332–1039 | 481 | Carrossel horizontal de páginas de blocos |
| Indicador de páginas | 1051 | — | 4 pontos |
| Título de seção | 1067–1147 | 54,5 | "Visão geral" |
| Blocos em coluna | 1147 em diante | — | Medidor, mapa, lista de ferramentas |

### 1.2 Sistema de blocos (V)

| Bloco | px | dp | Proporção |
|---|---|---|---|
| Largo | 674 × 337 | 459 × 229 | 93,6% L; razão 2:1 |
| Quadrado | 326 × 326 | 222 × 222 | 45,3% L; razão 1:1 |
| Vão entre blocos | 22 | 15 | — |
| Respiro interno | 24–29 | 16–20 | — |
| Raio | ~35 | ~24 | **E** (±2 px) |

- Dois quadrados + o vão ocupam exatamente a largura de um largo: a grade tem **duas colunas** e um
  bloco ocupa uma ou duas.
- Uma "página" da grade = um largo em cima e dois quadrados embaixo. As páginas vizinhas aparecem
  como uma fresta de 11 px na borda, sinalizando que há mais para o lado.
- Todo bloco tem a mesma cabeça: **rótulo pequeno** (linha de 21 dp, cinza) e, abaixo, **valor**
  (linha de 35 dp) ou uma frase de estado. O gráfico ocupa o terço inferior.
- O bloco inteiro é tocável e leva ao detalhe.

Tipos de gráfico vistos (em estado vazio): linha de comparação, barras verticais, barras
horizontais, medidor linear, mapa.

### 1.3 Estado vazio (V)

- Dentro do bloco: o gráfico vira uma **silhueta cinza** do próprio tipo (linha ondulada, cinco
  barras, duas faixas), e o valor dá lugar a uma frase de chamada ("Faça seu primeiro pagamento").
  O bloco mantém tamanho e posição.
- Na tela de detalhe: ícone de 64 dp, título (linha de 24 dp) e legenda (linha de 21 dp),
  centrados na área do gráfico.

### 1.4 Rolagem (V)

O título grande colapsa em título compacto na barra superior (mesma posição e tamanho do padrão
visto no perfil: linha de 29 dp, à direita do botão voltar). A barra passa de 172 dp para 108 dp.

## 2. Filtros

Quatro padrões distintos, cada um para um tipo de escolha.

| Padrão | Onde | Como funciona | Evidência |
|---|---|---|---|
| **Rótulo-filtro com seta** | "Pessoal ▾" na linha de filtros | Abre tela modal "Defina suas preferências" | V |
| **Link de período** | "Este mês", azul, alinhado à direita | Tocado, não abriu seletor visível; os blocos mudaram de variante | E — comportamento não esclarecido |
| **Controle segmentado** | Período no detalhe: 1 s · 1 m · 6 m · 1 a | Troca no lugar, sem navegar | V |
| **Botão "…" ao lado do segmentado** | Detalhe | Abre tela "Período personalizado" | V |
| **Abas de ícone na barra superior** | Detalhe, canto direito | Alterna a forma de visualização | V (o conteúdo de cada uma é N) |

### 2.1 Tela de preferências (V)

Cada filtro é uma **linha**: ícone de 40 dp, nome (linha de 24 dp), **valor atual** como subtítulo
(linha de 21 dp) e um botão pequeno "Alterar" (78 × 40 dp) à direita. Linha de 78 dp. A tela tem
título grande e uma frase de explicação. O usuário vê todos os filtros e seus valores de uma vez e
altera um por vez.

### 2.2 Controle segmentado (V)

| Elemento | px | dp |
|---|---|---|
| Trilho | 609 × 53 | 415 × 36 |
| Opção | 150 × 47 | 102 × 32 |
| Botão "…" | 52 × 52 | 35 × 35, a 11 px do trilho |
| Raio | ~23–26 | ~16–18 (cápsula) |

Cores: claro — trilho `EBEBF0`, opção ativa `FFFFFF`; escuro — trilho `252526`, opção ativa
`525254`. O texto da opção ativa é mais escuro/forte que o das demais.

### 2.3 Período personalizado (V)

Tela cheia com título grande, dois campos empilhados (672 × 84 px / 458 × 57 dp, com ícone de 32 dp
à direita) e um **botão principal fixo no rodapé** (458 × 52 dp), que no tema claro é quase preto
com texto branco e tem sombra suave.

### 2.4 Cabeça do detalhe (V)

Três linhas, de cima para baixo: contexto ("Gastos · Pessoal", linha de 24 dp), **valor grande com
seta** (linha de 47 dp), descrição do período (linha de 21 dp). O que está filtrado fica escrito
acima do número, não escondido num menu.

## 3. Mapa

### 3.1 Bloco de mapa no dashboard (V)

| Elemento | px | dp | Observação |
|---|---|---|---|
| Bloco | 674 de largura | 459 | Mesma largura dos blocos largos |
| Rótulo | linha de 31 | 21 | "Suas viagens" |
| Mapa | 616 × 304 | 419 × 207 | Razão ~2:1; **silhueta chapada** em cinza claro, sem rótulos, sem controles |
| Indicadores | 3 colunas de 193 × 100 | 131 × 68 | Valor grande + rótulo pequeno, centrados |

O mapa no bloco **não é interativo**: é uma imagem. Funciona como resumo e como porta de entrada.

### 3.2 Tela de mapa (V)

- **Mapa em tela cheia**, por trás de tudo, como um globo 3D (o conteúdo é renderizado em uma área
  web embutida).
- **Sempre escura**, mesmo com o app em modo claro: fundo `000000`, oceano `030630`, países
  `020317`, **país em destaque `B2B7C2`**, aro luminoso `1224F2`.
- Só um elemento recebe cor clara: o que importa. Todo o resto é quase preto.
- **Arrastar gira o globo** e ele **para na hora** — sem inércia e sem rotação automática
  (comparação de quadros 0,3 s e 2,8 s após o gesto: idênticos).
- Barra superior flutuante sobre o mapa: voltar à esquerda, uma ação à direita.

### 3.3 Folha inferior sobre o mapa (V)

| Elemento | px | dp | Proporção |
|---|---|---|---|
| Folha | 698 de largura, x=11 | 475; margem 7,5 | 97% L — **não encosta nas bordas** |
| Alça | 41 de altura | 28 | Tocável |
| Raio superior | ~64 | ~44 | **E** |
| Parada média | topo em y=909 | 619 | topo a 56% A |
| Parada alta | topo em y=159 | 108 | logo abaixo da barra superior |
| Base | y=1566 | — | 46 px acima do fim da tela |

- Duas paradas observadas; arrastar para baixo a partir da média não a recolheu mais.
- Conteúdo: **três contadores** em colunas iguais (valor com linha de 47 dp, rótulo de 18 dp) e um
  cartão de ação com um botão de largura total.
- Cores: folha `111112`, cartão interno `161618`, botão `2E2E30`, alça `3B3B3D`.
- O mapa continua visível e manipulável acima da folha na parada média.

## 4. Tema claro e escuro

### 4.1 Como o tema é configurado (V)

Caminho: Perfil → Configurações → Aparência → Tema.

- A tela mostra um **carrossel de miniaturas da Home** (200 × 432 dp, 41% L), uma por conta, com
  silhuetas no lugar do conteúdo.
- Embaixo, duas ações circulares: **Modo** e **Tema**.
- **Modo** substitui a barra de ações, no mesmo lugar, por um seletor em linha com três opções —
  **Claro, Escuro, Automático** —, cada uma com ícone de 40 dp num anel de 50 dp e rótulo (linha de
  16 dp), mais um botão de voltar à esquerda.
- Um botão **Aplicar** fica no rodapé, **desabilitado até haver mudança**.
- Ao tocar numa opção, **a tela inteira muda na hora**, antes de aplicar (prévia ao vivo). "Aplicar"
  confirma; o seletor se fecha e as ações voltam.
- **Tema** abre uma galeria de cores em tela sobreposta (conteúdo: N).
- A troca de modo do app **não altera** o modo do sistema.

### 4.2 Paleta nos dois modos (V, amostrada)

| Papel | Claro | Escuro |
|---|---|---|
| Fundo de página | `F7F7F7` | `191C1F` (telas de conteúdo) / `000000` (tela de tema) |
| Bloco / cartão | `FDFDFD`–`FFFFFF` | `292C2F` |
| Silhueta de gráfico vazio | cinza claro | `5D5F62` |
| Texto de título | quase preto | `BABBBC` no ponto amostrado (E) |
| Link | azul | `6FA0FF` (mais claro) |
| Trilho de segmentado / opção ativa | `EBEBF0` / `FFFFFF` | `252526` / `525254` |
| Botão principal | quase preto, texto branco | branco, texto preto |
| Botão circular (voltar) | `FCFCFC` | `232325`–`2A2B2C` |

Leituras:

- **Os dois modos são o mesmo desenho com os papéis invertidos** (V): geometria, raios e
  espaçamentos não mudam; só os valores de cada papel.
- **O botão principal é o oposto do fundo** (V): escuro no claro, branco no escuro. Não depende de
  uma cor de marca.
- **Dois degraus de superfície em cada modo** (V): página e bloco, sem borda e sem sombra visível.
- **O link clareia no escuro** (V) para manter o contraste.
- **Há telas que ignoram o modo** (V): a Home (degradê de contexto), o perfil (`191C1F` mesmo no
  claro) e o mapa (preto) são idênticos nos dois modos.

## 5. Motion

Tempos medidos do fim do comando de toque; resolução de ~265 ms. Tudo **E** quanto à duração.

| Transição | O que foi observado | Limite de duração |
|---|---|---|
| Barra inferior recolhe/expande | Um quadro com largura intermediária (588 px, entre 670 e 578): a largura **é animada** | Conclui em menos de ~0,5 s |
| Botões do cabeçalho (translúcido → opaco) | Trocaram no mesmo quadro em que a barra começou a recolher | Menos de ~0,3 s |
| Entrada de tela (Home → Análise) | Um quadro com a **direita já na cor da tela nova** e a esquerda ainda na antiga, levemente escurecida: a tela **desliza da direita** e a de baixo escurece | Menos de ~0,5 s |
| Troca de aba | Um quadro com o **fundo preto** antes do conteúdo novo: o conteúdo surge por esmaecimento, não por deslize. O realce da aba troca no mesmo quadro ou um quadro depois | Menos de ~0,5 s |
| Controle segmentado | **Não desliza**: a cápsula antiga some e a nova clareia em três quadros sucessivos (`2E2E30` → `4C4C4E` → `525254`) | ~0,6–0,8 s do toque ao estado final |
| Ação circular pressionada | Clareia e cresce ~4 px de cada lado | Um quadro; duração N |
| Prévia de tema | A tela inteira troca de cor ao tocar na opção | Transição N |
| Globo | Segue o dedo; para ao soltar | Sem inércia |
| Folha sobre o mapa | Duas paradas; a animação entre elas é N | — |

O que se pode afirmar:

- **Cada tipo de mudança tem um movimento próprio** (V): empilhar tela = deslizar; trocar de aba =
  esmaecer; mudar de estado no lugar (segmentado, barra) = transformar o próprio elemento.
- **Navegação termina em menos de meio segundo** (E); a troca de estado do segmentado é a mais
  lenta observada.
- **Nada salta** (V): em todas as transições medidas houve pelo menos um quadro intermediário.
- Curvas de aceleração, sobreposição exata entre saída e entrada e duração com precisão melhor que
  ~265 ms: **N**.

## 6. O que produz a percepção de qualidade nestas telas

1. **Grade de duas colunas com dois tamanhos de bloco** (§ 1.2): tudo cabe sem exceções.
2. **Mesma cabeça em todo bloco** (§ 1.2): rótulo, valor, gráfico — o olho aprende uma vez.
3. **Vazio com a forma do conteúdo** (§ 1.3): o bloco sem dados não encolhe nem some.
4. **O filtro ativo está sempre escrito na tela** (§ 2.4).
5. **Um padrão de filtro por tipo de escolha** (§ 2): poucas opções fixas no lugar; muitas opções
   ou valores livres em tela própria.
6. **Mapa como resumo e como destino** (§ 3): imagem leve no dashboard, mapa de verdade só quando
   pedido.
7. **Uma só cor clara no mapa** (§ 3.2): o destaque é inequívoco.
8. **Folha que não encosta nas bordas** (§ 3.3): lê-se como objeto sobre o mapa, não como outra
   tela.
9. **Tema por papéis** (§ 4.2): trocar de modo não muda o desenho.
10. **Prévia antes de confirmar** (§ 4.1): o usuário vê o resultado e ainda pode desistir.
11. **Um movimento por tipo de mudança** (§ 5).

## 7. Limitações

- Gráficos só em estado vazio: cores de série, eixos, rótulos, dicas e seleção de ponto são **N**.
- O link de período não teve o comportamento esclarecido.
- Abas de ícone do detalhe: conteúdo não distinguido (conta sem dados).
- Galeria de temas de cor: não explorada.
- O globo é conteúdo web embutido: sua estrutura interna não aparece na hierarquia.
- Durações com resolução de ~265 ms; curvas não medidas.
- Tela de preferências: os valores possíveis de cada filtro não foram abertos.

## 8. Tradução para o Localle

Viabilidade: **D** direto; **A** com adaptação web; **S** depende de suporte; **X** não recomendado.

| Padrão | Por que funciona | Onde ajuda o gestor | Viab. |
|---|---|---|---|
| Grade de 2 colunas, blocos 1× e 2× | Densidade previsível no celular | Painéis de manutenção, combustível, custos, ranking | D — `Grid` e `Card` já existem |
| Cabeça padrão do bloco (rótulo, valor, gráfico) | Leitura em um olhar | Todos os BIs | D — próximo do `Stat` atual |
| Bloco tocável que leva ao detalhe | Resumo → detalhe sem menu | Todos os BIs | D |
| Estado vazio com a silhueta do gráfico | Não desmonta o layout | BIs de cliente novo ou filtro sem dados | A — hoje o vazio em card é texto e ícone (`PRODUCT.md`); a silhueta é compatível com a regra |
| Páginas de blocos em carrossel | Mais conteúdo sem alongar | — | X no celular — esconde indicadores; preferir rolagem vertical |
| Título grande que colapsa | Identidade e depois espaço | Telas de BI e de detalhe | A |
| Contexto e período escritos acima do número | O filtro nunca fica oculto | Todo BI com comparação de período | D |
| Controle segmentado de período | Troca sem navegar | Período dos BIs (7 d, 30 d, 90 d, 12 m) | D — `Tabs` segmentado já existe |
| "…" → período personalizado em tela própria | Caso raro não polui o comum | Período livre | D — `Sheet` com `DateInput` |
| Tela de preferências com "Alterar" por linha | Mostra todos os filtros ativos | Telas com muitos filtros (grupo, veículo, motorista, período) | D — `Sheet` + `DescRow` |
| Abas de ícone para forma de ver | Gráfico × lista × mapa | Viagens, multas, combustível | A — exige rótulo acessível |
| Mapa-silhueta como bloco | Leve, não monta mapa interativo | Painel: onde a frota está | A — imagem estática ou SVG; nunca Leaflet no bloco |
| Três contadores sob o mapa | Resume o mapa em números | Em movimento, parados, sem sinal | D |
| Mapa em tela cheia + folha com paradas | Mapa e lista ao mesmo tempo | Monitoramento | D — já é o padrão (`Sheet modal={false}`) |
| Folha que não encosta nas bordas | Lê-se como objeto flutuante | Monitoramento | A — avaliar na folha atual |
| Um só destaque de cor no mapa | Foco inequívoco | Veículo ou cerca selecionados | D — já previsto: halo do selecionado |
| Mapa sempre escuro | Contraste do destaque | — | X — cores de status foram definidas para mapa claro |
| Globo 3D | Impacto visual | — | X — sem função para frota regional; custo alto em aparelho intermediário |
| Tema por papéis | Um desenho, dois modos | Base para um modo escuro futuro | A — os tokens já são por papel; faltam os valores escuros |
| Claro / Escuro / Automático | Respeita o sistema | Preferência do usuário | S — `prefers-color-scheme` |
| Prévia ao vivo + "Aplicar" | Ver antes de confirmar | Tema; também a cor da revenda no painel de marca | D |
| Botão principal oposto ao fundo | Independe de cor de marca | Fallback grafite | D — é a lógica do grafite |
| Um movimento por tipo de mudança | Orienta sem explicar | Todo o app | D — com os tokens `--t-*` |

### 8.1 Como o mapa pode servir ao Localle (H)

O valor não está no globo, e sim na **dupla**: um resumo geográfico leve no painel e um mapa
completo sob demanda.

- **Bloco "Onde está a frota"** no painel: silhueta da região de operação (não do mundo) com pontos
  agregados, e três contadores embaixo — em movimento, parado ligado, sem sinal — nas cores fixas de
  status. Sem interação; o toque abre o Monitoramento.
- **Variações do mesmo bloco:** cercas com mais entradas e saídas; trechos com mais excesso de
  velocidade; paradas longas por região.
- **Destaque único:** só o que foi selecionado (um grupo, uma cerca) recebe cor; o resto fica
  neutro.

Riscos: silhueta de região exige um desenho por área de operação ou a geração a partir das posições;
agregação precisa respeitar a escala de 600–2.000 veículos; o bloco não pode montar o Leaflet.

Componentes e critérios de aceitação: `02-diretrizes-pwa-localle.md` § 12.
