// Dados do e2e da identificação do motorista (apps/web/e2e/cartao-motorista.spec.ts), no cliente do usuário e2e
// ("Cliente Demo", o mesmo do seed-demo-user). Só banco local.
//
//   node scripts/e2e-cartao-motorista.mjs preparar <tag>  → imprime { assetId, codigo, instalacaoId } em JSON
//   node scripts/e2e-cartao-motorista.mjs limpar <tag>
//
// `preparar`: veículo com rastreador de modelo que aceita leitor, instalado sem o leitor marcado, e um cartão lido pelo
// rastreador que ainda não tem motorista (vínculo aberto com motorista_id null — o que a ingestão grava).
import 'dotenv/config';
import { randomInt } from 'node:crypto';
import pg from 'pg';

const [, , acao, tag] = process.argv;
if (!['preparar', 'limpar'].includes(acao) || !/^[a-z0-9]{6,16}$/.test(tag ?? '')) {
  console.error('uso: e2e-cartao-motorista.mjs preparar|limpar <tag de 6 a 16 letras/números minúsculos>');
  process.exit(2);
}
// localhost pode resolver para ::1 no Windows e o Postgres do Docker escuta no IPv4
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL.replace('localhost', '127.0.0.1') });
const fabricante = `E2E ${tag}`;
const codigo = `E2E${tag.toUpperCase()}`;
const placa = `E${tag.slice(0, 6).toUpperCase()}`;

try {
  const cliente = (await pool.query("select id from clients where name = 'Cliente Demo'")).rows[0];
  if (!cliente) throw new Error('Cliente Demo não existe: rode o global-setup (seed-demo-user) antes');
  if (acao === 'preparar') {
    const asset = (await pool.query('insert into assets (client_id, plate) values ($1, $2) returning id', [cliente.id, placa])).rows[0];
    const modelo = (await pool.query(
      `insert into rastreador_modelos (fabricante, nome, protocolo, porta, tipo_identificador, leitor_motorista)
       values ($1, 'RFID', 'jmak', 5259, 'imei', true) returning id`,
      [fabricante],
    )).rows[0];
    const imei = String(randomInt(1e9, 9e9)) + String(randomInt(1e5, 9e5));
    const rastreador = (await pool.query(
      `insert into rastreadores (imei, modelo_id, status) values ($1, $2, 'ativo') returning id`,
      [imei, modelo.id],
    )).rows[0];
    await pool.query('insert into rastreador_vinculos (client_id, rastreador_id) values ($1, $2)', [cliente.id, rastreador.id]);
    const instalacao = (await pool.query(
      `insert into instalacoes (client_id, rastreador_id, asset_id, instalado_em, tecnico) values ($1, $2, $3, now() - interval '1 day', 'e2e') returning id`,
      [cliente.id, rastreador.id, asset.id],
    )).rows[0];
    await pool.query(
      `insert into motorista_vinculos (client_id, asset_id, motorista_id, origem, codigo, rastreador_id, inicio)
       values ($1, $2, null, 'rastreador', $3, $4, now() - interval '10 minutes')`,
      [cliente.id, asset.id, codigo, rastreador.id],
    );
    console.log(JSON.stringify({ assetId: asset.id, codigo, instalacaoId: instalacao.id }));
  } else {
    const { rows: rs } = await pool.query(
      'select r.id from rastreadores r join rastreador_modelos m on m.id = r.modelo_id where m.fabricante = $1',
      [fabricante],
    );
    for (const { id } of rs) {
      await pool.query('delete from motorista_vinculos where rastreador_id = $1', [id]);
      await pool.query('delete from instalacoes where rastreador_id = $1', [id]);
      await pool.query('delete from rastreador_vinculos where rastreador_id = $1', [id]);
      await pool.query('delete from audit_log where target = $1', [id]);
      await pool.query('delete from rastreadores where id = $1', [id]);
    }
    await pool.query('delete from rastreador_modelos where fabricante = $1', [fabricante]);
    await pool.query('delete from motoristas where client_id = $1 and codigo_identificacao_norm = $2', [cliente.id, codigo]);
    await pool.query('delete from assets where client_id = $1 and plate = $2', [cliente.id, placa]);
  }
} finally {
  await pool.end();
}
