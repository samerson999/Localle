// Apoio do e2e de código por e-mail (apps/web/e2e/codigo-acesso.spec.ts). Só banco local; nenhum e-mail sai.
// Grava o código conhecido 123456 do mesmo jeito que a API (HMAC de `user_id:código` com o JWT_SECRET do .env,
// src/auth/codigo.ts) — o mesmo .env que a API de desenvolvimento lê.
//
//   node scripts/e2e-codigo.mjs convite <email>      → operador sem senha no "Cliente Demo", com convite aberto
//   node scripts/e2e-codigo.mjs redefinicao <email>  → operador com senha, com pedido de redefinição aberto
//   node scripts/e2e-codigo.mjs limpar <email>       → apaga esse usuário (e a auditoria dele)
import 'dotenv/config';
import { createHmac } from 'node:crypto';
import pg from 'pg';

export const CODIGO = '123456';
const [, , acao, email] = process.argv;
if (!['convite', 'redefinicao', 'limpar'].includes(acao) || !/^e2e-codigo-[a-z0-9-]+@localle\.test$/.test(email ?? '')) {
  console.error('uso: e2e-codigo.mjs convite|redefinicao|limpar e2e-codigo-<id>@localle.test');
  process.exit(2);
}
const hash = (userId) => createHmac('sha256', process.env.JWT_SECRET).update(`${userId}:${CODIGO}`).digest('hex');
// localhost pode resolver para ::1 no Windows e o Postgres do Docker escuta no IPv4
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL.replace('localhost', '127.0.0.1') });
try {
  if (acao === 'limpar') {
    await pool.query('delete from audit_log where target = (select id::text from users where email = $1)', [email]);
    await pool.query('delete from users where email = $1', [email]);
  } else {
    const senha = acao === 'convite' ? null : '$2a$04$invalidoinvalidoinvalidoinvalidoinvalidoinvalidoinvali';
    const { rows: [u] } = await pool.query(
      `insert into users (client_id, email, password_hash, role)
       values ((select id from clients where name = 'Cliente Demo'), $1, $2, 'operador') returning id, client_id`,
      [email, senha],
    );
    if (acao === 'convite') {
      await pool.query(
        `insert into convites (user_id, client_id, token_hash, expira_em, criado_por) values ($1, $2, $3, now() + interval '1 hour', $1)`,
        [u.id, u.client_id, hash(u.id)],
      );
    } else {
      await pool.query(
        `insert into senha_redefinicoes (user_id, client_id, token_hash, expira_em) values ($1, $2, $3, now() + interval '30 minutes')`,
        [u.id, u.client_id, hash(u.id)],
      );
    }
  }
} finally {
  await pool.end();
}
