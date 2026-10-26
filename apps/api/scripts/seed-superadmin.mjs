// Cria (ou redefine a senha de) um superadmin. Sem endpoint de autocadastro, de propósito: superadmin é
// a Locale, provisionado fora de qualquer fluxo público.
// Uso: pnpm --filter api seed:superadmin [email] [senha]
// Sem senha, gera uma aleatória forte e mostra uma única vez — não existe senha padrão conhecida.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const [, , email = 'superadmin@locale.dev', informada] = process.argv;
const password = informada ?? randomBytes(12).toString('base64url');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const passwordHash = await bcrypt.hash(password, 10);
await pool.query(
  `insert into superadmins (email, password_hash) values ($1, $2)
   on conflict (email) do update set password_hash = excluded.password_hash, updated_at = now()`,
  [email, passwordHash],
);

console.log(`Superadmin pronto: ${email}`);
if (!informada) console.log(`Senha gerada (anote agora, não será mostrada de novo): ${password}`);
await pool.end();
