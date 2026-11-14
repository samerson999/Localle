import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Rastreador backup e tag (pedido do Rafael, 14/11/2026): um ativo pode ter um aparelho principal e um backup. O mapa
// e tudo que decide o estado do ativo vêm sempre do principal; o backup continua comunicando e só aparece na ficha.
// - `papel = 'secundario'` (nunca usado pela API nem pelo front) vira `backup`.
// - `rastreador_modelos.tipo_aparelho`: a tag (aparelho de bateria, escondido, de redundância) é característica do
//   modelo, não da instalação. A regra "em veículo a tag só é backup" fica na aplicação (depende da categoria do ativo).
// - `v_localizacao_atual` passa a olhar só o principal: sem o filtro, um ativo com backup aparecia duas vezes no
//   Monitoramento e a posição da tag podia virar a posição do ativo.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.instalacoes drop constraint instalacoes_papel_check;
    update public.instalacoes set papel = 'backup' where papel = 'secundario';
    alter table public.instalacoes add constraint instalacoes_papel_check check (papel in ('principal', 'backup', 'can'));

    alter table public.rastreador_modelos add column tipo_aparelho text not null default 'rastreador'
      check (tipo_aparelho in ('rastreador', 'tag'));

    create or replace view public.v_localizacao_atual as
    select
      i.asset_id, i.client_id,
      up.rastreador_id, up.posicao_id, up.fix_time, up.geom, up.speed_kmh, up.ignition, up.atualizado_em
    from public.instalacoes i
    join public.ultima_posicao up
      on up.rastreador_id = i.rastreador_id and up.fix_time >= i.instalado_em
    where i.desinstalado_em is null and i.papel = 'principal';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create or replace view public.v_localizacao_atual as
    select
      i.asset_id, i.client_id,
      up.rastreador_id, up.posicao_id, up.fix_time, up.geom, up.speed_kmh, up.ignition, up.atualizado_em
    from public.instalacoes i
    join public.ultima_posicao up
      on up.rastreador_id = i.rastreador_id and up.fix_time >= i.instalado_em
    where i.desinstalado_em is null;

    alter table public.rastreador_modelos drop column tipo_aparelho;

    alter table public.instalacoes drop constraint instalacoes_papel_check;
    update public.instalacoes set papel = 'secundario' where papel = 'backup';
    alter table public.instalacoes add constraint instalacoes_papel_check check (papel in ('principal', 'secundario', 'can'));
  `);
}
