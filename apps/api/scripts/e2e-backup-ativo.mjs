// Dados do e2e do backup no card do Monitoramento (apps/web/e2e/backup-monitoramento.spec.ts), no cliente do usuário e2e
// ("Cliente Demo", o mesmo do seed-demo-user). Só banco local.
//
//   node scripts/e2e-backup-ativo.mjs preparar <tag>  → imprime { assetId, placa, imeiBackup } em JSON
//   node scripts/e2e-backup-ativo.mjs limpar <tag>
//
// `preparar`: veículo com principal (posição em São Paulo) e backup (posição em Campinas) — as duas em `ultima_posicao`,
// como a ingestão grava (a do backup sem asset_id/client_id: não fala pelo ativo).
import 'dotenv/config';
import { randomInt } from 'node:crypto';
import pg from 'pg';

const [, , acao, tag] = process.argv;
if (!['preparar', 'limpar'].includes(acao) || !/^[a-z0-9]{6,16}$/.test(tag ?? '')) {
  console.error('uso: e2e-backup-ativo.mjs preparar|limpar <tag de 6 a 16 letras/números minúsculos>');
  process.exit(2);
}
// localhost pode resolver para ::1 no Windows e o Postgres do Docker escuta no IPv4
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL.replace('localhost', '127.0.0.1') });
const fabricante = `E2E backup ${tag}`;
const placa = `BK${tag.slice(0, 6).toUpperCase()}`; // 8 caracteres: não tem formato de placa, aparece como texto

try {
  const cliente = (await pool.query("select id from clients where name = 'Cliente Demo'")).rows[0];
  if (!cliente) throw new Error('Cliente Demo não existe: rode o global-setup (seed-demo-user) antes');
  if (acao === 'preparar') {
    const asset = (await pool.query('insert into assets (client_id, plate) values ($1, $2) returning id', [cliente.id, placa])).rows[0];
    const modelo = (await pool.query(
      `insert into rastreador_modelos (fabricante, nome, protocolo, porta, tipo_identificador) values ($1, 'GT06', 'gt06', 5023, 'imei') returning id`,
      [fabricante],
    )).rows[0];
    const aparelho = async (papel, lat, lng, doAtivo) => {
      const imei = String(randomInt(1e9, 9e9)) + String(randomInt(1e5, 9e5));
      const r = (await pool.query(`insert into rastreadores (imei, modelo_id, status) values ($1, $2, 'ativo') returning id`, [imei, modelo.id])).rows[0];
      await pool.query('insert into rastreador_vinculos (client_id, rastreador_id) values ($1, $2)', [cliente.id, r.id]);
      await pool.query(
        `insert into instalacoes (client_id, rastreador_id, asset_id, papel, instalado_em, tecnico) values ($1, $2, $3, $4, now() - interval '1 day', 'e2e')`,
        [cliente.id, r.id, asset.id, papel],
      );
      await pool.query(
        `insert into ultima_posicao (rastreador_id, asset_id, client_id, posicao_id, fix_time, geom, speed_kmh, ignition)
         values ($1, $2, $3, 1, now() - interval '5 minutes', st_setsrid(st_makepoint($4, $5), 4326), 0, false)`,
        [r.id, doAtivo ? asset.id : null, doAtivo ? cliente.id : null, lng, lat],
      );
      return imei;
    };
    await aparelho('principal', -23.55052, -46.633308, true);
    const imeiBackup = await aparelho('backup', -22.90556, -47.06083, false);
    console.log(JSON.stringify({ assetId: asset.id, placa, imeiBackup }));
  } else {
    const { rows: rs } = await pool.query(
      'select r.id from rastreadores r join rastreador_modelos m on m.id = r.modelo_id where m.fabricante = $1',
      [fabricante],
    );
    for (const { id } of rs) {
      await pool.query('delete from ultima_posicao where rastreador_id = $1', [id]);
      await pool.query('delete from instalacoes where rastreador_id = $1', [id]);
      await pool.query('delete from rastreador_vinculos where rastreador_id = $1', [id]);
      await pool.query('delete from rastreadores where id = $1', [id]);
    }
    await pool.query('delete from rastreador_modelos where fabricante = $1', [fabricante]);
    await pool.query('delete from assets where client_id = $1 and plate = $2', [cliente.id, placa]);
  }
} finally {
  await pool.end();
}
