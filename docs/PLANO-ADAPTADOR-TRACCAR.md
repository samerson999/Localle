# Plano do adaptador Traccar (substituto de `rastreioApi.ts`)

22/10/2026. Mapeia, função a função, o que `src/lib/rastreioApi.ts` faz hoje contra a API Clube do Rastreador para o
equivalente na API REST do Traccar — para quando a decisão de migrar (`docs/ARQUITETURA-BACKEND.md` §6,
confirmada como direção provável em conversa com o Samerson) virar trabalho de verdade. Não é uma decisão nova:
é o "como" de uma decisão já tomada.

**Importante:** as chamadas da API do Traccar abaixo vêm do formato público e estável da API REST do projeto
(a mesma usada por qualquer integração de terceiros com o Traccar), não de teste contra o servidor real deste
projeto — isso ainda não foi validado contra a instância que já está rodando na VPS (`docs/GUIA-TRACCAR.md`).
Antes de codar, vale repetir o mesmo processo que fizemos com a API Clube do Rastreador: bater numa chamada real
e conferir o formato de resposta, principalmente de eventos e confirmação de comando.

---

## 1. Por que isso é mais simples do que parece

Comparado ao gateway próprio (já descartado), o adaptador Traccar é um trabalho pequeno: o Traccar já decodifica
~15 protocolos brasileiros e normaliza os atributos por trás de nomes comuns (`ignition`, `battery`, `motion`,
`satellites`, `odometer`), em vez dos campos crus por fabricante que a API Clube do Rastreador expõe hoje
(`io66`, `io239`, `acc`, `adc1`...). O `sensors()` atual em `rastreioApi.ts` — que existe só para decodificar essa
variação por fabricante — fica bem mais simples ou some.

## 2. Mapeamento função a função

| Hoje (`rastreioApi.ts`, API Clube do Rastreador) | Equivalente no Traccar | Observação |
|---|---|---|
| `syncObjects()` — poll `USER_GET_OBJECTS` a cada 30 s | `GET /api/devices` + `GET /api/positions` **ou**, melhor, WebSocket `/api/socket` | O Traccar empurra posição/evento/dispositivo em tempo real por WebSocket — dá para matar o polling de 30 s e o atraso que vem junto. `docs/ARQUITETURA-BACKEND.md` §4 já cogita isso para o backend NestJS; no front hoje (sem backend ainda) dá para consumir o WebSocket direto, atrás do mesmo proxy que hoje esconde a chave. |
| `sensors(p)` — decodifica `io66`/`io239`/`acc`/`adc1` por fabricante | `position.attributes.ignition`, `.batteryLevel` ou `.power`, `.motion`, `.satellites` | Atributos já normalizados pelo Traccar entre protocolos — a função fica bem mais enxuta, sem os casos por fabricante. |
| `toAsset()` — nome vem como `"PLACA\|MOTORISTA"` | `device.name` (só placa/identificação) | O Traccar não tem esse hack de nome composto. O motorista deixa de vir "de graça" no objeto — passa a vir só do histórico já especificado em `PRODUCT.md` § Identificação do motorista (`driverLinks.ts`), não mais extraído do texto do nome. **Isso é uma simplificação, não uma perda**: o hack atual (`driverOf()`, `driverIdFor()`) existe só por limitação da API atual. |
| `toVehicle()` — `pos`, `speed`, `heading`, `odometer`, `hourmeter` | `position.latitude/longitude`, `.speed`, `.course`, `.attributes.odometer`, `.attributes.hours` | Equivalente direto. |
| `classify()` — regex em cima do texto do evento (`"Ignição ligada"`, `"pânico"`, `"violação"`) | `GET /api/events` (ou WebSocket) com `type: 'alarm'` e `event.attributes.alarm` já como código padronizado (`sos`, `powerCut`, `lowBattery`, `jamming`, `tamper`...) | Essa é a maior melhoria: hoje `classify()` adivinha por palavra-chave em português (frágil, já exigiu o pulso `panic`/`powerCut` que fizemos em 22/10 só para contornar isso). No Traccar não tem adivinhação — o tipo já vem certo. O pulso `v.panic`/`v.powerCut` que alimenta as Regras `r7`/`r8` continua fazendo sentido, só a fonte do flag muda de regex para `event.attributes.alarm === 'sos'` / `'powerCut'` direto. |
| Zonas (`zone_in`/`zone_out`) | `geofenceEnter`/`geofenceExit` do Traccar, **ou** seguir calculando com `fenceCrossing()` (engine.ts) sobre a posição crua | Recomendo manter `fenceCrossing()`: as Cercas do produto já têm regra própria (tipo, alerta por entrada/saída, limite de velocidade, permanência máxima, gatilho de viagem de pátio) que o Traccar não conhece. Mais simples usar só a posição do Traccar e continuar com o motor de cercas que já existe e já funciona (confirmado em 21/10) do que sincronizar dois sistemas de geofence. |
| `fetchRoute()` — `OBJECT_GET_ROUTE` | `GET /api/positions?deviceId=X&from=...&to=...` | Equivalente direto; `src/lib/routeMatch.ts` (map-matching OSRM) continua funcionando igual, é agnóstico à fonte. |
| `sendRealCommand()` — `OBJECT_CMD_GPRS` (texto cru tipo `RELAY,1#`) + `OBJECT_GET_CMDS` (fila, sem confirmação real — confirmado em teste 22/10) | `POST /api/commands/send` com `{ deviceId, type, attributes }` | Ganho real aqui: o Traccar tem **tipos de comando decodificados por protocolo** (`engineStop`/`engineResume` já mapeiam para o comando certo de cada fabricante, sem precisar saber a sintaxe `RELAY,1#` de cada um) e dispara um evento `commandResult` (sucesso/falha) — um canal de confirmação de verdade, que a API atual não tem. `GET /api/commands/types?deviceId=X` lista o que cada rastreador suporta, então a tela de comandos pode se adaptar por equipamento em vez de uma lista fixa (`commandDefs` hoje é genérico demais: nem todo equipamento aceita `RELAY,1#`). |
| `purgeApiData()` | Mesma ideia, trocando o prefixo de id (`rt_`/`rd_`) por um equivalente Traccar (ex.: `tc_`) | Sem mudança de lógica. |
| `RASTREIO_ON` / proxy do Vite escondendo a chave (`vite.config.ts`) | Mesmo padrão, proxy para a URL do Traccar; sessão por cookie ou usuário/senha (Basic Auth) em vez de `key=` na query | O gate de segurança que já existe para `OBJECT_CMD_*` (bloquear comando até "liberar de propósito") deve ser recriado para `/api/commands/send` no proxy novo — não assumir que vem de graça. |

## 3. O que muda de verdade na arquitetura, não só de API

- **Tempo real em vez de polling**: WebSocket do Traccar elimina o atraso de até 30 s do `syncObjects()` atual — isso é ganho direto para o Sprint 1 (mapa ao vivo) e Sprint 2 (alertas).
- **Confirmação de comando de verdade**: resolve o limite que documentamos em `sendRealCommand` (hoje "confirmado" só quer dizer "saiu da fila", não "executou"). Com `commandResult`, dá para diferenciar os dois de verdade.
- **Motorista sai do hack de nome**: força (de forma boa) a usar o histórico de vínculo motorista × veículo que já está especificado em `PRODUCT.md`, em vez do parsing de string `"PLACA|MOTORISTA"`.
- **Cercas continuam do nosso lado**: não migrar a lógica de negócio de cerca para o Traccar — só a fonte de posição muda.

## 4. Antes de começar a codar

1. Repetir com o Traccar real da VPS o mesmo processo que fizemos com a API Clube do Rastreador: uma chamada de leitura (`GET /api/positions`) para confirmar o formato de atributos de cada protocolo em uso (GT06, Teltonika, Suntech, J-MAC/Penta — a pendência de nome já registrada no plano do MVP), e `GET /api/commands/types?deviceId=X` para ver o que cada equipamento aceita de comando.
2. Decidir sessão (cookie) vs. Basic Auth para o proxy, e se o WebSocket entra já nessa primeira versão ou se a primeira versão só troca o polling por `GET /api/positions` (mais simples, sem mexer em conexão persistente) e o WebSocket fica para uma segunda etapa.
3. Repetir o teste de comando com algo inofensivo (equivalente ao `WHERE#`/`positionSingle`) antes de confiar em `engineStop`/`engineResume` de verdade — mesmo cuidado que tomamos agora.
