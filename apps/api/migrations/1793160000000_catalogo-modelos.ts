import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Catálogo pronto de modelos (decisão de 03/11/2026): no cadastro de rastreador basta escolher o modelo; protocolo,
// porta e identificador já vêm do catálogo, sem digitação técnica.
// - `origem`: 'catalogo' = linha mantida pela Localle a partir da lista pública do Traccar (traccar.org/devices,
//   conferida em 03/11/2026 linha a linha); 'manual' = modelo não listado, cadastrado pela tela. A tela trava os dados
//   técnicos dos modelos do catálogo.
// - Seed: os três modelos em uso na HML (EVOO-X GT06, Teltonika FMC125, JMAK JR12) e 15 modelos de mercado. Mapeamento
//   de telemetria só nos três conferidos com payload real (migration 1793130000000); os demais seguem o padrão do
//   Traccar até um aparelho real mostrar o contrário.
// - Identificador: 'imei' só onde o protocolo manda o IMEI; Suntech, SinoTrack (h02), CalAmp e Maxtrack mandam um
//   identificador próprio do aparelho → 'outro'.
// - Modelo que já existe (o JR12 foi cadastrado pela tela na HML) não é sobrescrito: passa a ser do catálogo só se
//   protocolo e porta batem com a lista; se não batem (ex.: JR12 cadastrado como huabao/5015 na hipótese do JT808), fica
//   'manual' e editável, para alguém conferir.
const CATALOGO: [fabricante: string, nome: string, protocolo: string, porta: number, identificador: string][] = [
  ['EVOO-X', 'GT06', 'gt06', 5023, 'imei'],
  ['Teltonika', 'FMC125', 'teltonika', 5027, 'imei'],
  ['JMAK', 'JR12', 'jmak', 5259, 'imei'],
  ['Concox', 'GT06N', 'gt06', 5023, 'imei'],
  ['Jimi IoT', 'JM-VL01', 'gt06', 5023, 'imei'],
  ['TrackerKing', 'J16', 'gt06', 5023, 'imei'],
  ['Coban', 'GPS-103', 'gps103', 5001, 'imei'],
  ['SinoTrack', 'ST-901', 'h02', 5013, 'outro'],
  ['Suntech', 'ST4315', 'suntech', 5011, 'outro'],
  ['Suntech', 'ST8300', 'suntech', 5011, 'outro'],
  ['Queclink', 'GV300', 'gl200', 5004, 'imei'],
  ['Queclink', 'GV55', 'gl200', 5004, 'imei'],
  ['Teltonika', 'FMB920', 'teltonika', 5027, 'imei'],
  ['Teltonika', 'FMB120', 'teltonika', 5027, 'imei'],
  ['Teltonika', 'FMC130', 'teltonika', 5027, 'imei'],
  ['Ruptela', 'FM-ECO 4', 'ruptela', 5046, 'imei'],
  ['CalAmp', 'LMU-3030', 'calamp', 5082, 'outro'],
  ['Maxtrack', 'MXT-140', 'mxt', 5087, 'outro'],
];

const valores = CATALOGO.map(([f, n, p, porta, t]) => `('${f}', '${n}', '${p}', ${porta}, '${t}')`).join(',\n      ');

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.rastreador_modelos
      add column origem text not null default 'manual' check (origem in ('catalogo', 'manual'));

    insert into public.rastreador_modelos (fabricante, nome, protocolo, porta, tipo_identificador, origem)
    select f, n, p, porta, t, 'catalogo' from (values
      ${valores}
    ) as c(f, n, p, porta, t)
    on conflict (lower(fabricante), lower(nome)) do nothing;

    update public.rastreador_modelos m set origem = 'catalogo'
      from (values ${CATALOGO.map(([f, n, p, porta]) => `('${f}', '${n}', '${p}', ${porta})`).join(', ')}) as c(f, n, p, porta)
     where lower(m.fabricante) = lower(c.f) and lower(m.nome) = lower(c.n) and m.protocolo = c.p and m.porta = c.porta;

    update public.rastreador_modelos set atributo_tensao = 'vin', sinal_max = 31
     where lower(fabricante) = 'jmak' and lower(nome) = 'jr12' and protocolo = 'jmak' and atributo_tensao is null and sinal_max is null;
  `);
}

// Os modelos do seed ficam (podem já ter rastreadores apontando para eles); só a coluna sai.
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`alter table public.rastreador_modelos drop column origem;`);
}
