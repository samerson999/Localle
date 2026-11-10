# Pesquisa de UX — Jornada A: Home (referência: Revolut Android)

Objetivo: extrair princípios de experiência mobile para o Localle, não copiar a Revolut. Marca,
textos, ícones e composição da Revolut não devem ser reproduzidos. Onde este documento contradiz
`PRODUCT.md`, vale o `PRODUCT.md`. As diretrizes para o PWA estão em `02-diretrizes-pwa-localle.md`.

## 0. Como ler

**Classificação de cada observação**

| Marca | Significado |
|---|---|
| **V** | Verificada: medida ou observada diretamente |
| **E** | Estimada: inferida de evidência incompleta |
| **H** | Hipótese de produto para o Localle, não validada |
| **N** | Não investigada: sem evidência suficiente |

**Três tipos de medida.** Toda medida aparece como `px / dp / proporção`:

- **px** — físico, na tela de 720 × 1612. Só serve para conferir contra a captura.
- **dp** — lógico, na densidade configurada do aparelho (235 dpi; 1 dp = 1,469 px; tela de
  490 × 1097 dp). É a referência de dimensionamento. Os valores quebrados (23,8; 43,6; 47,7) são
  arredondamento de pixel; o nominal provável (24; 44; 48) é **E**.
- **proporção** — relativa à largura (L = 720 px) ou à altura (A = 1612 px) da tela. É o que se
  transporta para outros tamanhos de tela.

A tela deste aparelho é larga em dp (490). Num celular comum o PWA terá 360–430 px CSS de largura:
transporte **proporções e relações**, não os valores em dp.

**Método**

| Fonte | Uso |
|---|---|
| ADB, `uiautomator dump` | Geometria, estados (selecionado, clicável, rolável) e rótulos de interface |
| ADB, captura de tela | Aparência. Só foi aberta a cópia com o conteúdo pessoal coberto; ver abaixo |
| Amostragem de pixels da captura bruta | Cores e raios, sem abrir a imagem |
| ADB, `input` (toque, deslize, toque sem soltar) | Experimentos de rolagem, navegação e estado pressionado |
| Rajada de capturas durante o gesto | Tentativa de medir animação (resolução de ~650 ms por quadro) |
| REA, descompilação, tráfego, gravação de vídeo | Não usados |

Ambiente: Moto G24, Android 14, escala de fonte 1,0, escalas de animação do sistema 1,0, modo escuro
do sistema desligado, nenhum serviço de acessibilidade ativo. Revolut 10.155.

**Privacidade.** Cada captura foi tirada antes e depois do dump e só foi aceita quando as duas eram
idênticas (o dump descreve exatamente a imagem). Todo texto que não é rótulo de interface, e todo
avatar ou imagem de linha, foi coberto pelas posições do próprio dump antes de a imagem ser aberta.
Telas em que o dump não cobre a tela inteira (menu sobreposto) só foram abertas recortadas dentro do
menu. A tela de contas não gerou imagem. Saldos, valores, nomes e fotos não foram lidos. Capturas e
dumps foram apagados ao fim; nada foi gravado no aparelho. O app foi devolvido ao estado inicial.

## 1. Inventário da Home

| # | Componente | Papel | Interativo |
|---|---|---|---|
| 1 | Cabeçalho fixo | Perfil, busca, 2 atalhos | Sim |
| 2 | Fundo de contexto | Degradê cuja cor identifica a conta ativa | Não |
| 3 | Bloco principal | Rótulo de contexto, número dominante, botão de troca | Botão e gesto horizontal |
| 4 | Indicador de páginas | 5 pontos; mostra a página do bloco principal | Não |
| 5 | Ações rápidas | 4 ações circulares; a 4ª é "Mais" | Sim |
| 6 | Cartão de aviso | Título, texto, 2 botões (dispensar / agir) | Sim |
| 7 | Cartão com carrossel | Subtítulo com seta + itens na horizontal | Sim |
| 8 | Cartão de resumo com lista | Título com seta, número grande, linhas | Sim |
| 9 | Cartão com gráfico | Aparece mais abaixo na rolagem | N |
| 10 | Barra inferior flutuante | 4 abas; recolhe ao rolar | Sim |
| 11 | Menu ancorado | Aberto por "Mais" | Sim |

Telas alcançadas a partir da Home e também levantadas: seletor de contas (§ 6.4) e perfil (§ 7).

## 2. Anatomia e hierarquia visual

### 2.1 Faixas verticais em repouso (V)

| Faixa | y início–fim (px) | dp | Proporção de A |
|---|---|---|---|
| Barra de status | 0–77 | 0–52 | 4,8% |
| Cabeçalho | 77–153 | 52–104 | 4,7% |
| Vazio superior | 153–328 | 104–223 | 10,9% |
| Bloco principal (rótulo, número, botão) | 328–509 | 223–347 | 11,2% |
| Vazio inferior | 509–667 | 347–454 | 9,8% |
| Indicador de páginas | 667–675 | 454–460 | 0,5% |
| Ações rápidas | 720–832 | 490–567 | 6,9% |
| Lista de cartões | 855 em diante | 582 | — |
| Barra inferior | 1466–1554 | 998–1058 | 5,5% |
| Área de gesto | 1577–1612 | 1074–1097 | 2,2% |

O topo da lista de cartões fica em **53% da altura**. A primeira dobra mostra um cartão inteiro, o
segundo quase inteiro e o começo do terceiro.

### 2.2 Ordem de atenção

1. **Número dominante** (V): é o maior elemento de texto (54 dp de altura contra 21–24 do resto),
   centrado, com 119 dp de vazio acima e 107 dp abaixo. Nada compete com ele na faixa.
2. **Botão branco do cartão de aviso** (V): único elemento branco opaco da tela.
3. **Ações rápidas** (V): quatro círculos claros sobre a parte escura do fundo.
4. **Rótulo de contexto e cabeçalho** (V): tamanho de corpo, contraste menor.
5. **Títulos de cartão** (V): cinza claro, com seta, abaixo do peso do conteúdo.

### 2.3 Como a prioridade é construída (V, salvo indicação)

- **Tamanho:** só existem dois degraus perceptíveis — texto de 21–24 dp de linha e números de
  47–54 dp. Não há tamanhos intermediários na Home.
- **Espaço negativo:** o bloco principal ocupa 11% da altura, mas reserva 21% de vazio em volta.
- **Cor:** o fundo vai de claro e saturado no topo a quase preto na base; o conteúdo denso (cartões)
  fica na parte escura e o número fica na transição.
- **Informativo × interativo:** tudo que é tocável tem forma fechada (círculo, cápsula, cartão) ou
  seta. Texto solto não é tocável.
- **Primário × secundário:** o botão que age é branco opaco com texto escuro; o que dispensa é
  translúcido com texto branco. Mesmo tamanho, pesos opostos.
- **Densidade na rolagem:** ao rolar, a área vazia some e a tela passa a ser só cartões; a barra
  inferior recolhe para devolver espaço (§ 6.1).

## 3. Medidas e proporções verificadas

Todas **V**, exceto raios (medidos por varredura de quina, ±2 px) e nominais.

### 3.1 Cabeçalho

| Elemento | px | dp | Proporção |
|---|---|---|---|
| Faixa | 720 × 76 | 490 × 51,7 | — |
| Avatar | 64 × 64, a 24 da borda | 43,6; margem 16,3 | margem 3,3% L |
| Vão avatar → busca | 15 | 10,2 | — |
| Busca (2 atalhos à direita) | 445 × 64 | 303 × 43,6 | 61,8% L |
| Busca (1 atalho à direita) | 518 × 64 | 352,7 × 43,6 | 71,9% L |
| Ícone da busca | 35, a 12 da borda interna | 23,8; 8,2 | 55% da altura da busca |
| Atalho | 63 × 64, ícone 35 | 42,9 × 43,6; 23,8 | — |
| Vão entre atalhos | 10 | 6,8 | — |
| Margem direita | 22 | 15 | 3,1% L |

Avatar, busca e atalhos têm a **mesma altura** (44 dp nominal) e a mesma forma (cápsula/círculo).
A busca é um botão que abre outra tela, não um campo editável (V).

### 3.2 Bloco principal

| Elemento | px | dp | Observação |
|---|---|---|---|
| Rótulo de contexto | 205 × 31, centrado | linha 21,1 | Acima do número |
| Número | 98–140 × 79, centrado | altura 53,8 | A largura varia com o valor |
| Vão rótulo → número | 0 | 0 | Encostados |
| Botão de contexto | 118 × 59, centrado | 80,3 × 40,2 | A 12 px (8,2 dp) do número |
| Indicador | 52 × 8, centrado | 35,4 × 5,4 | 5 pontos; o ativo é maior |

Relações: o número tem **2,5×** a altura de linha do rótulo; o conjunto fica centrado em ~26% da
altura da tela.

### 3.3 Ações rápidas

| Elemento | px | dp | Proporção |
|---|---|---|---|
| Coluna (área de toque) | 167 × 112 | 113,7 × 76,3 | 23,2% L cada |
| Círculo (visual) | 70 | 47,7 | 9,7% L; 42% da coluna |
| Ícone | 35 | 23,8 | 50% do círculo |
| Vão círculo → rótulo | 11 | 7,5 | — |
| Rótulo | linha de 31 | 21,1 | Centrado na coluna |
| Distância entre centros | 169 | 115 | — |
| Vão visual entre círculos | 99 | 67,4 | 1,4× o diâmetro |

A área de toque é **5,7×** a área do círculo. As quatro colunas ocupam a largura útil inteira.

### 3.4 Cartões

| Elemento | px | dp | Proporção |
|---|---|---|---|
| Largura | 672 | 457,5 | 93,3% L |
| Margem lateral | 24 | 16,3 | 3,3% L |
| Vão entre cartões | 22–23 | 15,3–15,7 | — |
| Respiro interno | 24 | 16,3 | — |
| Raio | ~33–35 | ~23–24 | **E** (±2 px) |
| Vão ações → primeiro cartão | 23 | 15,7 | — |

**Cartão de aviso** (197 px / 134 dp de altura): ícone em círculo de 58 px (39,5 dp); título com
linha de 35 px (23,8 dp); texto com linha de 31 px (21,1 dp); texto começa a 24 px do ícone; dois
botões de 306 × 59 px (208 × 40 dp), cada um com 45,5% da largura do cartão, 12 px (8,2 dp) entre
eles, totalmente arredondados.

**Cartão com carrossel** (233 px / 159 dp): subtítulo de 67 px (45,6 dp); itens de 194 px (132 dp)
de largura — cabem 3 inteiros —, ponto indicador de 8 px.

**Cartão de resumo com lista**: cabeçalho de 124 px (84 dp) com título de linha 31 px e número de
69 px (47 dp) de altura seguido de seta de 35 px; linhas de 106 px (72 dp) com imagem de 58 px
(39,5 dp), título a 24 px da imagem, valor alinhado à direita a 24 px da borda.

### 3.5 Barra inferior

| Estado | Barra (px) | dp | Proporção | Ícone | Rótulo |
|---|---|---|---|---|---|
| Expandida | 672 × 88, x=24 | 457,5 × 59,9 | 93,3% L | 35 px / 23,8 dp | linha 19 px / 12,9 dp |
| Recolhida | 578 × 76, x=71 | 393,5 × 51,7 | 80,3% L | 30 px / 20,4 dp | ausente |

- A base da barra fica em y=1554 nos dois estados: 58 px (39,5 dp) acima do fim da tela e 23 px
  (15,6 dp) acima da área de gesto.
- Raio = metade da altura nos dois estados (44 e 38 px).
- Quatro abas de 171 px (116 dp). O realce da aba ativa ocupa a aba inteira, com ~5 px de folga
  até a borda da barra.
- A lista passa por baixo da barra; a barra é opaca.

## 4. Tipografia e cores

### 4.1 Escala tipográfica

Altura de linha é **V**; tamanho de fonte é **E**; família e peso não foram identificados (**N**).

| Papel | Linha (px / dp) | Tamanho provável |
|---|---|---|
| Número dominante | 79 / 53,8 | 40–44 |
| Número de resumo | 69 / 47 | 34–36 |
| Título de cartão de aviso, título de linha | 35 / 23,8 | 16 |
| Corpo, rótulo de ação, texto de botão, título de seção | 31 / 21,1 | 14 |
| Subtítulo pequeno | 26 / 17,7 | 12 |
| Rótulo de aba | 19 / 12,9 | 10–11 |

Alinhamento (V): bloco principal e ações centrados; cartões alinhados à esquerda; valores à direita.

### 4.2 Cores (V, amostradas)

| Elemento | Cor | Sobre |
|---|---|---|
| Fundo, página 1 (de cima para baixo) | `40E2D2` → `119C8D` → `005C51` → `003A34` → `022E29` | — |
| Fundo, página 2 | `42D5E8` → `1C869E` → `05475E` → `022D3D` | — |
| Fundo, outra aba | `AA14F6` → `5B49F3` → `3F208C` | — |
| Base da tela | `010D0C` | — |
| Busca e atalhos, em repouso | `2B645E` | fundo `25B9AB` |
| Busca e atalhos, com conteúdo atrás | `353535` | qualquer |
| Círculo de ação | `5A7876` | fundo `022F2C` |
| Botão de contexto | `598882` | fundo `004940` |
| Cartão | `14534C` | fundo `024940` |
| Peça dentro do cartão / botão secundário | `2C645D` / `2B685F` | cartão |
| Botão primário | `FFFFFF`, texto escuro | cartão |
| Cartão, com a página rolada | `142C29` | fundo `021C19` |
| Barra inferior / aba ativa | `080808` / `2B2B2B` | — |
| Menu ancorado | `242426` | — |

Leituras:

- **A cor do fundo carrega significado** (V): muda com a página do bloco principal (verde, ciano) e
  com a aba (violeta). O esqueleto é idêntico; a cor diz onde se está.
- **Superfícies são clareamentos do fundo** (V): cartão, peça interna e botão secundário são três
  degraus cada vez mais claros da mesma cor, sem contorno e sem sombra visível.
- **Só três coisas são opacas e neutras** (V): barra inferior, menu e botão primário.
- **Não há cor semântica na Home**, exceto o vermelho do item destrutivo no menu (V).
- **Número dominante e sua unidade:** não observados (região coberta) — **N**.

## 5. Estados e variantes

| Componente | Estado | Evidência |
|---|---|---|
| Aba | Selecionada: realce cinza na aba inteira + ícone e rótulo marcados | V |
| Aba | Recolhida: só ícone, 20 dp | V |
| Busca / atalhos | Translúcidos no topo; cinza opaco (`353535`) assim que há rolagem | V |
| Círculo de ação | Pressionado: clareia (`5A7876` → ~`7B9391`) e cresce ~4 px (2,7 dp) de cada lado na linha medida | V (um quadro); fator de escala ~1,12 é **E** |
| Botão | Primário (branco opaco) e secundário (translúcido) | V |
| Indicador de páginas | Ponto ativo maior que os demais | V |
| Item de menu | Normal (branco) e destrutivo (vermelho, ícone vermelho) | V |
| Desabilitado, carregando, vazio, erro | — | N |
| Pressionado de botão, aba, linha e cartão | — | N |

Variante do conjunto de ações por contexto (V): página 1 mostra três ações + "Mais"; página 2
mostra outras três + "Mais". A quarta posição é sempre "Mais".

## 6. Interações e comportamento

### 6.1 Rolagem vertical (V — 5 pontos medidos, retorno ao topo reproduzido)

Deslocamento do conteúdo medido pela posição do primeiro cartão.

| Conteúdo rolado | Cabeçalho | Bloco principal | Ações | Barra inferior |
|---|---|---|---|---|
| 0 | Translúcido | y=328 | y=720 | Expandida |
| 89 px (61 dp) | Fixo; busca vira cinza opaco | y=246 (subiu 82) | subiu 89 | **Recolhida** |
| 348 px (237 dp) | Fixo | y=8 (subiu 320), passando por trás do cabeçalho | subiu 348 | Recolhida |
| ~860 px | Fixo; só cartões na tela | fora da tela | fora da tela | Recolhida |
| ~115 px de volta para cima | Fixo | fora da tela | fora da tela | **Expandida** |
| Topo | Translúcido | y=328 | y=720 | Expandida |

Conclusões:

- **O cabeçalho nunca sai nem muda de tamanho** (V). Não ganha fundo próprio: o conteúdo passa por
  trás e continua visível entre os botões. O que muda é a cor dos botões, de translúcida para
  opaca, logo no primeiro deslocamento.
- **O bloco principal não vira título compacto** (V): ele simplesmente rola para fora, por trás do
  cabeçalho. O botão de contexto aparece esmaecido no meio do caminho (V na imagem; a opacidade não
  foi medida — **E**).
- **Paralaxe leve** (V): rótulo, número, botão e indicador sobem a **0,92×** da velocidade do
  conteúdo (82/89 e 320/348). As ações sobem a 1×.
- **O fundo sobe mais devagar** (E): a base da imagem de fundo subiu 44 px quando o conteúdo subiu
  89 (≈0,5×), um único ponto medido antes de ela encostar no limite.
- **O fundo escurece com a profundidade** (V): do degradê para um tom quase uniforme (`021C19`).
- **A barra inferior responde à direção, não à posição** (V): recolhe ao rolar para baixo (já
  recolhida com 61 dp) e expande ao rolar para cima, mesmo longe do topo.
- **Encaixe (snap) e inércia:** não investigados — **N**.

### 6.2 Bloco principal paginado (V)

Deslize horizontal sobre o bloco troca a página: o indicador avança, a cor do fundo muda, o conjunto
de ações muda e a **lista de cartões inteira é substituída**. O cabeçalho e a barra inferior não
mudam. Um deslize rápido (440 px em 250 ms) não paginou; um mais lento e longo (520 px em 600 ms)
paginou — o limiar do gesto não foi caracterizado (**N**).

### 6.3 "Mais" → menu ancorado (V)

- Abre um **menu flutuante, não uma folha inferior**: 317 × 336 px / 216 × 229 dp (44% L).
- Alinhado à margem direita da tela (16 dp) e 13 dp abaixo da linha de ações.
- 5 itens de 65 px (44,3 dp): ícone de 24 dp a 16 dp da borda, texto a 12 dp do ícone.
- Fundo opaco escuro, um divisor antes do último item, item destrutivo em vermelho.
- Animação de abertura e forma de fechar: **N**.

### 6.4 Botão de contexto → tela de contas (V, só estrutura)

Abre uma **tela cheia empilhada**, sem barra de abas: barra superior de 108 dp (com a de status) e
botão de voltar de 44 dp; lista com linhas e botões pequenos à direita; um botão em cápsula
**flutuante e centrado** (334 × 76 px / 227 × 52 dp, 46% L) a 40 dp da área de gesto. "Voltar"
devolve a Home no mesmo estado.

### 6.5 Troca de aba (V)

A barra mantém geometria e posição; só o realce muda de aba. O cabeçalho permanece, e a busca
alarga quando a aba tem um atalho a menos. A cor do fundo muda. A transição em si: **N**.

### 6.6 Mapa de interações

| Origem | Gesto | Resultado | Retorno |
|---|---|---|---|
| Avatar | Toque | Perfil em tela cheia (§ 7) | Voltar / botão fechar |
| Busca | Toque | N | N |
| Bloco principal | Deslize horizontal | Troca de contexto (página) | Deslize contrário |
| Botão de contexto | Toque | Tela de contas | Voltar |
| Ação rápida | Toque | N (não tocadas: são transacionais) | — |
| "Mais" | Toque | Menu ancorado | N |
| Botões do cartão de aviso | Toque | N (alteram dados da conta) | — |
| Aba | Toque | Troca de aba | Toque em outra aba |
| Lista | Deslize vertical | Rolagem; barra recolhe/expande | — |

Observação de método: por duas vezes o primeiro toque após uma pausa não teve efeito e o segundo
teve. A causa não foi determinada (**N**); não tratar como comportamento do app.

## 7. Perfil ("minha conta") — tela cheia a partir do avatar

Levantada só em estrutura e aparência, com todo o conteúdo coberto.

**Anatomia (V)**

| Elemento | px | dp | Observação |
|---|---|---|---|
| Botão fechar (X) | 64 × 64, x=23 | 43,6 | Círculo, canto superior esquerdo |
| Ação em cápsula | 139 × 64 | 94,6 × 43,6 | Branca opaca, ícone 16 dp + texto, canto direito |
| Avatar | 146 × 146, centrado | 99,4 | 20,3% L |
| Nome | até 2 linhas, 125 de altura | 85,1 | Centrado |
| Identificador | linha de 35 | 23,8 | Centrado, tocável |
| Cabeçalho total | 459 | 312,5 | 28,5% A |
| Cartão de plano | 672 × 128 | 457,5 × 87 | Título (linha 29 dp), rótulo, botão de 40 dp |
| Grupo de linhas | 1 cartão com 8 linhas | — | Sem divisores entre as linhas |
| Linha simples | 83 de altura | 56,5 | Ícone 24 dp a 16 dp; texto a 16 dp do ícone |
| Linha com subtítulo | 114 | 77,6 | — |
| Linha isolada | cartão próprio, a 24 px do grupo | 16 | Última ação, separada |
| Rodapé | 3 linhas de texto pequeno | — | — |

**Aparência (V):** fundo chapado `191C1F`, sem degradê; cartões `292C2F`; raio ~24 dp (E); sem
barra de abas.

**Rolagem (V):** o cabeçalho grande colapsa de 312 dp para 108 dp. Durante o colapso surge um
título na barra (linha de 29 dp, à direita do botão fechar), que sobe 5,5 dp até a posição final.
O texto do título tem o mesmo comprimento do nome — é o nome reaproveitado como título (E).

**Diferença em relação à Home:** aqui o cabeçalho **colapsa em título**; na Home ele é fixo e o
bloco principal apenas rola para fora. São dois padrões distintos no mesmo app.

## 8. Motion e microinterações

Medido numa segunda rodada, com quadros brutos em sequência a ~4 por segundo (um a cada ~265 ms);
método e demais transições em `03-dashboards-tema-motion-revolut.md` § 5. Durações são **E**.

| Item | Situação |
|---|---|
| Barra inferior recolher/expandir | A largura **é animada** (quadro intermediário de 588 px entre 670 e 578); conclui em menos de ~0,5 s |
| Troca de cor dos botões do cabeçalho | Ocorre no mesmo quadro em que a barra começa a recolher: menos de ~0,3 s |
| Entrada de tela empilhada | A tela nova **desliza da direita** e a de baixo escurece; menos de ~0,5 s |
| Troca de aba | O conteúdo novo surge por **esmaecimento** (um quadro de fundo preto no meio); menos de ~0,5 s |
| Paralaxe do bloco principal e do fundo | V (0,92×) e E (0,5×); é ligada à rolagem, não ao tempo |
| Estado pressionado | V em um quadro (clareia e cresce); duração e retorno: **N** |
| Abertura do menu, troca de página do bloco | **N** |
| Curvas de aceleração | **N** — nenhuma foi medida; não inventar |

A gravação de vídeo não foi usada porque a Home exibe dados financeiros.

## 9. O que produz a percepção de qualidade

Síntese; cada item se apoia nas seções indicadas.

1. **Uma só altura para todos os controles de uma faixa** (§ 3.1): avatar, busca e atalhos com
   44 dp. Nada "quase alinhado".
2. **Poucos valores, repetidos sempre** (§ 3): 16 de margem e respiro, 24 de ícone, 40–48 de alvo,
   60 de barra. A consistência é a principal fonte de acabamento.
3. **Raio proporcional à altura** (§ 3.5): o que é controle é cápsula; o que é contêiner tem raio
   grande e constante.
4. **Dois degraus de tamanho, com salto grande** (§ 4.1): a hierarquia é legível à distância.
5. **Vazio usado como destaque** (§ 2.1): 21% da altura sem conteúdo em volta do número.
6. **Superfícies em degraus da mesma cor, sem linhas** (§ 4.2): agrupamento por fundo e espaço,
   não por contorno ou divisor.
7. **Alvo de toque muito maior que o desenho** (§ 3.3): 5,7× no caso das ações.
8. **A interface cede espaço ao conteúdo** (§ 6.1): a barra recolhe quando o usuário lê e volta
   quando ele hesita.
9. **Movimento com profundidade discreta** (§ 6.1): camadas em velocidades ligeiramente diferentes.
10. **Peso de botão coerente com consequência** (§ 2.3): agir é opaco, dispensar é translúcido,
    destruir é vermelho.

## 10. Limitações e evidências ausentes

- Curvas de aceleração; durações só têm limite superior, com resolução de ~265 ms.
- Número dominante: composição, unidade, tratamento de casas decimais.
- Família e pesos tipográficos; tamanhos de fonte são estimativas.
- Raios de cartão têm ±2 px; raio da busca não foi medido (é cápsula na imagem).
- Tela de busca, destino das ações rápidas, botões do cartão de aviso: não tocados.
- Forma de fechar o menu ancorado.
- Limiar e encaixe do gesto horizontal do bloco principal.
- Estados de carregamento, vazio, erro e sem conexão.
- Abas além da Home e de uma aba promocional.
- A Home é idêntica nos modos claro e escuro do app (verificado depois; ver documento 03, § 4).
- Um único aparelho, numa densidade não padrão.

## 11. Tradução para o Localle

Viabilidade: **D** = direto com a stack atual; **A** = com adaptação web; **S** = depende de
suporte do navegador/sistema; **X** = não recomendado.

| Padrão | Por que funciona | Onde ajuda o gestor | Viab. |
|---|---|---|---|
| Bloco principal com uma pergunta só | Responde "o que eu preciso saber agora" sem leitura | Início: pendências críticas e estado da frota | D |
| Vazio em volta do dado dominante | Isola a decisão do resto | Início; topo de detalhe do veículo | D |
| Contexto pequeno acima + troca de contexto abaixo | Diz de quem é o número e deixa trocar sem sair | Início: cliente/grupo/filial | D |
| Troca de contexto por deslize horizontal | Compara contextos sem menu | Entre grupos ou filiais | A — precisa de alternativa por toque; conflita com o gesto de voltar do navegador na borda |
| Linha de até 4 ações, a 4ª "Mais" | Limita a escolha ao que cabe sem rolar | Início; detalhe do veículo (comando, replay, checklist) | D |
| Alvo de toque maior que o desenho | Reduz erro com o polegar | Todo o app | D |
| "Mais" como menu ancorado | Mantém o contexto visível | Ações secundárias de uma linha ou cartão | A — o padrão do Localle abaixo de `md` é a `Sheet`; usar menu só em telas largas |
| Cartão de aviso com agir/dispensar | Decisão no lugar, sem navegar | "Precisa de você": documento vencendo, OS aguardando | A — item crítico não deve ter "dispensar" com o mesmo peso |
| Cartão de resumo: número, depois linhas | Conclusão antes do detalhe | Custos, combustível, manutenção, com variação de período | D |
| Carrossel horizontal dentro de cartão | Mostra vários itens sem alongar a tela | Veículos em alerta, motoristas | A — exige `scroll-snap` e indicador; cuidado com rolagem aninhada |
| Barra inferior flutuante de 4 itens | Navegação ao alcance do polegar, conteúdo passa por baixo | Já existe (`SidebarDock`) | D |
| Barra que recolhe ao rolar para baixo | Devolve espaço à leitura | Listas longas, relatórios | A — por direção de rolagem; desligar com movimento reduzido |
| Cabeçalho fixo sem fundo, com controles opacos | Mantém busca e perfil sem cortar a tela | Início | A — no Localle o fundo é claro: usar o vidro já existente (`dock-glass`) |
| Cabeçalho grande que colapsa em título | Dá identidade no topo e espaço depois | Conta, detalhe do veículo, detalhe do motorista | A — `position: sticky` + observador de rolagem |
| Paralaxe de fundo e de bloco | Sensação de profundidade | — | X para o fundo (não há imagem de fundo); S para o bloco (animação ligada à rolagem) — opcional |
| Fundo em degradê de cor que indica contexto | Orientação imediata | — | X — a marca é da revenda; status tem cores fixas |
| Superfícies translúcidas sobre cor | Unidade visual | — | X — contraste de status não pode depender do fundo |
| Grupo de linhas num cartão, sem divisores | Menos ruído | Conta, configurações | A — hoje `ListItem` usa divisor; avaliar por tela |
| Ação isolada em cartão próprio | Separa o que é destrutivo ou final | "Sair", "Excluir" | D |

### 11.1 Hipótese de Home do Localle (H)

A decisão parte da necessidade do gestor, não do cartão financeiro. Hoje o gestor cai em
`/monitoramento`; uma tela de início é uma proposta nova.

- **Bloco principal:** quantidade de itens do "Precisa de você", com o contexto (cliente/grupo)
  acima e a ação "Tratar" abaixo. Vermelho apenas quando houver crítico. Com zero pendências, o
  bloco mostra o estado da frota em vez de um zero.
- **Estado da frota:** em movimento, parado ligado, desligado, sem sinal — ponto + texto + número,
  nas cores fixas de status.
- **Ações (4):** Mapa, Comando, Checklist, Mais.
- **Cartões por urgência:** críticos abertos → documentos e CNH vencendo → manutenção próxima →
  resumo do dia com comparação de período.

Detalhamento, componentes e critérios de aceitação: `02-diretrizes-pwa-localle.md`.

## 12. A Jornada A está concluída?

| Critério | Situação |
|---|---|
| Evidência visual, geométrica e comportamental dos elementos principais | Atendido |
| Rolagem em 5 pontos com retorno ao topo | Atendido |
| Estados selecionado, recolhido, pressionado | Atendido em parte (pressionado só em um componente) |
| Motion com duração e curva | Atendido em parte: tipo de movimento e limite de duração medidos; curvas não |
| Suficiente para prototipar sem voltar à Revolut | Sim para estrutura, proporções, hierarquia, rolagem e tipo de movimento; não para curvas de animação |

Recomendação: dar a Jornada A por concluída para fins de protótipo. Reproduzir o **tipo** de
movimento (deslizar ao empilhar, esmaecer ao trocar de aba, transformar o elemento ao mudar de
estado) com os tempos e curvas do Localle: `--t-*` e `--ease-*` do `tokens.css`.
