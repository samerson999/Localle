# Arquitetura de integração: Traccar × backend (NestJS) × banco (PostgreSQL/TimescaleDB/PostGIS)

23/10/2026. Análise da arquitetura proposta por push para ingestão de posições/eventos do Traccar, comandos,
associação no tempo, modelo de dados e tempo real. Documento de domínio (decisões e porquês); passo a passo de
comando continua em `docs/GUIA-TRACCAR.md`. Complementa `docs/ARQUITETURA-BACKEND.md` (que já define Traccar como
gateway, fila entre ingestão e gravação, e hypertables) e substitui, na parte de contrato função-a-função, o que
`docs/PLANO-ADAPTADOR-TRACCAR.md` descrevia como "ler o Traccar direto do front" — ver seção 7.

**Importante sobre o Traccar instalado**: o kit (`infra/traccar/docker-compose.yml`) usa `traccar/traccar:latest`,
ou seja, a versão flutua a cada `docker compose pull`. Tudo abaixo (nomes de chave de configuração, formato de
payload de `Forwarding`, endpoints REST) é descrito contra o comportamento documentado e estável da série 5.x/6.x
do Traccar (a mesma faixa validada em `docs/GUIA-TRACCAR.md` com os 11 protocolos testados em 21/10/2026). **Antes
de implementar, confirmar contra a instância real**: `GET /api/server` devolve a versão; o changelog oficial
(`traccar.org/changelog`) mostra qualquer quebra de compatibilidade entre a versão instalada e o que está descrito
aqui. Fixar a tag da imagem (ex.: `traccar/traccar:6.6`) antes de produção é uma recomendação à parte, independente
desta análise — hoje `:latest` pode trocar de versão sem aviso num `docker compose pull`.

**Revisão de 23/10/2026 (segunda passada)**: uma revisão técnica externa sobre a primeira versão deste documento
apontou 4 problemas bloqueadores — dois deles erros de SQL concretos (constraint `unique` inválida em hypertable,
FK entre duas hypertables, ambos inválidos no TimescaleDB), um de modelagem (rastreador não pode "pertencer" a um
cliente de forma permanente) e um de postura (a API aceitar o `POST` do Traccar com `202` não é, por si só,
garantia de durabilidade). As seções 1.5, 4, 5.1, 5.2 e 6b abaixo já incorporam as correções; a seção 8 resume o
que mudou e por quê, para quem já tinha lido a primeira versão.

---

## 1. Verificação contra o Traccar (o que a documentação do projeto confirma)

### 1.1 Encaminhamento de posições (`Forwarding`)

O Traccar tem dois mecanismos de saída distintos — não confundir:

- **Position Forwarding** (`forward.*`): dispara um `POST`/`GET` HTTP para cada posição **gravada com sucesso**
  no Postgres do Traccar, de forma assíncrona (não bloqueia o fluxo do protocolo). Configurável em
  `conf/traccar.xml` (`infra/traccar/conf/traccar.xml` neste repositório, hoje sem nenhuma chave `forward.*` —
  confirmar com `grep forward infra/traccar/conf/traccar.xml`) ou pela aba **Configurações do servidor** no
  próprio painel web (a partir da 5.x, a maior parte do que antes só existia em XML também virou editável ali,
  persistido na tabela `tc_server`/atributos — **isso significa que a configuração de forwarding pode não estar só
  no arquivo**: ao revisar/auditar, checar os dois lugares).
- **Event Forwarding** é configurado **separadamente** da posição, com seu próprio par de chaves
  (`event.forward.url`, `event.forward.type`) — não é a mesma URL com uma flag ligada; se eventos também precisam
  ser encaminhados, a chave de evento tem que ser configurada à parte da de posição.

Chaves relevantes — **nomes corrigidos nesta revisão** (a primeira versão deste documento usava os nomes antigos/
incorretos `forward.format`, `forward.retryEnabled`, `forward.retryDelay`, `forward.retryCount`; os nomes corretos
na documentação oficial de Forwarding do Traccar são os da coluna "Chave" abaixo). **Ainda assim, confirmar contra
`GET /api/server` e a documentação da versão exata instalada antes de configurar** — mesmo os nomes corrigidos
podem ter mudado entre séries, e esta análise não teve acesso a bater numa instância real para validar:

| Chave | Efeito |
|---|---|
| `forward.url` | URL de destino do `POST`/`GET` de posição |
| `event.forward.url` | URL de destino do `POST`/`GET` de evento (separada da de posição) |
| `forward.header` | cabeçalhos extras, formato `Nome: valor\u0007Nome2: valor2` (separador `\u0007`, não `;`) — é aqui que entra a chave secreta pedida na seção 2 da arquitetura proposta |
| `forward.type` | `json` para corpo JSON estruturado (`attributes` aninhado) em vez de query string achatada — **usar `json`** |
| `event.forward.type` | mesma ideia, para o forwarding de evento |
| `forward.retry.enable` | liga nova tentativa em caso de falha (default `false` — **conferir e ligar explicitamente**) |
| `forward.retry.delay`, `forward.retry.count` | backoff entre tentativas e número de tentativas de reenvio |
| `forward.retry.limit` | **limite de entregas pendentes simultâneas** (fila interna de retry do Traccar tem teto; documentação oficial cita **default de 100 posições pendentes e 10 tentativas**) — **tratar como parâmetro operacional a decidir, não aceitar o default sem avaliar**: com rajada grande (ex.: reconexão em massa após queda de energia numa região), 100 pendentes pode ser pouco e descartar posições antes mesmo de esgotar o inbox (seção 5.1) do lado do backend — medir na POC (seção 7.5) e ajustar junto com o dimensionamento de fila |
| `forward.additional` | inclui dados do dispositivo (nome, `uniqueId`, grupo) além da posição crua |

**Pré-requisito explícito antes de configurar em produção**: um teste de contrato contra a versão fixada do
Traccar e um equipamento (ou simulador OsmAnd, `docs/GUIA-TRACCAR.md` § 8.1) real, validando nome de chave,
formato do corpo e comportamento de retry — não assumir que o texto desta seção está 100% correto sem esse teste.

**Formato do corpo** (`forward.type=json`), campos principais de uma posição — **este JSON também não foi
validado contra uma instância real** (ver pré-requisito acima); é a estrutura documentada pelo projeto, mas o
Traccar pode variar o nível de aninhamento (`position`/`device` como objetos separados vs. tudo achatado) entre
versões:

```json
{
  "position": {
    "id": 123456,
    "deviceId": 42,
    "protocol": "gt06",
    "serverTime": "2026-10-23T14:00:05.000+00:00",
    "deviceTime": "2026-10-23T14:00:00.000+00:00",
    "fixTime": "2026-10-23T14:00:00.000+00:00",
    "valid": true,
    "latitude": -8.0631, "longitude": -34.8711,
    "altitude": 12.0, "speed": 19.4, "course": 180.0,
    "address": null,
    "attributes": { "ignition": true, "batteryLevel": 87, "motion": true,
                    "satellites": 9, "odometer": 102345, "hours": 884000 }
  },
  "device": { "id": 42, "name": "ABC1D23", "uniqueId": "864717003283581" }
}
```

Pontos a confirmar contra a instância real (a bateria de testes de `docs/GUIA-TRACCAR.md` § 8.1.1 validou
decodificação e gravação, **não** validou o payload de forwarding, que ainda não está configurado no kit):

- `serverTime` vs. `deviceTime` vs. `fixTime` — os três existem; `fixTime` é o horário do GPS (o "horário oficial"
  que a seção 3 da arquitetura proposta pede), `deviceTime` é o horário que o próprio rastreador colocou no pacote
  (pode divergir do GPS se o relógio interno do aparelho estiver errado), `serverTime` é quando o Traccar recebeu e
  gravou. **Usar `fixTime` como horário oficial da posição confirma a proposta**, mas vale testar com um
  rastreador real: alguns protocolos (ex.: `gps103`/Coban mais antigos) não mandam `fixTime` separado e o Traccar
  preenche igual a `deviceTime`.
- `attributes` varia por protocolo — nem todo fabricante manda `batteryLevel` (alguns mandam só `power`, tensão da
  bateria do veículo, e `attributes.battery` para a bateria interna do rastreador). O adaptador do backend precisa
  de uma tabela de normalização por protocolo, não um único nome de campo.
- **`position.id` como identidade confiável é premissa não verificada, não fato** (adicionado em revisão de
  23/10/2026, terceira passada): há relato no fórum oficial do Traccar de forwarding JSON entregando
  `position.id = 0` mesmo com a posição gravada corretamente em `tc_positions`. Isso não confirma que o problema
  existe na versão/configuração que este projeto vai usar, mas derruba a premissa de que `traccar_position_id` é
  sempre um identificador confiável para deduplicação (seção 4.3) — se vier `0` (ou repetido por bug) para posições
  distintas do mesmo rastreador, a chave de dedup `(rastreador_id, traccar_position_id)` as trataria como a mesma
  posição e descartaria dado legítimo. **Decisão pendente de teste, não resolvida por este documento**: antes de
  confiar em `position.id`, o teste de contrato da seção 1.1 precisa confirmar explicitamente (a) que o valor nunca
  vem `0`/nulo em pacotes de posição real, e (b) que é de fato único por dispositivo no histórico do Traccar. Se
  qualquer um dos dois falhar, a chave de dedup muda para um hash determinístico do conteúdo relevante da posição
  (`rastreador_id` + `fixTime` + lat/lon/odômetro arredondados), aceitando que isso é mais frágil contra posições
  genuinamente idênticas em sequência rápida — a decisão exata fica para quando o teste real acontecer, não antes.

### 1.2 Unidades dos campos

Confirmado pela documentação oficial do protocolo de posição do Traccar:

| Campo | Unidade no Traccar | Unidade a gravar no nosso banco |
|---|---|---|
| `speed` | **nós** (knots) | km/h — multiplicar por `1.852` |
| `course` | graus (0–360) | graus, sem conversão |
| `altitude` | metros | metros, sem conversão |
| `attributes.odometer` | **metros** | a arquitetura proposta já lista isso certo; converter para km na leitura, ou manter metros no banco e converter só na apresentação (recomendo manter metros no banco — evita erro de arredondamento acumulado em relatórios de km por soma) |
| `attributes.hours` | **milissegundos** (horímetro do motor, quando o protocolo manda) | converter para horas só na apresentação |
| `attributes.distance`/`totalDistance` | metros (distância calculada pelo próprio Traccar entre posições, quando ligado) | **não usar como fonte de km** — é um cálculo auxiliar do Traccar (linha reta entre pontos, sem map-matching); o produto já tem motor de km próprio (`packages/shared/src/km.ts`) que deve continuar sendo a fonte, lendo `odometer` do rastreador quando disponível e geometria quando não |

### 1.3 Tipos de evento disponíveis

O Traccar classifica eventos por `type` (string fixa, não heurística — é exatamente a melhoria que
`docs/PLANO-ADAPTADOR-TRACCAR.md` já identificou em relação à API atual). Os relevantes para este produto:

- **Do aparelho/protocolo** (`attributes.alarm` dentro do evento `alarm`, valores padronizados: `sos`, `tamper`,
  `powerCut`, `lowBattery`, `overspeed` próprio do Traccar — ver nota abaixo —, `fault`, `jamming`, `hardAcceleration`,
  `hardBraking`, entre outros do catálogo do Traccar).
- `deviceOnline` / `deviceOffline` / `deviceUnknown` — diagnóstico de conectividade, calculado pelo próprio Traccar
  com base em `devices.timeout` (parâmetro do servidor). **Atenção**: isso é diagnóstico de socket (o aparelho
  parou de falar com o Traccar), não é a mesma coisa que a regra de produto "sem sinal" (que, pela arquitetura
  proposta item 7, é parametrizável por cliente no Setup) — não usar `deviceOffline` do Traccar como fonte da
  regra de produto; usar como métrica operacional (seção 4).
- `geofenceEnter` / `geofenceExit` — **só dispara se a cerca existir cadastrada dentro do Traccar**. A arquitetura
  proposta (e `docs/PLANO-ADAPTADOR-TRACCAR.md` § 2, linha de Zonas) já decide manter cercas só no backend,
  calculadas sobre a posição crua (`fenceCrossing()` em `packages/shared/src/engine.ts:88`) — então esses dois
  tipos de evento do Traccar **não vão ser usados**, e as cercas do próprio Traccar devem ficar vazias/desligadas
  (coerente com a instrução "cercas e limite de velocidade do próprio Traccar ficam desligados" da seção 1 da
  proposta).
- `overspeed` **do Traccar** é calculado contra um limite por cerca ou por dispositivo cadastrado dentro do
  Traccar — mesma lógica do ponto anterior: como a regra de excesso de velocidade é por cliente/regra de negócio
  (arquitetura proposta, item 7), o `overspeed` nativo do Traccar também deve ficar desligado; o cálculo de excesso
  é 100% do motor de regras do backend.
- `commandResult` — resultado de um comando enviado (seção 1.4).
- `maintenance`, `driverChanged`, `media` — existem no Traccar mas não mapeiam para nada do produto hoje (RFID/
  iButton do Traccar é um recurso parecido com `driverLinks.ts` do produto, mas a arquitetura proposta já decide
  manter o vínculo motorista×veículo como histórico próprio, não usar o `driverChanged` do Traccar).

### 1.4 API de comandos e evento de resultado

- `GET /api/commands/types?deviceId=X` — lista os tipos de comando que aquele dispositivo específico aceita,
  resolvidos pelo protocolo dele (ex.: `engineStop`, `engineResume`, `positionSingle`, `outputControl`). Isso
  confirma o que `docs/PLANO-ADAPTADOR-TRACCAR.md` já apontava como ganho sobre a API Clube do Rastreador.
- `POST /api/commands/send` — corpo `{ "deviceId": 42, "type": "engineStop", "attributes": {} }`. Resposta
  imediata é só confirmação de enfileiramento (o comando entra na fila do Traccar para aquele dispositivo,
  despachado quando ele estiver conectado — rastreador em protocolo TCP/UDP sem canal persistente, como a maioria
  dos GT06/H02 em UDP, só recebe no próximo "keep-alive" ou pacote de posição).
- **Confirmação real**: o Traccar gera um evento do tipo `commandResult` quando o protocolo devolve um ACK de
  execução — mas **nem todo protocolo devolve isso**. GT06 e a maioria dos protocolos chineses simples confirmam
  só a entrega do pacote no socket, não necessariamente a execução no relé do veículo (o relé pode estar com fiação
  errada e o comando "ter sido executado" do ponto de vista do protocolo mesmo assim). Teltonika e Suntech tendem a
  ter confirmação mais confiável. **Recomendação**: tratar `commandResult` como "o aparelho confirmou recebimento/
  execução segundo o protocolo dele", não como garantia de estado físico do veículo — e para o fluxo de pânico/
  bloqueio remoto do produto, isso é uma lacuna de produto a documentar para o cliente final (nem toda confirmação
  de comando é prova de bloqueio físico), não um problema da integração.
- Um comando pendente sem resposta não expira sozinho no Traccar — o estado "aguardando o aparelho" com timeout
  (item 6 da proposta) precisa ser controlado pelo backend (um job que marca como `falhou` por timeout se não
  chegar `commandResult` dentro de N minutos), o Traccar não faz isso por conta própria.

### 1.5 Cadastro automático de desconhecidos em grupo de quarentena

**Recomendação revista nesta revisão: cadastro oficial primeiro, não auto-registro seguido de quarentena.**

A primeira versão deste documento recomendava manter `database.registerUnknown=true` em produção e desativar o
dispositivo depois que ele aparecesse sozinho no Traccar. Uma revisão técnica externa apontou corretamente que
isso ainda deixa uma janela — curta, mas real — em que **qualquer IMEI desconhecido já existe como dispositivo
operacional** no Traccar antes de qualquer avaliação da aplicação, e cria uma superfície de abuso: quem descobrir
o IP/porta de um protocolo aberto (ex.: 5023 `gt06`) pode mandar pacotes de protocolo válido com IMEI aleatório e
gerar cadastros sem fim, mesmo que cada um nasça "para ser desativado em seguida" — o custo (linha em
`tc_devices`, ruído na fila de ingestão) já foi pago antes da desativação rodar.

**Fluxo recomendado: cadastro oficial → provisionamento no Traccar → primeira conexão → ativação.**

1. O IMEI entra no cadastro oficial da plataforma (Gestão de ativos) **antes** de o rastreador ser ligado em
   campo — é o fluxo natural de instalação (técnico recebe o equipamento já com IMEI conhecido).
2. O backend cria o dispositivo no Traccar via `POST /api/devices` (`uniqueId` = IMEI) nesse momento, já
   associado ao grupo correto, e com `disabled: false` — ele só existe no Traccar porque alguém já o colocou lá
   deliberadamente.
3. Com `database.registerUnknown=false` (valor seguro, igual ao que `docs/GUIA-TRACCAR.md` § 8.2 já recomenda),
   um IMEI que **não** passou pelo passo 2 não cria dispositivo nenhum — o pacote chega, o Traccar loga
   `Unknown device` (mesmo comportamento já documentado em `docs/GUIA-TRACCAR.md` § 6) e não grava posição. Não há
   quarentena a limpar depois, porque não há cadastro indevido a desfazer.
4. Quando a primeira posição de um dispositivo **já cadastrado** chega, o worker de ingestão confirma a instalação
   correspondente (seção 4.2) e o fluxo segue normal.

**Se a descoberta automática (instalador plugou um equipamento cujo IMEI ainda não foi digitado em lugar nenhum)
for um requisito real de produto**, a alternativa é um fluxo de **ativação temporária e auditada**, não
`registerUnknown` ligado permanentemente: uma rota específica (`POST /ingest/traccar/device-discovery`, só
acessível internamente) que registra o IMEI desconhecido observado (sem criar dispositivo operacional no
Traccar), com limite de tentativas por período e por origem de rede, e alerta para alguém confirmar manualmente o
cadastro — o "grupo de quarentena" nesse desenho é uma tabela da plataforma (`imeis_observados`), não um grupo
dentro do Traccar. Essa alternativa fica registrada aqui como opção, não como recomendação padrão: o fluxo
cadastro-primeiro cobre o caso comum (instalação planejada) com menos superfície de risco.

### 1.6 Como ler o banco do Traccar para a conciliação

- O Postgres do Traccar (schema público, tabelas `tc_positions`, `tc_devices`, `tc_events`, `tc_commands`,
  `tc_groups`) é acessível diretamente — é o mesmo Postgres citado em `docs/ARQUITETURA-BACKEND.md` § 7.2
  ("Postgres do Traccar … pode ser o mesmo cluster, schema separado").
- **Recomendação: a rotina de conciliação lê direto esse banco via SQL (réplica de leitura se o volume justificar),
  não via API REST.** A API REST (`GET /api/positions?deviceId=X&from=...&to=...`) tem paginação e rate-limit
  implícitos (é a mesma API usada pelo painel web) e não foi desenhada para varredura em lote de milhares de
  posições por conciliação periódica; SQL direto em `tc_positions` com índice por `deviceid`+`fixtime` é ordens de
  magnitude mais barato para esse caso de uso específico.
- Acesso só de leitura: criar um usuário Postgres `traccar_readonly` com `GRANT SELECT` nas tabelas `tc_positions`,
  `tc_devices`, `tc_events`, usado só pelo job de conciliação — nunca o usuário de aplicação do próprio Traccar,
  para não arriscar lock/contenção com a escrita do Traccar nem dar ao job de conciliação acesso de escrita por
  engano.
- `tc_positions.fixtime`, `tc_positions.deviceid`, `tc_positions.id` são as colunas que a conciliação casa contra
  `positions.ts`/`positions.device_id`/a chave única da seção 4.2 (reaproveitando `tc_positions.id` como parte da
  chave de deduplicação, igual à proposta já sugere).

---

## 2. Conflitos com o que já existe (arquivo e linha)

1. **`docs/PLANO-ADAPTADOR-TRACCAR.md` descreve o front falando com o Traccar direto** (via proxy do Vite,
   igual ao padrão atual com a API Clube do Rastreador) — linhas 28, 37, 49: "no front hoje (sem backend ainda) dá
   para consumir o WebSocket direto, atrás do mesmo proxy que hoje esconde a chave", "O gate de segurança que já
   existe para `OBJECT_CMD_*` … deve ser recriado para `/api/commands/send` no proxy novo". Isso contradiz
   diretamente o item 1 da arquitetura proposta ("O front nunca fala com o Traccar") e o resumo de
   `PRODUCT.md:71` ("Relatórios, telas de monitoramento e qualquer leitura de posição são sempre contra o nosso
   banco, nunca contra a API do Traccar"). **Resolução**: o plano do adaptador vale como mapeamento função-a-função
   de *recursos* (o que o Traccar oferece no lugar de cada chamada da API Clube do Rastreador), mas o "onde" muda —
   quem chama `GET /api/positions`, `/api/commands/send` etc. passa a ser o backend NestJS, nunca o front. Corrigido
   no próprio arquivo (seção 7 abaixo) e na nota de topo dele.
2. **Retenção do Traccar não está decidida nem configurada** — `docs/ARQUITETURA-BACKEND.md:156` só menciona o
   `backup.sh` (dump completo, não retenção automática), e nenhum arquivo do kit (`infra/traccar/conf/traccar.xml`,
   `docker-compose.yml`) configura a chave de retenção do Traccar (`database.*` ou a rotina interna de limpeza —
   versões recentes do Traccar têm uma tarefa agendada de limpeza configurável só pelo banco, não por XML, via
   tabela de configuração do servidor). A proposta (item 2) assume uma retenção curta (7 dias) como premissa de
   segurança da conciliação, mas isso **não existe hoje** — é risco a tratar como decisão em aberto (seção 6a),
   não como fato já resolvido.
3. **`docs/GUIA-TRACCAR.md:211-217` recomenda desligar `database.registerUnknown`** fora de teste ("nunca deixar
   ligado em homologação/produção, porque qualquer IMEI desconhecido passaria a criar um veículo sozinho"). A
   arquitetura proposta (item 5) pedia originalmente o cadastro automático em quarentena, que dependeria dessa
   chave ligada — essa recomendação **foi revertida** na seção 1.5 desta análise (revisão de 23/10/2026): o fluxo
   passa a ser cadastro oficial → provisionamento no Traccar → primeira conexão, com `registerUnknown=false`.
   **Isso elimina o conflito em vez de resolvê-lo por mudança do guia**: `docs/GUIA-TRACCAR.md:211-217` já estava
   certo e continua valendo sem alteração — era a arquitetura proposta original que precisava mudar, não o guia.
4. **Modelo de dados do protótipo (`docs/especificacao-sql/`) não tem tabela `positions` nem `devices`/`rastreadores`
   como entidade de primeira classe** — o que existe é `tracker_installations` (vínculo IMEI↔ativo,
   `docs/especificacao-sql/20261017200000_instalacao.sql:4-15`), sem tabela própria de "rastreador" (o IMEI vive
   só como coluna de texto na instalação) e sem qualquer tabela de posição crua (o protótipo lê posição do mock de
   rede, `apps/web/src/lib/positionsSource.ts`/`rastreioApi.ts`, nunca persiste). A arquitetura proposta (item 9)
   pede uma tabela `rastreadores` própria — é trabalho novo, não adaptação do que existe; `tracker_installations`
   deveria passar a referenciar `rastreador_id` (FK) em vez de guardar `imei text` solto, para não ter o mesmo IMEI
   digitado em dois lugares que podem divergir.
5. **`docs/ARQUITETURA-BACKEND.md:68-80` já desenha uma tabela `positions`** com PK `(device_id, ts, id)`, mas usa
   `device_id bigint` (assumindo que é o ID do Traccar) e não inclui `cliente_id`/`veiculo_id` resolvidos por
   histórico de instalação (item 4 da proposta) nem o horário de chegada separado do horário do GPS (item 3 da
   proposta). A seção 4 deste documento já corrige isso — ver modelo de dados detalhado.
6. **`docs/ARQUITETURA-BACKEND.md:142-143` descreve webhook e polling como alternativas equivalentes de
   "preferência"** ("em ordem de preferência"), sem endpoints separados por posição/evento nem fila de prioridade
   para eventos críticos além da menção breve na seção 4 ("fila separada para eventos críticos … com prioridade
   maior"). A arquitetura proposta (itens 2 e 6) já detalha isso melhor (endpoints separados, chave secreta,
   conciliação); esta análise consolida os dois em vez de manter duas versões divergentes — ver seção 5 (contratos).
7. **Unidade de velocidade**: nenhum documento hoje registra a conversão nó→km/h do Traccar — nem
   `docs/GUIA-TRACCAR.md` nem `docs/ARQUITETURA-BACKEND.md` mencionam unidade de `speed`. A arquitetura proposta
   (item 3) já acerta isso; esta análise confirma contra a documentação do protocolo (seção 1.2) e marca como
   conflito de omissão a corrigir nos dois documentos.

---

## 3. Riscos e pontos fracos não considerados

1. **Confirmação de comando não é garantia de execução física** (detalhado na seção 1.4) — o produto hoje já
   promete "bloqueio remoto" como funcionalidade de SOS/pânico; o estado `confirmado` do fluxo de comando (item 6
   da proposta) precisa deixar claro, na UI, que é "confirmado pelo protocolo do aparelho", não "confirmado que o
   motor parou". Risco de produto, não só técnico: um cliente que aciona bloqueio remoto em uma emergência e confia
   cegamente no "confirmado" tem expectativa desalinhada com o que o protocolo realmente garante.
2. **Resolvido pela seção 5.1 (inbox transacional)** — a versão original deste risco apontava o Redis/BullMQ como
   ponto único de perda entre o `202` e a gravação. Com o inbox no Postgres (seção 5.1), o `202` só é emitido depois
   do commit; a fila passa a servir só o trabalho derivado idempotente, onde perder um job é reprocessável sem
   efeito colateral. Continua valendo monitorar fila dead-letter não vazia como métrica (não só profundidade),
   caso a alternativa mais simples (só BullMQ, sem inbox) seja a escolhida para a primeira versão.
3. **Em grande parte resolvido pela seção 6b revista (versionamento de indicador fechado)** — a versão original
   deste risco (relatório mudando sob os olhos do usuário sem aviso) motivou a correção: indicadores fechados agora
   geram nova versão em vez de sobrescrever, e a UI mostra "recalculado em HH:MM" explicitamente. O que continua
   como ponto de atenção de produto, não mais de arquitetura: decidir com o dono do produto se a tela do cliente
   deve notificar ativamente ("seu relatório de ontem mudou") ou só mostrar a versão mais recente passivamente.
4. **Resolução de veículo/cliente por histórico de instalação (item 4) tem janela de corrida na troca de
   instalação**: se uma posição com `fixTime` de 14:00:00.500 chega ao worker no mesmo instante em que o técnico
   está registrando a desinstalação às 14:00:00 (ex.: rastreador sendo removido e reinstalado em outro veículo no
   mesmo minuto, comum em troca de veículo de frota), a query "qual instalação valia nesse `fixTime`" pode achar
   zero ou duas instalações vigentes dependendo de como o intervalo é fechado/aberto. Precisa de uma regra explícita
   de fronteira (ex.: intervalo `[instalado_em, desinstalado_em)`, meio-aberto) e um teste de unidade específico
   para esse caso, não só o código "feliz" de uma instalação ativa por vez.
5. **O Traccar tem sua própria noção de "offline" (`devices.timeout`) que pode conflitar com a métrica de produto
   "sem sinal"** (já apontado na seção 1.3) — risco adicional: se alguém configurar o `devices.timeout` do Traccar
   pensando que está ajustando o parâmetro de produto do Setup, os dois dessincronizam silenciosamente. Vale um
   comentário/trava explícita (ou até ocultar o campo no painel do Traccar) para não haver dois lugares editáveis
   para "o que conta como sem sinal".
6. **Superado pela revisão da seção 1.5**: a versão original deste risco apontava `database.registerUnknown=true`
   em produção como superfície de abuso (qualquer um mandando pacote com IMEI aleatório cria dispositivo sem fim no
   Traccar). Com a recomendação revista (cadastro oficial antes da primeira conexão, `registerUnknown=false`), o
   risco deixa de existir na forma descrita — um IMEI não cadastrado não cria nada. Resta um risco residual menor:
   tráfego de protocolo com IMEI desconhecido ainda chega às portas abertas e é processado (parseado) pelo Traccar
   antes de ser descartado por falta de cadastro — isso é custo de CPU/log, não de linhas de banco; rate-limit por
   IP de origem no firewall/proxy continua sendo boa prática independente disso.
7. **Pacote bruto (decisão 6c) sem mascaramento pode gravar dado sensível sem necessidade**: alguns protocolos
   embutem campos como senha de admin do próprio rastreador (ex.: comandos de configuração capturados por engano
   se o guardado for o payload completo do socket, não só o payload de posição) ou dado de localização de terceiros
   (se o IMEI identificado errado por bug de decodificação apontar para outro cliente, guardar o pacote bruto por
   dias cria uma cópia do erro que sobrevive além do banco oficial). Se a decisão 6c for "sim, guardar", guardar
   só o payload relevante ao protocolo de posição/evento, nunca o socket inteiro, e aplicar a mesma política de
   isolamento por cliente da seção 2.1 do `ARQUITETURA-BACKEND.md` a essa tabela também.
8. **Nenhum documento atual cobre o que acontece se o backend ficar indisponível por minutos/horas** (deploy,
   incidente) enquanto o Forwarding do Traccar segue tentando entregar: o Traccar tem limite de retry
   (`forward.retry.count`/similar); depois de esgotado, a posição fica só no banco do Traccar, e só a conciliação
   periódica (item 2 da proposta) a resgata — ou seja, a janela de retenção do Traccar (decisão 6a) precisa cobrir
   não só "atraso normal de rede", mas o pior caso de indisponibilidade do backend mais o intervalo até a próxima
   rodada de conciliação. Isso muda o cálculo de "quantos dias de retenção são seguros" (seção 6a) — não é só
   sobre lentidão de rede do rastreador.

---

## 4. Modelo de dados detalhado

Schema `public` do banco da plataforma (Postgres+TimescaleDB+PostGIS), substituindo/estendendo o esboço de
`docs/ARQUITETURA-BACKEND.md` § 2.2.

**Revisão de 23/10/2026**: a primeira versão desta seção tinha três problemas apontados por uma revisão técnica
externa, dois deles erros de SQL que **impediriam a migração de rodar**, não só questões de estilo:

1. `unique (rastreador_id, traccar_position_id)` em `posicoes` **não inclui a coluna de particionamento**
   (`fix_time`) — o TimescaleDB exige que todo índice único de uma hypertable inclua a coluna de tempo usada em
   `create_hypertable`. `create_hypertable('posicoes', 'fix_time', ...)` com essa constraint **falha**. O mesmo
   valia para `eventos`/`traccar_event_id` sem `ts`. Corrigido na seção 4.3 com uma tabela de deduplicação separada,
   não hypertable, em vez de forçar `fix_time` dentro do índice único (que resolveria a migração mas permitiria
   duplicar o mesmo registro do Traccar se ele chegasse com `fix_time` divergente entre tentativas).
2. `eventos.posicao_id bigint references public.posicoes (id)` é inválida: `posicoes.id` não é chave única
   independente (só existe dentro da PK composta `(rastreador_id, fix_time, id)`), e o **TimescaleDB não suporta
   foreign key de uma hypertable para outra hypertable**. Corrigido na seção 4.5: a referência vira lógica, sem FK,
   guardando só `posicao_id` (o valor de `id`, globalmente único por ser `generated always as identity`, mesmo sem
   ser chave isolada) — uma correção posterior (revisão de segunda passada) trocou a ideia inicial de referenciar
   por `rastreador_id` + `fix_time`, porque esse par não identifica uma posição sem ambiguidade (dois pacotes podem
   ter o mesmo `fix_time`).
3. `rastreadores.client_id` modelava o rastreador como pertencente a um cliente para sempre — mas um rastreador é
   uma peça física que pode ser desinstalada de um cliente e reinstalada em outro (equipamento devolvido, troca de
   contrato). Quem define o dono de uma posição histórica é a instalação vigente **naquele instante**, nunca o
   cliente atual do rastreador. Corrigido na seção 4.1: `rastreadores` não tem `client_id` — é identidade física
   pura; `client_id` só existe em `instalacoes` (vínculo temporal) e é dali que `posicoes`/`eventos` o herdam.

### 4.1 `rastreadores` (identidade física, sem cliente fixo)

```sql
create table public.rastreadores (
  id uuid primary key default gen_random_uuid(),
  traccar_device_id bigint unique,              -- id do dispositivo no Traccar; null até o backend criar lá
  imei text not null,
  modelo text,                                   -- catálogo existente em trackerModels.ts
  protocolo text,                                -- preenchido/confirmado pelo Traccar na 1ª posição
  status text not null default 'cadastrado'
    check (status in ('cadastrado', 'ativo', 'desativado')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.rastreadores (traccar_device_id);
create unique index rastreadores_imei_ativo_uidx
  on public.rastreadores (imei) where status <> 'desativado';
```

**Sem `client_id`** — de propósito (ver nota de revisão acima). O cliente dono de um rastreador num dado momento
é sempre resolvido via `instalacoes` (seção 4.2), nunca lido direto da tabela de rastreadores. `status`:
`cadastrado` (existe na plataforma, ainda sem instalação vigente ou provisionado no Traccar — seção 1.5),
`ativo` (tem instalação vigente e já manda posição), `desativado` (fim de vida do equipamento). `imei` é único
entre rastreadores não desativados (um IMEI pode ser reaproveitado depois de desativado — troca de chip físico no
mesmo rastreador acontece, mas dois registros ativos com o mesmo IMEI é sempre erro de cadastro).

### 4.2 `instalacoes` (histórico veículo × rastreador, substitui/estende `tracker_installations`)

**Revisão de 23/10/2026 (segunda passada)**: a versão anterior só impedia sobreposição do **mesmo rastreador** em
dois veículos ao mesmo tempo — correto, mas incompleto: não impedia (nem decidia) se um **mesmo veículo** pode ter
duas instalações vigentes simultâneas. Isso não é um erro de hoje (hoje só existe "um rastreador por veículo"), mas
é uma lacuna de desenho: o produto já cogita veículo com rastreador GPS principal **e** módulo CAN separado no
mesmo período. Resolvido abaixo com um `papel` explícito, exclusão de sobreposição só onde a exclusividade faz
sentido (por `papel`, não por veículo inteiro), e duas validações adicionais que a revisão apontou como faltando:

```sql
create table public.instalacoes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  rastreador_id uuid not null references public.rastreadores(id) on delete restrict,
  asset_id uuid not null references public.assets(id) on delete cascade,
  papel text not null default 'principal' check (papel in ('principal', 'secundario', 'can')),
  instalado_em timestamptz not null,
  desinstalado_em timestamptz,                   -- null = vigente
  tecnico text not null,
  km_inicial numeric(12,1),
  foto text,
  check (desinstalado_em is null or desinstalado_em > instalado_em),
  -- um mesmo rastreador nunca está instalado em dois lugares ao mesmo tempo, qualquer papel:
  exclude using gist (
    rastreador_id with =,
    tstzrange(instalado_em, coalesce(desinstalado_em, 'infinity'), '[)') with &&
  ),
  -- um mesmo veículo não tem duas instalações vigentes do MESMO papel ao mesmo tempo
  -- (papéis diferentes — GPS principal + módulo CAN — podem coexistir de propósito):
  exclude using gist (
    asset_id with =,
    papel with =,
    tstzrange(instalado_em, coalesce(desinstalado_em, 'infinity'), '[)') with &&
  )
);
create index on public.instalacoes (asset_id, instalado_em desc);
create index on public.instalacoes (rastreador_id, instalado_em desc);
```

`exclude using gist` (requer extensão `btree_gist`) impede as duas sobreposições acima no banco — resolve de raiz o
risco 3.4 (janela de corrida), em vez de confiar só em lógica de aplicação. Intervalo meio-aberto
`[instalado_em, desinstalado_em)`: a posição com `fixTime` igual ao exato instante de `desinstalado_em` já conta
para a instalação seguinte, não a anterior — escolha arbitrária mas precisa ser essa, documentada, e coberta por
teste. O `check (desinstalado_em is null or desinstalado_em > instalado_em)` barra no banco uma instalação
cadastrada com desinstalação igual ou anterior à instalação (erro de digitação do técnico, ou bug de fuso horário).

**Validação adicional pendente de teste, não de constraint de banco**: a revisão aponta corretamente que o banco
não consegue, sozinho, garantir que `instalacoes.client_id` corresponde ao cliente que era dono do `asset_id`
naquele período (o ativo em si também pode ser transferido entre clientes/revendas). Isso precisa de um teste de
integração específico — "cadastrar uma instalação com `client_id` diferente do dono do ativo naquele período deve
falhar" — na mesma suíte de isolamento multi-tenant que `docs/ARQUITETURA-BACKEND.md` § 2.1 já exige, cobrindo
explicitamente: troca de rastreador entre clientes, correção retroativa de instalação já fechada, posição recebida
antes da instalação existir no cadastro, e transferência de veículo entre empresas.

### 4.3 `posicoes` (hypertable) + deduplicação

A deduplicação por `traccar_position_id` fica numa **tabela relacional separada, não hypertable** — é ela que
reserva a identidade da origem antes de gravar, e é o que garante processamento idempotente dentro da janela de retenção (nota abaixo) sem precisar meter a coluna
de tempo dentro do índice único (o que, como a nota de revisão explica, abriria brecha para duplicar o mesmo
registro se ele chegasse de novo com `fix_time` diferente — reenvio depois de correção de relógio do rastreador,
por exemplo).

**Correção de 23/10/2026 (segunda passada)**: a versão anterior declarava `posicao_id bigint not null`, mas o
fluxo descrito (reservar a identidade primeiro, gravar a posição depois, então preencher `posicao_id`) não é
compatível com `not null` — no instante do primeiro `insert` o `id` da posição ainda não existe. Corrigido abaixo:
`posicao_id` nasce `null` e só é preenchido depois, e **o commit da transação só acontece depois desse segundo
update** (não antes) — é esse commit que marca a posição como "deduplicação resolvida", não a reserva inicial.

```sql
create table public.ingest_posicoes_recebidas (
  rastreador_id uuid not null references public.rastreadores(id),
  traccar_position_id bigint not null,
  posicao_id bigint,                    -- null até o worker gravar a posição e atualizar, na mesma transação
  recebido_em timestamptz not null default now(),
  primary key (rastreador_id, traccar_position_id)
);
create index on public.ingest_posicoes_recebidas (recebido_em) where posicao_id is null;
```

O índice parcial `where posicao_id is null` serve para um job de vigilância encontrar reservas que ficaram
penduradas (worker caiu entre o primeiro insert e o update) e decidir se refaz o processamento ou libera a
reserva — mesmo mecanismo de recuperação do inbox (seção 5.1, revisão de processamento abaixo).

**Retenção destas tabelas de deduplicação** (ponto novo desta revisão — a versão anterior não tratava disso): elas
crescem para sempre se não forem limpas. Com 800 rastreadores a cada 30s, são ~2,3 milhões de linhas/dia, ~69
milhões em 30 dias — pequenas por linha, mas sem limite não é aceitável. **A deduplicação só precisa cobrir a
janela em que uma reentrega é possível**: o retry do Traccar (segundos a minutos) e a rotina de conciliação (seção
1.6, rodando dentro da janela de retenção do Traccar — recomendação de 14 dias, seção 6a). Um job diário apaga de
`ingest_posicoes_recebidas`/`ingest_eventos_recebidos` tudo com `recebido_em` mais antigo que a janela de
conciliação + uma margem de segurança (ex.: 21 dias) — depois disso, se a mesma `traccar_position_id` reaparecer
(cenário extremamente improvável depois de 3 semanas), o pior caso é gravar uma posição duplicada, não perder
dado, e é um preço aceitável por não guardar essa tabela para sempre.

**Correção de enquadramento (revisão de 23/10/2026, terceira passada)**: o termo "exatamente-uma-vez" usado nesta
seção descreve a garantia dentro da janela de retenção da tabela de dedup, não uma garantia absoluta e permanente —
e depende também da premissa sobre `position.id` ainda não verificada (nota da seção 1.1). O enunciado correto é:
**processamento idempotente dentro de uma janela definida** (a janela de retenção acima), sujeito a reprocessamentos
manuais e conciliações em andamento serem considerados antes de qualquer limpeza — um job de limpeza que rode
enquanto uma conciliação manual ainda está reprocessando um período antigo pode apagar a linha de dedup bem no
meio do reprocessamento; a limpeza deve checar que não há reprocessamento/conciliação em andamento para aquele
`rastreador_id`/período antes de apagar, não só a idade de `recebido_em`.

```sql
create table public.posicoes (
  id bigint generated always as identity,
  rastreador_id uuid not null references public.rastreadores(id),
  traccar_position_id bigint not null,          -- tc_positions.id; auditoria/depuração, dedup real é a tabela acima
  client_id uuid,                                -- resolvido pelo worker via instalacoes; null se não resolvido ainda
  asset_id uuid,                                 -- idem
  fix_time timestamptz not null,                 -- horário do GPS (fonte da verdade)
  server_time timestamptz not null,              -- quando o Traccar gravou
  received_at timestamptz not null default now(),-- quando o NOSSO backend recebeu (item 3 da proposta)
  valid boolean not null,
  geom geometry(Point, 4326) not null,
  speed_kmh numeric,
  course numeric,
  altitude numeric,
  odometer_m numeric,
  ignition boolean,
  attributes jsonb not null default '{}',
  primary key (rastreador_id, fix_time, id)
);
select create_hypertable('posicoes', 'fix_time', chunk_time_interval => interval '1 day');
create index on public.posicoes (rastreador_id, fix_time desc);
create index on public.posicoes using gist (geom);
create index on public.posicoes (client_id, fix_time desc) where client_id is not null;
```

Gravação (uma transação no worker): `insert ... on conflict (rastreador_id, traccar_position_id) do nothing
returning rastreador_id` em `ingest_posicoes_recebidas` (com `posicao_id` ainda `null`); se o `insert` não
retornar linha (já existia — reentrega do Traccar ou reprocessamento), o worker descarta sem tocar em `posicoes`;
se retornar, grava a posição em `posicoes`, captura o `id` gerado e só então faz
`update ingest_posicoes_recebidas set posicao_id = $id where (rastreador_id, traccar_position_id) = (...)` — o
`commit` da transação acontece depois desse `update`, nunca antes. Isso é o que garante processamento idempotente dentro da janela de retenção, sem FK
nem índice único cruzando a fronteira da hypertable, e evita o estado inconsistente "reserva feita, posição nunca
gravada" sobreviver além da própria transação (se o worker cair no meio, a transação inteira não commitou — nem a
reserva nem a posição existem, e o reprocessamento trata como primeira tentativa).

- `client_id`/`asset_id` **nullable**: uma posição pode chegar antes do worker conseguir resolver instalação
  (rastreador recém-cadastrado, ainda sem instalação registrada) — ela é gravada mesmo assim (histórico cru não se
  perde), e um job de backfill resolve `client_id`/`asset_id` quando a instalação for cadastrada depois,
  reprocessando as posições órfãs daquele `rastreador_id` anteriores à instalação.
- `valid=false` (sem fix de GPS) é gravada mas filtrada em toda query de mapa/relatório/distância — índice
  `(client_id, fix_time desc) where client_id is not null` não filtra por `valid` porque telas de diagnóstico
  ("ver tudo que esse rastreador mandou") precisam enxergar posições inválidas também.
- **Isolamento multi-tenant, segunda camada**: além do filtro de aplicação por `client_id` (camada única de acesso
  obrigatória, já decidida em `docs/ARQUITETURA-BACKEND.md` § 2.1), ativar RLS em `posicoes`/`eventos`/
  `ultima_posicao` (`client_id = current_setting('app.client_id')::uuid`) como rede de segurança — não a primeira
  linha de defesa, mas a que pega um bug de filtro que escapou do teste automático de leitura cruzada que
  `ARQUITETURA-BACKEND.md` § 2.1 já exige.
  **Ressalva importante (revisão de 23/10/2026, segunda passada)**: RLS protege contra consultar fora do
  `client_id` certo, **não** contra o dado já ter sido classificado com o `client_id` errado. Se o worker gravar
  uma posição do Cliente A com `client_id` do Cliente B (erro de resolução de instalação), o RLS deixa o Cliente B
  lê-la normalmente — ele não sabe que a classificação está errada, só impede ler fora dela. A defesa real contra
  isso é correção na origem (seção 4.2, validação de `instalacoes.client_id`) mais os testes de integração listados
  ali (troca de rastreador entre clientes, correção retroativa, posição antes da instalação, transferência de
  veículo) — RLS é complementar a isso, não substituto.

### 4.4 `ultima_posicao` (localização) + `rastreador_comunicacao` (saúde do equipamento)

**Correção de 23/10/2026 (segunda passada)**: a versão anterior usava uma única tabela para "onde o veículo está"
e, implicitamente, "o rastreador está vivo". A revisão apontou que isso mistura dois conceitos diferentes: um
rastreador pode continuar transmitindo pacotes (o Traccar recebe e confirma) sem coordenada válida (`valid=false`
— sem fix de GPS, prédio/túnel), e `ultima_posicao` não atualiza nesse caso, deixando a última **posição válida**
parada enquanto o equipamento está, na verdade, online e se comunicando. Além disso, uma troca de instalação
(rastreador saindo de um veículo e entrando em outro) precisa refletir imediatamente em quem é o dono daquele
rastreador, mesmo que nenhuma posição nova tenha chegado ainda depois da troca — senão a tela de monitoramento
mostra o veículo errado associado ao rastreador até a próxima posição.

```sql
create table public.ultima_posicao (
  rastreador_id uuid primary key references public.rastreadores(id),
  asset_id uuid,
  client_id uuid,
  posicao_id bigint not null,
  fix_time timestamptz not null,
  geom geometry(Point, 4326) not null,
  speed_kmh numeric,
  ignition boolean,
  atualizado_em timestamptz not null default now()
);
create index on public.ultima_posicao (client_id);
create index on public.ultima_posicao using gist (geom);

create table public.rastreador_comunicacao (
  rastreador_id uuid primary key references public.rastreadores(id),
  asset_id uuid,                        -- instalação vigente, atualizado na hora da troca, não espera posição nova
  client_id uuid,
  ultimo_pacote_em timestamptz,         -- qualquer pacote recebido, válido ou não (saúde de conexão)
  ultima_posicao_valida_em timestamptz, -- espelha ultima_posicao.fix_time, para consulta conjunta sem join
  atualizado_em timestamptz not null default now()
);
create index on public.rastreador_comunicacao (client_id);
```

- `ultima_posicao` só muda com posição **válida** mais recente — é a fonte do "onde está o veículo no mapa".
- `rastreador_comunicacao` muda com **qualquer** pacote (válido ou não) — é a fonte da métrica "sem sinal"/saúde de
  conexão (item 4 do modelo de dados da proposta original, seção 1.3 desta análise) e é atualizada **também** no
  instante de uma troca de instalação (gatilho na própria transação de `instalacoes`, não só pelo worker de
  posição), para que `asset_id`/`client_id` fiquem corretos imediatamente, mesmo sem posição nova.

Upsert de `ultima_posicao` pelo worker a cada posição **válida**, só se `fix_time` for maior que o `fix_time` já
gravado (item 3 da proposta — "a última posição só é atualizada se a nova for mais recente"):

```sql
insert into public.ultima_posicao (rastreador_id, asset_id, client_id, posicao_id, fix_time, geom, speed_kmh, ignition)
values ($1,$2,$3,$4,$5,$6,$7,$8)
on conflict (rastreador_id) do update set
  asset_id = excluded.asset_id, client_id = excluded.client_id,
  posicao_id = excluded.posicao_id, fix_time = excluded.fix_time,
  geom = excluded.geom, speed_kmh = excluded.speed_kmh, ignition = excluded.ignition,
  atualizado_em = now()
where excluded.fix_time > public.ultima_posicao.fix_time;
```

Upsert de `rastreador_comunicacao` roda a cada pacote recebido (válido ou não) e, separadamente, a cada
`insert`/`update` em `instalacoes` (vigente nova) — os dois caminhos de escrita convergem na mesma tabela pequena,
sem disputa real porque cada um atualiza colunas distintas na prática (pacote atualiza timestamps de comunicação,
troca de instalação atualiza `asset_id`/`client_id`).

**Correção de 23/10/2026 (terceira passada) — localização não pode ser herdada entre instalações.** A troca de
instalação acima atualiza `asset_id`/`client_id` imediatamente em `rastreador_comunicacao`, mas **não** deve ser
interpretada como "o veículo B está na última posição válida do rastreador". Se o rastreador saiu do veículo A às
14:00 e foi instalado no B às 14:05, e sua última posição válida (gravada em `ultima_posicao`) é das 13:58 — essa
coordenada é de A, não de B; exibi-la como localização atual de B (só porque `rastreador_comunicacao.asset_id`
já mudou) mostra o veículo errado no lugar errado no mapa. Regra explícita: **a localização só é apresentada como
atual quando `ultima_posicao.fix_time` é maior ou igual ao `instalado_em` da instalação vigente daquele
`asset_id`**; antes disso, o veículo aparece como "aguardando primeira posição", sem herdar a posição do rastreador
anterior. Isso é resolvido na leitura (não precisa de mais uma coluna de controle em `ultima_posicao`), com uma
view que faz esse cruzamento:

```sql
create or replace view public.v_localizacao_atual as
select i.asset_id, i.client_id, up.*
from public.instalacoes i
join public.ultima_posicao up
  on up.rastreador_id = i.rastreador_id and up.fix_time >= i.instalado_em
where i.desinstalado_em is null;  -- só a instalação vigente de cada veículo
```

Um veículo sem linha em `v_localizacao_atual` (instalação vigente existe, mas nenhuma posição qualifica ainda) é
exatamente o caso "aguardando primeira posição" — a tela de monitoramento trata a ausência de linha como esse
estado, não como erro.

### 4.5 `eventos`

Mesmo padrão de dedup da seção 4.3 (`ingest_eventos_recebidos`, tabela relacional, não hypertable), pelo mesmo
motivo: `unique (rastreador_id, traccar_event_id)` sem `ts` dentro não funciona como índice único de hypertable.

```sql
create table public.ingest_eventos_recebidos (
  rastreador_id uuid not null references public.rastreadores(id),
  traccar_event_id bigint not null,
  evento_id bigint,                    -- null até o worker gravar o evento e atualizar (mesmo padrão da seção 4.3)
  recebido_em timestamptz not null default now(),
  primary key (rastreador_id, traccar_event_id)
);
```

```sql
create table public.eventos (
  id bigint generated always as identity,
  rastreador_id uuid not null references public.rastreadores(id),
  client_id uuid,
  asset_id uuid,
  origem text not null check (origem in ('aparelho', 'regra')),
  tipo text not null,                 -- 'sos','powerCut','lowBattery','commandResult','cerca_entrada','cerca_saida','excesso','sem_sinal','ignicao_fora_horario','parada_prolongada', ...
  ts timestamptz not null,
  traccar_event_id bigint,            -- null quando origem='regra'; dedup real é a tabela acima
  posicao_id bigint,                   -- referência lógica a posicoes.id, sem FK (ver nota abaixo) — null se o evento não vem de uma posição específica
  attributes jsonb not null default '{}',
  primary key (rastreador_id, ts, id)
);
select create_hypertable('eventos', 'ts', chunk_time_interval => interval '7 days');
create index on public.eventos (client_id, ts desc);
create index on public.eventos (rastreador_id, tipo, ts desc);
```

**Sem FK para `posicoes`** (correção desta revisão): `posicoes.id` não é chave única fora da PK composta, e o
TimescaleDB não aceita foreign key de hypertable para hypertable.

**Correção de 23/10/2026 (segunda passada)**: a versão anterior referenciava a posição por
`(posicao_rastreador_id, posicao_fix_time)` — mas isso **não identifica uma posição de forma inequívoca**: nada
impede dois pacotes do mesmo rastreador chegarem com o mesmo `fix_time` (GPS com resolução de segundo, dois pacotes
no mesmo segundo), e `(rastreador_id, fix_time)` sozinho pode casar com mais de uma linha de `posicoes`. Corrigido
acima: a referência é só `posicao_id` (o valor de `posicoes.id`, que é `generated always as identity` — **globalmente
único por si só**, mesmo não sendo chave única isolada dentro do schema por causa da PK composta da hypertable).
Resolvida e gravada pelo worker na hora de processar o evento (ele já tem a posição em mãos, do mesmo payload, ou
já fez o `insert` em `posicoes` segundos antes), nunca pelo banco via constraint. Uma query que precisa "achar a
posição do evento" faz `select * from posicoes where id = $1` (sem precisar de `rastreador_id`/`fix_time` para
desambiguar, porque `id` sozinho já é suficiente) — mais lento que um `index scan` por partição porque não usa a
coluna de tempo, aceitável porque é um caso raro (buscar a posição de **um** evento específico, não varredura em
lote).

Chunk de 7 dias (não 1 dia como `posicoes`): volume de eventos é ordens de magnitude menor que posições (eventos
são exceção, posições são a cada 20–30s sempre).

### 4.6 `comandos`

```sql
create table public.comandos (
  id uuid primary key default gen_random_uuid(),
  rastreador_id uuid not null references public.rastreadores(id),
  client_id uuid not null,
  tipo text not null,                 -- 'engineStop','engineResume','positionSingle', etc. (de /api/commands/types)
  solicitado_por uuid not null references public.users(id),
  motivo text,
  status text not null default 'solicitado'
    check (status in ('solicitado','enviado','aguardando','confirmado','falhou','expirado')),
  traccar_command_id bigint,
  solicitado_em timestamptz not null default now(),
  enviado_em timestamptz,
  resolvido_em timestamptz,
  expira_em timestamptz not null,     -- solicitado_em + timeout de configuração
  resultado jsonb
);
create index on public.comandos (rastreador_id, status) where status in ('solicitado','enviado','aguardando');
create unique index comandos_pendente_uidx on public.comandos (rastreador_id, tipo)
  where status in ('solicitado','enviado','aguardando');
```

`comandos_pendente_uidx` implementa no banco a regra do item 6 da proposta ("um comando igual pendente bloqueia
outro") — tentar inserir um segundo comando do mesmo tipo pendente para o mesmo rastreador falha na constraint, em
vez de depender só de uma checagem de aplicação antes do insert (condição de corrida entre duas requisições
simultâneas de bloqueio, por exemplo).

**Pendente de especificação própria (apontado em revisão de 23/10/2026, terceira passada) — comandos que alteram
estado físico do veículo** (`engineStop`/bloqueio remoto, principalmente) precisam de regras mais específicas do que
a tabela acima cobre sozinha, a detalhar quando o motor de regras do backend for especificado (fora do escopo deste
documento de integração):

- **Autorização no momento do envio**: quem pode disparar `engineStop` (perfil de usuário, não só "está logado") e
  se isso é checado de novo no instante do envio ou só na tela (um token de sessão antigo não deveria bastar para
  um comando que para um veículo em movimento).
- **Condições que impedem o bloqueio**, incluindo segurança operacional — ex.: não bloquear acima de uma velocidade
  mínima, mesmo que o operador peça, para não causar acidente (regra de produto, não de protocolo do Traccar).
- **Comando expirado localmente (`expira_em` passou) mas ainda pendente no Traccar**: a tabela marca `expirado` no
  nosso banco, mas isso não cancela nada no Traccar/aparelho — se o `commandResult` chegar depois do `expira_em`,
  o backend precisa decidir e registrar explicitamente o que fazer com uma execução tardia (ex.: logar como
  "executado após expiração local", nunca silenciar).
- **Comando substituído/cancelado não deve executar tarde**: se um operador pede `engineResume` logo depois de um
  `engineStop` que ainda não foi confirmado, o `engineStop` original não pode "ganhar" se chegar depois — precisa de
  uma regra de precedência por `rastreador_id` (o comando mais recente intencional vence; `comandos_pendente_uidx`
  já impede dois comandos do mesmo tipo simultâneos, mas não resolve dois tipos opostos em sequência rápida).
- **Timeout da aplicação ≠ cancelamento efetivo**: `status = 'expirado'` descreve só que o backend parou de esperar
  resposta — nunca apresentar isso ao usuário como "comando cancelado" ou "veículo liberado", porque não se sabe o
  que aconteceu no equipamento/Traccar depois do timeout (mesma lacuna da seção 1.4: confirmação de protocolo ≠
  confirmação física).

### 4.7 Compressão e retenção

- `posicoes`: igual à proposta já validada em `docs/ARQUITETURA-BACKEND.md` § 2.4 — compressão após 7 dias
  (`compress_segmentby = 'rastreador_id'`), retenção por plano do cliente via rotina própria (não
  `add_retention_policy` global), export para Parquet no plano de 5 anos.
- `eventos`: mesma política de compressão (seg. por `rastreador_id`); retenção mais longa por padrão (eventos
  pesam muito menos que posição por linha) — sugestão: reter por 24 meses mesmo no plano básico, revisar com o
  dono do produto.
- `ultima_posicao`: tabela normal, não hypertable (uma linha por rastreador, sempre pequena).
- `comandos`: tabela normal; volume baixo, sem necessidade de hypertable.

---

## 5. Contratos: endpoints de ingestão e tempo real

Tipos compartilhados em `packages/shared/src/traccarIngest.ts` (novo módulo — critério de
`docs/ARQUITETURA-BACKEND.md` § 0: puro, sem React/DOM, consumido pela API quando nascer e por qualquer teste do
front que precise do mesmo formato).

### 5.1 Endpoints de ingestão (recebem o Forwarding do Traccar)

```
POST /ingest/traccar/positions
POST /ingest/traccar/events
```

**Revisão de 23/10/2026 — durabilidade explícita, não assumida.** A primeira versão deste documento respondia
`202 Accepted` logo depois de empilhar no BullMQ, tratando "aceito na fila" como equivalente a "dado seguro". Uma
revisão técnica externa apontou, corretamente, que `appendfsync everysec` no Redis (a opção de AOF mais barata,
única mencionada em `docs/ARQUITETURA-BACKEND.md` § 4) ainda admite perda de até ~1 segundo de jobs numa queda do
processo, e isso não deveria ficar escondido atrás de um `202` que parece prometer mais do que entrega. A correção
aqui é separar as duas garantias:

- **Entrega rápida** (a fila) continua existindo para o trabalho derivado — cálculo de regras, publicação em tempo
  real, atualização de `ultima_posicao` — onde perder e reprocessar um job é barato e sem efeito colateral
  observável (o worker é idempotente via `ingest_posicoes_recebidas`/`ingest_eventos_recebidos`, seção 4.3/4.5).
- **Entrega durável** é um **inbox transacional no próprio Postgres da plataforma**, não o Redis: o endpoint grava
  o payload bruto recebido numa tabela (`ingest_inbox`, abaixo) **dentro de uma transação commitada antes de
  responder**, e só então enfileira no BullMQ o aviso "processar a linha X do inbox" (ou um worker varre o inbox
  por polling/`LISTEN`/`NOTIFY`, sem depender só da fila). O `202` passa a significar "está no mesmo banco que já
  tem backup com WAL archiving/PITR" (`docs/ARQUITETURA-BACKEND.md` § 5), não "está numa fila em memória com
  flush a cada segundo".

```sql
create table public.ingest_inbox (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('posicao', 'evento')),
  payload jsonb not null,
  recebido_em timestamptz not null default now(),
  tentativas integer not null default 0,
  lease_por text,                        -- identificador do worker/processo que reivindicou o lote
  lease_expira_em timestamptz,           -- até quando esse worker tem posse da linha
  processado_em timestamptz,
  erro text
);
create index on public.ingest_inbox (recebido_em) where processado_em is null;
```

**Protocolo de processamento — modelo de lease, não lock mantido durante o processamento** (correção de 23/10/2026,
terceira passada: a versão anterior misturava `FOR UPDATE SKIP LOCKED` com `travado_em`/`travado_por` de forma
incoerente — se o lock da transação de aquisição fica aberto durante todo o processamento, a transação vira longa
e trava `vacuum`/outras operações no meio de normalização, regras e chamadas externas; o modelo de lease resolve
isso separando "reivindicar" de "processar" em transações distintas):

1. **Reivindicação (transação curta)**: o worker roda, numa transação que dura só o tempo desse `update`,
   ```sql
   with lote as (
     select id from public.ingest_inbox
     where processado_em is null and (lease_expira_em is null or lease_expira_em < now())
     order by id for update skip locked limit 100
   )
   update public.ingest_inbox i set lease_por = $worker_id, lease_expira_em = now() + interval '2 minutes',
     tentativas = i.tentativas + 1
   from lote where i.id = lote.id
   returning i.id, i.tipo, i.payload;
   ```
   `for update skip locked` só protege essa reivindicação (milissegundos) — dois workers nunca reivindicam a mesma
   linha — e o `commit` acontece logo em seguida, **liberando o lock do Postgres antes de processar**.
2. **Processamento (fora de transação de banco)**: o worker normaliza, resolve instalação, grava em
   `posicoes`/`eventos` (suas próprias transações curtas, seção 4.3/4.5) usando o lote que já tem em mãos — sem
   segurar lock nenhum em `ingest_inbox` durante esse trabalho.
3. **Confirmação (transação curta)**: ao terminar, `update ingest_inbox set processado_em = now() where id = any($ids)`
   para sucesso, ou `update ... set erro = $msg where id = $id` (mantendo `processado_em` nulo) para falha — a linha
   com erro continua elegível para nova reivindicação assim que `lease_expira_em` passar, por qualquer worker, sem
   precisar que o mesmo worker volte.
4. **Recuperação de linhas abandonadas** é automática pela própria condição de reivindicação
   (`lease_expira_em is null or lease_expira_em < now()`) — se um worker morre no meio do processamento, a linha
   simplesmente fica com o lease vencido e qualquer worker (incluindo um novo, substituto) a reivindica nos
   próximos 2 minutos, sem precisar de um job de vigilância separado para "destravar" nada.
5. **Teto de tentativas**: acima de um limite (ex.: 10, contado em `tentativas`), a linha é excluída da
   reivindicação automática (condição adicional `and tentativas < 10` na query do passo 1) e cai numa fila de
   observação manual — não apaga, não processa para sempre em loop.
- **Limpeza/retenção**: `ingest_inbox` é **tabela relacional comum, não hypertable** (correção desta revisão — a
  primeira versão mencionava `add_retention_policy`, que só existe para hypertables do TimescaleDB). A limpeza é um
  job próprio (`delete from ingest_inbox where processado_em is not null and processado_em < now() - interval '3 days'`,
  rodando fora de horário de pico) — se o volume justificar, considerar particionamento nativo do Postgres
  (`partition by range (recebido_em)`) para tornar esse `delete` em massa mais barato (drop de partição em vez de
  delete linha a linha), mas isso só vale a pena depois de medir o volume real da POC.

- Rede: só acessíveis pela rede interna (mesma VPC/WireGuard entre VPS-APP e o Traccar — ambos já estão no
  VPS-APP segundo `docs/ARQUITETURA-BACKEND.md` § 7.2, então na prática é `localhost`/rede de containers, nem
  precisa sair da VPS).
- Autenticação: cabeçalho `X-Traccar-Ingest-Key: <segredo>`, configurado em `forward.header` (seção 1.1) e
  comparado contra uma variável de ambiente da API — 401 se ausente/errado, sem corpo de erro detalhado (não dar
  dica de formato esperado para quem tentar adivinhar a chave).
- Corpo: o mesmo JSON que o Traccar manda (`forward.type=json`, seção 1.1) — a API não exige um contrato
  "nosso", recebe o formato nativo do Traccar e normaliza internamente (menos acoplamento a uma transformação
  feita só para caber num contrato próprio; a normalização unidades/nomes acontece no worker, não no payload
  aceito).
- Resposta: `202 Accepted` **depois do commit no `ingest_inbox`** (não antes) — se o insert no Postgres falhar
  (banco fora do ar), o endpoint responde `503`, e o retry do próprio Traccar (`forward.retry.*`, seção 1.1) tenta
  de novo; isso é estritamente melhor do que confirmar e depois perder, porque devolve a responsabilidade de
  reentrega para quem já tem essa lógica pronta (o Traccar). `400` só se o corpo não for JSON válido ou faltar
  `position.deviceId`/`position.id`.
- **Alternativa mais simples, aceitável para a primeira versão em produção, desde que documentada como tal**:
  manter só BullMQ com AOF (`everysec`) na ingestão principal, sem o inbox, assumindo explicitamente esse nível de
  durabilidade e dependendo da conciliação periódica (seção 1.6) para fechar a lacuna rara de uma perda de fila.
  O que não é aceitável é apresentar essa opção internamente ou ao cliente como "garantia de não perder posição"
  sem ter testado o cenário de queda do Redis em staging. O inbox é a opção recomendada porque custa pouco (uma
  tabela a mais no banco que já existe) e fecha essa lacuna de verdade.

```ts
// packages/shared/src/traccarIngest.ts
export interface TraccarPositionPayload {
  position: {
    id: number; deviceId: number; protocol: string;
    serverTime: string; deviceTime: string; fixTime: string;
    valid: boolean; latitude: number; longitude: number;
    altitude: number; speed: number; course: number;
    attributes: Record<string, unknown>;
  };
  device?: { id: number; name: string; uniqueId: string };
}

export interface TraccarEventPayload {
  event: {
    id: number; type: string; deviceId: number; positionId?: number;
    serverTime: string; attributes: Record<string, unknown>;
  };
  device?: { id: number; name: string; uniqueId: string };
  position?: TraccarPositionPayload['position'];
}
```

### 5.2 Tempo real (API → front)

WebSocket próprio da API (não o WebSocket do Traccar — o front nunca fala com o Traccar, item 1 da proposta e
correção da seção 2.1 desta análise):

```ts
// packages/shared/src/realtime.ts
export type RealtimeMessage =
  | { kind: 'posicao'; clientId: string; assetId: string; rastreadorId: string;
      fixTime: string; lat: number; lon: number; speedKmh: number; ignition: boolean }
  | { kind: 'evento'; clientId: string; assetId: string; tipo: string; ts: string;
      attributes: Record<string, unknown> }
  | { kind: 'comando_status'; clientId: string; rastreadorId: string; comandoId: string;
      status: 'enviado' | 'aguardando' | 'confirmado' | 'falhou' | 'expirado' };
```

O worker publica em canais Redis pub/sub nomeados por cliente (`rt:cliente:<client_id>`).

**Correção desta revisão**: a primeira versão descrevia a API assinando um canal "por usuário conectado" — errado
quando várias conexões de usuários diferentes do mesmo cliente compartilham a mesma instância da API (caso comum:
dois gestores da mesma frota com o mapa aberto ao mesmo tempo). A assinatura ao Redis é **por tenant e por
instância da API** (uma assinatura de `rt:cliente:<client_id>` por instância, não por conexão WebSocket individual
— múltiplos usuários do mesmo cliente, na mesma instância, reaproveitam a mesma assinatura Redis); a autorização
de **cada usuário individual** para ver aquele cliente é checada na hora de aceitar a conexão WebSocket e checada
de novo se a permissão for revogada enquanto a conexão está aberta (um listener de evento de "permissão alterada"
que força o fechamento/reautenticação da conexão, não espera o usuário desconectar sozinho).

**Pub/sub não é histórico — protocolo de reconexão explícito** (Redis pub/sub não guarda mensagem para quem estava
desconectado, risco que a primeira versão parcialmente cobria):

**Correção de 23/10/2026 (segunda passada)**: a sequência original ("busca o snapshot, depois começa a receber
incrementais") tem uma condição de corrida real — uma atualização publicada **entre** o `SELECT` do snapshot e o
momento em que a assinatura ao canal Redis começa a valer pode não aparecer em nenhum dos dois caminhos. A ordem
certa é inverter: assinar primeiro, buscar o snapshot depois, e reconciliar usando o `fix_time` por rastreador (que
já serve como versão/sequência, sem precisar de uma coluna nova):

1. Ao conectar (ou reconectar), a API **assina primeiro** o canal Redis do tenant e começa a **enfileirar em
   memória** (buffer local da conexão) qualquer `RealtimeMessage` que chegar a partir desse instante, sem mandar
   nada ainda ao front.
2. Só então busca o **snapshot** — `SELECT * FROM ultima_posicao WHERE client_id = $1` (seção 4.4) — e manda ao
   front.
3. Dispara ao front o buffer acumulado no passo 1, **filtrando por `fixTime`**: para cada `rastreadorId`, só repassa
   mensagens de posição com `fixTime` mais recente que o `fix_time` que já veio no snapshot daquele rastreador
   (evita reaplicar algo mais antigo que o snapshot já contemplava). A partir daí, passa a repassar incrementais
   direto, sem buffer.
4. Se a conexão cair e reabrir, repete o processo do zero (assinar → snapshot → drenar buffer filtrado) — não tenta
   "continuar de onde parou" durante a janela de desconexão em si (pub/sub não tem replay), mas a reconexão em si
   não perde nada porque a assinatura cobre o momento exato da reconexão, antes do snapshot.
5. **Eventos e alertas (não só posição) não podem depender só do buffer de reconexão** — ao contrário da posição
   (onde o snapshot de `ultima_posicao` já é o estado atual e cobre a lacuna), um evento perdido na janela de
   desconexão não tem "estado atual" equivalente a reconsultar. Por isso, ao reconectar, a API também consulta
   `eventos` (seção 4.5) por `client_id` e `ts > última_leitura_confirmada_do_cliente` (um timestamp que o próprio
   front guarda e manda na reconexão) — a fonte de verdade para evento é sempre a tabela persistida, nunca só o
   pub/sub.

---

## 6. As três decisões em aberto — recomendação

### 6a. Janela de conciliação e retenção do Traccar

**Recomendação: 14 dias, não 7.** A proposta de 7 dias cobre atraso normal de rede/reconexão, mas o risco 8 (seção
3) mostra que a janela precisa cobrir também o pior caso de indisponibilidade do próprio backend (deploy com
problema, incidente de algumas horas) **mais** o intervalo até a conciliação rodar de novo. Com conciliação diária,
7 dias deixa pouca margem se um incidente de 2–3 dias coincidir com o fim da janela. 14 dias custa pouco a mais em
disco (posição crua é pequena por linha) e dobra a margem de segurança. Revisar depois da POC com números reais de
tamanho de linha × volume diário.

### 6b. Limite de horas para reprocessar lotes atrasados

**Recomendação revista nesta revisão: sem corte rígido — separar histórico factual (sempre reprocessável) de
indicadores fechados (versionados, não recalculados silenciosamente).**

A recomendação original (6 horas, depois disso a posição é gravada mas relatórios fechados não mudam) tinha um
problema real apontado na revisão externa: em rastreamento, um aparelho pode ficar **dias** sem comunicação (área
rural, pátio sem sinal, manutenção) e, se o produto promete que o histórico de posição é confiável, descartar o
recálculo de km/eventos daquele período por ter passado de 6 horas cria exatamente a divergência que o item 3 da
arquitetura original queria evitar — só que de forma permanente, não temporária: "a posição está lá, mas o
relatório daquele dia está errado para sempre" é pior do que "o relatório mudou uma vez, com aviso".

Modelo revisto:

- **Posição crua (`posicoes`) nunca tem corte** — todo lote atrasado é gravado, não importa a idade, sujeito só à
  janela de retenção/compressão (seção 4.7).
- **Indicadores por período** (km do dia, eventos por veículo, excessos, horas de motor — os continuous aggregates
  de `docs/ARQUITETURA-BACKEND.md` § 2.4) ganham um conceito de **fechamento versionado**: um indicador "fecha"
  N horas depois do fim do período (ex.: km de 23/10 fecha às 06:00 de 24/10), vira a versão 1 consultável pelos
  relatórios. Se um lote atrasado altera dados dentro desse período **depois** do fechamento, o job de
  reprocessamento gera uma **versão 2** do indicador daquele período (não sobrescreve a versão 1 silenciosamente)
  — relatórios/exports já gerados contra a versão 1 continuam reproduzíveis como estavam (auditoria, cobrança), e
  a tela do cliente mostra a versão mais recente com um indicador "recalculado em HH:MM, motivo: dados atrasados
  recebidos" quando houver divergência entre versões.
- Isso custa uma coluna de versão a mais nas tabelas de indicador fechado e um job de reprocessamento que sabe
  gerar nova versão em vez de só fazer `update` — mais trabalho de implementação que um corte fixo de horas, mas
  resolve o risco de verdade em vez de empurrá-lo para "o cliente nunca mais vai ver o número certo depois de 6
  horas".
- Janela prática para disparar reprocessamento automático (sem intervenção manual): ainda vale ter um limite —
  recomendo **72 horas** — depois do qual o reprocessamento de indicadores passa a ser sob demanda (alguém pede
  explicitamente, não roda sozinho toda vez que uma posição velha chega), para não gerar uma cadeia infinita de
  reprocessamento em cascata por um lote isolado muito atrasado. Isso é um limite operacional (custo de
  processamento), não uma linha que diz "depois disso o dado não conta mais" como a recomendação original.

### 6c. Guardar o pacote bruto por alguns dias

**Recomendação: sim, mas só o corpo do Forwarding (o JSON de `forward.type=json`), não o pacote binário do
protocolo original, e só por 3 dias.** O pacote bruto do protocolo (bytes do socket) já está fora do alcance do
backend — quem teria esse dado é o próprio Traccar/`tc_*`, não o Forwarding. O que o backend pode guardar
com custo e risco baixos é o payload HTTP que ele próprio recebeu (`TraccarPositionPayload`/`TraccarEventPayload`
cru, seção 5.1) numa tabela de auditoria de curtíssima retenção (`ingest_raw_log`, 3 dias, sem índice além de
`received_at`, truncada por `add_retention_policy` de verdade — aqui não há necessidade de retenção por cliente,
é só para diagnóstico de falha de parsing/normalização). Mitiga o risco 7 (dado sensível) ao limitar o escopo (só
o que já era o payload da posição/evento, nunca o socket) e o prazo.

**Nota de simplificação (se o inbox transacional da seção 5.1 for adotado)**: `ingest_inbox` já guarda o payload
bruto recebido. Nesse caso, não criar `ingest_raw_log` como tabela separada — o job de limpeza de 3 dias que a
seção 5.1 já define sobre `ingest_inbox` (tabela relacional comum, com `delete` periódico, não `add_retention_policy`
— essa é exclusiva de hypertable) cobre a mesma necessidade, evitando guardar o mesmo dado bruto duas vezes.

---

## 7. O que uma revisão técnica externa validou e o que mudou

Esta seção resume, para quem já tinha lido versões anteriores deste documento, o resultado de **duas rodadas** de
revisão técnica externa recebidas em 23/10/2026 — o que foi confirmado como correto, o que era bloqueador de
verdade (já corrigido nas seções acima) e o que ficou registrado como recomendação a decidir com o dono do
produto. A segunda rodada (7.2b/7.3b/7.5 abaixo) revisou a correção da primeira e encontrou inconsistências de
implementação nela — nenhuma delas tão grave quanto os bloqueadores originais, mas reais o suficiente para corrigir
antes de virar migration.

### 7.1 Direção geral confirmada

A revisão concorda com a separação entre Traccar (infraestrutura de comunicação com rastreadores) e a plataforma
proprietária (regra de negócio, dado oficial, interface) como a decisão mais importante do desenho, e endossa
manter: front isolado do Traccar (seção 2, conflito 1, já corrigido), histórico de instalação como fonte de
verdade por tempo (seção 4.2), TimescaleDB+PostGIS, última posição materializada (seção 4.4), conciliação
periódica (seção 1.6) e comandos auditáveis (seção 4.6). Também confirma que não vale introduzir Kubernetes nesta
fase — a complexidade operacional seria desproporcional ao estágio inicial do produto; a separação lógica de
responsabilidades (Traccar / API / worker de ingestão / worker de regras / Postgres / Redis, cada um compartilhando
a mesma VPS no início mas desenhado para separar depois) já é suficiente.

### 7.2 Correções incorporadas (bloqueadores)

| Problema apontado | Onde estava | Correção aplicada |
|---|---|---|
| `unique` sem a coluna de tempo em hypertable (migração falharia) | `posicoes`/`eventos`, seção 4 (versão original) | Dedup movida para tabelas relacionais `ingest_posicoes_recebidas`/`ingest_eventos_recebidos` (seção 4.3/4.5) |
| FK de `eventos.posicao_id` para `posicoes.id` (inválida: hypertable→hypertable, e `id` não é chave única isolada) | `eventos`, seção 4 (versão original) | Referência lógica sem FK (seção 4.5) — ver 7.2b, a primeira tentativa de correção também tinha um problema |
| `202` logo após enfileirar no Redis, sem distinguir entrega rápida de durabilidade | Ingestão, seção 5.1 (versão original) | Inbox transacional no Postgres antes do `202`; fila só para trabalho derivado idempotente (seção 5.1) |
| `rastreadores.client_id` fixo (rastreador não muda de dono para sempre) | Modelo de dados, seção 4.1 (versão original) | `rastreadores` vira identidade física sem `client_id`; dono é sempre resolvido via `instalacoes` (seção 4.1) |

### 7.3 Correções incorporadas (altas, não bloqueadoras)

- Quarentena automática trocada por cadastro-oficial-primeiro (seção 1.5) — elimina a superfície de abuso em vez de
  só mitigá-la.
- Nomes de chave do Forwarding corrigidos (`forward.type`, `forward.retry.enable`/`.delay`/`.count`,
  `event.forward.url` separado) — seção 1.1; marcado como ainda não validado contra instância real.
- Reprocessamento de atrasados: corte rígido de 6h substituído por versionamento de indicador fechado — seção 6b.
- Tempo real: assinatura Redis por tenant+instância (não por usuário), e protocolo de reconexão com snapshot —
  seção 5.2.

### 7.4 Dimensionamento (fora do escopo desta análise, registrado para referência)

A revisão estimou ~2,3 milhões de posições/dia e ~27 posições/segundo em média para 800 veículos (hipótese de 1
posição a cada 30s, 24h/dia) — ordem de grandeza compatível com os números que `docs/ARQUITETURA-BACKEND.md` § 2.2
já usa para 600–2.000 veículos (1,7 a 8,6 milhões de linhas/dia). É estimativa matemática, não benchmark: rajadas de
reconexão, pacotes CAN e frequência maior em movimento alteram a carga real — por isso a POC com o GT06 real
(`docs/ARQUITETURA-BACKEND.md` § 8, item 2) continua sendo o passo que confirma os números antes de fechar chunk
size, política de compressão e dimensionamento de VPS; esta análise não recalcula esses números, só registra que a
ordem de grandeza já estimada é consistente com uma segunda fonte independente.

### 7.2b Segunda rodada — correções na implementação da primeira correção

A primeira correção (7.2) resolveu os erros de SQL que impediam a migração de rodar, mas introduziu três
inconsistências próprias, apontadas numa segunda rodada de revisão:

| Problema apontado | Onde estava | Correção aplicada |
|---|---|---|
| `ingest_posicoes_recebidas.posicao_id`/`ingest_eventos_recebidos.evento_id` declarados `not null`, mas preenchidos só depois do primeiro insert (contradição) | Seção 4.3/4.5 (primeira correção) | Colunas viram nullable; commit da transação só depois do `update` que as preenche (seção 4.3) |
| Referência evento→posição por `(posicao_rastreador_id, posicao_fix_time)` não identifica uma posição sem ambiguidade (dois pacotes podem ter o mesmo `fix_time`) | Seção 4.5 (primeira correção) | Referência simplificada para só `posicao_id` (valor de `id`, globalmente único mesmo fora da PK composta) |
| Tabelas de dedup (`ingest_*_recebidos`) sem política de retenção — cresceriam para sempre (~69 milhões de linhas/30 dias com 800 rastreadores) | Seção 4.3 (primeira correção, omissão) | Job de limpeza amarrado à janela de conciliação + margem (seção 4.3) |

### 7.3b Segunda rodada — correções de modelagem e processo

- **Instalações**: faltava impedir (ou decidir) duas instalações vigentes no mesmo veículo — corrigido com `papel`
  (`principal`/`secundario`/`can`) e exclusão de sobreposição por `(asset_id, papel)` além da já existente por
  `rastreador_id`; adicionado `check (desinstalado_em > instalado_em)`; registrada a necessidade de teste
  específico para `client_id` de instalação vs. dono do ativo no período (seção 4.2).
- **RLS com ressalva**: RLS protege contra consultar fora do `client_id`, não contra o dado já ter sido classificado
  errado na origem — ressalva adicionada na seção 4.3, com a lista de cenários que precisam de teste de integração
  dedicado (troca de rastreador entre clientes, correção retroativa, posição antes da instalação, transferência de
  veículo).
- **Inbox sem protocolo de disputa**: a tabela existia, mas não como vários workers adquirem, tentam de novo e
  recuperam linhas abandonadas — adicionado `for update skip locked`, contador de tentativas e job de liberação de
  linhas travadas (seção 5.1). Corrigida também a menção equivocada a `add_retention_policy` sobre `ingest_inbox`
  (tabela relacional comum, não hypertable) — vira `delete` periódico.
- **`ultima_posicao` sozinha não representa saúde do equipamento**: um rastreador pode seguir transmitindo sem
  coordenada válida, e uma troca de instalação deveria refletir no dono do rastreador sem esperar posição nova —
  separado em `ultima_posicao` (localização) e `rastreador_comunicacao` (saúde/vínculo atual) na seção 4.4.
- **Condição de corrida no snapshot de reconexão**: a ordem "snapshot primeiro, incrementais depois" podia perder
  uma atualização publicada entre os dois passos — invertida para "assinar primeiro, bufferizar, snapshot depois,
  drenar buffer filtrado por `fixTime`" (seção 5.2); eventos ganharam reconciliação própria contra a tabela
  persistida, não só o pub/sub.
- **Chave de Forwarding adicional**: `forward.retry.limit` (limite de entregas pendentes simultâneas) acrescentada
  à tabela da seção 1.1, confirmada contra a documentação atual do Traccar.

### 7.5 Critérios de aprovação da POC integrada (antes de produção)

A segunda rodada recomenda encerrar revisão puramente conceitual e validar por execução, numa POC em homologação
com Traccar + NestJS + Postgres integrados, enviando posições de simulador (`docs/GUIA-TRACCAR.md` § 8.1) e dos
equipamentos de teste já usados, com interrupções propositais de serviço. Critérios de aprovação:

- Nenhuma posição/evento duplicado depois de reentrega forçada (desligar e religar o Traccar no meio de uma rajada).
- Nenhuma posição associada ao `client_id`/`asset_id` errado nos cenários de troca de instalação listados na
  seção 4.2.
- Recuperação completa depois de derrubar o worker de ingestão no meio do processamento de um lote (linhas do
  inbox voltam a ser processadas, nenhuma fica travada para sempre).
- Recuperação completa depois de derrubar o Redis (posições continuam chegando ao banco via inbox; tempo real
  recupera via snapshot ao reconectar).
- Reprocessamento de um lote de posições atrasado (> janela de fechamento) gera nova versão do indicador fechado
  sem apagar a versão anterior.
- Comandos passam pelos estados auditáveis completos (`solicitado` → `enviado` → `aguardando`/`confirmado`/
  `falhou`/`expirado`), incluindo o caso de timeout sem `commandResult`.

Isso é o próximo passo de execução, não mais uma revisão de desenho — o documento, a partir daqui, deveria evoluir
junto com os resultados da POC, não com mais rodadas de análise só de leitura.

### 7.6 Terceira rodada — último ajuste fino antes do congelamento

Uma terceira revisão técnica (23/10/2026) encontrou cinco pontos pontuais na implementação da segunda correção —
nenhum deles bloqueador de SQL como as duas primeiras rodadas, mas reais o suficiente para corrigir antes de gerar
migration: (1) `position.id` como chave de dedup é **premissa não verificada** — há relato de `position.id = 0` no
forwarding do Traccar em certas condições; registrado como decisão pendente de teste, com plano B definido, na
seção 1.1; (2) o modelo de lock do inbox (`FOR UPDATE SKIP LOCKED` + timeout) foi incoerente — trocado por lease
explícito com reivindicação em transação curta, seção 5.1; (3) troca de instalação podia fazer o mapa herdar a
localização do veículo anterior — corrigido com a regra "`fix_time` >= início da instalação vigente" e a view
`v_localizacao_atual`, seção 4.4; (4) comandos que mudam estado físico do veículo precisam de uma especificação de
segurança própria (autorização no envio, condições que impedem bloqueio, execução tardia, precedência entre
comandos opostos) — registrado como pendente na seção 4.6, fora do escopo deste documento de integração; (5) a
garantia de deduplicação foi reenquadrada de "exatamente-uma-vez" para "idempotente dentro de uma janela definida",
e a chave `forward.retry.limit` (default 100 pendentes/10 tentativas, segundo a documentação do Traccar) marcada
como parâmetro a decidir na POC, não aceita por default.

**Congelamento**: esta terceira revisão recomendou explicitamente parar de expandir este documento e avançar para
o detalhamento de motor de regras, telemetria CAN, auditoria e multi-tenancy operacional — e esta análise concorda.
As decisões arquiteturais das seções 1–6 ficam **congeladas** a partir desta versão (23/10/2026): revisões
futuras devem vir da POC (seção 7.5) rodando de verdade, não de mais leitura sobre o mesmo desenho. As únicas
exceções abertas e explicitamente marcadas como tal são as decisões pendentes de teste já citadas acima (chave de
dedup de `position.id`, valores de `forward.retry.*`) e as validações de contrato real (seção 1.1) — tudo o mais
aqui é a especificação a implementar, não a revisar de novo.

---

## 8. Atualizações feitas em outros documentos

- `docs/ARQUITETURA-BACKEND.md`: adicionada referência cruzada a este documento nas seções 4 (ingestão) e 2
  (modelo de dados), marcando o desenho de `positions` da seção 2.2 como superado pela seção 4 deste documento.
- `docs/PLANO-ADAPTADOR-TRACCAR.md`: nota de topo e trechos que descreviam o front consumindo o Traccar
  diretamente (linhas 28, 37, 49 da versão anterior) corrigidos para deixar explícito que, na versão produção, é
  sempre o backend NestJS quem fala com o Traccar — o mapeamento função-a-função continua válido como "o que o
  Traccar oferece no lugar de cada chamada antiga", só o "quem chama" muda.
