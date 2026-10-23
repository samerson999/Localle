import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.2: histórico veículo × rastreador. As duas `exclude using
// gist` são a defesa de verdade (no banco, não só na aplicação) contra: (1) o mesmo rastreador instalado
// em dois lugares ao mesmo tempo, e (2) o mesmo veículo com duas instalações vigentes do MESMO papel ao
// mesmo tempo — papéis diferentes (GPS principal + módulo CAN) podem coexistir de propósito.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createExtension('btree_gist', { ifNotExists: true });

  pgm.createTable('instalacoes', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    client_id: { type: 'uuid', notNull: true, references: 'clients', onDelete: 'CASCADE' },
    rastreador_id: { type: 'uuid', notNull: true, references: 'rastreadores', onDelete: 'RESTRICT' },
    asset_id: { type: 'uuid', notNull: true, references: 'assets', onDelete: 'CASCADE' },
    papel: {
      type: 'text',
      notNull: true,
      default: 'principal',
      check: "papel in ('principal', 'secundario', 'can')",
    },
    instalado_em: { type: 'timestamptz', notNull: true },
    desinstalado_em: { type: 'timestamptz' },
    tecnico: { type: 'text', notNull: true },
    km_inicial: { type: 'numeric(12,1)' },
    foto: { type: 'text' },
  });

  pgm.addConstraint('instalacoes', 'instalacoes_desinstalado_apos_instalado', {
    check: 'desinstalado_em is null or desinstalado_em > instalado_em',
  });

  pgm.sql(`
    alter table public.instalacoes add constraint instalacoes_sem_sobreposicao_rastreador
    exclude using gist (
      rastreador_id with =,
      tstzrange(instalado_em, coalesce(desinstalado_em, 'infinity'), '[)') with &&
    );
  `);

  pgm.sql(`
    alter table public.instalacoes add constraint instalacoes_sem_sobreposicao_asset_papel
    exclude using gist (
      asset_id with =,
      papel with =,
      tstzrange(instalado_em, coalesce(desinstalado_em, 'infinity'), '[)') with &&
    );
  `);

  pgm.createIndex('instalacoes', ['asset_id', { name: 'instalado_em', sort: 'DESC' }]);
  pgm.createIndex('instalacoes', ['rastreador_id', { name: 'instalado_em', sort: 'DESC' }]);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('instalacoes');
}
