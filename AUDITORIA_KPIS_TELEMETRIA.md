# Auditoria de KPIs e Telemetria — Localle DNA

Data: 31/10/2026 · Branch `dev` (HEAD `869b23c`) · Ambiente: local (docker: `localle-dev-api`, `localle-dev-web`,
`traccar`, `plataforma-db`, `fila-redis`). Nenhum código da aplicação foi alterado; nenhuma escrita foi feita no banco
pela auditoria (consultas com `default_transaction_read_only=on`). A suíte de testes do repositório foi executada (ela
cria e limpa os próprios fixtures); as contagens do banco foram conferidas antes e depois e não mudaram (1 cliente,
4 ativos, 272 posições, 4 `ultima_posicao`).

Legenda de evidência usada em todo o documento:

- **[REAL]** observado em execução contra o ambiente local (Traccar, banco, API).
- **[SIM]** cenário controlado: fixture sintética passada às funções **reais** do código (bundle com esbuild, script
  em scratch, fora do repositório). Prova o comportamento do código, não a frequência em produção.
- **[TESTE]** coberto por teste automatizado do repositório que passou nesta execução.
- **[ESTÁTICO]** confirmado por leitura do código ou da definição no banco, sem reprodução.
- **[SUSPEITA]** hipótese com base no código e ainda não confirmada.

---

## A. Resumo executivo

**Hoje os indicadores do Monitoramento não são confiáveis para operar.** O motivo não é cálculo de backend errado. A
API e o banco estão coerentes entre si, e os relatórios de percurso batem com um recálculo independente em SQL. Os
problemas estão em três pontos:

1. **Perda de posições na entrada [REAL].** Quando o Forwarding do Traccar envia uma posição com `id = 0`, a API
   responde 503 e conta com o reenvio do Traccar. No ambiente local o reenvio falha dentro do próprio Traccar
   (`NullPointerException: device is null`). As posições 19 e 20 estão gravadas no Traccar e não chegaram à
   plataforma. Como o polling está desligado, nada reconcilia essa diferença.
2. **O status dos veículos no front diverge do status do backend [SIM + ESTÁTICO].**
   - O tile "Sem sinal" soma veículos **online** com ignição desligada ou sem atributo de ignição.
   - O status de comunicação só é lido no login e não é recalculado depois.
   - O front usa um limite fixo de 6 h sobre `fixTime` e ignora o limite configurado pelo cliente (0,5–72 h).
   - Um veículo que parou de transmitir a 60 km/h continua "Em movimento" por até 6 h.
3. **Valores fictícios apresentados como reais [ESTÁTICO + SIM].** No painel do veículo, Bateria "12,6 V", GPS
   "0 satélites", GSM "0/5", Bloqueio "Livre" e Odômetro "0" são valores padrão do front: a API não envia nenhum
   desses dados. O odômetro 0 ainda é gravado diariamente como leitura "rastreador", que alimenta a manutenção.

Também há KPIs calculados só com o que o navegador recebeu ("Percurso hoje", "Rodou hoje", gráfico
"Movimentação"), um cálculo de tempo de motor e de movimento que infla com lacunas de transmissão, e um histórico
truncado em 10.000 pontos sem aviso.

**O que está correto e foi verificado:**

- Dedup da ingestão por `(rastreador_id, traccar_position_id)` [REAL: 0 duplicatas; TESTE].
- `ultima_posicao` protegida contra posição atrasada [ESTÁTICO + TESTE].
- Descarte de posição fora de ordem no SSE [SIM].
- Conversão de nós para km/h [ESTÁTICO + TESTE].
- Isolamento por `client_id` em todas as consultas de cliente [ESTÁTICO + TESTE].
- `/reports/percurso`: distância e horas de motor batem com SQL independente [REAL].

**Diferenças entre o stack descrito no pedido e o stack real.** Não existem Prisma, ts-rest, Zod nem TanStack Query
neste repositório. O stack real é:

- Backend: NestJS + `pg` + `node-pg-migrate`, com validação manual em `dto/*.ts`.
- Front: Zustand persistido em `localStorage` + `fetch` + SSE.

As seções sobre "invalidação do TanStack Query" foram auditadas no equivalente real, ou seja, a sincronização do
store.

---

## 1. Mapa do fluxo real

```
Aparelho ──TCP──▶ Traccar (porta por protocolo; grava na base própria)
   │
   ├─(A) Forwarding JSON  POST /ingest/traccar/positions|events   [ATIVO: TRACCAR_POLL_ENABLED=false]
   │       traccar-ingest.controller.ts: chave X-Traccar-Ingest-Key → valida → id=0 ⇒ 503 (espera reenvio)
   │       → insert ingest_inbox (202)
   │       inbox.worker.ts (lease, 1 s, lote 100, até 10 tentativas, backoff 30 s × n)
   │
   └─(B) Polling GET /api/positions a cada 30 s (positions-poller.service.ts) → BullMQ → positions.worker.ts
           [DESLIGADO no ambiente local; só traz a ÚLTIMA posição de cada device]
                     │
                     ▼
   PositionsIngestService.ingest (1 transação por posição)
     rastreador por traccar_device_id → reserva ingest_posicoes_recebidas (dedup)
     → resolverInstalacaoVigente(fixTime) → insert posicoes
     → upsert rastreador_comunicacao (ultimo_pacote_em = now(); ultima_posicao_valida_em = greatest)
     → upsert ultima_posicao só se valid e fix_time maior
     → alarmes → eventos; cercas; regras (só se atualizou a última posição) → alertas
     → commit → RealtimeHub.publish (Redis pub/sub)
                     │
                     ▼
   API: GET /monitoring/current  (assets ⨝ v_localizacao_atual ⨝ instalacoes ⨝ rastreador_comunicacao
                                  + statusComunicacao(limite do cliente))
        GET /monitoring/stream   (SSE: snapshot de posições + eventos desde `since` + ao vivo)
        GET /monitoring/assets/:id/history (limit 10000) · GET /monitoring/events (limit 5000)
        GET /reports/percurso|velocidade|cercas|passou-por-aqui (packages/shared sobre posicoes)
        GET /reports/km|paradas|excesso-velocidade (sem consumidor no front)
        GET /superadmin/visao-geral|saude (agregados da plataforma)
                     │
                     ▼
   Front: useLocalleSync (Layout.tsx) → syncFrota() UMA vez no login → runStream() (SSE, reconexão
          1/3/10/30 s; na reconexão só ressincroniza alertas e comandos)
          localleMap.toVehicle/applyPosicao → store Zustand (persistido em localStorage, gravação a cada 10 s)
          store.vehicleStatus() → Monitoramento (tiles, lista, mapa, painel do veículo)
          useRelatorioApi → telas de Relatórios; fetchLiveRoute → Replay
```

Pontos de falha identificados por etapa. Os detalhes estão na seção E.

| Etapa | Falha | ID |
|---|---|---|
| Traccar → Forwarding | `id=0` recusado; o reenvio do Traccar falha; sem reconciliação | AUD-01 |
| Validação | `fixTime` futuro de até +366 dias é aceito e congela `ultima_posicao` | AUD-10 |
| Ingestão → comunicação | `ultimo_pacote_em = now()` da ingestão, não o horário do aparelho | AUD-11 |
| View de localização | sem filtro de `papel`, um ativo pode aparecer duplicado | AUD-09 |
| API → front | status de comunicação lido só no login | AUD-03 |
| Front | KPI "Sem sinal" soma "Desligado"; sensores fictícios; KPIs calculados só com o histórico local | AUD-02, 04, 07 |

Fila (BullMQ) e polling existem, mas só são usados no caminho (B), que está desligado. Tempo real: Redis pub/sub
→ SSE. O front não faz polling da frota.

---

## B. Inventário de telas, KPIs e gráficos

| Tela | Componente | Fonte dos dados | Validação | Resultado |
|---|---|---|---|---|
| Monitoramento | Tile "Veículos rastreados" | store `assets` com `tracker` (de `/monitoring/current`, nunca podado) | ESTÁTICO + REAL (API = 4) | ⚠ ativos que saem da API ficam no store (AUD-14) |
| Monitoramento | Tile "Em movimento" | `vehicleStatus` = `speed > 3` e sem `noSignal` e `lastUpdate` < 6 h | SIM | ✗ mostra veículo que parou de transmitir (AUD-03) |
| Monitoramento | Tile "Parados" | `vehicleStatus` "par" (só com ignição ligada) | SIM | ✗ parados com ignição desligada vão para "Sem sinal" (AUD-02) |
| Monitoramento | Tile "Sem sinal" | `counts.sem + counts.des` | SIM | ✗ **soma "Desligado" (online)** (AUD-02) |
| Monitoramento | Tile "Percurso hoje" | haversine sobre `history` local (máx. 120 pontos/veículo) | ESTÁTICO | ✗ não é o percurso do dia (AUD-07) |
| Monitoramento | Tile "Velocidade média" | média das velocidades instantâneas com `speed > 2` | ESTÁTICO | ⚠ nome engana; limiar 2 ≠ 3 (AUD-15/16) |
| Monitoramento | Gráfico "Movimentação" (StackedColumns, 8 faixas de 9 h) | conta **amostras** do `history` local, `p[3] > 2` | ESTÁTICO | ✗ conta pontos, não veículos nem tempo; incompleto (AUD-07) |
| Monitoramento | "Últimos eventos" | `alerts` do store (`/alertas` + SSE) | ESTÁTICO | ✓ |
| Monitoramento | Lista/mapa: velocidade, ignição, horário | `toVehicle`/`applyPosicao` | SIM | ⚠ ignição `null` vira "Desligada" (AUD-06) |
| Monitoramento | Painel do veículo: Bateria, GPS, GSM, Bloqueio, Odômetro/Horímetro | padrões de `toVehicle` (12,6 / 0 / 0 / false / 0) | SIM + ESTÁTICO | ✗ **valores fictícios** (AUD-04/05) |
| Monitoramento | Painel do veículo: "Rodou hoje" | `history` local | ESTÁTICO | ✗ (AUD-07) |
| Replay | Distância, Tempo em movimento, Paradas, Vel. máx., Eventos | `/monitoring/assets/:id/history` (limit 10000) + `routeStats`; `/monitoring/events` | ESTÁTICO + SIM | ✗ truncado sem aviso (AUD-12); lacunas inflam tempo (AUD-08); erro de eventos vira "0" (AUD-17) |
| Relatórios › Uso da frota | Km, em movimento, motor ligado, ocioso, paradas, vel. máx. | `/reports/percurso` | REAL (API × SQL) + SIM | ✓ na amostra; ✗ lacunas e ignição nula (AUD-06/08) |
| Relatórios › Posições | resumo do percurso | `/reports/percurso` | igual ao anterior | igual ao anterior |
| Relatórios › Velocidade | trechos acima de `minSpeed` | `/reports/velocidade` (`speedLegs`) | ESTÁTICO + TESTE | ⚠ definição diferente de `/reports/excesso-velocidade` (AUD-20) |
| Relatórios › Cercas / Passou por aqui | passagens | `/reports/cercas`, `/reports/passou-por-aqui` | ESTÁTICO + TESTE (`fenceStats`, `nearbyStats`) | ✓ estático |
| Saúde (superadmin) | Comunicando agora (≤ 10 min), Últimas 24 h, Sem sinal > 24 h, Fila, Inbox, Banco, Posições 24 h | `/superadmin/saude` | ESTÁTICO + REAL (inbox = 0 pendentes) | ⚠ inclui instalações secundárias e pacote anterior à instalação (AUD-21); **o inbox não mostra as perdas de AUD-01** |
| Visão geral Locale | Receita, Veículos ativos, Margem, Clientes, Donut, custos | `/superadmin/visao-geral` + constantes `CHIP_COST`/`INFRA_COST` | ESTÁTICO | ⚠ custos constantes, rotulados "estimados" (AUD-23) |
| Faturamento | Receita prevista, Apurado, Recebido, Em atraso | `/superadmin/faturamento` | não auditado em profundidade | — |
| Ativos | Ativos, Vinculados, Sem rastreador, Documentos | store | ESTÁTICO | ⚠ AUD-14 |
| Rastreadores | Instalados, Em estoque, Desativados, Chips livres | `/rastreadores`, `/superadmin/rastreadores` | ESTÁTICO | ⚠ `rastreadores.status` fica "cadastrado" mesmo transmitindo [REAL] (AUD-24) |
| Manutenção / BIManut | Vencidas, Próximas, Custo/km, MTBF, MKBF, Disponibilidade | store (`localleModulos`) + `assetKm` | ESTÁTICO | ✗ km "rastreador" = 0 (AUD-05) |
| Combustível, Multas, Jornada, Checklist, Ranking, Pneus, Viagens | KPIs e PeriodCompare de cada módulo | `localleModulos.ts` (API), exceto Pneus (local) | **não validado** | fora da telemetria; sem verificação de cálculo |
| Revenda | Acessos, Prévia da fatura | `platform.demoBilling` + `accessLog` (locais) | ESTÁTICO | ⚠ dado local; tela aparentemente inacessível (login só gera `gestor`/`locale`) |
| Design / DesignSections | gráficos de amostra | dados de exemplo | — | catálogo de componentes, não é tela de produto |

---

## C. Matriz de conciliação dos indicadores

Momento da medição: 31/10/2026 19:22 (-03). Dados locais: 4 ativos e 272 posições, todas de 28/10. Os quatro
rastreadores instalados (`traccar_device_id` 992132, 992796, 997400, 997560) **não existem no Traccar local**. Os
dados deles entraram por injeção ou seed no inbox, não pelo Traccar.

O front **não foi observado em navegador**: a preferência registrada do usuário é não usar automação de navegador
nesta máquina. A coluna "Frontend" traz o valor que o código produz para os dados que a API retornou, obtido com as
funções reais (`toVehicle` + `vehicleStatus`).

| Indicador | Esperado (fonte primária) | API | Frontend (derivado do código) | Divergência | Evidência |
|---|---|---|---|---|---|
| Veículos rastreados | 4 (SQL: ativos `ativo` com instalação vigente) | 4 linhas `/monitoring/current` | 4 | não | REAL + ESTÁTICO |
| Comunicação (os 4) | sem sinal: último pacote há ~3 dias > limite de 6 h | `sem_sinal` × 4 | "Sem sinal" × 4 | não neste instante | REAL |
| Em movimento | 0 | — (não há KPI na API) | 0 | não | REAL + SIM |
| Sem sinal | 4 | 4 `sem_sinal` | 4 | não **neste dado**; com veículo online e ignição desligada a divergência aparece (S1/S2) | SIM |
| Último pacote de PEB7J10 | horário do aparelho: última posição com `fix_time` 05:59 | `ultimoPacoteEm` 15:02:41 (horário em que a ingestão processou) | — | **sim** | REAL (AUD-11) |
| Distância 28/10 ABC1D23 | 7,006 km (PostGIS `st_distance` geográfico) | 7,034 km | não observado | 0,4% (haversine esférico × elipsoide), aceitável | REAL |
| Distância 28/10 PEB7J10 / QYX5B88 / RCF2E45 | 2,471 / 4,126 / 2,487 km | 2,481 / 4,127 / 2,485 km | não observado | ≤ 0,4% | REAL |
| Motor ligado 28/10 (h) | 0,992 / 0,950 / 0,556 / 0,717 (SQL com `lag`) | 0,992 / 0,950 / 0,556 / 0,717 | não observado | não | REAL |
| Vel. máxima 28/10 QYX5B88 | 44,0 | 43,99999999999999 | arredondado na tela | só formatação | REAL (AUD-22) |
| `/reports/km` ABC1D23 | sem odômetro nas posições (0 de 140) | `distanciaKm: null`, `amostras: 140` | sem consumidor | não (null correto) | REAL |
| `/reports/paradas` ABC1D23 | 1 parada de 9,5 min (≤ 2 km/h) | 1 episódio de 9,5 min | sem consumidor | não | REAL |
| Percurso hoje | 0 km (nenhuma posição em 31/10) | não existe endpoint | soma do `history` do navegador | indeterminado (depende do navegador) | ESTÁTICO (AUD-07) |
| Duplicatas de posição | 0 | — | — | não | REAL (SQL) |

---

## D. Matriz de conciliação da telemetria (Traccar × banco × API)

| Device Traccar | Posição Traccar (id, fixTime UTC, válida, velocidade, ignição) | `ingest_inbox` | `posicoes` | `/monitoring/current` | Divergência |
|---|---|---|---|---|---|
| 13 | id 19 · 22:08:11.000Z · válida · 22,68 nós · **sem atributo de ignição** | **ausente** (última linha do inbox é de 28/10) | **ausente** | (rastreador sem instalação) | **perdida**: 503 por `id=0` e reenvio quebrado (AUD-01) |
| 14 | id 20 · 22:08:11.218Z · válida · 22,68 nós · ignição true | **ausente** | **ausente** | (sem instalação) | **perdida** (AUD-01) |
| 15 | sem posição (`positionId 0`) | — | — | — | — |
| 992132 / 992796 / 997400 / 997560 | **não existem no Traccar local** | 272 linhas de 28/10, processadas, 0 erros | 272 (49/140/20/63), 0 inválidas, 0 duplicadas, 0 sem dono | 4 linhas, todas `sem_sinal` | não conciliável com o Traccar (dado injetado) |

Logs que sustentam AUD-01:

- API, 22:08:14Z: `Forwarding: 1 envio(s) sem id adiado(s) com 503 ... traccar_device_id 13`. O resumo é emitido a
  cada 10 min, então o segundo envio adiado entrou na contagem sem gerar nova linha.
- Traccar, `tracker-server.log`, 19:08:14 e 19:08:16 (-03):
  `Position forwarding failed: 1 pending - HTTP code 503`, seguido de
  `An exception was thrown by TimerTask. - Cannot invoke "org.traccar.model.Device.getAttributes()" because "device" is null - NullPointerException (... PositionForwarderJson:53 ...)`.
- Cerca de 20 min depois, `posicoes` ainda tinha 0 linhas com `traccar_position_id in (19, 20)` desses devices.

---

## E. Problemas encontrados

### P0 — Crítico

#### AUD-01 — Posições perdidas no Forwarding (`id = 0` → 503 → reenvio do Traccar falha) · CONFIRMADO NO LOCAL [REAL]; FREQUÊNCIA EM HML NÃO MEDIDA

> **Ressalva (31/10, após revisão com o usuário):** a falha do reenvio (NPE no Traccar) foi observada só no
> ambiente local. Os devices 13 e 14 tinham sido provisionados um minuto antes das posições, então pode ser
> efeito do estado da instância local. O que independe do ambiente é a dependência total do reenvio:
> - a API recebeu a posição (log do 503), então não foi problema de rede;
> - se o reenvio falhar por qualquer motivo, nada recupera a posição, porque o polling está desligado e não há
>   reconciliação.
>
> A gravidade P0 vale como **risco** até medir na HML: contar as posições por device no Traccar e em `posicoes`
> na mesma janela, só leitura. O comentário do controller registra 2 perdas em 135 na HML.
- **Onde:** `apps/api/src/ingest/traccar-ingest.controller.ts:41-72` (`adiarSemId`).
  `apps/api/src/ingest/positions-poller.service.ts` (polling desligado por `TRACCAR_POLL_ENABLED=false`).
  `infra/traccar/conf/traccar.xml:23-26`.
- **Causa:** o Traccar 6 dispara o forward antes de gravar a posição, por isso a primeira tentativa chega com
  `id = 0`. A API responde 503 e conta com o reenvio. O reenvio do Traccar estoura `NullPointerException` em
  `PositionForwarderJson:53` (device nulo na TimerTask de retry) e a posição nunca é reenviada. Não há
  reconciliação: o polling, quando ligado, só lê `GET /api/positions`, que traz apenas a última posição de cada
  device. O comentário do próprio controller registra que, na HML, 133 de 135 posições entraram pelo reenvio, ou
  seja, 2 se perderam lá também.
- **Esperado:** posições 19 e 20 em `posicoes`.
- **Observado:** ausentes no inbox e em `posicoes`. Nenhum alarme na tela de Saúde, porque o inbox mostra 0
  pendentes e 0 erros.
- **Impacto:** percurso, distância, cercas, regras e alertas calculados sem essas posições. A última posição exibida
  pode ser antiga. Alarmes (SOS, corte de alimentação) que vêm dentro da posição também se perdem.
- **Reprodução:** provisionar um rastreador (cria device no Traccar) → aparelho envia a primeira posição → conferir
  `tracker-server.log` (503 + NPE) e `select ... from posicoes where traccar_position_id = <id>`.
- **Correção recomendada:**
  1. Job de reconciliação por device. Para cada `rastreadores.traccar_device_id` ativo, ler
     `GET /api/positions?deviceId=&from=&to=` desde o último `fix_time` conhecido, com sobreposição de margem, e
     enfileirar no mesmo `PositionsIngestService`. O dedup por `(rastreador_id, traccar_position_id)` já torna isso
     idempotente.
  2. Métrica na tela de Saúde: posições no Traccar × posições na plataforma por janela.
  3. Investigar o NPE do Traccar (versão, cache de devices após criar o device pela API). Pode exigir reiniciar ou
     atualizar o Traccar.
- **Teste de regressão:** teste de integração do job de reconciliação (Traccar falso devolvendo posições já
  ingeridas e novas → só as novas são gravadas, nenhuma duplicada). Teste do controller garantindo que `id=0`
  registra a pendência de forma rastreável.

#### AUD-02 — Tile "Sem sinal" soma veículos online com ignição desligada · CONFIRMADO [SIM + ESTÁTICO]

> **Corrigido em 31/10 (sem commit):** um tile por status do PRODUCT.md (Em movimento, Parado ligado, Desligado,
> Sem sinal), via `contarStatusFrota`. Ignição não informada continua em Desligado, com o rótulo "Não informada".
> Rastreador sem posição continua em Sem sinal, com o rótulo "Aguardando 1ª posição". Teste em
> `apps/web/src/lib/statusFrota.test.ts`.
- **Onde:** `apps/web/src/pages/Monitoramento.tsx:176`
  (`value={(counts.sem || 0) + (counts.des || 0)}`) e `apps/web/src/lib/store.ts` (`vehicleStatus`: "des" =
  "Desligado").
- **Esperado:** veículo transmitindo e estacionado conta como online/parado.
- **Observado [SIM]:**
  - S1 (online, parado, ignição false): status `des`, entra no tile "Sem sinal".
  - S2 (online, sem atributo de ignição): idem.
  - "Parados" só conta quem está com ignição ligada (`par`).
- **Impacto:** em frota real, a maioria dos veículos estacionados de motor desligado aparece como "Sem sinal". O KPI
  principal da tela fica inflado, e "Parados" fica subcontado. Também afeta aparelhos que não reportam ignição (a
  posição 19 do device 13 não tem o atributo [REAL]).
- **Correção:** separar dois eixos.
  - Conectividade, vinda do backend: `online` / `sem_gps` / `sem_sinal` / `aguardando`.
  - Movimento: em movimento / parado ligado / parado desligado / ignição desconhecida.
  - Os tiles devem usar categorias mutuamente exclusivas e explícitas, por exemplo "Parados" =
    `par + des + ignição desconhecida`, com "Sem sinal" vindo só da comunicação.
- **Teste:** teste de unidade da contagem dos tiles com os cenários S1–S6 (hoje não existe teste para
  `vehicleStatus` nem para as contagens).

#### AUD-03 — Status de comunicação não é atualizado após a carga inicial; o front usa limite fixo de 6 h · CONFIRMADO [SIM + ESTÁTICO]

> **Corrigido em 31/10 (sem commit):**
> - `ComunicacaoTicker` (apps/api/src/realtime) recalcula a comunicação a cada 60 s, só para clientes com stream
>   aberto na instância, e entrega uma mensagem `kind: 'comunicacao'` pelo SSE.
> - O front aplica essa mensagem e ignora item mais velho que a posição já exibida.
> - O limite do cliente substitui as 6 h fixas.
> - A frota é relida na reconexão do SSE.
>
> Testes: `comunicacao-ticker.e2e.spec.ts` e `statusFrota.test.ts`. Fica em aberto o limite por grupo (AUD-13).
- **Onde:**
  - `apps/web/src/lib/localleApi.ts:454-470`: `syncFrota` roda só no login, ao instalar e ao desinstalar. Na
    reconexão do SSE são chamados apenas `syncAlertas` e `syncComandos`.
  - `apps/api/src/realtime/realtime-stream.service.ts`: o snapshot não traz `comunicacao`.
  - `apps/web/src/lib/store.ts`, `vehicleStatus`: `Date.now() - v.lastUpdate > 6 * 3600000`.
  - `apps/api/src/settings/setting-definitions.ts:47`: `monitoramento.sem_sinal_h`, default 6, min 0,5, max 72.
- **Esperado:** quando o aparelho para de transmitir, o status muda para "sem sinal" após o limite configurado do
  cliente.
- **Observado:**
  - [SIM] S7: snapshot online a 60 km/h, aparelho calado há 2 h → front segue "Em movimento". Com limite de 1 h,
    o backend diria `sem_sinal` (S8).
  - O limite de 6 h do front é aplicado sobre `fixTime` (última posição válida), não sobre o último pacote.
  - `sem_gps` só é conhecido no login. Depois, qualquer posição recebida pelo SSE zera `noSignal`.
- **Impacto:** cenário de furto ou corte de alimentação. O equipamento cala e a tela continua mostrando o veículo
  em movimento por até 6 h, ou até alguém recarregar a página. Telas abertas por horas, como central de
  monitoramento e modo tela cheia, ficam permanentemente desatualizadas.
- **Correção:** fonte única de status no backend. Duas opções:
  - Enviar `comunicacao` no snapshot e publicar a transição online → sem_sinal (job periódico que detecta a
    passagem do limite).
  - Ou, no mínimo, `syncFrota` periódico (ex.: 60 s) e na reconexão do SSE, com o front usando o limite do cliente
    em vez de 6 h fixo.
- **Teste:** teste de unidade de `vehicleStatus` com o limite do cliente; teste do stream com a transição de
  status; teste do front garantindo que a reconexão ressincroniza a frota.

### P1 — Alto

#### AUD-04 — Sensores fictícios no painel do veículo · CONFIRMADO [SIM + ESTÁTICO]
- **Onde:** `apps/web/src/lib/localleMap.ts:37`
  (`battery: 12.6, gps: 0, gsm: 0, blocked: false, odometer: 0, hourmeter: 0`) e
  `apps/web/src/pages/Monitoramento.tsx:369-376`.
- **Observado [SIM]:** em todos os cenários S1–S6 o painel recebe bateria 12,6 V, GPS 0, odômetro 0. A API
  (`/monitoring/current`) não envia bateria, satélites, GSM, bloqueio nem odômetro.
- **Impacto:** o usuário vê "Bateria 12,6 V", "0 satélites", "Sinal GSM 0/5" e "Bloqueio: Livre" como se fossem
  leituras. O botão Bloquear/Desbloquear é escolhido a partir de `blocked: false` fixo.
- **Correção:** exibir "—"/"não informado" quando o dado não vier da API. Opcionalmente, expor `power`/`battery`,
  `sat`, `rssi` e `blocked` a partir de `posicoes.attributes` da última posição, já gravados hoje.
- **Teste:** teste de `toVehicle` garantindo que campos ausentes ficam `null`/`undefined`, nunca com valor padrão
  numérico.

#### AUD-05 — Odômetro "do rastreador" sempre 0 alimenta a manutenção · CONFIRMADO [ESTÁTICO]
- **Onde:**
  - `packages/shared/src/km.ts:4-20` (`assetKm`, `kmSource = 'rastreador'` é o padrão em `toAsset`).
  - `packages/shared/src/km.ts:23-40` (`consolidateTrackerReadings`, chamado em `apps/web/src/lib/maintJobs.ts:11`).
- **Causa:** para veículos `lc_`, `v.odometer` é sempre 0 (AUD-04). `consolidateTrackerReadings` grava todo dia uma
  leitura `{ km: 0 + kmOffset, source: 'rastreador' }`.
- **Impacto:** o odômetro aparece como 0 km; planos de manutenção por km nunca vencem ou vencem errado; Custo/km,
  MKBF e Km rodados de pneus distorcidos.
- **Correção:** expor odômetro real (`posicoes.odometer_m` da última posição, ou km calculado pela soma do
  percurso) e não consolidar leitura quando o valor não vier do aparelho.
- **Teste:** `consolidateTrackerReadings` não deve gerar leitura quando o odômetro é desconhecido.

#### AUD-06 — Ignição desconhecida (`null`) é tratada como "desligada" em toda a cadeia · CONFIRMADO [SIM + REAL]

> **Corrigido em 31/10 (sem commit):**
> - `Point` aceita ignição `null` e o backend parou de converter ausência em `false`.
> - `routeStats` não soma trecho com ignição desconhecida e devolve `engineOn`/`idle` = `null` quando nenhum ponto
>   informa ignição.
> - As telas mostram "—"/"Não informada".
> - No status ao vivo, o veículo fica em Desligado com "Ignição: Não informada" (decisão do usuário).
>
> Testes: `routeStats.test.ts` e `frota-reports.isolation.spec.ts`.
- **Onde:**
  - `localleMap.ts` (`ignition: row.ignition === true`, `applyPosicao`).
  - `localleApi.ts`, `fetchRoute` (`p.ignition ? 1 : 0`).
  - `apps/api/src/reports/frota-reports.repository.ts` (`coalesce(ignition, false)`).
  - `Monitoramento.tsx:303,369` ("Desligada").
- **Evidência:** a posição 19 do device 13 no Traccar não tem atributo `ignition` [REAL]. Os cenários S2 [SIM]
  confirmam o efeito.
- **Impacto:** status "Desligado" (que cai em "Sem sinal", AUD-02). "Motor ligado" e "Ocioso" ficam zerados nos
  relatórios de Uso e Posições para aparelhos sem ignição.
- **Correção:** propagar `null` e exibir "ignição não informada". Em `routeStats`, não somar motor ligado nem
  ocioso quando a ignição for desconhecida e informar a cobertura.
- **Teste:** fixture com ignição nula em `routeStats` e em `/reports/percurso`.

#### AUD-07 — "Percurso hoje", "Rodou hoje" e o gráfico "Movimentação" usam só o histórico do navegador · CONFIRMADO [ESTÁTICO]
- **Onde:** `Monitoramento.tsx:119-134` e `:333`. `localleApi.ts`: `LIVE_HISTORY = 120` (`.slice(-120)`), histórico
  alimentado só pelo SSE e persistido em `localStorage`.
- **Esperado:** km do dia a partir de `posicoes` (fonte autoritativa).
- **Observado:** a soma considera apenas pontos recebidos com a aba aberta, no máximo 120 por veículo. O gráfico
  "Movimentação" conta **pontos** (amostras) com velocidade > 2, não veículos nem tempo, rotulados como "Em
  movimento"/"Parados".
- **Impacto:** valores diferentes por usuário e por navegador; subcontagem sistemática.
- **Correção:** endpoint de resumo do dia (ou `/reports/percurso` de hoje) para os tiles. O gráfico deve mostrar
  "veículos em movimento por faixa" ou "tempo em movimento", calculado no backend.
- **Teste:** teste do endpoint de resumo do dia comparando com SQL independente.

#### AUD-08 — `routeStats` infla tempo de motor e de movimento com lacunas, e a distância com ruído de GPS · CONFIRMADO [SIM]
- **Onde:** `packages/shared/src/routeStats.ts:14-22`. Usado em `/reports/percurso` (Uso da frota, Posições) e no
  Replay.
- **Observado [SIM]:**
  - S10: lacuna de 8 h após um ponto com ignição = 1 → **8,00 h** de motor ligado.
  - S11: lacuna de 8 h e retorno já andando → **8,00 h** em movimento.
  - S12: veículo parado 1 h com ruído de ~10 m → **1,20 km** de distância.
- **Impacto:** horas de motor, ociosidade e tempo em movimento infladas sempre que o aparelho fica sem transmitir
  (garagem sem sinal, desligado). Distância inflada em veículos parados.
- **Correção:** limitar `dt` por intervalo máximo de amostragem (parâmetro técnico, ex.: 5 min) e tratar lacuna como
  "sem dado". Ignorar deslocamento com velocidade ≤ limiar e distância < precisão.
- **Teste:** adicionar S10, S11 e S12 a `packages/shared` (hoje não há `routeStats.test.ts`).

#### AUD-09 — `v_localizacao_atual` sem filtro de `papel`: ativo duplicado e posição do módulo secundário/CAN · CONFIRMADO NA DEFINIÇÃO [ESTÁTICO], NÃO REPRODUZIDO
- **Onde:**
  - `apps/api/migrations/1792769079910_create-ultima-posicao-and-comunicacao.ts:40-48`. A definição no banco
    (`pg_get_viewdef`) confirma que não há filtro de `papel`.
  - `monitoring.repository.ts:63`: `left join v_localizacao_atual v on v.asset_id = a.id`.
  - `dto/instalar-rastreador.dto.ts` aceita `papel` igual a `secundario` ou `can`, e a constraint permite papéis
    diferentes ao mesmo tempo.
- **Impacto:** um ativo com rastreador principal + secundário vira duas linhas em `/monitoring/current` e no
  snapshot do SSE. Isso duplica a contagem de "Veículos rastreados" e faz o mapa alternar entre as posições dos dois
  aparelhos. `/reports/*` e `historicoDoAtivo` misturam as posições dos dois aparelhos por `asset_id`.
- **Correção:** `and i.papel = 'principal'` na view, via nova migration. Decidir explicitamente o tratamento das
  posições do secundário nos relatórios.
- **Teste:** teste de integração com instalação principal + secundária, esperando uma linha em
  `/monitoring/current`.

#### AUD-10 — `fixTime` futuro congela a última posição e a comunicação · SUSPEITA FORTE [ESTÁTICO]
- **Onde:**
  - `apps/api/src/ingest/dto/traccar-forward.dto.ts`: `dataValida` aceita até `Date.now() + 366 dias`.
  - `positions-ingest.service.ts`: o upsert em `ultima_posicao` usa `where excluded.fix_time > ultima_posicao.fix_time`,
    e o de `rastreador_comunicacao` usa `ultima_posicao_valida_em = greatest(...)`.
- **Cenário:** aparelho com relógio errado (comum após reset do GT06) manda um `fixTime` no futuro. Todas as
  posições corretas seguintes têm `fix_time` menor, então o mapa fica parado na posição futura e o status não
  reflete o GPS real até a data futura passar.
- **Correção:** recusar ou marcar `fixTime > serverTime + tolerância` (ex.: 10 min) e registrar log `warn` com
  `traccar_device_id`.
- **Teste:** unidade da validação e integração na ingestão (posição futura seguida de uma normal).

#### AUD-12 — Histórico e Replay truncados em 10.000 pontos sem aviso · CONFIRMADO [ESTÁTICO]
- **Onde:** `apps/api/src/monitoring/monitoring.repository.ts`: `historicoDoAtivo ... order by fix_time asc limit 10000`,
  com período até 93 dias.
- **Impacto:** a 1 posição a cada 30 s, o limite cobre cerca de 3,5 dias. Para períodos maiores, o **fim** do
  período some do Replay e dos KPIs dele (distância, tempo, paradas), sem nenhuma indicação. `limit` é aplicado
  antes de o front filtrar `valid`.
- **Correção:** paginação ou decimação no servidor e sinalização `truncado: true`. Ou limitar o período do Replay
  ao que o limite cobre.
- **Teste:** integração com mais de N pontos → resposta sinaliza o truncamento.

### P2 — Médio

#### AUD-11 — `ultimo_pacote_em` é o horário da ingestão, não o do aparelho · CONFIRMADO [REAL]
- **Onde:** `positions-ingest.service.ts`, `atualizarComunicacao` (`ultimo_pacote_em = now()`).
- **Evidência [REAL]:** PEB7J10 tem `ultimo_pacote_em` = 28/10 15:02:41 e `max(server_time)` = `max(fix_time)` =
  05:59:30 do mesmo dia.
- **Impacto:** depois de uma fila acumulada (inbox parado, reprocessamento, reconciliação de AUD-01), aparelhos
  calados aparecem "online" por até `sem_sinal_h`. Além disso, o upsert sobrescreve `asset_id`/`client_id` de
  `rastreador_comunicacao` com a instalação de um pacote **atrasado**, se ela for anterior à atual [ESTÁTICO].
- **Correção:** `ultimo_pacote_em = greatest(atual, serverTime da posição)`, e só atualizar `asset_id`/`client_id`
  quando o pacote pertencer à instalação vigente.
- **Teste:** integração que ingere uma posição antiga e verifica que `ultimo_pacote_em` não avança para "agora".

#### AUD-13 — Limite `sem_sinal_h` por grupo é ignorado

> **Corrigido em 31/10 (sem commit):** `SettingsService.resolveMenorPorAtivo`. Ativo em vários grupos fica com o
> **menor** limite (decisão do usuário); sem override de grupo, vale o do cliente. É usado por
> `GET /monitoring/current` e pelo `ComunicacaoTicker`. Também: "Sem GPS" ganhou rótulo próprio dentro do tile Sem
> sinal. Os demais parâmetros `porGrupo` continuam resolvidos só no nível do cliente em toda a API (ver resumo da
> correção).
>
> **01/11 (sem commit):**
> - A velocidade limite também é resolvida por grupo (relatório de excesso de velocidade).
> - O Setup passou a avisar "Ainda sem efeito" nos 43 parâmetros que nenhum código lê, e "Ainda sem efeito no grupo"
>   nos parâmetros por grupo cujo valor de grupo ainda não é aplicado (combustível, pneus, jornada, ranking).
> - A lista é verificada contra o código por `setting-definitions.spec.ts`.
> - Aplicar grupo nos módulos fora de ativos/monitoramento/relatórios fica para quando o escopo deles for definido.
- **Onde:** `monitoring.controller.ts:28` chama `settings.resolve(clientId, 'monitoramento.sem_sinal_h')` sem
  `groupId`, mas o parâmetro é `porGrupo: true` (`setting-definitions.ts:47`). [ESTÁTICO]
- **Correção:** resolver o limite por ativo, conforme o grupo dele. **Teste:** integração com override por grupo.

#### AUD-14 — O store nunca remove ativos e veículos que saíram da API
- **Onde:** `localleApi.ts`, `syncFrota`: só insere ou atualiza. Store persistido em `localStorage`
  (`store.ts`, chave `localle-v1`). [ESTÁTICO]
- **Impacto:** ativo vendido ou baixado (`status <> 'ativo'`) continua em "Veículos rastreados" e no mapa. Um
  veículo que deixa de ter posição qualificada (troca de instalação) mantém a posição antiga.
- **Correção:** `syncFrota` deve substituir o conjunto `lc_*` pelo que veio da API. **Teste:** unidade de
  `syncFrota` com um ativo removido.

#### AUD-15 — Limiares de movimento e parada inconsistentes entre telas
Valores encontrados [ESTÁTICO]:
- Status: `moving` com `speed > 3` (`localleMap.ts`).
- Velocidade média e gráfico do Monitoramento: `> 2`.
- `routeStats`: ≤ 3 km/h e parada de mais de 5 min fixos.
- `/reports/paradas`: ≤ 2 km/h e `parada_min_duracao_min` do Setup.

Um mesmo veículo a 2,5 km/h é "parado" no status e "em movimento" no gráfico. **Correção:** uma constante
compartilhada em `packages/shared`, e a duração de parada vinda do Setup.

#### AUD-16 — "Velocidade média" é a média instantânea dos veículos em movimento agora
- **Onde:** `Monitoramento.tsx:125`. [ESTÁTICO]
- O nome sugere média do período. **Correção:** renomear ("Velocidade média agora, em movimento") ou calcular a
  média do dia no backend.

#### AUD-17 — Erros silenciosos
- **Onde:** `Replay.tsx:71-73`: falha em `/monitoring/events` vira `setEvsReais([])` e a tela mostra 0 eventos.
  [ESTÁTICO]
- **Correção:** exibir o erro, como já fazem os relatórios com `toast`.

#### AUD-18 — Relatórios e Replay excluem veículo cujo rastreador foi desinstalado
- **Onde:** `RelatorioUso.tsx:33` e similares (`hadTracker` depende de `a.tracker` ou de `accessLog`, que é local);
  `Replay.tsx:53` (exige `tracker.live`). [ESTÁTICO]
- **Impacto:** o histórico do período em que o veículo teve rastreador some dos relatórios.
- **Correção:** o escopo dos relatórios deve vir do backend (instalações no período).

#### AUD-20 — Definições paralelas de distância e de excesso; `/reports/km` mistura odômetros
- `/reports/km` calcula `max(odometer_m) - min(odometer_m)` por **ativo**, sem separar por rastreador. Uma troca de
  aparelho no período gera km absurdo. [ESTÁTICO]
- `/reports/km`, `/reports/paradas` e `/reports/excesso-velocidade` não têm consumidor no front. O relatório de
  Velocidade usa `minSpeed` da tela, não `velocidade_limite_kmh` do Setup.
- **Correção:** decidir a definição oficial de km (odômetro × percurso), particionar por `rastreador_id` e remover
  ou adotar os endpoints órfãos.

### P3 — Baixo

- **AUD-21:** a Saúde e a Visão geral contam instalações `secundario`/`can` e pacotes anteriores à instalação
  vigente (diferente de `frotaAtual`). Os limites são 10 min e 24 h, diferentes do limite do cliente.
  `painel.repository.ts`. [ESTÁTICO]
- **AUD-22:** `speedKmh` é serializado como string (`numeric` do pg) em `/monitoring/current` ("61") e `vmax` vem
  como `43.99999999999999`. O front converte. Contrato tipado `number | string`. [REAL]
- **AUD-23:** os custos da Visão geral da Locale são constantes (`CHIP_COST`, `INFRA_COST`), rotulados "estimados".
  [ESTÁTICO]
- **AUD-24:** `rastreadores.status` permanece "cadastrado" em aparelhos instalados e transmitindo. [REAL] Confirmar
  a semântica esperada antes de corrigir.
- **AUD-25:** integração antiga (`rastreioApi.ts`) ainda montada no `Layout`. Está desligada por
  `VITE_RASTREIO_ON=false`, mas, se ligada, injeta bateria 12,6 V como padrão e uma segunda fonte no mesmo store.
  [ESTÁTICO]

### Isolamento multi-tenant (seção 8 do pedido)

- Todas as consultas de cliente auditadas (`monitoring`, `reports`, `frota-reports`, `realtime`) usam o `client_id`
  do `@ClientId()` (JWT) como primeiro filtro. `assetIds` e `cercaId` vindos da query são sempre combinados com
  `client_id` [ESTÁTICO].
- Os specs `monitoring.isolation.spec.ts`, `reports.isolation.spec.ts`, `frota-reports.isolation.spec.ts` e
  `assets.isolation.spec.ts` passaram [TESTE].
- `/superadmin/*` cruza clientes de propósito, protegido por `SuperadminGuard`.
- Front: o store é por navegador e `purgeLocalleData` limpa os dados `lc_` ao sair [ESTÁTICO].
- **Não testado em execução:** ataque entre clientes. O banco local tem um único cliente. A diferença de permissões
  Admin/Gestor/Operador também não foi exercitada.
- **Nenhum vazamento entre clientes foi encontrado.**

---

## F. Cobertura da auditoria

**Validado em execução com dados reais (ambiente local)**
- Fluxo Traccar → Forwarding → inbox e a perda das posições 19 e 20 (AUD-01), com logs da API e do Traccar.
- `/monitoring/current` × SQL direto: 4 ativos, `sem_sinal` correto para os dados; divergência de
  `ultimo_pacote_em` (AUD-11).
- `/reports/percurso` × SQL independente (PostGIS `st_distance`, `lag` de ignição): distância dentro de 0,4% e horas
  de motor idênticas.
- `/reports/km`, `/reports/paradas`, `/reports/excesso-velocidade` em um ativo.
- Qualidade das posições: 0 duplicadas, 0 inválidas, 0 sem dono, 0 com `fix_time > server_time`.
- Definição de `v_localizacao_atual` lida do banco (AUD-09).

**Validado com testes automatizados (executados agora)**
- `@localle/shared`: 5 arquivos, **32/32**.
- `web`: 8 arquivos, **45/45**.
- `api`: 54 arquivos, **304/304**, contra Postgres e Redis locais. Inclui dedup da ingestão, inbox, fila, stream de
  tempo real, `comunicacao-status` e specs de isolamento.
- Cenários controlados S1–S12 [SIM], com as funções reais `toVehicle`, `applyPosicao`, `vehicleStatus`,
  `statusComunicacao` e `routeStats`, em bundle esbuild fora do repositório. São fixtures sintéticas.

**Validado apenas por inspeção estática**
- Contagens dos tiles e gráficos do Monitoramento, painel do veículo, Replay, escopo dos relatórios, persistência do
  store, consolidação de odômetro, limites de histórico, validação de datas e Saúde/Visão geral.

**Não validado**
- **Renderização no navegador.** Nenhuma tela foi aberta: a preferência registrada é não usar automação de
  navegador nesta máquina. A conferência visual fica para o usuário, com os passos de reprodução de cada item.
- **Ambiente HML/produção.** Sem acesso nesta sessão. A frequência real de AUD-01 em produção é desconhecida; o
  comentário do código indica 2 perdidas em 135 na HML.
- **Os 4 rastreadores com dados não existem no Traccar local.** Não há conciliação Traccar × plataforma para eles.
- **Módulos** Combustível, Multas, Jornada, Checklist, Ranking, Pneus, Viagens e Faturamento: cálculos não
  auditados.
- **Isolamento em execução entre dois clientes** e **permissões por papel**.
- **Latência ponta a ponta** posição → tela. Não houve posição chegando com rastreador instalado durante a
  auditoria.

---

## G. Plano de correção priorizado

Correções propostas, a executar em fases separadas. Cada uma é uma mudança pequena e com teste, conforme
`CLAUDE.md`.

| Ordem | Item | Por quê primeiro | Dependência | Risco |
|---|---|---|---|---|
| 1 | AUD-01: job de reconciliação Traccar → plataforma por device (reusa `PositionsIngestService` e o dedup) + métrica na Saúde | perda de dado é irreversível depois que o Traccar expira o histórico | nenhuma | baixo: idempotente pelo dedup existente |
| 2 | AUD-02 + AUD-06: separar conectividade de movimento; tratar ignição `null` | KPI principal errado hoje | nenhuma | baixo: só front, mais um teste de contagem |
| 3 | AUD-03: status de comunicação vivo (`syncFrota` periódico e na reconexão; limite do cliente no front; depois, transição publicada pelo backend) | status grave em telas abertas por horas | idealmente após AUD-11 | médio: mexe no stream |
| 4 | AUD-04 + AUD-05: remover valores padrão fictícios; não consolidar odômetro desconhecido; expor bateria, odômetro e sinal reais a partir de `attributes` | dado falso na tela e na manutenção | parte de backend opcional | baixo |
| 5 | AUD-09: migration da view com `papel = 'principal'` | duplicação assim que alguém instalar um secundário | nenhuma | baixo (migration) |
| 6 | AUD-10 + AUD-11: recusar `fixTime` futuro; `ultimo_pacote_em` pelo `serverTime`; não regredir `asset_id` | robustez do status | nenhuma | baixo |
| 7 | AUD-08 + AUD-15: lacunas e ruído em `routeStats`; constantes únicas de limiar | relatórios de uso | decisão de produto sobre os limiares | médio: muda números históricos (comunicar) |
| 8 | AUD-07 + AUD-16: KPIs do dia vindos do backend | KPIs por navegador | endpoint novo | baixo |
| 9 | AUD-12, AUD-14, AUD-17, AUD-18, AUD-13, AUD-20 | consistência | — | baixo |
| 10 | P3 | acabamento | — | — |

Antes de executar os itens 1 e 3 (ingestão e tempo real), rodar `security-review` e `pentester-input`, conforme
`.claude/rules/security.md`.

---

## H. Testes de regressão recomendados

| Camada | Teste | Cobre |
|---|---|---|
| `apps/api` integração | reconciliação: Traccar falso com posições já ingeridas e novas → só as novas são gravadas, sem duplicata | AUD-01 |
| `apps/api` integração | `/monitoring/current` com instalação principal + secundária → 1 linha | AUD-09 |
| `apps/api` integração | posição com `fixTime` futuro é recusada; a seguinte atualiza `ultima_posicao` | AUD-10 |
| `apps/api` integração | posição atrasada não avança `ultimo_pacote_em` nem troca `asset_id` de `rastreador_comunicacao` | AUD-11 |
| `apps/api` integração | `sem_sinal_h` com override por grupo | AUD-13 |
| `apps/api` integração | histórico acima do limite sinaliza truncamento | AUD-12 |
| `apps/api` integração | `/reports/km` com troca de rastreador no período | AUD-20 |
| `packages/shared` unidade | `routeStats`: lacuna (S10/S11), ruído (S12), ignição nula, limiares | AUD-06/08/15 |
| `apps/web` unidade | `vehicleStatus` e contagem dos tiles (S1–S7), limite do cliente | AUD-02/03 |
| `apps/web` unidade | `toVehicle` sem valores padrão fictícios; `consolidateTrackerReadings` sem leitura com odômetro desconhecido | AUD-04/05 |
| `apps/web` unidade | `syncFrota` remove ativo ausente da API; reconexão do SSE ressincroniza a frota | AUD-03/14 |
| E2E (quando houver Playwright) | Monitoramento com frota de fixtures: tiles = contagem esperada; veículo calado muda para "Sem sinal" após o limite | AUD-02/03 |

Os testes existentes cobrem bem a ingestão (dedup, inbox, fila, stream) e o isolamento. Hoje **não existe nenhum
teste** para:

- as contagens e o status exibidos no front;
- `routeStats`;
- os valores padrão de `toVehicle`.

É exatamente onde estão os problemas encontrados.
