// Apoio do e2e da equipe por usuário + senha (apps/web/e2e/equipe-acessos.spec.ts). Só banco local; nenhum e-mail sai.
//
//   node scripts/e2e-equipe.mjs grupo <id>            → grupo "E2E <id>" no "Cliente Demo" com UM ativo; imprime { grupo, assetId }
//   node scripts/e2e-equipe.mjs codigo <usuario> <email> → confirmação de e-mail aberta com o código 123456 para o usuário
//   node scripts/e2e-equipe.mjs limpar <id> <usuario>    → apaga o usuário (mesmo excluído), a auditoria dele e o grupo
import 'dotenv/config';
import { createHmac } from 'node:crypto';
import pg from 'pg';

const CODIGO = '123456';
const [, , acao, a, b] = process.argv;
const ID = /^[a-z0-9]{8}$/;
const USUARIO = /^e2e-[a-z0-9]{8}$/;
const valido =
  (acao === 'grupo' && ID.test(a ?? '')) ||
  (acao === 'codigo' && USUARIO.test(a ?? '') && /^e2e-[a-z0-9]{8}@localle\.test$/.test(b ?? '')) ||
  (acao === 'limpar' && ID.test(a ?? '') && USUARIO.test(b ?? ''));
if (!valido) {
  console.error('uso: e2e-equipe.mjs grupo <id8> | codigo e2e-<id8> e2e-<id8>@localle.test | limpar <id8> e2e-<id8>');
  process.exit(2);
}
// localhost pode resolver para ::1 no Windows e o Postgres do Docker escuta no IPv4
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL.replace('localhost', '127.0.0.1') });
try {
  if (acao === 'grupo') {
    const { rows: [c] } = await pool.query(`select id from clients where name = 'Cliente Demo'`);
    const { rows: [asset] } = await pool.query(`select id from assets where client_id = $1 and status = 'ativo' order by plate limit 1`, [c.id]);
    const { rows: [g] } = await pool.query('insert into asset_groups (client_id, name) values ($1, $2) returning id', [c.id, `E2E ${a}`]);
    await pool.query('insert into asset_group_members (client_id, group_id, asset_id) values ($1, $2, $3)', [c.id, g.id, asset.id]);
    console.log(JSON.stringify({ grupo: `E2E ${a}`, assetId: asset.id }));
  } else if (acao === 'codigo') {
    const { rows: [u] } = await pool.query('select id, client_id from users where username = $1 and excluido_em is null', [a]);
    const hash = createHmac('sha256', process.env.JWT_SECRET).update(`${u.id}:${CODIGO}`).digest('hex');
    await pool.query(
      `insert into email_confirmacoes (user_id, client_id, email, token_hash, expira_em) values ($1, $2, $3, $4, now() + interval '30 minutes')`,
      [u.id, u.client_id, b, hash],
    );
  } else {
    const { rows } = await pool.query('select id from users where username = $1', [b]);
    for (const u of rows) {
      await pool.query('delete from audit_log where target = $1', [u.id]);
      await pool.query('delete from users where id = $1', [u.id]);
    }
    await pool.query(`delete from asset_groups where name = $1`, [`E2E ${a}`]);
  }
} finally {
  await pool.end();
}
