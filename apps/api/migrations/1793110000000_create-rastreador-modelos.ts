import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Catálogo de modelos de rastreador (decisão de 28/10/2026): o cadastro passa a exigir o modelo, que diz o protocolo
// do Traccar, a porta e o tipo de identificador que o aparelho manda (IMEI, terminal JT808…). O Traccar não expõe essa
// lista pela API — o protocolo é a porta em que o aparelho conecta —, então ela é da plataforma, mantida pela Locale
// numa tela do admin. Sem `client_id`: catálogo global, como `rastreadores` (só superadmin acessa).
// - `rastreadores.modelo_id` nasce nullable (expand-and-contract): os já cadastrados não têm modelo; o cadastro novo
//   exige pela API. A coluna texto `modelo` continua (nome exibido) até os antigos serem migrados.
// - Seed: os dois modelos em uso na HML, confirmados com aparelho real (EVOO-X GT06 na 5023, Teltonika FMC125 na
//   5027). O JR12 entra pela tela quando a porta/protocolo for confirmada (docs/GUIA-JR12-HML.md).
// - Backfill: rastreador ativo sem modelo cujo protocolo detectado bate com um único modelo do seed recebe esse modelo.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.rastreador_modelos (
      id uuid primary key default gen_random_uuid(),
      fabricante text not null check (length(trim(fabricante)) between 1 and 60),
      nome text not null check (length(trim(nome)) between 1 and 60),
      protocolo text not null check (protocolo ~ '^[a-z0-9]{2,30}$'),
      porta integer not null check (porta between 1 and 65535),
      tipo_identificador text not null check (tipo_identificador in ('imei', 'terminal_jt808', 'outro')),
      ativo boolean not null default true,
      criado_em timestamptz not null default now(),
      atualizado_em timestamptz not null default now()
    );
    create unique index rastreador_modelos_fabricante_nome_uidx on public.rastreador_modelos (lower(fabricante), lower(nome));

    alter table public.rastreadores add column modelo_id uuid references public.rastreador_modelos(id) on delete restrict;
    create index rastreadores_modelo_id_idx on public.rastreadores (modelo_id);

    insert into public.rastreador_modelos (fabricante, nome, protocolo, porta, tipo_identificador) values
      ('EVOO-X', 'GT06', 'gt06', 5023, 'imei'),
      ('Teltonika', 'FMC125', 'teltonika', 5027, 'imei');

    update public.rastreadores r set modelo_id = m.id
      from public.rastreador_modelos m
     where r.modelo_id is null and r.status <> 'desativado' and r.protocolo = m.protocolo
       and (select count(*) from public.rastreador_modelos m2 where m2.protocolo = m.protocolo) = 1;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.rastreadores drop column modelo_id;
    drop table public.rastreador_modelos;
  `);
}
