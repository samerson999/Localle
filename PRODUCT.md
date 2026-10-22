# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Três perfis, em camadas (Plataforma → Revenda → Cliente → Grupo), cada um vendo só a própria camada:

- **Gestor da frota (cliente final):** opera a frota no dia a dia. Acompanha o mapa ao vivo, trata alertas críticos, envia comandos ao rastreador (bloqueio, desbloqueio, alerta ao motorista) e cuida de manutenção, combustível, checklist, viagens, multas, jornada, pneus e ranking de motoristas. Também é quem decide com base nos painéis (visão do gestor e visão do dono).
- **Revenda (rastreadora):** revende a plataforma com a própria marca. Configura logo, cor, foto da tela de login e os módulos de cada cliente, e acompanha os acessos consumidos. Não vê a operação da frota do cliente por padrão, só números agregados; para ver, usa o acesso de suporte (entrar como cliente), registrado com quem, quando e o motivo.
- **Locale (administrador da plataforma):** administra as rastreadoras. Vê vínculos de rastreador, cobrança por acesso, prévia de fatura, estoque de rastreadores e define padrões e limites dos parâmetros para as camadas de baixo. Também só vê a frota de um cliente pelo acesso de suporte.

- **Portaria (porteiro):** vê só a tela de saída e entrada de veículos, otimizada para o celular. Não acessa os módulos nem o "Precisa de você".

Acessos de demonstração: `gestor@demo.com`, `revenda@demo.com`, `locale@demo.com`, `portaria@demo.com` (senha `demo`).

## Product Purpose

Plataforma white label de rastreamento e gestão de frota: a Locale fornece o produto, cada rastreadora o vende com a própria marca, e o gestor da frota usa para operar e gerir veículos e motoristas. Sucesso é o gestor ver o que precisa de ação ("Precisa de você"), agir rápido e confiar nos números de custo, disponibilidade e conformidade.

## Positioning

- **O diferencial é a gestão de frota, não o monitoramento.** O mapa ao vivo é básico e parecido entre concorrentes; o que diferencia são os módulos de gestão: manutenção, combustível, checklist, viagens, multas, jornada, ranking e pneus.
- **Módulos independentes e vendáveis separadamente**, inclusive para empresas que já usam outra plataforma de rastreamento: os módulos se integram ao rastreador que o cliente já tem.
- **Preço abaixo do mercado com qualidade:** a percepção do mercado é de que não há gestão de frota boa por menos de R$ 50–60 por veículo. Venda em combo: o módulo avulso custa mais, com desconto quando contratado junto com o rastreador.
- **White label para rastreadoras:** cada revenda aplica a própria marca e revende aos seus clientes.

## Operating Context

- Uso diário de operação (ferramenta de trabalho): monitoramento ao vivo com atualização contínua, tratamento de alertas, cadastro e lançamentos; painéis de BI com comparação entre períodos.
- Rastreadores reais atualizam a posição a cada 20–30 s; a simulação local acelera o tempo (1x a 120x).
- Documentos impressos fazem parte do fluxo: espelho de ponto em A4 paisagem com assinaturas, termos e medidas disciplinares, prévia de fatura, relatório de telemetria.
- **Este repositório é especificação viva e ambiente de demonstração, não a base de produção.** Roda sem banco, com o simulador e os dados no navegador; Manutenção, Pneus e Checklist também podem ler e gravar num Supabase local. Integrações com rastreador, SERPRO, ERP, e-mail e WhatsApp são simuladas.
- Região de referência dos dados de exemplo: Grande Recife e Suape (horário de Recife).

## Capabilities and Constraints

- Módulos: Monitoramento (mapa ao vivo, comandos, Passou por aqui, link temporário de localização, Replay, Cercas, Alertas/regras/comandos, Telemetria CAN, Relatórios de km, motor, excessos e paradas), Gestão de ativos (cadastro, importação/exportação em planilha, documentos com vencimento, ciclo de vida e histórico de rastreadores, registro de alterações), Manutenção (planos, OS, orçamentos, BI), Combustível, Checklist, Viagens, Multas, Jornada (Lei 13.103/2015), Pneus, Ranking, Painel da Locale, Painel da revenda.
- Cada módulo pode ser ligado ou desligado por cliente; a revenda decide o que vende.
- Parâmetros de operação seguem herança Plataforma → Revenda → Cliente → Grupo, com limites definidos pela Locale e "Restaurar padrão" (plano em `docs/PLANO-SETUP-ADMIN.md`).
- Os limites da Lei 13.103 são piso: a empresa só pode deixá-los mais rigorosos. Modelos de documento jurídico precisam de revisão antes do uso real.
- Dados de produção da API rastreamento.ong.br são somente leitura.
- Stack do protótipo: Vite, React 18, TypeScript, Tailwind CSS, Leaflet, Recharts, Zustand, Tesseract.js.
- **Documentos do ativo:** CRLV, IPVA, seguro, tacógrafo, RNTRC, AET, CIV/CIPP e outros, com vencimento e anexo (`src/lib/assetDocs.ts`). Vencido ou a 7 dias do fim entra no "Precisa de você"; a 30 dias aparece como atenção na lista de ativos. No produto real os prazos seguem a herança de parâmetros. CNH e exame toxicológico do motorista seguem a mesma regra com prazos próprios (aviso laranja a 30 dias, crítico a 7 ou vencido).
- **Ciclo de vida:** vendidos e baixados ficam fora das listas e telas operacionais de todos os módulos, com a opção "Incluir inativos"; relatórios e BIs de período contam o veículo nos períodos em que operou (`src/lib/assetStatus.ts`).
- **Registro de alterações:** só de inclusão (a store ignora qualquer escrita que tente trocar o registro); inclui as operações em lote. Na simulação o navegador guarda as 2.000 mais recentes; no produto real é tabela sem UPDATE/DELETE para o cliente.
- **Link de localização:** registra cada abertura (quantas e quando), visível para quem criou o link.
- **Mapa em escala:** a frota de um cliente chega a 600–2.000 veículos; o mapa agrupa marcadores por grade em pixels até o zoom 16 e só monta o que está na área visível (`ClusteredVehicles` em `src/components/MapBits.tsx`). O veículo selecionado nunca é agrupado.

### Identificação do motorista (especificação do produto real)

- O vínculo motorista × veículo é um **histórico**, não um campo único no ativo: cada registro tem veículo, motorista, início, fim (vazio enquanto vigente) e origem (`escala`, `app` ou `rastreador`, este por iButton/RFID).
- Os eventos, viagens, marcações de jornada, abastecimentos e checklists continuam gravando o motorista **do momento**. Trocar o vínculo depois não reatribui o passado.
- Mais de uma origem pode existir no mesmo cliente. A precedência é parâmetro (`motoristas.origem_prioridade`), com padrão rastreador > app > escala: vale a de maior prioridade e, quando duas origens divergem no mesmo período, o conflito fica sinalizado para conferência. A decisão final é do dono.
- No protótipo: histórico em `s.driverLinks` (`src/lib/driverLinks.ts`), painel "Histórico de motoristas" na ficha do ativo. `assets.driverId` segue como atalho para o motorista atual; trocar pela ficha ou pela importação abre um vínculo novo de origem `escala`.

### Carretas e engates (especificação do produto real)

- A carreta é um ativo próprio (implemento), com pneus próprios e, opcionalmente, rastreador próprio.
- Os engates são um histórico de **composições**: cavalo, de 1 a 3 implementos em ordem, início, fim e o km do cavalo no início e no fim. Bitrem: dois semirreboques; rodotrem: semirreboque, dolly e semirreboque. Trocar qualquer peça fecha a composição vigente e abre outra.
- Sem rastreador próprio, o km da carreta é o km de cadastro somado ao que cada cavalo rodou com ela engatada. Esse é o km usado nos pneus e na manutenção da carreta.
- No protótipo: `src/lib/couplings.ts`, origem do km "engate" e o painel Engates na ficha da carreta, em Ativos.

### Produção (arquitetura própria, separada deste protótipo)

- Backend NestJS com as regras de negócio; PostgreSQL com PostGIS e TimescaleDB.
- Gateway de rastreadores: **Traccar** (GT06, Teltonika, Suntech, Ruptela, Coban e outros), não um gateway próprio — decisão revista depois da POC na VPS Hostinger (`docs/ARQUITETURA-BACKEND.md` › seção 6). O Traccar só recebe e decodifica os protocolos dos rastreadores; ele encaminha cada posição, por uma fila (BullMQ/Redis), para o **nosso** banco (Postgres+TimescaleDB+PostGIS). O banco do próprio Traccar tem retenção curta e não é fonte de consulta. Relatórios, telas de monitoramento e qualquer leitura de posição são sempre contra o nosso banco, nunca contra a API do Traccar.
- Infraestrutura: 2 VPS Hostinger — uma só para o banco (Postgres+TimescaleDB+PostGIS, sem exposição pública além da rede privada), outra para a aplicação (API, Traccar, front-end), deploy pelo Coolify, CI/CD no GitHub com homologação e produção, 100% automatizado. Detalhe e passo a passo em `docs/ARQUITETURA-BACKEND.md` e `docs/GUIA-TRACCAR.md`; Docker Compose de referência em `infra/`.
- Antes da produção: POC com um rastreador GT06 real (em andamento) para medir o volume de dados e validar o Traccar como gateway.
- Ordem de clientes: a própria Locale é o primeiro cliente; depois, uma rastreadora parceira com cerca de 400 placas.
- O modo Supabase do protótipo será descontinuado. A fase atual é só adaptar o front-end.
- Em aberto: confirmar os números de volume da POC (hoje com 1 rastreador real) antes de fechar a topologia dos 2 VPS; datas do cronograma.

## Brand Commitments

- **White label:** a marca visível é a da revenda (nome, logo, cor, foto do login). A cor da revenda é aplicada em tempo de execução (`src/lib/brand.ts`) e precisa funcionar com qualquer cor escolhida.
- **Onde a cor da revenda entra:** só no botão principal, nos controles de seleção (checkbox, radio, toggle, controle segmentado, aba ativa, paginação), no link, no halo do veículo selecionado no mapa e na superfície do card de dica (no máximo um por tela). Em nenhum outro lugar.
- **Fallback grafite:** a cor da revenda passa por verificação automática de contraste (3:1 para componentes, 4,5:1 para texto sobre ela). Quando não passa, tudo o que ela pintaria vira grafite; o link vira grafite sublinhado. Marcas vermelhas ou laranja também viram grafite, mesmo passando no contraste, para não parecerem alerta. Marcas verdes não têm fallback: verde em controle significa "ligado" e não conflita com "em movimento".
- **Foco:** anel duplo fixo (contorno claro por dentro, grafite por fora), que aparece também sobre o botão grafite e sobre fundos escuros. Não segue a revenda.
- **Barra lateral:** o item ativo é grafite. A marca da revenda já aparece no logo da barra; não se usa tom claro da marca (com revenda vermelha viraria rosa, que significa perda).
- **Contadores:** o do "Precisa de você" é vermelho, porque conta só itens críticos. Os demais (abas, filtros, listas) são neutros.
- **Cores de status e de dado são fixas:** nunca mudam com a revenda. Status: verde = em movimento (e em dia, ativo, concluído), laranja = parado ligado ou atenção, anel = desligado, anel tracejado = sem sinal, vermelho = crítico. Gráficos: azul = realizado, rosa = perda/desvio, hachura = estimado/meta.
- **Vermelho só para crítico, erro e ação destrutiva.** Atenção é laranja; perda já consumada, como prazo perdido, é rosa; variação ruim é rosa. Gráfico nunca usa vermelho: a barra em destaque usa a cor de dado (azul), seja o resultado bom ou ruim, e o chip de variação ao lado é que diz se é bom (verde) ou ruim (rosa).
- **Status como ponto + texto**, sem fundo colorido. Chips com fundo só para variação (bom/ruim).
- **Mapa:** as cores de status são exclusivas dos veículos. Clusters são neutros (escuros, com o número). Cercas usam uma paleta própria de zonas (violeta, ameixa, petróleo, ardósia), sem verde, laranja, vermelho ou rosa. O halo do veículo selecionado usa a cor da revenda, com o mesmo fallback grafite. O veículo é sempre um disco na cor do status com seta de direção, em qualquer zoom; não há marcador 3D no mapa. A aparência do veículo (silhueta da categoria) aparece no card ou popup da seleção.
- **Ilustrações:** 3D só em estados vazios, de erro e no onboarding, no nível de página ou painel principal; vazio dentro de card de BI ou tabela secundária fica com texto e ícone de linha. A cor de destaque das ilustrações é fixa (o azul de dado), nunca a cor da revenda. Os ícones da interface são de linha, com traço uniforme. Avatares são neutros (iniciais sobre cinza).
- **Silhuetas de ativo:** cheias, em cinza, vista lateral, uma por categoria (carro, utilitário, picape, moto, caminhão, cavalo, ônibus, semirreboque, dolly, reboque, linha amarela, equipamento, objeto pessoal). Composições (bitrem, rodotrem) são montadas juntando cavalo e implementos.
- **Documentos impressos:** espelho de ponto, termos e medidas disciplinares levam o logo do cliente final (empregador), do campo "logo da empresa" no cadastro do cliente; a fatura leva o logo da Locale; relatórios gerados pelo cliente levam a marca da revenda e o nome do cliente.
- **Favicon:** gerado em código a partir do logo ou das iniciais da revenda.
- **Paleta própria:** fundo e tons de texto em cinza frio com valores próprios, fora da escala padrão do Tailwind. Texto secundário pequeno direto sobre o fundo da página tem no mínimo 4,5:1.
- **Números:** placas, IMEI e códigos (OS, frota, contrato) em fonte mono com zero cortado. Valores em reais, quantidades, datas e colunas de tabela na fonte normal da interface, com algarismos tabulares, nunca em mono.
- Sombra só no que flutua.
- **Referências visuais** (`docs/referencias/`; inventário de assets em `docs/INVENTARIO-ASSETS.md`): servem como direção (densidade, hierarquia, card de KPI com conclusão no rodapé, motivo da rota), não como especificação pixel a pixel. Onde contradizem as regras acima, valem as regras.
- A identidade visual vive só em `src/styles/tokens.css`; trocar a identidade é editar esse arquivo.
- Linguagem da interface em português do Brasil.

## Evidence on Hand

- Base de exemplo da simulação (veículos, placas de teste, três rastreadoras de teste, 60 dias de telemetria CAN).
- Planilha de referência de telemetria (`docs/ANALISE-PLANILHA-TELEMETRIA.md`).
- Não há clientes, depoimentos, métricas de uso ou preços públicos confirmados; não inventar. O preço de referência de R$ 2 por acesso é parâmetro da simulação, não preço público.

## Product Principles

1. **Mínimo de digitação para o motorista:** o que o sistema já sabe (km, data e hora, posição) vem preenchido ou carimbado.
2. **Educar e premiar, não só punir:** ranking, jornada e checklist orientam e reconhecem o bom motorista, além de apontar infrações.
3. **BI com comparação de período para o dono:** todo indicador de gestão permite comparar períodos e mostra a variação.
4. **Transparência técnica com o cliente:** origem de cada número (rastreador, lançamento, calculado) e de cada valor herdado sempre explícita.
5. O que precisa de ação vem primeiro: críticos visíveis em todas as telas, com caminho direto para tratar.
6. A marca é da revenda: nada na interface pode depender de uma cor de marca específica. Conformidade legal é piso, não opção.
