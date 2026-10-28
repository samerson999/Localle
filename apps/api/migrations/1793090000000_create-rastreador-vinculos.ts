import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Vínculo rastreador × cliente (decisão de 28/10/2026, docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.1): a
// Locale cadastra o rastreador e o vincula a um cliente — inclusive aparelho do próprio cliente —, e o
// cliente só escolhe em qual ativo ele está (`instalacoes`). O dono deixa de ser deduzido da instalação.
// A `exclude using gist` é a defesa no banco contra o mesmo rastreador vinculado a dois clientes ao mesmo
// tempo; o histórico (vinculado_em/desvinculado_em) fica, para faturamento e auditoria.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('rastreador_vinculos', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    client_id: { type: 'uuid', notNull: true, references: 'clients', onDelete: 'CASCADE' },
    rastreador_id: { type: 'uuid', notNull: true, references: 'rastreadores', onDelete: 'RESTRICT' },
    vinculado_em: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    desvinculado_em: { type: 'timestamptz' },
  });

  pgm.addConstraint('rastreador_vinculos', 'rastreador_vinculos_desvinculado_apos_vinculado', {
    check: 'desvinculado_em is null or desvinculado_em > vinculado_em',
  });

  pgm.sql(`
    alter table public.rastreador_vinculos add constraint rastreador_vinculos_sem_sobreposicao
    exclude using gist (
      rastreador_id with =,
      tstzrange(vinculado_em, coalesce(desvinculado_em, 'infinity'), '[)') with &&
    );
  `);

  pgm.createIndex('rastreador_vinculos', ['client_id', 'rastreador_id']);

  // Instalações vigentes de antes desta tabela: o cliente da instalação passa a ser o vínculo.
  pgm.sql(`
    insert into public.rastreador_vinculos (client_id, rastreador_id, vinculado_em)
    select client_id, rastreador_id, instalado_em from public.instalacoes where desinstalado_em is null;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('rastreador_vinculos');
}
