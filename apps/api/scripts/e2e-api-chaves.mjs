// Apoio do e2e da API pública (apps/web/e2e/api-chaves.spec.ts). Só banco local.
//
//   node scripts/e2e-api-chaves.mjs limpar  → revoga as chaves "E2E ..." do cliente do e2e e as chaves mestras "E2E ..."
//                                             que sobraram de uma execução interrompida (o limite é de 10 chaves ativas)
import 'dotenv/config';
import pg from 'pg';

if (process.argv[2] !== 'limpar') {
  console.error('uso: e2e-api-chaves.mjs limpar');
  process.exit(2);
}
// localhost pode resolver para ::1 no Windows e o Postgres do Docker escuta no IPv4
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL.replace('localhost', '127.0.0.1') });
try {
  await pool.query(
    `update api_chaves set revogada_em = now()
      where revogada_em is null and nome like 'E2E %'
        and client_id = (select client_id from users where email = 'e2e@localle.test')`,
  );
  await pool.query(`update api_chaves_mestras set revogada_em = now() where revogada_em is null and nome like 'E2E %'`);
} finally {
  await pool.end();
}
