# Plataforma de Rastreamento White Label — simulação local

Sistema completo rodando no seu computador, com um **simulador de rastreadores** embutido: os veículos andam pelo Grande Recife e Suape, geram eventos, entram e saem de cercas, abrem e fecham viagens, marcam jornada e disparam alertas. Todos os dados ficam salvos no navegador (localStorage).

## Como rodar

1. Instale o **Node.js 18 ou mais novo** (https://nodejs.org — versão LTS).
2. Descompacte esta pasta.
3. Windows: dê dois cliques em `iniciar-windows.bat`.
   Mac/Linux: rode `./iniciar-mac-linux.sh`.
   Ou, no terminal, dentro da pasta: `npm install` e depois `npm run dev`.
4. O navegador abre em **http://localhost:5173**.

É preciso internet para os mapas (OpenStreetMap), a fonte e a leitura OCR das notas.

## Acessos de teste (senha: `demo`)

- `gestor@demo.com` — gestor da frota (cliente final)
- `revenda@demo.com` — administrador da rastreadora: vê também o **Painel da revenda** (marca, módulos e cobrança por acesso)

## Barra do simulador (topo)

- **Rodando / Pausado** — liga e desliga o simulador.
- **1x, 8x, 30x, 120x** — acelera o tempo da simulação.
- **Reiniciar dados** — apaga tudo e recria a base de exemplo.

## O que tem em cada módulo

**Monitoramento** — mapa ao vivo com cards de veículos (foto enviada pelo usuário, sensores: ignição, bateria, GPS, bloqueio, temperatura e porta do baú, odômetro/horímetro, GSM), filtros por status e grupo, envio de comandos por veículo ou grupo (bloqueio, desbloqueio, alerta ao motorista, comandos cadastrados e comando livre, com confirmação por senha e retorno do rastreador), botão direito no mapa → **Passou por aqui**, **Replay de percurso** com play/pausa/parar e velocidades, **Cercas** poligonais e circulares com tipo (matriz, filial, cliente, oficina, posto…) e regras de viagem, **Alertas, regras e comandos** com construtor de regras (ex.: só pode rodar até 22h).

**Telemetria CAN** (Monitoramento › Telemetria CAN) — importa o arquivo do rastreador (CSV ou XLSX, escolhendo a aba) com ODO, HRMT, RPM, TFL, NFL, TENG, APOS, GEAR, TRBP e VPWR, e também o arquivo de eventos por sigla (ACP, ACN, VMX, OCS, BGL…). O relatório mostra:

- km, litros, km/L e L/h;
- motor ligado, motor ocioso e litros gastos parado;
- faixas de RPM (lenta, verde, amarela, vermelha);
- tempo e km acima do limite, velocidade máxima, banguela, pedal no fundo, freio de estacionamento em movimento;
- temperatura, turbo e tensão;
- eventos a cada 100 km e eventos do rastreador sem repetição;
- dia a dia, comparativo entre veículos e entre períodos, e qualidade dos dados.

Também imprime, exporta CSV e envia os eventos ao ranking. Na simulação, os veículos com CAN (KOZ5H91 e PEW1A33) já trazem 60 dias de telemetria gerados pelo simulador, então a tela abre nos últimos 30 dias comparados aos 30 anteriores. "Recriar dados da simulação" gera esse histórico de novo. "Testar importação com arquivo de exemplo" carrega a planilha de referência só para testar a importação (veja `docs/ANALISE-PLANILHA-TELEMETRIA.md`).

**Gestão de ativos** — veículos com consulta por placa e preenchimento automático da ficha técnica (bateria, óleo, lâmpadas, tanque, pneus, filtros), demais ativos com cadastro manual e campos personalizados, origem do km (rastreador, lançamentos ou mescla), metas de combustível, grupos, motoristas, operações e vínculo de rastreador (consome 1 acesso). Na instalação são obrigatórios o técnico e, se o veículo permitir, o odômetro inicial com foto do painel. Sem leitura de odômetro, o veículo fica marcado como "km calculado". No primeiro lançamento manual depois da instalação, se o km divergir muito, o sistema pergunta uma única vez se deve corrigir o odômetro real.

**Manutenção** — planos por km, tempo ou os dois, OS preventivas geradas automaticamente, recálculo quando uma corretiva executa o mesmo serviço (veja o RZM9I22: corretiva em 47.900 km → próxima em 57.900 km), OS com até 3 orçamentos e escolha do vencedor antes de autorizar, evidências (foto, áudio, vídeo), comentários, nota fiscal e integração com ERP; BI com Disponibilidade, MTBF, MTTR e custos por veículo e frota. Uma preventiva vencida passa a Crítica depois do prazo de crítico, que por padrão é de 10 dias ou 1.000 km. Cada plano pode ter um prazo próprio em "Crítico após". A aba "Alertas e e-mails" define quem recebe e-mail em cada nível: Alerta, Crítico e "Crítico sem ação" após X horas, como o gestor primeiro e o dono depois. Ela também mostra a caixa de saída: na demonstração, os e-mails ficam na fila e não são enviados. O rastreador grava uma leitura de odômetro consolidada por veículo e por dia, com origem "rastreador".

**Combustível** — lançamento com o mínimo de digitação: o motorista informa litros e valor; o km vem do rastreador quando houver, e motorista, combustível e posto já vêm preenchidos. O sistema bloqueia km menor que o último e saltos acima do limite, calcula o valor do litro e o consumo contra a meta, e permite marcar a foto da nota fiscal. A aba Notas fiscais aceita a chave de acesso (com validação do dígito), o XML da NF-e ou digitação, e compara a nota com o lançamento (litros, valor, data e posto). Daí sai o índice de confiabilidade de cada motorista. A busca da nota na SEFAZ fica preparada para quando a integração for contratada, e o OCR é opcional, desligado por padrão. O BI tem comparação de período, consumo por veículo contra a meta e um mapa de preço e consumo por estado, cidade e bairro. As metas de consumo valem por frota, tipo de operação, grupo e veículo, com teto mensal indicativo, que alerta mas não bloqueia.

**Checklist** — perguntas de sim/não, nota (1 a 5 ou 1 a 10), km/odômetro (já vem preenchido com o km atual), data, data e hora (carimbada no envio, sem digitar), texto livre, foto e múltipla escolha; cada pergunta define quais respostas indicam problema. Grupos de respondentes por regra (categoria da CNH ou função, como chefe de pátio) e pessoas avulsas. Periodicidade diária, semanal, mensal, por ciclo (ex.: a cada 45 dias) ou datas do calendário. BI com adesão por pessoa, grupo, periodicidade e modelo, tempo médio, painel de respostas (o que mais aparece e o % com problema), % de veículos com avaria e quem não lançou, tudo com comparativo entre períodos. A tela "Preencher" simula o app: cada pessoa vê os checklists pendentes do dia.

**Viagens** — portaria simples para o porteiro (veículo, motorista, foto, odômetro e volta prevista), com a sequência validada: não aceita duas saídas nem duas entradas seguidas, e a portaria abre e fecha a viagem de pátio. "Quem está na rua" mostra no mapa quem saiu e quem já devia ter voltado. Viagens externas por etapas (origem, carga, descarga e destino), com km com carga e sem carga; a viagem só termina no destino depois da descarga, e o veículo que segue rodando depois de concluir é sinalizado ao monitoramento ("Rodando sem viagem"). Viagens recorrentes (matriz): paradas com horário previsto, dias da semana e onde o veículo dorme, com relatório de cumprimento planejado × realizado pelas cercas visitadas. Visão geral com comparação de período: viagens concluídas, tempo e km rodando sem viagem, km em viagem sem carga, cumprimento da matriz e indicadores por veículo. Sensor de porta e integração com o órgão de transporte intermunicipal estão marcados como recurso futuro e ficam escondidos.

**Multas** — lançamento manual com validação, sugestão do condutor pelo horário da infração e prazo de indicação com aviso; BI por veículo, motorista, operação, gravidade, mês, infrações mais frequentes e risco de suspensão da CNH. A integração por API (SERPRO/SENATRAN) é recurso futuro, escondido.

**Portaria** — entre com `portaria@demo.com`: só a tela de saída e entrada, para o celular.

**Jornada** — marcações do teclado embarcado (geradas pelo simulador) ou app, alertas de pausa obrigatória, interjornada, refeição, jornada excedida e descanso semanal (Lei 13.103/2015), espelho de ponto para assinatura em A4 paisagem. O documento traz:

- cabeçalho com empregador (razão social, CNPJ, endereço) e motorista (CNH, CPF, matrícula, veículo, atividade);
- período por competência ou personalizado;
- apuração dia a dia, incluindo folgas;
- infrações com a base legal;
- registro detalhado de cada marcação, com origem e ajustes manuais destacados;
- declaração, campo de observações e assinaturas;
- código de verificação.

Dá para imprimir um motorista ou todos, um por página. A aba "Termos e medidas" emite o termo de ciência de marcação incorreta (com os apontamentos escolhidos), as medidas disciplinares (advertência verbal ou escrita, suspensão de 1, 3 ou 5 dias e justa causa, com as medidas anteriores e o próximo passo usual) e o comunicado coletivo com lista de assinaturas. Cada emissão fica no histórico. Em Regras, os limites da Lei 13.103 funcionam como piso: a empresa só pode deixá-los mais rigorosos. Os modelos de documento precisam de revisão do jurídico antes do uso real.

**Pneus** — terceiro maior custo da frota; o módulo pode ser vendido separadamente. Identificação pelo número gravado no pneu (sigla e logo da empresa + número, definidos em Parâmetros). Diagrama de eixos visto de cima por tipo de veículo (carro/picape, 4x2, 6x2, 6x4, carreta), com a posição e o sulco de cada pneu; ao clicar numa posição: montar do estoque (mesma medida primeiro), medir, rodízio e retirada para estoque, recapadora ou descarte. Vida do pneu (novo, 1ª recapagem, 2ª...) e histórico de movimentações (compra, montagem, rodízio, retirada, envio à recapadora, recapagem, descarte). Medição de sulco digitada, com o km do rastreador, e preparada para o profundímetro Bluetooth no app (origem "profundímetro"). Desgaste (mm a cada 1.000 km), km previstos por vida e custo por 1.000 km por pneu, por posição (direcional, tração, livre, carreta) e por marca. Visão geral com comparação de período: gasto com novos e recapagem, custo por 1.000 km, recapagens, descartes e sulco dos pneus rodando. Sulcos de alerta e de retirada seguem o Setup; o mínimo legal de 1,6 mm é fixo, valor de retirada abaixo dele é recusado no campo, e pneu montado abaixo do mínimo legal entra em "Precisa de você". Estoque por medida com estoque mínimo. A simulação tem um cavalo 6x2 (RJX2B57) e uma carreta de 3 eixos (Carreta SR-01), cadastrada como implemento: em Ativos, a ficha da carreta mostra o histórico de engates e permite engatar e desengatar, e o km dela é a soma do que os cavalos rodaram com ela engatada.

**Ranking** — matriz de eventos × pesos editável, com faixas pelo valor medido (ex.: excesso de velocidade com peso 3 até 89 km/h, 5 a partir de 90 e 10 a partir de 100). Os eventos vêm em cinco grupos: básicos (excesso de velocidade, aceleração, frenagem e curva bruscas), telemetria/CAN (tempo ocioso, RPM excessivo, banguela), videotelemetria, jornada e regras da empresa. Há um limite de pontos por semana, mês ou trimestre, proporcional ao período escolhido. Quem passa do limite fica "em atenção", com a lista dos eventos que mais pesaram. A classificação tem comparativo entre períodos. Dá para criar eventos próprios, lançar eventos manualmente e montar campanhas por período.

**Painel da Locale** (entre com `locale@demo.com`) — administração da plataforma. Mostra, por rastreadora, os rastreadores vinculados no mês, as novas vinculações, os acessos cobrados e a prévia da fatura, que pode ser impressa com a lista dos rastreadores cobrados. Também traz o histórico de 12 meses, os veículos sem rastreador e os rastreadores em estoque sem uso. A cobrança é parametrizável por rastreadora:

- **A, por rastreador vinculado:** acessos × preço.
- **B, pacote mínimo:** mínimo de N acessos, mais o excedente.

A base pode ser "vinculados no mês" ou "novas vinculações". O preço de referência é R$ 2. A coluna "No outro modelo" e o seletor de cenário mostram quanto cada rastreadora pagaria no modelo alternativo. A simulação inclui três rastreadoras de teste.

**Painel da revenda** — logo, foto e posição da foto na tela de login, cor da marca, módulos vendidos para o cliente (cada módulo liga/desliga) e extrato de acessos consumidos por vínculo de rastreador.

## Especificação SQL do backend

O protótipo roda só no navegador (simulação e dados no `localStorage`/IndexedDB). O modo Supabase local foi removido em 20/10/2026. As migrations e funções que ele usava ficaram em `docs/especificacao-sql/`, como especificação das regras para o backend real (NestJS + PostgreSQL), não como código a rodar:

- **Odômetro e instalação** (`20261017200000_instalacao.sql`): leitura com origem (abastecimento, checklist, portaria, OS, rastreador), recusa de km menor que o último, `fn_install_tracker` (técnico, odômetro e foto obrigatórios) e a pergunta única de divergência (`fn_check_odometer`).
- **Manutenção** (`20261016120200_manutencao_fase1.sql`, `20261017090000_fase1_front.sql`): planos por km, dias ou os dois, com antecedência; níveis Pendente → Alerta → Crítico com histórico; escalonamento por e-mail em fila; rotina diária `fn_daily_maintenance()` (há um comentário com `pg_cron`).
- **BI de manutenção** (`20261017120000_bi_manutencao.sql`): `fn_maintenance_kpis`, com o mesmo cálculo que a simulação faz em `src/lib/maintKpis.ts`.
- **Pneus** (`20261016120100_pneus.sql`): montar, desmontar, rodízio, medição, recapagem e sucata como funções que validam cada passo; `v_tire_overview` com sulco, desgaste, km e custo por 1.000 km.
- **Checklist** (`20261017150000_checklist.sql`): `fn_submit_checklist` (obrigatórias, fotos, carimbo de data e hora no servidor no horário de Recife, km no histórico de odômetro) e `fn_checklist_bi`.
- **Ranking** (`20261017180000_ranking.sql`): `driver_events`, `event_types`, `ranking_settings` e `fn_driver_ranking`.
- **Telemetria CAN** (`20261017210000_telemetria_can.sql`): `can_samples`, `can_events` e `fn_can_report`, com as regras de `src/lib/can.ts`.
- **Painel da Locale** (`20261017230000_painel_locale.sql`): `tracker_links`, `tracker_stock`, `tenant_billing`, `fn_platform_billing`, `fn_tenant_billed_links` e `fn_set_tenant_billing`, liberadas só para o administrador da plataforma.
- `seed-exemplo.sql` traz dados de exemplo; `20261016120000_base.sql` tem as tabelas base.

Atenção ao reaproveitar: o acesso de desenvolvimento (`dev_settings`, chave anon enxergando um cliente fixo) existia só para estudo e não deve ir para produção; em produção, o cliente vem do login e anexos vão para armazenamento de arquivos, não para o banco.

### BI de manutenção

Manutenção › BI do dono e BI do gestor:

- **Visão do dono:** custo total, custo por km, preventiva × corretiva, peso da corretiva no custo, disponibilidade, OS que estiveram críticas e preventivas feitas com atraso, além de custo mensal e custo por veículo.
- **Visão do gestor:** disponibilidade, MTBF (tempo entre falhas), MKBF (km entre falhas), MTTR (tempo de reparo), panes, horas paradas, veículos na oficina agora, falhas mais frequentes, confiabilidade por veículo e a lista de OS que passaram para Crítico.

Os dois têm filtro de período (mês, trimestre, semestre, ano ou personalizado) e comparação com o mesmo período do ano anterior, o período anterior ou um período personalizado. A variação aparece em % e em valor. Quando o período ainda está em andamento, a comparação usa o outro período só até a mesma data. Km rodado, MKBF e custo por km usam as leituras de odômetro.

## O que é simulado

Consulta por placa e ficha técnica (base de exemplo — placas de teste: RZM9I22, ABC1D23, SOY0E58, UHT2G34, QWE4R56), API SERPRO, envio a ERP, comunicação com rastreadores e e-mail/WhatsApp. Para virar produção, essas partes trocam por integrações reais e os dados saem do navegador para o backend (especificação em `docs/especificacao-sql/`).

## Tecnologia

Vite + React 18 + TypeScript + Tailwind CSS, Leaflet (mapas), Recharts (gráficos), Zustand (estado), Tesseract.js (OCR).
