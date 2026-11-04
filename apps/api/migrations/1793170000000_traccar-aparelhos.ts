import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Lista de aparelhos do Traccar como fonte dos modelos (decisão de 04/11/2026): os ~2.200 modelos de
// traccar.org/devices (nome, protocolo, porta) ficam em `traccar_aparelhos`; o catálogo (`rastreador_modelos`) vira o
// registro dos modelos EM USO, criado sozinho quando o primeiro rastreador do modelo é cadastrado, e guarda só o que o
// Traccar não sabe (identificador, mapeamento da telemetria, ativo). Sem `client_id`: lista global, só superadmin.
// - A carga inicial não está aqui: o serviço carrega a cópia salva no repositório quando a tabela está vazia, e o
//   botão "Atualizar lista do Traccar" baixa a página de novo (src/rastreadores/lista-traccar.ts).
// - Os 15 modelos de mercado do seed da 1793160000000 saem do catálogo (eram cópia da lista); só os que nenhum
//   rastreador usa. Ficam os três em uso (EVOO-X GT06, Teltonika FMC125, JMAK JR12).
// - Nome no catálogo vai a 120 caracteres: o nome do Traccar chega a 84 e é cortado no 1º espaço em fabricante + modelo.
const MERCADO = [
  ['Concox', 'GT06N'], ['Jimi IoT', 'JM-VL01'], ['TrackerKing', 'J16'], ['Coban', 'GPS-103'], ['SinoTrack', 'ST-901'],
  ['Suntech', 'ST4315'], ['Suntech', 'ST8300'], ['Queclink', 'GV300'], ['Queclink', 'GV55'], ['Teltonika', 'FMB920'],
  ['Teltonika', 'FMB120'], ['Teltonika', 'FMC130'], ['Ruptela', 'FM-ECO 4'], ['CalAmp', 'LMU-3030'], ['Maxtrack', 'MXT-140'],
];

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    create table public.traccar_aparelhos (
      id integer generated always as identity primary key,
      nome text not null check (length(trim(nome)) between 1 and 120),
      protocolo text not null check (protocolo ~ '^[a-z0-9]{2,30}$'),
      porta integer not null check (porta between 1 and 65535),
      atualizado_em timestamptz not null default now()
    );
    create unique index traccar_aparelhos_nome_protocolo_uidx on public.traccar_aparelhos (lower(nome), protocolo);

    alter table public.rastreador_modelos
      drop constraint rastreador_modelos_fabricante_check,
      drop constraint rastreador_modelos_nome_check,
      add constraint rastreador_modelos_fabricante_check check (length(trim(fabricante)) between 1 and 120),
      add constraint rastreador_modelos_nome_check check (length(trim(nome)) between 1 and 120);

    delete from public.rastreador_modelos m
     using (values ${MERCADO.map(([f, n]) => `('${f}', '${n}')`).join(', ')}) as c(f, n)
     where m.origem = 'catalogo' and lower(m.fabricante) = lower(c.f) and lower(m.nome) = lower(c.n)
       and not exists (select 1 from public.rastreadores r where r.modelo_id = m.id);
  `);
}

// Os modelos de mercado removidos não voltam: a lista do Traccar os recria quando forem usados.
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop table public.traccar_aparelhos;
    alter table public.rastreador_modelos
      drop constraint rastreador_modelos_fabricante_check,
      drop constraint rastreador_modelos_nome_check,
      add constraint rastreador_modelos_fabricante_check check (length(trim(fabricante)) between 1 and 60),
      add constraint rastreador_modelos_nome_check check (length(trim(nome)) between 1 and 60);
  `);
}
