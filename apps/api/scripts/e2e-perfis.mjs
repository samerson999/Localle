// Apoio do e2e de perfis de acesso (apps/web/e2e/perfis-acesso.spec.ts). Só banco local.
//
//   node scripts/e2e-perfis.mjs criar <email> <senha>  → perfil próprio sem Multas e sem comandos no "Cliente Demo", e
//                                                        um usuário nele com essa senha
//   node scripts/e2e-perfis.mjs limpar <email>         → apaga o usuário, o perfil dele e a auditoria
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const [, , acao, email, senha] = process.argv;
if (!['criar', 'limpar'].includes(acao) || !/^e2e-perfil-[a-z0-9-]+@localle\.test$/.test(email ?? '') || (acao === 'criar' && !senha)) {
  console.error('uso: e2e-perfis.mjs criar e2e-perfil-<id>@localle.test <senha> | limpar e2e-perfil-<id>@localle.test');
  process.exit(2);
}
// localhost pode resolver para ::1 no Windows e o Postgres do Docker escuta no IPv4
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL.replace('localhost', '127.0.0.1') });
const nomePerfil = `E2E ${email.slice('e2e-perfil-'.length, 'e2e-perfil-'.length + 8)}`;
try {
  if (acao === 'criar') {
    const { rows: [c] } = await pool.query(`select id from clients where name = 'Cliente Demo'`);
    const { rows: [p] } = await pool.query(
      `insert into perfis (client_id, nome, base_role) values ($1, $2, 'operador') returning id`,
      [c.id, nomePerfil],
    );
    for (const key of ['multas.ver', 'comandos.enviar', 'comandos.bloquear']) {
      await pool.query(`insert into perfil_permissoes (client_id, perfil_id, permission_key, allowed) values ($1, $2, $3, false)`, [c.id, p.id, key]);
    }
    await pool.query(
      `insert into users (client_id, email, password_hash, role, perfil_id, email_confirmado_em) values ($1, $2, $3, 'operador', $4, now())`,
      [c.id, email, await bcrypt.hash(senha, 4), p.id],
    );
  } else {
    const { rows } = await pool.query('select id, perfil_id from users where email = $1', [email]);
    for (const u of rows) {
      await pool.query('delete from audit_log where target = $1', [u.id]);
      await pool.query('delete from users where id = $1', [u.id]);
      if (u.perfil_id) await pool.query('delete from perfis where id = $1', [u.perfil_id]);
    }
  }
} finally {
  await pool.end();
}
