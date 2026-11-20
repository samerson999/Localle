// Apoio do e2e de redefinir senha pelo Console (apps/web/e2e/redefinir-senha.spec.ts). Só banco local.
//
//   node scripts/e2e-redefinir-senha.mjs criar <email>    → operador no "Cliente Demo", com senha qualquer
//   node scripts/e2e-redefinir-senha.mjs limpar <email>   → apaga esse usuário (e a auditoria dele)
import 'dotenv/config';
import pg from 'pg';

const [, , acao, email] = process.argv;
if (!['criar', 'limpar'].includes(acao) || !/^e2e-senha-[a-z0-9-]+@localle\.test$/.test(email ?? '')) {
  console.error('uso: e2e-redefinir-senha.mjs criar|limpar e2e-senha-<id>@localle.test');
  process.exit(2);
}
// localhost pode resolver para ::1 no Windows e o Postgres do Docker escuta no IPv4
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL.replace('localhost', '127.0.0.1') });
try {
  if (acao === 'criar') {
    await pool.query(
      `insert into users (client_id, email, password_hash, role)
       values ((select id from clients where name = 'Cliente Demo'), $1, '$2a$04$invalidoinvalidoinvalidoinvalidoinvalidoinvalidoinvali', 'operador')`,
      [email],
    );
  } else {
    await pool.query('delete from audit_log where target = (select id::text from users where email = $1)', [email]);
    await pool.query('delete from users where email = $1', [email]);
  }
} finally {
  await pool.end();
}
