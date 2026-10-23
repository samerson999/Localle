// Cria um cliente + usuário de teste local. Não há endpoint de cadastro ainda (fora do escopo do
// AuthModule inicial) — uso só para validar o AuthGuard/login manualmente em desenvolvimento.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const [, , email = 'gestor@demo.com', password = 'demo'] = process.argv;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const { rows: existing } = await pool.query('select id from clients where name = $1', ['Cliente Demo']);
const clientId = existing[0]?.id ?? (await pool.query(
  'insert into clients (name) values ($1) returning id',
  ['Cliente Demo'],
)).rows[0].id;

const passwordHash = await bcrypt.hash(password, 10);
await pool.query(
  `insert into users (client_id, email, password_hash, role) values ($1, $2, $3, 'admin')
   on conflict (email) do update set password_hash = excluded.password_hash`,
  [clientId, email, passwordHash],
);

console.log(`Usuário ${email} / ${password} pronto, client_id = ${clientId}`);
await pool.end();
