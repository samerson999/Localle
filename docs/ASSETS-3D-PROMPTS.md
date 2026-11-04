# Assets 3D: varredura, especificação e prompts

Levantamento de 04/11/2026, feito no código, para refazer o conjunto 3D em alta qualidade e criar as peças em camadas
da tela de login. Complementa `docs/INVENTARIO-ASSETS.md` (decisões de 20/10/2026, que continuam valendo) e segue o
método do guia da Oratry: **referência → prompt → iteração → galeria**, com a IA lendo esta especificação antes de
gerar qualquer peça.

## 1. Regra de uso (não muda)

`PRODUCT.md` › Brand Commitments: **3D só em estado vazio, erro e onboarding**, no nível de página ou painel principal.
Vazio pequeno (card de BI, tabela secundária, lista curta, paleta de comandos) fica com texto e ícone de linha.
Cor de destaque fixa no azul de dado (`--real`, #1D5BEA), **nunca a cor da revenda**.

**Exceção em avaliação:** o painel de destaques do login (`components/LoginShowcase.tsx`) usa 3D como primeiro contato
(nível de onboarding). Se aprovada, registrar no `PRODUCT.md`.

## 2. Varredura: onde o 3D entra

### 2.1 Em uso hoje (refazer em alta, mesmo lugar)

| Id | Onde aparece (arquivo:linha) | Situação |
|---|---|---|
| `ilu-erro` | `Checklist.tsx:107`, `Manutencao.tsx:62`, `Monitoramento.tsx:280`, `Ranking.tsx:59`, `Replay.tsx:167`, `Setup.tsx:64` | ok, refazer em alta |
| `ilu-busca-veiculo` | `Ativos.tsx:95`, `Monitoramento.tsx:177/225/542`, `Pneus.tsx:349`, `PortariaApp.tsx:62` | ok, refazer em alta |
| `ilu-tudo-em-dia` | `NeedsPanel.tsx:87`, `BIManut.tsx:111`, `Alertas.tsx:46`, `Checklist.tsx:223`, `Jornada.tsx:98`, `Manutencao.tsx:113`, `PrecisaDeVoce.tsx:48/118`, `Ranking.tsx:103`, `Viagens.tsx:91/179` | **fora da especificação**: check verde; a regra pede sem verde de status |
| `ilu-sem-acesso` | `App.tsx:58`, `Clientes.tsx:23`, `Contratos.tsx:32`, `Equipe.tsx:46`, `EquipeCliente.tsx:42`, `Faturamento.tsx:39`, `Juridico.tsx:8`, `Locale.tsx:24`, `Rastreadores.tsx:54`, `Revenda.tsx:17`, `Saude.tsx:24` | ok, refazer em alta |
| `ilu-link-expirado` | `Compartilhar.tsx:58` | ok, refazer em alta |
| `ilu-cercas` | `Cercas.tsx:141`, `RelatorioCercas.tsx:164` | ok, refazer em alta |
| `ilu-checklist` | `Checklist.tsx:357` | ok, refazer em alta |
| `ilu-combustivel` | `Combustivel.tsx:51/161` | ok, refazer em alta |
| `ilu-manutencao` | `Manutencao.tsx:177` | ok, refazer em alta |
| `ilu-multas` | `Multas.tsx:156` | ok, refazer em alta |
| `ilu-pneus` | `Pneus.tsx:455` | ok, refazer em alta |
| `ilu-viagens` | `Viagens.tsx:147/215` | ok, refazer em alta |
| `ilu-jornada` | `Jornada.tsx:93/125` | ok, refazer em alta |
| `ilu-campanhas` | `Ranking.tsx:207` | ok, refazer em alta |
| `ilu-replay` | `Replay.tsx:168` | ok, refazer em alta |
| `ilu-documentos` | `Ativos.tsx:517` | ok, refazer em alta |
| `ilu-estoque` | `Rastreadores.tsx:118`, `Revenda.tsx:143` | ok, refazer em alta |
| `ilu-telemetria` | só no login (`LoginShowcase.tsx`); a tela de Telemetria saiu | **fora da especificação**: virou velocímetro; a especificação era o módulo rastreador. Manter o velocímetro como `ilu-telemetria` e criar `ilu-rastreador` |
| `ilu-equipe` | `EquipeCliente.tsx:48` | **referenciado sem arquivo**: hoje mostra o marcador neutro |

### 2.2 Lacunas: telas que se encaixam na regra e hoje usam ícone de linha

| Tela e situação (arquivo:linha) | Por que entra na regra | Asset |
|---|---|---|
| "Nenhum ativo cadastrado" (`Ativos.tsx:96`) | primeiro acesso do gestor: onboarding de página | `ilu-onboarding-frota` (novo) |
| "Nenhum cliente cadastrado" (`Clientes.tsx:45`) | vazio de página (revenda e Locale) | `ilu-clientes` (novo) |
| "Nenhum contrato para faturar" (`Faturamento.tsx:86`) | vazio de página | `ilu-faturamento` (novo) |
| "Nenhum relatório gerado ainda" (`Relatorios.tsx:77`) | vazio do painel principal do hub | `ilu-relatorios` (novo) |
| "Nenhum rastreador cadastrado" (`Rastreadores.tsx:538`) | vazio de página | `ilu-rastreador` (novo) |
| "Nenhuma posição/veículo no período" (`RelatorioPosicoes.tsx:164/169`, `RelatorioUso.tsx:123`, `RelatorioPassouPorAqui.tsx:173`, `RelatorioCercas.tsx:176`) | painel principal da tela de relatório | `ilu-periodo-vazio` (novo) |
| "Nenhum excesso de velocidade no período" (`RelatorioVelocidade.tsx:162/174`) | vazio que é boa notícia | `ilu-tudo-em-dia` (existente) |
| "Link indisponível" do convite e da redefinição de senha (`Convite.tsx:53`) | página pública, mesmo caso do link compartilhado | `ilu-link-expirado` (existente) |
| Onboarding: importar planilha, configurar marca | ainda não há tela (previstos no inventário, Fase D) | `ilu-onboarding-importar`, `ilu-onboarding-marca` (novos) |
| Login: painel de destaques | exceção em avaliação (seção 1) | conjunto em camadas da seção 5 |

### 2.3 Ficam sem 3D (a regra pede ícone de linha)

Vazios de gráfico e card de BI (`story.tsx:172/173/194/195/224/225/256`), paleta de comandos
(`CommandPalette.tsx:50`), "Nenhum alerta recente" do painel lateral (`NeedsPanel.tsx:93`), tabelas secundárias
(`Alertas.tsx:126`, `SupportAccess.tsx:46`, `JornadaDocs.tsx:138`, `Locale.tsx:71/89/92`, `Revenda.tsx:146/151`,
`Setup.tsx:66/126`, `Pneus.tsx:126/158/282`, `Rastreadores.tsx:152`, `Monitoramento.tsx:314/385/637`), e o
"Carregue um percurso" do Replay (`Replay.tsx:184`), que é instrução, não vazio.

## 3. Especificação comum (vale para todas as peças)

**Entrega**
- **PNG com canal alfa real** (fundo transparente de verdade). Não aceitar fundo branco, cinza ou o "xadrez" desenhado
  que algumas ferramentas pintam no lugar da transparência. Se a ferramenta não exportar alfa, gerar sobre **magenta
  chapado #FF00FF** (nenhuma peça usa magenta) para o recorte automático.
- **Uma peça por arquivo.** Nunca folha com várias peças, grade ou variações lado a lado.
- **Alta resolução:** canvas **2048 × 1638 px** (mesma proporção 5:4 do conjunto atual), objeto centralizado
  ocupando cerca de 70% da altura, margem mínima de 10% em todos os lados. O pipeline gera as versões de uso
  (640×512, WebP 2x de página e de painel).
- **Sem sombra de chão, sem reflexo, sem chão.** A sombra passa a ser feita em código (elipse desfocada), para
  acompanhar a peça quando ela flutua no login e ficar igual em todo o app.
- **Sem texto, letras ou números** desenhados na peça.

**Estilo**
- 3D fosco, aspecto de "massinha"/clay suave, bordas bem arredondadas, sem brilho especular forte.
- Paleta: branco e cinza frio (#F4F6F9 a #C7D0DC) no corpo; **azul #1D5BEA** como único destaque.
- Cor própria só quando o objeto pede: laranja #D26A06 no cone; vermelho #D42A1E **só** em selo de erro.
  Sem verde (o verde é cor de status de veículo).
- Câmera em 3/4, levemente de cima (cerca de 20°), lente normal (sem grande angular); luz principal suave de
  cima à esquerda, preenchimento suave à direita.
- Mesma câmera, luz e escala em todo o conjunto: as peças precisam parecer da mesma família lado a lado.

**Peças em camadas (login)**
- Primeiro gerar a **peça inteira** e aprovar. Depois gerar **cada camada a partir da peça aprovada** (usando-a como
  imagem de referência), mantendo exatamente a mesma câmera, escala e posição no canvas, para as camadas se
  sobreporem sem ajuste.
- Cada camada é um arquivo próprio, no mesmo canvas de 2048 × 1638, com o restante transparente.
- Onde uma parte esconde outra (ex.: ponteiro sobre o mostrador), a camada de baixo vem **completa**, sem o "buraco"
  da parte de cima.

**Nomes e pasta**
- App: `apps/web/src/images/ilustracoes/fonte/NN-nome.png` (mestres em 2048), processados por
  `scripts/ilustracoes.py` para os `ilu-*.png` e os WebP de `ilustracoes/web/`.
- Login: `apps/web/src/images/login/<peca>-<camada>.png` (ex.: `velocimetro-ponteiro.png`).

## 4. Prompts do conjunto do app

Os prompts estão em inglês porque as ferramentas de geração de imagem respondem melhor a ele. Cada um é completo:
copie e cole sem juntar nada. Todos repetem o mesmo bloco de estilo de propósito, para a família sair consistente.

**Bloco de estilo** (já incluído em cada prompt abaixo):
> Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent
> color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper
> left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10%
> margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no
> reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

### 4.1 Refazer em alta (já existem)

**ilu-erro** · cone com selo de erro
> A traffic cone in soft orange #D26A06 with white matte stripes, with a small round red #D42A1E badge with a white exclamation mark floating at its upper right. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-busca-veiculo** · pino sobre mapa dobrado com lupa
> A white location pin standing on a folded paper map (three panels, white and light grey), with a royal blue #1D5BEA magnifying glass leaning on the lower right of the map. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-tudo-em-dia** · escudo com check (sem verde)
> A rounded white shield with a light grey inner panel and a raised white check mark on a royal blue #1D5BEA round seal at its center. No green anywhere. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-sem-acesso** · cadeado sobre pasta
> A closed white padlock with a royal blue #1D5BEA shackle resting on top of a light grey file folder. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-link-expirado** · pino com relógio
> A white location pin with a small royal blue #1D5BEA round clock attached to its lower right side, clock hands in white. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-cercas** · área demarcada com estacas e pino
> A small square patch of light grey ground delimited by four white stakes connected by a royal blue #1D5BEA rope, with a white location pin standing in the middle. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-checklist** · prancheta com lista e caneta
> A white clipboard with a light grey clip holding a sheet with three rows of rounded check boxes, two of them checked in royal blue #1D5BEA, and a royal blue pen lying diagonally across it. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-pneus** · pneu em pé
> A single truck tire standing upright, tire in dark cool grey (not black) with deep tread, white rim with a royal blue #1D5BEA hub cap. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-manutencao** · chave inglesa sobre ordem de serviço
> A white sheet of paper with grey lines representing a work order, with a royal blue #1D5BEA wrench lying diagonally on top of it. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-combustivel** · bomba de combustível
> A compact white fuel pump with a light grey display panel and a royal blue #1D5BEA nozzle hanging on its side by a curved grey hose. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-viagens** · cancela de portaria
> A gate barrier: a short white post with a long white boom arm with royal blue #1D5BEA stripes, the arm slightly raised. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-multas** · envelope com notificação de trânsito
> A white envelope slightly open with a light grey card sticking out, and a small royal blue #1D5BEA round traffic-sign shaped seal on the card. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-jornada** · relógio de ponto
> A white time clock machine (punch clock) with a round face, light grey body, and a royal blue #1D5BEA card inserted in its slot. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-campanhas** · troféu
> A white trophy cup with two rounded handles on a light grey base, with a royal blue #1D5BEA ribbon band around the cup. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-replay** · mapa com rota tracejada e botão play
> A folded white paper map with a royal blue #1D5BEA dashed route connecting two small round dots, and a large royal blue round play button with a white triangle overlapping the lower right corner. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-documentos** · pasta com documento e etiqueta de vencimento
> A light grey file folder with a white document sticking out, and a small royal blue #1D5BEA tag with a tiny white calendar shape hanging from the folder. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-estoque** · caixa aberta com rastreadores
> An open white cardboard-like box (matte white, not brown) containing three small rounded rectangular GPS tracker modules in light grey with royal blue #1D5BEA tops. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-telemetria** · velocímetro com ondas de sinal
> A round white speedometer gauge with light grey tick marks, a royal blue #1D5BEA needle pointing up and to the right, and two royal blue curved signal waves rising from its upper right edge. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

### 4.2 Novos

**ilu-equipe** · dois bustos de pessoas (referenciado sem arquivo)
> Two simple abstract person busts side by side (round head and rounded shoulders, no faces), one white and one light grey, with a small royal blue #1D5BEA round plus badge at the upper right. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-rastreador** · módulo rastreador com chicote
> A small rounded rectangular GPS tracker module in white with a light grey lid, a short grey wire harness with a connector coming out of one side, and two royal blue #1D5BEA curved signal waves above it. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-onboarding-frota** · veículos sobre mapa (primeiro acesso)
> A folded white paper map with two small rounded toy-like vehicles on it (a white van and a white truck, simple shapes, no logos) and a royal blue #1D5BEA location pin standing beside them. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-clientes** · prédio comercial com cartão
> A small rounded white office building (three floors, light grey windows) with a royal blue #1D5BEA business card leaning against its base. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-faturamento** · fatura com moeda
> A white invoice sheet with grey lines, slightly curled at the bottom, with a royal blue #1D5BEA coin standing in front of it, the coin with a simple embossed circle (no currency symbol). Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-relatorios** · documento com gráfico de barras
> A white document sheet with a small bar chart of three rounded bars, two in light grey and the tallest in royal blue #1D5BEA, and a light grey folded corner. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-periodo-vazio** · calendário com rota pontilhada
> A white desk calendar block with light grey binding rings, and a royal blue #1D5BEA dotted route line curling out of its front page and ending in a small hollow circle. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-onboarding-importar** · planilha virando veículos
> A white spreadsheet sheet with a light grey grid on the left, and a royal blue #1D5BEA curved arrow leading to two small rounded white toy-like vehicles on the right. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

**ilu-onboarding-marca** · paleta e cartão de marca
> A white artist palette with three paint dabs (light grey, white, royal blue #1D5BEA) next to a blank white business card standing upright. Soft matte 3D clay render, rounded edges, no specular highlights. Body in white and cool light grey, single accent color royal blue #1D5BEA. 3/4 view slightly from above (about 20 degrees), normal lens. Soft key light from upper left, gentle fill from the right. Single isolated object, centered, occupying about 70% of the canvas height, 10% margin on all sides. Transparent background (PNG with real alpha channel). No ground, no floor shadow, no reflection, no text, no letters, no numbers. 2048x1638 px, high detail, clean edges.

## 5. Conjunto do login (em camadas)

Fluxo de cada peça: gerar a **peça inteira** com o prompt "inteira" e aprovar na galeria; depois gerar cada camada
anexando a peça aprovada como referência, com o prompt da camada. Começar pelo **velocímetro** (o ganho mais visível:
ponteiro girando) e só seguir para as outras se o encaixe das camadas funcionar.

**Prompt de camada** (modelo; trocar o trecho entre colchetes):
> Using the attached image as the exact reference, output the SAME object with identical camera angle, scale, lighting and position on a 2048x1638 canvas, but show ONLY [descrição da camada]. Everything else must be removed and fully transparent (PNG with real alpha channel). Where other parts used to cover this part, complete it naturally so it looks whole. No ground, no shadow, no text.

| Peça | Prompt da peça inteira | Camadas (arquivo · trecho da camada) | Animação prevista |
|---|---|---|---|
| Velocímetro | o de `ilu-telemetria` (4.1), com o ponteiro **apontando para baixo à esquerda** (posição zero) | `velocimetro-mostrador` · "the gauge body and dial with tick marks, without the needle and without the signal waves" · `velocimetro-ponteiro` · "only the needle and its center cap" · `velocimetro-ondas` · "only the two curved signal waves" | ponteiro sobe até a velocidade; ondas pulsam uma a uma |
| Caminhão | "A small rounded toy-like box truck in white matte clay with light grey cargo box and a royal blue #1D5BEA cab stripe, no logos, side 3/4 view facing right" + bloco de estilo | `caminhao-carroceria` · "the truck body without the wheels" · `caminhao-rodas` · "only the visible wheels, each wheel complete" | rodas giram enquanto entra; balanço leve da suspensão |
| Cone de alerta | o de `ilu-erro` (4.1) | `cone-corpo` · "only the cone, without the red badge" · `cone-selo` · "only the round red badge with the exclamation mark" | selo salta e pulsa a cada alerta que chega |
| Escudo | o de `ilu-tudo-em-dia` (4.1) | `escudo-corpo` · "only the shield, with the blue seal empty (no check mark)" · `escudo-check` · "only the white check mark" | check desenhado quando o último alerta é tratado |
| Bomba de combustível | o de `ilu-combustivel` (4.1) | `bomba-corpo` · "only the pump body and display, without hose and nozzle" · `bomba-bico` · "only the hose and the blue nozzle" | bico balança e solta uma gota quando a barra de combustível cresce |
| Chave e engrenagem | "A royal blue #1D5BEA wrench crossed with a white gear, side by side" + bloco de estilo | `chave-chave` · "only the wrench" · `chave-engrenagem` · "only the gear, complete" | engrenagem gira enquanto as barras voam para o total |

## 6. Conferência (antes de aprovar uma peça)

1. Abrir o PNG num editor e confirmar que o fundo é transparente de verdade (não branco, não xadrez desenhado).
2. Conferir que há uma única peça no arquivo, sem texto, sem sombra de chão.
3. Colocar ao lado de duas peças já aprovadas: mesma câmera, luz, espessura de borda e tom de branco.
4. Nas camadas: sobrepor todas no mesmo canvas e conferir que encaixam sem deslocamento.
5. Conferir em 160×128 (estado vazio de página) e em 96×77 (painel): a silhueta ainda precisa ser reconhecível.
