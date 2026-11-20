// Limpeza do e2e de pneus (apps/web/e2e/pneus.spec.ts): apaga do "Cliente Demo" (cliente do usuário e2e) os pneus
// cadastrados pela tela com o número do teste. Só banco local.
//
//   node scripts/e2e-pneus.mjs limpar <número>   → apaga os pneus cujo número de fogo termina em -<número>
import 'dotenv/config';
import pg from 'pg';

const [, , acao, numero] = process.argv;
if (acao !== 'limpar' || !/^[0-9]{6,12}$/.test(numero ?? '')) {
  console.error('uso: e2e-pneus.mjs limpar <número de 6 a 12 dígitos>');
  process.exit(2);
}
// localhost pode resolver para ::1 no Windows e o Postgres do Docker escuta no IPv4
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL.replace('localhost', '127.0.0.1') });
try {
  await pool.query(
    `delete from pneus where client_id = (select id from clients where name = 'Cliente Demo') and numero_fogo like $1`,
    [`%-${numero}`],
  );
} finally {
  await pool.end();
}
