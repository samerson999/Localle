---
paths: apps/api/migrations/**, apps/api/src/db/**, infra/plataforma/**
---

# Banco de dados (Postgres 16 + TimescaleDB + PostGIS)

Decisões de domínio e de volume estão em `docs/ARQUITETURA-BACKEND.md` §§ 2–4 e
`docs/ARQUITETURA-INTEGRACAO-TRACCAR.md` § 4 — leia antes de desenhar uma tabela nova de telemetria. Este
arquivo é a parte executável: como migrar, como escrever query, o que não fazer.

## Migrations

- Ferramenta: `node-pg-migrate` (`apps/api/migrations/`, `pnpm --filter api migrate:create|up|down`).
  Toda mudança de schema é uma migration nova — nunca `ALTER`/`CREATE` manual direto no banco, nem em
  desenvolvimento, porque o schema local tem que continuar reproduzível a partir de `migrate:up` limpo.
- Migration tem que ser reversível (`down` real) a menos que seja genuinamente impossível (ex.: drop de
  coluna com dado) — nesse caso, documentar no corpo da migration por que o `down` é um no-op.
- Tabela com dado em produção: mudança de schema incompatível segue expand-and-contract (adiciona coluna
  nova nullable → backfill → troca o código para a nova coluna → só depois remove a antiga numa migration
  separada). Não faça `NOT NULL` direto numa coluna nova de tabela que já tem linha, nem renomeie coluna
  em uso sem essa sequência.
- Migration em tabela grande (hypertables de posição/evento): atenção a lock — `ALTER TABLE` que reescreve
  a tabela inteira trava escrita de ingestão. Prefira `ADD COLUMN` com default `NULL` (não reescreve) e
  evite `ALTER COLUMN TYPE`/`SET NOT NULL` direto nessas tabelas sem avaliar o tamanho atual primeiro.

## Modelagem e nomenclatura

- Toda tabela de domínio de cliente tem `client_id uuid not null` com FK para `clients`. Nenhuma tabela de
  dado de cliente deve ficar sem essa coluna "porque é óbvio pelo join" — o isolamento por aplicação
  (`.claude/rules/backend.md`) depende dela existir na própria tabela.
- Nomes de tabela/coluna do domínio de telemetria são em português e já estabelecidos:
  `rastreadores`, `instalacoes`, `posicoes`, `eventos`, `ultima_posicao`, `rastreador_comunicacao`,
  `ingest_posicoes_recebidas`/`ingest_eventos_recebidos` (dedup). Siga essa convenção ao estender esse
  domínio; não misture inglês (`positions`/`events`) nessas tabelas — isso é ilustração de raciocínio em
  `docs/ARQUITETURA-BACKEND.md` § 2.2, não o schema real.
- Dedup de ingestão por chave única (`traccar_position_id`/`traccar_event_id` + `rastreador_id`) com
  `on conflict ... do nothing` — não confiar que o Traccar nunca reentrega.
- Período de instalação de rastreador em ativo usa exclusion constraint (`instalacoes`) para impedir
  sobreposição — ver `telemetria/schema.spec.ts` para o comportamento exigido antes de alterar essa tabela.
- Timezone: `timestamptz` sempre, nunca `timestamp` sem zona, para qualquer coluna de tempo de evento.

## Hypertables e índices (quando a tabela crescer sem limite)

- Tabela de série temporal por rastreador (posição, amostra CAN) vira hypertable particionada por `ts`/
  `fix_time`, chunk de 1 dia como ponto de partida (`docs/ARQUITETURA-BACKEND.md` § 2.2) — não criar tabela
  comum para esse tipo de dado e otimizar depois "quando precisar".
- Índice composto `(device_id|rastreador_id, ts desc)` é o padrão para esse tipo de tabela; GiST em
  coluna de geometria só se houver consulta espacial real (cerca eletrônica, raio) — não adicionar GiST
  "por garantia" numa tabela que só grava.
- Nunca indexar uma coluna `jsonb` inteira; se precisar filtrar uma chave específica com frequência, índice
  de expressão nessa chave.
- Medir antes de adicionar índice: rodar `EXPLAIN (ANALYZE, BUFFERS)` na query real. Não propor índice por
  suposição.

## Consultas

- Mapa ao vivo / última posição: nunca `order by ts desc limit 1` por veículo em loop — usar
  `distinct on (...)` ou tabela de última posição mantida por upsert (`ultima_posicao` já existe para
  isso).
- Replay e relatório por período: sempre filtrar por `rastreador_id`/`asset_id` (ou lista) **e** intervalo
  de tempo — nunca só por intervalo de tempo na frota inteira.
- Paginação de tabela grande: keyset (`where (ts, id) < (last_ts, last_id)`), nunca `offset` crescente.
- BI/relatório recorrente: ler de view/continuous aggregate já fechado, não recalcular do dado cru a cada
  clique.

## Transações e concorrência

- Operação que grava em mais de uma tabela com invariante entre elas (ex.: fechar uma instalação e abrir
  outra) entra numa transação explícita do `pg` (`client.query('BEGIN')`/`COMMIT`/`ROLLBACK`), não duas
  queries soltas no pool.
- Ingestão (webhook/polling do Traccar) é idempotente por natureza (dedup por `traccar_*_id`) — qualquer
  novo ponto de ingestão precisa manter essa propriedade, não assumir "não vai duplicar".

## Testes de banco

Ver `.claude/rules/testing.md` para a matriz completa. Resumo específico de banco: toda constraint, trigger,
exclusion constraint ou view nova (`v_localizacao_atual` é o exemplo existente) ganha teste de integração
contra o Postgres local de verdade (`infra/plataforma`), não mock — é o próprio banco que está sendo
testado, mockar o driver não prova nada.
