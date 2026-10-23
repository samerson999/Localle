import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.4: `ultima_posicao` (onde o veículo está, só posição
// válida) é separada de `rastreador_comunicacao` (saúde do equipamento, qualquer pacote) — um
// rastreador pode estar online sem fix de GPS, e misturar os dois esconderia isso. A view resolve a
// regra "localização não pode ser herdada entre instalações" (§ 4.4, terceira passada) na leitura.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('ultima_posicao', {
    rastreador_id: { type: 'uuid', primaryKey: true, references: 'rastreadores' },
    asset_id: { type: 'uuid' },
    client_id: { type: 'uuid' },
    posicao_id: { type: 'bigint', notNull: true },
    fix_time: { type: 'timestamptz', notNull: true },
    geom: { type: 'geometry(Point, 4326)', notNull: true },
    speed_kmh: { type: 'numeric' },
    ignition: { type: 'boolean' },
    atualizado_em: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('ultima_posicao', 'client_id');
  pgm.sql('create index on public.ultima_posicao using gist (geom);');

  pgm.createTable('rastreador_comunicacao', {
    rastreador_id: { type: 'uuid', primaryKey: true, references: 'rastreadores' },
    asset_id: { type: 'uuid' },
    client_id: { type: 'uuid' },
    ultimo_pacote_em: { type: 'timestamptz' },
    ultima_posicao_valida_em: { type: 'timestamptz' },
    atualizado_em: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('rastreador_comunicacao', 'client_id');

  // `up.*` colidiria com `i.asset_id`/`i.client_id` (ultima_posicao também tem essas colunas, por sua
  // vez atualizadas por `rastreador_comunicacao` na troca de instalação — ver nota da migração sobre
  // "localização não pode ser herdada entre instalações"); por isso as colunas vêm listadas, não `up.*`.
  pgm.sql(`
    create or replace view public.v_localizacao_atual as
    select
      i.asset_id, i.client_id,
      up.rastreador_id, up.posicao_id, up.fix_time, up.geom, up.speed_kmh, up.ignition, up.atualizado_em
    from public.instalacoes i
    join public.ultima_posicao up
      on up.rastreador_id = i.rastreador_id and up.fix_time >= i.instalado_em
    where i.desinstalado_em is null;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('drop view public.v_localizacao_atual;');
  pgm.dropTable('rastreador_comunicacao');
  pgm.dropTable('ultima_posicao');
}
