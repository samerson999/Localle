# Arquitetura de backend e infraestrutura (proposta validada)

21/10/2026 (atualizado em 23/10/2026 — decisão de monorepo, seção 0). Este documento fecha o item "Em aberto" de `PRODUCT.md` › Produção: a arquitetura de backend, banco e infraestrutura para sair do protótipo (`apps/web/src`, roda só no navegador) para o sistema real de telemetria. Trata domínio: decisões ficam aqui; passo a passo de comando fica em `docs/GUIA-TRACCAR.md` e em `infra/`.

**Decisão revista em 23/10/2026**: o backend (NestJS) **não** nasce em repositório separado — nasce como `apps/api/` neste mesmo repositório, monorepo com `pnpm` workspaces. Ver seção 0 para o motivo e a estrutura.

---

## 0. Monorepo: front e backend no mesmo repositório

Decisão de 23/10/2026, revendo o que a seção 1 original previa (backend em repositório próprio).

**Motivo**: há lógica que precisa ser idêntica no front e no backend — o registro de parâmetros do Setup (mesma fonte para tela e banco, quando existir), validações, os motores de cálculo hoje escritos como funções puras em `src/lib/` (manutenção, escalonamento, ranking, fuel, km, pneus, relatórios de rota), o contrato de polaridade de métricas e os tipos de posição/evento. Em repositórios separados isso vira cópia que diverge silenciosamente — o motor de "quando um ativo precisa de manutenção" calculado diferente no front (preview/simulação) e no backend (cálculo real) é exatamente o tipo de bug que não aparece em teste manual.

**Estrutura**:
```
apps/web/        — front atual (Vite + React), movido de src/ para cá em 23/10/2026
apps/api/         — NestJS, nasce quando a POC do rastreador real validar o volume (ver seção 8)
packages/shared/  — tipos, contratos de API, motores de cálculo e regras de domínio puras (sem React/DOM/Zustand)
infra/            — inalterado (infra/plataforma, infra/traccar)
docs/             — inalterado
pnpm-workspace.yaml, package.json (raiz) — workspace root
```

- **Workspaces com pnpm** (`pnpm-workspace.yaml`: `apps/*`, `packages/*`). O front importa de `packages/shared` via alias `@localle/shared/<módulo>` (configurado em `apps/web/vite.config.ts` e `apps/web/tsconfig.json`); a API vai importar do mesmo pacote quando nascer.
- **O que já foi extraído para `packages/shared`** (23/10/2026): `utils`, `catalog`, `couplings`, `trips`, `engine`, `fuel`, `pneus`, `km`, `assetStatus`, `insights`, `maint`, `maintKpis`, `escalation`, `billing`, `platformOverview`, `fines`, `jornada`, `ranking`, `can`, `canSim`, `checklist`, `assetDocs`, `audit`, `routeStats`, `routeMatch` — critério: função pura, sem depender de React/Zustand/`store`/`idb`/DOM, e sem ser fixture de demonstração do protótipo.
- **O que ficou propositalmente em `apps/web`**: `seed.ts` e dados "simulados" do protótipo (são fixture de demo, não regra de negócio real), `tokens.ts` (lê `document`/CSS vars, só roda no navegador), tudo acoplado a React/Zustand/`store`/`idb`, e `positionsSource`/`rastreioApi`/`fenceStats`/`nearbyStats`/`speedStats` (acoplados ao mock de rede do protótipo). O **registro de parâmetros do Setup** e o **contrato de polaridade de métricas** (hoje só uma demonstração isolada em `apps/web/src/pages/design/metricPolarity.ts`, não consumida por nenhuma tela real) ainda não existem como código de produção — entram em `packages/shared` quando forem implementados de verdade, não antes.
- **CI/CD com filtro por caminho**: quando os workflows do GitHub Actions existirem (ver `docs/DEPLOY-COOLIFY.md`, plano de deploy), mudanças em `apps/web/**` disparam só o deploy do front; em `apps/api/**`, só o da API; em `packages/shared/**`, os dois.
- **No Coolify**, cada Resource de aplicação aponta para a pasta e o Dockerfile da sua app (`apps/web/Dockerfile`, futuro `apps/api/Dockerfile`), não para a raiz do monorepo.

---

## 1. Visão geral da stack

| Camada | Escolha | Por quê |
|---|---|---|
| Backend | NestJS (TypeScript) | já decidido em `PRODUCT.md`; módulos, DI e guards mapeiam bem para a herança Plataforma → Revenda → Cliente → Grupo e os perfis de acesso |
| Banco | PostgreSQL 16 | já decidido; maduro, com as duas extensões abaixo |
| Extensão geo | PostGIS | ponto do veículo, cercas eletrônicas (polígonos), consultas "dentro da cerca" e distância |
| Extensão de série temporal | TimescaleDB | posições e amostras CAN são séries temporais por rastreador; hypertables resolvem partição, compressão e retenção sem reescrever as queries |
| Gateway de rastreadores | **Traccar** (não gateway próprio) | ver seção 6 — decisão revista a partir do trabalho já feito com a VPS Hostinger |
| Ingestão → gravação | fila (seção 4) | desacopla a taxa de chegada dos rastreadores (rajada, reconexão em massa) da capacidade de escrita do Postgres |
| Infraestrutura | 2 VPS (seção 7) | separar banco de aplicação: isolar I/O de disco do banco da CPU da API, e limitar o que fica exposto à internet |
| Orquestração de containers | Docker Compose por VPS, gerenciado pelo Coolify | já decidido em `PRODUCT.md`; Coolify fala com os dois servidores a partir de um só painel |
| CI/CD | GitHub Actions → Coolify (homologação e produção) | já decidido |

Tudo aqui é a proposta técnica; falta a POC com um rastreador real (uma unidade GT06, que já está rodando — ver `docs/GUIA-TRACCAR.md`) para confirmar os números de volume usados nas seções 3 e 4.

---

## 2. Modelagem de dados para telemetria

### 2.1 O que já existe como especificação

`docs/especificacao-sql/` tem o desenho das tabelas pensado no protótipo Supabase (RLS por `client_id`, funções PL/pgSQL). Ele vale como **especificação de regra de negócio**, não como schema a copiar: no backend real, RLS por linha tende a sair do Postgres e virar filtro explícito por `client_id` em cada query do NestJS (mais simples de otimizar e de explicar num `EXPLAIN`), com o isolamento entre clientes garantido na camada de serviço, não no banco.

**Isolamento por cliente — camada única + teste automático + RLS como segunda proteção** (decisão de 23/10/2026): o filtro por `client_id` na aplicação não pode ser uma convenção que cada desenvolvedor lembra de aplicar — vira obrigatório ao passar por uma **única camada de acesso ao banco** (ex.: um `BaseRepository`/query builder compartilhado no NestJS); nenhuma query de domínio chama o driver do Postgres diretamente. Dois reforços adicionais, obrigatórios antes de ligar a API a dados reais de múltiplos clientes:
1. **Testes automáticos de leitura entre clientes** — suite de integração que, para cada endpoint/query sensível, tenta ler dado de um `client_id` autenticado como outro e falha o build se conseguir.
2. **RLS como segunda camada de defesa** (não a primeira) nas tabelas mais sensíveis (`positions`, dados de faturamento/billing) — rede de segurança caso um bug no filtro da aplicação escape dos testes acima. O filtro de aplicação continua sendo a fonte da verdade (evita o problema de "blast radius" de RLS mal escrita degradando queries silenciosamente, visto em outros projetos na mesma escala).

As tabelas de telemetria de alto volume (`can_samples`, `can_events`, e a futura `positions` vinda do Traccar) são as que mais importam para performance — são elas que crescem sem limite.

**O desenho de `positions`/`events` desta seção está superado por `docs/ARQUITETURA-INTEGRACAO-TRACCAR.md` § 4**
(23/10/2026): lá o schema ganha `rastreadores`, `instalacoes` (histórico veículo×rastreador com exclusão de
sobreposição), `posicoes`/`eventos`/`comandos` com chave de deduplicação por `traccar_position_id`/
`traccar_event_id`, `client_id`/`asset_id` resolvidos por histórico de instalação, e `ultima_posicao` como tabela
própria em vez de agregação na hora. O exemplo de `positions` abaixo fica só como ilustração do raciocínio de
hypertable/índice (seções 2.2–2.3), não como schema a implementar.

### 2.2 Hypertables (TimescaleDB)

Toda tabela que registra um evento no tempo por rastreador vira hypertable, particionada por tempo:

```sql
create table public.positions (
  id bigint generated always as identity,
  device_id bigint not null,
  client_id uuid not null,
  ts timestamptz not null,
  geom geometry(Point, 4326) not null,
  speed numeric, course numeric, ignition boolean, odometer numeric, attributes jsonb,
  primary key (device_id, ts, id)
);
select create_hypertable('positions', 'ts', chunk_time_interval => interval '1 day');
create index on public.positions (device_id, ts desc);
create index on public.positions using gist (geom);
```

Por quê chunk de 1 dia: com uma frota de 600–2.000 veículos mandando posição a cada 20–30 s (números de `PRODUCT.md`), isso dá de ~1,7 a ~8,6 milhões de linhas por dia. Um chunk por dia mantém cada partição num tamanho que cabe confortavelmente em memória para os índices mais usados (consulta do dia, do replay), sem criar milhares de chunks pequenos.

A chave primária inclui `device_id` e `ts` (não só `id`) porque é por esse par que o sistema sempre lê: mapa ao vivo (última posição por `device_id`), replay (intervalo de tempo de um `device_id`), relatório (intervalo de tempo de vários `device_id`).

### 2.3 Índices: regra prática

- **Índice composto `(device_id, ts desc)` é o padrão**, não `ts` sozinho — quase toda consulta filtra por rastreador(es) e ordena/filtra por tempo.
- **GiST em `geom`** só nas tabelas que recebem consulta espacial de verdade (está dentro da cerca, veículos num raio) — cercas eletrônicas, posições recentes para o mapa. Não colocar GiST em tabela que só grava e nunca é consultada por geometria (desperdício de escrita).
- **BRIN como alternativa ao B-tree em `ts`** em tabelas muito grandes e só de histórico (ex.: `can_events` depois de meses) — ocupa uma fração do espaço de um B-tree porque aproveita que os dados já chegam ordenados no tempo; perde precisão, mas para "entre duas datas" em tabela append-only é o suficiente. TimescaleDB já aplica isso via `compress_segmentby`/`compress_orderby` nos chunks comprimidos (seção 2.4), então BRIN manual só se compressão não for usada.
- **Nunca indexar JSONB inteiro** (`attributes`) a não ser que uma chave específica dele seja filtrada o tempo todo — nesse caso, índice de expressão: `create index on positions ((attributes->>'motorista'))`.
- Medir antes de adicionar índice: `EXPLAIN (ANALYZE, BUFFERS)` na query real, não suposição. Índice que não é usado só atrasa a escrita.

### 2.4 Retenção e compressão

> **Estado em 26/10/2026**: compressão (7 dias) está na migration `1792970000000`; a retenção por plano é a rotina
> `RetencaoService` (`apps/api/src/retencao/`), não policy do Timescale — ver `docs/ARQUITETURA-INTEGRACAO-TRACCAR.md`
> § 4.7. Continuous aggregates e export Parquet ainda não existem.

Dado de telemetria crua perde valor rápido; o que fica caro para sempre é o agregado.

```sql
alter table public.positions set (timescaledb.compress, timescaledb.compress_segmentby = 'device_id', timescaledb.compress_orderby = 'ts desc');
select add_compression_policy('positions', interval '7 days');   -- comprime o que passou de 7 dias
select add_retention_policy('positions', interval '13 months');  -- descarta posição crua depois de 13 meses
```

- Comprime depois de 7 dias (a janela de replay e "passou por aqui" quase sempre olha a semana corrente, sem compressão) — isso é igual para todo mundo, independe do plano do cliente.
- **Retenção por plano do cliente, não política global** (decisão de 23/10/2026): o tempo de histórico de posição é definido pelo plano contratado (ex.: 3 meses, 1 ano, 5 anos — confirmar os planos exatos com o dono do produto; `apps/web/src/lib/plans.ts` já modela planos no front, hoje para o admin de clientes/planos, não para retenção de telemetria). O exemplo de `add_retention_policy('positions', interval '13 months')` acima está **errado como política única**: `add_retention_policy` do TimescaleDB vale para a hypertable inteira, não filtra por `client_id` — não dá para ter "3 meses para o cliente A e 5 anos para o cliente B" só com a policy nativa. A retenção por cliente precisa de uma **rotina própria** (job agendado na API, não a policy do Timescale): lê o plano vigente de cada cliente e deleta/arquiva as partições/linhas daquele `client_id` especificamente quando vencer o prazo do plano dele.
- **Armazenamento frio em Parquet para o plano de 5 anos** (decisão de 23/10/2026): não faz sentido manter 5 anos de posição bruta comprimida no Postgres só porque um plano promete esse histórico. Para os clientes nesse plano, exportar os chunks/continuous aggregates mais antigos para **Parquet em object storage** antes de descartar do banco quente, mantendo um caminho de leitura separado (mais lento, aceitável) para consulta de histórico de 5 anos. Essa rotina de export é responsabilidade da API (`apps/api`), não do Postgres sozinho.
- O que precisa durar além da retenção (km do dia, horas de motor, eventos por veículo) vira **continuous aggregate**, não fica na tabela crua:

```sql
create materialized view public.daily_vehicle_km with (timescaledb.continuous) as
select device_id, time_bucket('1 day', ts) as day,
       max(odometer) - min(odometer) as km_dia
from public.positions group by device_id, day;
select add_continuous_aggregate_policy('daily_vehicle_km', start_offset => interval '3 days', end_offset => interval '1 hour', schedule_interval => interval '1 hour');
```

Isso resolve o mesmo problema que a função `fn_can_report` resolve hoje em PL/pgSQL (percorrer amostra a amostra para montar o relatório) de um jeito que o Postgres já sabe manter incrementalmente, sem reprocessar o histórico inteiro a cada consulta.

### 2.5 Queries de consulta (BI, relatórios, mapa)

- **Mapa ao vivo:** nunca `select * from positions order by ts desc limit 1` por veículo em loop. Usar `distinct on (device_id)` com o índice composto, ou manter uma tabela `last_position` (uma linha por veículo, upsert a cada posição) atualizada pela própria ingestão — mais rápido que agregar a hypertable toda vez, e é o que o mapa de até 2.000 veículos (seção "Mapa em escala" de `PRODUCT.md`) precisa.
- **Replay e relatórios de período:** sempre filtrar por `device_id` (ou lista) **e** intervalo de `ts`; nunca só por intervalo de `ts` em toda a frota.
- **BI (manutenção, combustível, ranking):** ler de continuous aggregates ou de tabelas de resumo já fechadas por dia/mês, nunca recalcular do dado cru na hora do clique.
- **Paginação:** por `(ts, id)` com keyset pagination (`where (ts, id) < (last_ts, last_id)`), não `offset` — `offset` em tabela grande lê e descarta as linhas anteriores.

### 2.6 Endereço das posições (geocodificação reversa) — pendência aberta

**Estado em 28/10/2026:** o endereço por extenso é resolvido **no navegador** (`apps/web/src/lib/geocode.ts`), no
Nominatim público (OpenStreetMap), limitado a 1 consulta por segundo, com cache por ponto arredondado (~11 m) no
`localStorage` de cada usuário. A tela resolve só as linhas visíveis; as exportações usam só o que já está em cache
(Posições, Replay) ou resolvem poucos pontos (Velocidade, Cercas, "Passou por aqui").

**Gap (sprint de monitoramento, bug 5):** o critério "todas as posições com GPS válido mostram endereço" **não é
atendido**. Um relatório de posições exportado sai com a maioria das linhas sem endereço — resolver 1.000 pontos a
1/s levaria ~17 min, e o uso do Nominatim público em volume fere a política de uso dele. Paliativo entregue: posição
sem endereço mostra as coordenadas (`fmtCoord`, 6 casas) no lugar, na tela e nas exportações.

**Solução prevista (aguarda decisão de provedor/custo):** a API resolve o endereço — serviço próprio (Nominatim
self-hosted com o extrato do Brasil) ou contratado — com cache em tabela no banco por ponto arredondado,
compartilhado entre todos os clientes; os relatórios saem da API já com o endereço. O front deixa de chamar
serviço externo. Até lá, não prometer endereço em 100% das linhas exportadas.

---

## 3. Pool de conexões e concorrência

- NestJS abre um pool por instância da API (ex.: `pg` ou TypeORM/Prisma com `max` configurado), não uma conexão por requisição.
- Entre a API e o Postgres, **PgBouncer** em modo `transaction` quando o número de instâncias da API crescer (cada conexão Postgres é um processo; sem pooler, 2.000 veículos com várias instâncias de API somam conexões rápido). Não é urgente na POC de 1 cliente com ~400 placas, mas o compose já deve prever o serviço (seção 7.3) para não precisar migrar sob pressão depois.
- A ingestão de posições do Traccar (seção 4) usa seu próprio pool, separado do pool de leitura da API — picos de escrita não podem esgotar conexões que a tela ao vivo precisa para ler.

---

## 4. Ingestão: Traccar → fila → Postgres

**Detalhamento completo (contratos, unidades, conciliação, quarentena, decisões de retenção) em
`docs/ARQUITETURA-INTEGRACAO-TRACCAR.md`** — esta seção fica como resumo de alto nível; o front **nunca** fala com
o Traccar, nem em protótipo de backend: quem chama a API/webhook do Traccar é sempre o NestJS.

Decisão (seção 6): o Traccar recebe o protocolo do rastreador e já grava a posição no próprio Postgres dele (schema `tc_*`). A plataforma não precisa reimplementar os ~15 protocolos usados no Brasil (GT06, Teltonika, Suntech, Ruptela, Coban etc.) — isso é exatamente o que o PDF de integração já validou.

Duas formas de levar a posição do Traccar para o schema da plataforma, em ordem de preferência:

1. **Webhook do Traccar** (`Forwarding` em `Settings › Server`, ou por atributo do dispositivo): o Traccar manda um `POST` a cada posição nova para um endpoint da API. A API empilha numa fila (ver abaixo) e devolve 200 rápido.
2. **Polling** (o que o protótipo faz hoje via `apps/web/src/lib/positionsSource.ts`/`rastreioApi.ts`, a cada 30 s): mais simples, mas acrescenta até 30 s de atraso e decola mal acima de poucas centenas de veículos. Serve para a fase de protótipo; trocar pelo webhook antes de vender a módulos que dependem de alerta em tempo real (SOS, cerca).

Fila entre a ingestão e a gravação (decisão de `PRODUCT.md`, "fila entre a ingestão e a gravação"):

- **BullMQ sobre Redis** é a opção mais simples de operar dentro do próprio ecossistema Node/NestJS (sem outro serviço além de um Redis pequeno). Cobre o caso de uso: amortecer rajada (motor ligando, dezenas de rastreadores reconectando juntos), não perder posição se o Postgres estiver momentaneamente sob manutenção, e permitir reprocessar em caso de erro de validação.
- Job size pequeno (uma posição ou um lote curto), `concurrency` controlado por configuração, e uma fila separada para eventos críticos (SOS, violação) com prioridade maior que posição de rotina.
- Alternativa mais pesada (Kafka/RabbitMQ) só se a POC mostrar volume que justifique — não antes.

---

## 5. Observabilidade e backup

- **Backup do Postgres:** `pg_dump` lógico diário não é suficiente sozinho para um banco que não pode perder dados entre backups — usar **WAL archiving + `pg_basebackup`** (ou `pgBackRest`) para PITR (point-in-time recovery), com os arquivos de WAL enviados para fora da VPS do banco (objeto storage, ou a VPS de aplicação como destino secundário, nunca só local).
- **Backup do Traccar:** mesmo Postgres, mesma rotina; o `backup.sh` do kit atual (`pg_dump` simples) serve para a fase de teste, não para produção.
- **Métricas mínimas antes de vender a clientes:** tempo de resposta do endpoint de posições, profundidade da fila, uso de disco do banco (hypertables crescem rápido), número de rastreadores sem comunicação há mais de X minutos (isso já é produto: "Precisa de você").
- **Logs:** da API (NestJS) e do Traccar centralizados (mesmo que só `docker compose logs` agregado por enquanto); antes de produção com cliente pagante, um coletor (Loki, ou o que o Coolify já oferecer) evita depender de SSH manual.

---

## 6. Traccar em vez de gateway próprio — por que mudou

`PRODUCT.md` ainda registra "Gateway próprio para os rastreadores (GT06, Suntech, Ruptela e JMAK)" como plano. Na prática, o trabalho desta semana (ver `docs/GUIA-TRACCAR.md`) já validou o Traccar rodando em Docker numa VPS, recebendo um GT06 real e sendo lido pela plataforma. Recomendação: **adotar o Traccar como o gateway**, não construir um próprio, pelos motivos abaixo — e atualizar `PRODUCT.md` depois que isso for confirmado com o time.

- Traccar já fala os protocolos que importam no Brasil (266 protocolos no total, a maioria irrelevante, mas os usados — GT06, Teltonika, Suntech, Ruptela, Coban, H02, JT808, Queclink, Meitrack — estão todos prontos), com anos de uso em produção por terceiros. Reimplementar protocolo binário de rastreador é trabalho grande e frágil (cada fabricante tem variação de firmware).
- Ele já resolve o que um gateway próprio teria que resolver do zero: reconexão de socket, parsing de pacote malformado, decodificação de atributo específico por fabricante (temperatura, combustível, CAN).
- O ponto fraco do Traccar é a modelagem de negócio (ele não entende "cliente", "revenda", "parâmetro herdado") — e é exatamente por isso que ele fica numa camada isolada: só entrega posição e evento bruto. Toda a regra de negócio (quem vê o quê, limites, alertas compostos) continua no NestJS, lendo do Traccar (API ou banco) e da fila, nunca o contrário.
- Esforço de manter um gateway próprio só se justificaria se o Traccar não suportasse algum protocolo necessário (hoje não é o caso) ou se o volume exigisse otimização que o Traccar não permite (a decidir depois da POC).

---

## 7. Infraestrutura: 2 VPS

### 7.1 Por que dividir banco e aplicação

- **Isolamento de recursos:** o Postgres é sensível a I/O de disco e a picos de memória (checkpoint, vacuum); a API e o Traccar competem por CPU e rede. No mesmo servidor, um vacuum pesado derruba o tempo de resposta da API, e vice-versa.
- **Superfície de ataque menor:** o VPS do banco não precisa expor porta nenhuma à internet pública — só à rede privada entre os dois servidores. O VPS de aplicação é o único que fala com o mundo (painel, API, portas dos rastreadores).
- **Escala independente:** quando a frota crescer, o VPS do banco pede mais RAM/IOPS; o VPS de aplicação pede mais CPU — upgrades diferentes, sem copiar o outro.

### 7.2 Topologia proposta

```
                    Internet
                       |
          ┌────────────┴────────────┐
          |      VPS-APP            |
          |  (Hostinger, IP público)|
          |                         |
          |  - Nginx/Coolify proxy │ TLS (Let's Encrypt)
          |    (reverse proxy)      |
          |  - API NestJS           |
          |  - Traccar (portas dos  │ 5023, 5027, 5011... (TCP/UDP, rastreadores)
          |    protocolos)          |
          |  - Redis (fila)         |
          |  - Front-end (build     │ servido pelo Nginx/Coolify
          |    estático do Vite)    |
          └────────────┬────────────┘
                        │ rede privada (VPC da Hostinger, ou WireGuard se não houver VPC)
          ┌─────────────┴────────────┐
          |      VPS-DB              |
          |  (sem IP exposto além    |
          |   da porta do Postgres,  |
          |   só para a rede privada)|
          |                         |
          |  - PostgreSQL 16 +      |
          |    TimescaleDB + PostGIS|
          |  - Postgres do Traccar  │ pode ser o mesmo cluster, schema separado
          |  - pgBackRest / WAL     │ arquivo de backup enviado para fora da VPS
          └──────────────────────────┘
```

Pontos de atenção que a Hostinger impõe:

- Confirmar se o plano contratado oferece **rede privada entre VPS** (muitos planos cloud oferecem; KVM básico às vezes não). Sem rede privada, a conexão entre VPS-APP e VPS-DB precisa de **WireGuard** (túnel criptografado simples de manter) — nunca Postgres exposto na internet pública, nem com senha forte.
- Firewall do VPS-DB: só a porta do Postgres (5432) liberada para o IP do VPS-APP (ou para a sub-rede do túnel WireGuard), mais 22/tcp restrito a um IP de administração conhecido.
- Firewall do VPS-APP: 22 (admin), 80/443 (painel e API via proxy), e as portas dos protocolos de rastreador que estiverem em uso (ver tabela em `docs/GUIA-TRACCAR.md`) — nunca abrir a faixa inteira 5000–5100 "por garantia"; abrir só o que o cliente usa.
- Painel do Traccar (hoje na porta 8082 sem TLS, exposto — ver pendência no PDF de integração) precisa ficar atrás do reverse proxy com HTTPS antes de qualquer cliente real acessar; a porta 8082 direta fecha para a internet.

### 7.3 Docker Compose por VPS

A estrutura real neste repositório é `infra/plataforma/` e `infra/traccar/` (não `infra/docker-compose.db.yml`/`app.yml`, que nunca chegaram a existir — corrigido em 23/10/2026):

- `infra/plataforma/` — Postgres 16 + TimescaleDB + PostGIS (banco da plataforma) + PgBouncer. Sobe no VPS-DB em produção; local em desenvolvimento.
- `infra/traccar/` — Traccar + o Postgres próprio dele (kit generalizado, sem credencial real, referenciado por `docs/GUIA-TRACCAR.md`). Sobe no VPS-APP em produção; local em desenvolvimento.
- Quando `apps/api` nascer, seu Dockerfile sobe no VPS-APP junto do Traccar e do front (`apps/web`).

Para desenvolvimento local (um só computador, sem separar VPS), `infra/plataforma/` e `infra/traccar/` sobem juntos apontando para `localhost` — ver `infra/README.md`.

**O guia real de deploy/CI-CD é `docs/DEPLOY-COOLIFY.md`** (plano aprovado em 22/10/2026, a executar quando os recursos — Postgres, Traccar, depois a API — estiverem prontos). Resumo do fluxo por ambiente:
- **Homologação**: banco (`infra/plataforma`) e app na mesma VPS; o Coolify builda a imagem a partir do Dockerfile de cada app (`apps/web/Dockerfile`, futuro `apps/api/Dockerfile`) direto do código-fonte.
- **Produção**: o build roda no GitHub Actions (não no Coolify), que publica a imagem pronta num registry; o Coolify de produção só faz `pull`+deploy. O banco fica em VPS separada, ligada por rede privada/WireGuard — a "Postgres URL (internal)" que o Coolify gera só vale entre recursos da mesma instância/servidor, não atravessa VPS.

O Coolify, quando entrar, substitui a necessidade de rodar `docker compose up -d` manualmente em cada VPS: ele guarda os recursos e faz o deploy a partir do GitHub (CI/CD). Os arquivos em `infra/` continuam sendo a fonte da verdade para desenvolvimento local mesmo com Coolify em produção.

---

## 8. Ordem recomendada de execução

1. **Dockerizar o ambiente local** (feito): `infra/plataforma/` com Postgres+TimescaleDB+PostGIS, `infra/traccar/` com Traccar — ambos rodando no computador do time, sem depender de VPS para desenvolver.
2. **POC com o GT06 real** (já em andamento na VPS Hostinger — `docs/GUIA-TRACCAR.md`): confirmar volume de posições/dia e eventos/dia com 1 rastreador, depois estimar para 400 e para 2.000.
3. **Nascer `apps/api` neste monorepo** (NestJS, decisão de 23/10/2026 — seção 0), com o schema de `positions`/`events` desta seção, lendo do Traccar via webhook (seção 4), e importando regras de `packages/shared` em vez de duplicá-las.
4. **Provisionar os 2 VPS de homologação** com a topologia da seção 7.2, rede privada/WireGuard, firewall mínimo.
5. **CI/CD** (GitHub Actions → Coolify) para homologação primeiro, produção depois, como já decidido em `PRODUCT.md`.
6. Atualizar `PRODUCT.md` para registrar Traccar como o gateway (seção 6 deste documento) e marcar o item "infraestrutura ainda será discutida" como resolvido, com link para este arquivo.
