# Inspeção geral — design, interação e desempenho

20/10/2026. Inspeção e correções feitas **pelo código**. A conferência visual fica com você, pelo roteiro da seção 5. As medições de desempenho da seção 2 foram feitas no navegador, no build de produção, antes de você pedir para parar de usar o navegador. As medições finais (LCP, INP, quadros por segundo) ficam no roteiro, para você repetir.

Padrão de referência: `PRODUCT.md` › Brand Commitments, a vitrine `/design` e o guia visual da `Nova pasta` (mesmas imagens de `docs/referencias/`).

---

## 1. Resumo

| Área | Antes | Depois |
|---|---|---|
| Gráficos com tooltip | nenhum | todos: os da Fase B, os antigos (cascata, matriz de calor, matriz de pontos, estimado × realizado, barras 100% horizontais) e as listas com barra feitas em cada tela |
| Recharts | 4 telas (Multas, Painel da Locale, `/design`, `charts.tsx`) | removido do código; só gráficos próprios em SVG |
| Bundle inicial (JS) | 1.508,7 KB (455,5 KB gzip), um arquivo para o app inteiro | 432,8 KB (152,3 KB gzip); cada tela baixa só o próprio pedaço |
| Abertura do app com dados salvos | gerava a base inteira da simulação (0,5 a 0,7 s de CPU) em toda abertura | gera só quando não há estado salvo (ou uma única vez, ao migrar versão) |
| Tela parada (simulador rodando) | 5 travadas de 60 a 80 ms a cada 10 s | 1 travada em 10 s (a gravação no navegador, agora no máximo a cada 10 s e quando o navegador está ocioso) |
| Ilustrações 3D | PNG 640×512 (2,1 MB no total) em qualquer tamanho | WebP no tamanho de uso, em 2x: 188 KB as de página, 128 KB as de painel; PNG só como alternativa |
| Modo Supabase | código, dependência e telas próprias | removido; SQL guardado em `docs/especificacao-sql/` como especificação |
| Fase C | 14 telas faltando, 3 sem revisão | concluída em todas |

Compila sem erros (`npx tsc --noEmit`) e o build de produção passa.

---

## 2. Desempenho

### 2.1 Tamanho por rota (build de produção)

Antes, o app inteiro era um arquivo só. Qualquer tela baixava tudo:

| Arquivo | Tamanho | gzip |
|---|---|---|
| `index.js` (app inteiro) | 1.508,7 KB | 455,5 KB |
| `index.css` | 77,3 KB | 20,0 KB |
| `xlsx.js` (sob demanda, importar e exportar planilhas) | 429,0 KB | 143,1 KB |

Depois, a base (React, roteador, store, layout, componentes) fica num arquivo e cada tela num arquivo próprio, baixado ao abrir a tela:

| Pedaço | Tamanho | gzip |
|---|---|---|
| base `index.js` | 432,8 KB | 152,3 KB |
| `index.css` | 77,2 KB | 19,7 KB |
| `MapBits` (Leaflet e mapa; só telas com mapa) | 164,2 KB | 48,9 KB |
| `charts` (gráficos; só telas com gráfico) | 42,5 KB | 12,5 KB |
| Ativos | 50,9 KB | 16,3 KB |
| Manutenção | 49,9 KB | 15,5 KB |
| Checklist | 44,5 KB | 13,6 KB |
| Pneus | 43,6 KB | 13,8 KB |
| Telemetria | 41,1 KB | 14,9 KB |
| Jornada | 39,6 KB | 12,5 KB |
| Combustível | 33,3 KB | 11,3 KB |
| Viagens | 26,6 KB | 8,3 KB |
| Monitoramento | 24,9 KB | 9,4 KB |
| Ranking | 22,8 KB | 7,6 KB |
| Multas | 20,7 KB | 7,2 KB |
| Painel da Locale | 12,7 KB | 4,6 KB |
| Configurações da revenda | 10,7 KB | 4,1 KB |
| Replay | 9,5 KB | 3,9 KB |
| Alertas | 9,4 KB | 3,5 KB |
| Relatórios | 7,7 KB | 3,1 KB |
| Cercas | 7,4 KB | 2,9 KB |
| Portaria | 6,1 KB | 2,5 KB |
| Compartilhar (página pública) | 2,9 KB | 1,4 KB |
| `/design` (vitrine) | 63,4 KB | 19,0 KB |

Primeira abertura de cada tela, em JS gzip (base + tela + pedaços compartilhados que ela usa):

| Tela | Antes | Depois (aprox.) |
|---|---|---|
| Monitoramento | 455 KB | 212 KB |
| Ativos | 455 KB | 171 KB |
| Manutenção | 455 KB | 184 KB |
| Combustível | 455 KB | 229 KB (tem mapa de postos) |

**O que mais pesa:**
1. Na base: React e React DOM, mais o gerador da simulação (`lib/seed.ts`, `lib/engine.ts` e o catálogo).
2. Fora dela: Leaflet (164 KB, só nas telas com mapa) e xlsx (429 KB, só ao importar ou exportar planilha).

### 2.2 Métricas de página (build de produção, localhost, sem limitar a rede)

| Tela | LCP antes | LCP depois | CLS antes → depois | Maior tarefa longa no carregamento, antes → depois |
|---|---|---|---|---|
| Monitoramento | 1.008 ms | 4.540 ms* | 0 → 0 | 479 ms → 253 ms |
| Ativos | 880 ms | 916 ms | 0 → 0 | 529 ms → 439 ms |
| Manutenção | 904 ms | 628 ms | 0 → 0 | 468 ms → 201 ms |
| Combustível | 1.276 ms | 308 ms | 0 → 0 | 469 ms → 128 ms |

\* No Monitoramento, o elemento do LCP é um bloco do mapa, que vem do servidor do OpenStreetMap: o número depende da rede, não do app. Coloquei `preconnect` aos servidores de blocos no `index.html`.

O "depois" foi medido antes de três mudanças que também pesam a favor: não gerar a base com estado salvo, o `@import` da fonte trocado por `<link>` e o WebP das ilustrações. Repita a medição pelo roteiro (seção 6).

INP: trocar de aba em Manutenção respondeu em 24 a 48 ms (meta: abaixo de 200 ms).

### 2.3 O que foi feito para o desempenho

- **Telas sob demanda:** `React.lazy` em todas as rotas (`App.tsx`). Enquanto a tela baixa, o layout continua na tela e aparece um esqueleto no lugar do conteúdo (`Layout.tsx`).
- **Simulador sem retrabalho:** a cada passo de 2 s, eventos, alertas, viagens, jornada e acionamentos de regra mantêm a mesma referência quando não mudam. Antes eram recriados sempre, o que redesenhava tudo que os lia. A jornada deixou de filtrar 8.000 marcações por veículo a cada passo (`lib/engine.ts`).
- **Telas de BI sem redesenho a cada passo:** o hook `useStoreData()` (`lib/store.ts`) ignora posição e trilha dos veículos e redesenha no máximo a cada 30 s. Qualquer outra mudança (OS, abastecimento, alerta) redesenha na hora.
  - Usado em: Manutenção (e o BI), Combustível, Checklist, Multas, Ranking, Jornada, Telemetria, Painel da Locale, Configurações da revenda, Pneus, Ativos e o "Precisa de você" (10 s).
  - Replay e Cercas também não redesenham o mapa a cada passo.
- **Gravação no navegador:** antes, o estado inteiro (~1,2 MB) era gravado a cada passo. Agora grava no máximo a cada 10 s, quando o navegador está ocioso, e sempre ao esconder ou fechar a aba (`lib/store.ts`, `idleStorage`).
- **Base da simulação:** só é gerada sem estado salvo. Uma marca de versão (`SEED_REV`) completa coleções novas uma única vez quando o código ganhar coleções.
- **Lista ao vivo do Monitoramento em lotes de 80:** carrega mais ao rolar. Com 2.000 veículos, não monta 2.000 linhas de uma vez.
- **Tabelas:** paginam acima de 50 linhas (já faziam). As listas de "mostrar mais" seguem em 25 + 50.
- **Fontes:** só os pesos usados (Geist 400–700, Geist Mono 400–600; o 800 saiu), carregadas por `<link>`. Antes, um `@import` dentro do CSS atrasava o carregamento.
- **Ilustrações:** `<picture>` com WebP no tamanho de uso, `loading="lazy"`, largura e altura fixas (sem salto de layout).

---

## 3. O que foi corrigido

### Geral (componentes)
- **Tooltip em todos os gráficos** (`components/chartTip.tsx` e `charts.tsx`):
  - Cartão branco com sombra leve. Aparece na hora, sem animação de posição, para não tremer.
  - Fica acima do ponto lido e vira para baixo quando não cabe; nunca sai da tela.
  - No toque, abre com um toque e fecha ao tocar fora, rolar ou apertar Esc.
- **Por tipo de gráfico:**
  - **Barras:** a barra sob o ponteiro ganha destaque e fundo. O tooltip mostra o período, o valor em pt-BR com unidade e a variação contra o período anterior, verde ou rosa conforme a direção boa.
  - **Linhas:** régua vertical, ponto em cada série e todas as séries no tooltip.
  - **Rosca:** fatia destacada pela posição no anel (as demais esmaecem); a legenda também mostra o tooltip.
  - **Gauge, anel e barra 100%:** valor e percentual.
- **Listas com barra feitas em cada tela** (`TipItem`): consumo × meta, adesão e tempo do checklist, falhas mais frequentes, rendimento por veículo, sulco dos pneus e multas por gravidade.
- **Rótulos que se sobrepunham:**
  - Valores acima das barras só aparecem quando cabem.
  - Os rótulos do eixo X são espaçados.
  - A margem do eixo Y se ajusta ao maior rótulo; antes cortava valores como "R$ 40k".
  - O rótulo da meta saiu de cima da última barra.
  - Nas colunas, há uma base do eixo (`floor`) para séries perto de 100%, como a disponibilidade.
- **Números grandes encolhem com o card**, até um mínimo, em vez de estourar (KPIs, número principal, card compacto).
- Textos longos quebram em vez de vazar: título de card, pares rótulo/valor, legenda da rosca, lista ao vivo e card do veículo.
- O `Badge` desenha o mesmo símbolo do `StatusDot`; os chips do seletor de período viraram `Pills`, na cor da revenda.
- **Painel do simulador:** começa recolhido e sai de cena ao rolar para baixo (volta ao subir ou no fim da página). Era ele que cobria o rodapé dos cards.
- **Card "Últimas 12 semanas"** (Manutenção): não estica mais até a altura da coluna ao lado, então sumiu o vão vazio abaixo do gráfico.
- **Telas de "sem acesso"** (módulo não contratado, perfil restrito): ilustração do cadeado.
- **Cores fixas removidas** do status do veículo (`vehicleStatus`): as cores vêm só dos tokens.

### Por tela (Fase C)
Todas passaram a usar:
- tipografia por tokens;
- placa e códigos em chip mono;
- datas e valores em algarismos tabulares;
- números de tabela alinhados à direita;
- status como ponto + texto;
- ilustração nos vazios e erros principais;
- ícone nos títulos dos cards;
- toast nas ações.

Os pontos específicos de cada tela:

| Tela | Correções além do padrão |
|---|---|
| Manutenção e BI | Gráfico semanal novo com base do eixo; cancelar OS pede confirmação; itens da OS com `Check`; empilhado preventiva × corretiva |
| Combustível | Comparação mensal atual × anterior; KPIs em R$ com centavos menores; OCR com estado "carregando" |
| Pneus | Linha do sulco com a meta de retirada; busca com lupa; KPIs do detalhe do pneu |
| Ativos | Busca e importação no padrão; origem do km como cartões de escolha; documentos com vazio ilustrado; "Ícone no mapa" e a seleção em lote removidos (decisão 1) |
| Viagens | Km por dia/semana em azul (em viagem) e rosa (sem carga ou sem viagem); "Precisam voltar" em laranja (atenção), não vermelho |
| Checklist | Respostas Sim/Não/nota/múltipla na cor da revenda (são controles de seleção); barras finas; datas como chips removíveis |
| Telemetria | Rendimento diário em linha com o período anterior; botões com "carregando" e toast |
| Multas | Gráfico mensal novo; "risco de CNH" em laranja e vermelho só ao estourar o limite; códigos em chip |
| Ranking | "Em atenção" em laranja (antes vermelho); faixas da matriz com campos e botões do padrão |
| Jornada e documentos | Gráfico de descumprimentos refeito: o empilhado colorido não existia mais e a tela estava quebrada; registrar documento dá toast |
| Portaria | Placa em chip grande; botões e itens com hover; vazio ilustrado |
| Relatórios | Totais em KPIs; motor ligado/desligado como status; exportar CSV avisa quantas linhas baixou (ou que não há nada) |
| Replay | KPIs; vazio e erro do mapa num cartão; velocidade da reprodução como controle segmentado; ponto atual em pares rótulo/valor |
| Cercas | Círculo/Polígono como controle segmentado sobre o mapa; tipo da cerca com a cor da zona; vazio ilustrado |
| Alertas | Prioridade como status (alta = crítico, média = atenção, baixa = anel); comandos em chip; ativar/desativar regra dá toast |
| Compartilhar | Link expirado/inválido com ilustração própria; placa em chip |
| Painel da Locale | KPIs com variação (rosa quando piora, não vermelho); faturamento mensal + ranking por rastreadora (decisão 3) |
| "Precisa de você" | Vazio ilustrado; placa em chip; título no token |
| Busca (⌘K / Ctrl K) | Placa em chip; hover; vazio com ícone |
| Acesso de suporte | Tokens; vazio do registro |
| Configurações da revenda | Estoque de rastreadores: incluir/remover com toast (remover com "Desfazer"), IMEI repetido recusado |

### Decisões que você tomou, aplicadas
1. **"Ícone no mapa" removido** da ficha do ativo, com a seleção em lote que só servia para ele. Saíram `IconPicker.tsx` e `lib/vehicleIcons.ts`; as imagens 3D antigas (`src/images/png-tight`) ficaram na pasta, mas não entram mais no build.
2. **Modo Supabase removido** do app e do bundle:
   - As 10 migrations e o seed foram copiados para `docs/especificacao-sql/`, e o LEIA-ME aponta para lá.
   - `@supabase/supabase-js` saiu do `package.json`.
   - Saíram `lib/supa.ts` e `pages/ManutencaoRemote.tsx`.
   - As funções locais de odômetro foram para `lib/odometer.ts`.
3. **Painel da Locale:** total por mês (clicar num mês ou usar Enter escolhe a competência) e, ao lado, o ranking horizontal do faturamento de cada rastreadora no mês escolhido. Sem empilhado colorido.

### O que ainda está fora dos tokens
Varredura de cor fixa, `text-[Npx]`, espaçamento em px e `style={{}}` em `pages/` e `components/`, sem contar a vitrine `/design`.

**Fica assim, de propósito:**
- **Folhas de impressão:** o relatório da Locale (`Locale.tsx`, ~linha 131, com `#111`), o da Telemetria (`Telemetria.tsx`, ~258), a folha de ponto (`FolhaPonto.tsx`, 20 estilos) e os termos da Jornada (`JornadaDocs.tsx`, 8 tamanhos em px). São papel, não tela, e usam medidas fixas para a impressão sair igual em qualquer navegador.
- **Cores de exemplo da revenda** (`Revenda.tsx:48`, `seed.ts:290`): são os valores que a revenda escolhe, não estilo.
- **Larguras e posições calculadas** (`style={{ width: … }}` nas barras de Checklist, Telemetria e `charts.tsx`): o valor vem do dado.
- **Componentes base** (`ui.tsx`, `story.tsx`, `charts.tsx`): os poucos px que restam são os próprios componentes da Fase B, aprovados.

**Corrigido em 21/10/2026** (eram os cinco tamanhos em px em telas de verdade):

| Onde | Antes | Agora |
|---|---|---|
| `Layout.tsx` (telefone do suporte e nome da revenda no topo do celular) | 15px | `text-body` |
| `MapBits.tsx:139` (coordenadas sem endereço) | 12px | `text-caption` |
| `Pneus.tsx:382` (KPI "Vida atual") | 28px e tracking à mão | `numSizeClass('lg')`, a mesma escala do número dos outros KPIs, que encolhe com o card (exportada de `story.tsx`) |
| `PortariaApp.tsx:52` e `:75` (busca de placa e km) | 18px e 17px | `text-h3` (16px); a altura do campo (56 e 48px) continua a mesma para o toque |

---

## 4. Precisa de decisão sua

1. **Pasta `supabase/`** (config e migrations originais) continua na raiz. O conteúdo já está em `docs/especificacao-sql/`. Apago a pasta?
2. **Imagens 3D antigas do mapa** (`src/images/png-tight`, 62 arquivos) não são mais usadas. Apago?
3. **Comparação com o período anterior em dois gráficos:**
   - "Preventiva × corretiva por mês" (BI do dono) não mostra o anterior, porque o empilhado da Fase B não tem essa barra.
   - "Km por dia" em Viagens agrupa 4 séries em 2.
   - Quer um empilhado com a barra do anterior ao lado?
4. **Gráfico de faixas de RPM** (Telemetria) ainda usa o empilhado horizontal antigo, já com tooltip. A Fase B não tem uma barra 100% com várias linhas. Crio esse componente?
5. **Seta ↗ dos cards:** nenhum card mostra ↗ sem destino; ela só aparece quando há link. Hoje quase nenhum card de tela tem link de detalhe. Quer que eu ligue os principais (ex.: "Últimas 12 semanas" → BI do gestor; KPIs de Combustível → aba BI)?
6. **Gerador da simulação na base:** fica no arquivo inicial (parte dos 152 KB gzip). Dá para carregá-lo só no primeiro acesso, ao custo de um esqueleto na primeira abertura. Vale a pena?

---

## 5. Roteiro de conferência visual

Rode `npm run dev` (porta 5174) ou o build (`npx vite build && npx vite preview`). Contas: `gestor@demo.com`, `revenda@demo.com`, `locale@demo.com`, `portaria@demo.com` (senha `demo`).

**Em toda tela:**
- **Hover:** passe o mouse em linhas de tabela, itens de lista, chips de filtro e botões. Todo clicável escurece o fundo, e a mãozinha aparece só no que é clicável. Nos gráficos e nas listas com barra, o cursor fica normal e aparece o tooltip.
- **Tab:** percorra a tela do topo ao fim. Todo elemento focável mostra o anel duplo (claro por dentro, grafite por fora), na ordem de leitura.
- **Gráficos:**
  - Barras: o tooltip aparece na hora, a barra sob o mouse ganha fundo e o cartão não cobre a barra lida nem sai da tela.
  - Linhas: aparece uma régua vertical com ponto em cada série.
- **Seta ↗:** clique em todas as que aparecerem. Cada uma abre o detalhe do card. Card sem destino não mostra ↗ (ver decisão 5 da seção 4).
- **Larguras 1440, 1280 e 1024 px:** no modo de celular do DevTools, escolha "Responsive" e digite a largura. Nenhum texto fica cortado, sobreposto ou fora do card. Os cards de um mesmo painel têm a mesma margem interna, e os números das tabelas ficam alinhados à direita.
- **Celular (390 px):** abra o DevTools (F12) › ícone de celular › 390 × 844.
  - Nada vaza para os lados.
  - Os KPIs encolhem o número.
  - Um toque abre o tooltip; tocar fora fecha.
- **Cores da revenda:** entre como `revenda@demo.com` › Configurações › Cor principal.
  - **Verde** (#0E7C66): o botão principal, os controles marcados, a aba ativa, a paginação e o link ficam verdes. Os status não mudam.
  - **Vermelho** (#B91C1C): tudo que seria da marca vira **grafite**. Nada fica vermelho, a não ser crítico, erro e ação destrutiva.
  - Para ver as telas do cliente, use "Entrar como cliente", no próprio painel, com um motivo.
- **Movimento reduzido:** no Windows, Configurações › Acessibilidade › Efeitos visuais › Efeitos de animação desligado. Só ficam fades curtos; o painel do simulador some sem deslizar.

| Tela | Rota | O que testar | O que deve acontecer |
|---|---|---|---|
| Monitoramento | `#/monitoramento` | Rolar a lista; clicar num veículo; filtros de status | A lista carrega mais ao rolar; o card do veículo abre com a silhueta; os filtros mostram contagem; vazio com o pino ilustrado |
| Manutenção › Visão geral | `#/manutencao` | Mouse nas 12 semanas e na cascata; Tab | Tooltip com a semana anterior e a variação; o card das semanas sem vão embaixo; a cascata com tooltip por linha |
| Manutenção › OS | aba Ordens de serviço | Abrir uma OS; "Cancelar OS" | Pede confirmação; itens com checkbox do padrão; toast ao salvar |
| Manutenção › BI do dono e do gestor | abas | Mouse nas colunas empilhadas e nas falhas | Tooltip com preventiva, corretiva e total; falhas com % das panes |
| Combustível › BI | `#/combustivel` › BI | Mouse no gasto mensal e em "Consumo × meta" | Atual × anterior com variação; cada veículo com meta e % abaixo |
| Combustível › Notas | aba Notas fiscais | Ligar o OCR, abrir uma nota com foto | O botão do OCR mostra "carregando" |
| Checklist | `#/checklist` | Mouse nas barras de adesão; aba Preencher | Tooltip com preenchidos, adesão e anterior; respostas Sim/Não na cor da revenda |
| Viagens | `#/viagens` | Mouse no km por dia; Na rua | Azul em viagem, rosa sem carga; "Precisam voltar" em laranja |
| Multas | `#/multas` | Mouse no custo mensal; lista; aba CNH | Tooltip com variação (verde se caiu); vazio ilustrado; risco em laranja |
| Jornada | `#/jornada` | Mouse nos descumprimentos; "Termos e medidas" › Registrar | Colunas com tooltip; toast ao registrar; impressão abre |
| Pneus | `#/pneus` | Mouse no sulco e no gasto; abrir um pneu | Tooltip por faixa; linha do sulco com régua e meta |
| Ranking | `#/ranking` | Classificação; Matriz › faixas | "Em atenção" em laranja; campos da faixa do padrão |
| Telemetria | `#/monitoramento/telemetria` | Mouse na linha diária e nas faixas de RPM; "Recriar dados" | Régua com as duas séries; botão com "carregando" e toast |
| Relatórios | `#/monitoramento/relatorios` | Exportar CSV sem dados e com dados | Toast "Nada para exportar" ou "Planilha baixada com N linhas" |
| Replay | `#/monitoramento/replay` | Período vazio; carregar; reproduzir | Cartão com ilustração no mapa; velocidade 1x/4x/10x/25x como segmentado |
| Cercas | `#/monitoramento/cercas` | Círculo/Polígono; desenhar e salvar | Segmentado sobre o mapa; toast ao salvar; tipo com a cor da zona |
| Alertas | `#/monitoramento/alertas` | Ativar/desativar uma regra; histórico | Toast; prioridade como ponto (alta vermelho, média laranja, baixa anel) |
| Ativos | `#/ativos` | Buscar algo inexistente; abrir uma ficha | Vazio com pino e "Limpar filtros"; sem "Ícone no mapa"; documentos vazios ilustrados |
| Painel da Locale | `#/locale` (locale@demo.com) | Clicar num mês do faturamento; Tab até as barras e Enter | O ranking ao lado muda para o mês; tooltip nas duas áreas |
| Configurações da revenda | `#/revenda` | Incluir um IMEI repetido; remover | Repetido recusado; remover com "Desfazer" |
| Portaria | `portaria@demo.com` | Buscar placa inexistente; registrar saída | Vazio ilustrado; placa em chip grande; toast |
| Compartilhar | link gerado no Monitoramento › Compartilhar, ou `#/compartilhar/x` | Abrir link inválido | Ilustração de link expirado |
| Precisa de você | botão na barra lateral | Abrir com e sem críticos | Vazio "Nenhum alerta crítico agora" com escudo |
| Busca | Ctrl K | Buscar uma placa e algo inexistente | Placa em chip; vazio com ícone |
| Sem acesso | entrar como `revenda@demo.com` e abrir `#/manutencao` | — | Cadeado e a explicação |

---

## 6. Teste de carga com 2.000 veículos e medição

**Abrir:** `http://localhost:5174/#/monitoramento?carga=2000` (até 5.000). Os veículos sintéticos (placas `CRG0000`…) andam a cada 2 s, só na tela; nada é gravado. Sem o parâmetro, a tela volta ao normal.

**Quadros por segundo no DevTools (Chrome):**
1. F12 › menu ⋮ › More tools › **Rendering** › marque **Frame Rendering Stats**. O medidor de FPS aparece no canto da página.
2. Com o teste de carga aberto, arraste o mapa e dê zoom (roda do mouse) por uns 10 s. A meta é ficar perto de 60 FPS, sem quedas longas.
3. Para detalhar: aba **Performance** › Record › arraste e dê zoom por 5 s › Stop. Procure tarefas com triângulo vermelho (acima de 50 ms) e veja quanto tempo vai para "Scripting" a cada atualização de 2 s.
4. Confira também a lista: role até o fim; ela deve carregar mais 80 de cada vez, sem travar.

**LCP, INP e CLS no build de produção:**
1. `npx vite build && npx vite preview --port 4174`.
2. Abra `http://localhost:4174`, entre, abra a tela e recarregue (Ctrl Shift R).
3. DevTools › aba **Performance**: o painel "Live metrics" mostra LCP, CLS e INP enquanto você clica. Metas: LCP < 2,5 s, INP < 200 ms, CLS < 0,1. Para simular rede comum, use "Network: Fast 4G" e "CPU: 4x slowdown" no mesmo painel.
4. Repita em Monitoramento, Ativos, Manutenção e Combustível.
