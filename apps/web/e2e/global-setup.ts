import { execFileSync } from 'node:child_process';
import { E2E_EMAIL, E2E_SENHA } from './usuario';

// Garante o usuário dos testes no banco local (mesmo script do seed:demo-user, com e-mail próprio).
export default function globalSetup() {
  execFileSync(process.execPath, ['scripts/seed-demo-user.mjs', E2E_EMAIL, E2E_SENHA], {
    cwd: '../api',
    stdio: 'inherit',
  });
}
