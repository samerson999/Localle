// Cria um superadmin de teste local. Sem endpoint de autocadastro (de propósito — superadmin é a Locale,
// provisionado fora de qualquer fluxo público) — uso só para validar o fluxo em desenvolvimento.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const [, , email = 'superadmin@locale.dev', password = 'demo'] = process.argv;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const passwordHash = await bcrypt.hash(password, 10);
await pool.query(
  `insert into superadmins (email, password_hash) values ($1, $2)
   on conflict (email) do update set password_hash = excluded.password_hash`,
  [email, passwordHash],
);

console.log(`Superadmin ${email} / ${password} pronto`);
await pool.end();
