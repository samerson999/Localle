// Wrapper para node-pg-migrate: com `node-linker=hoisted` (ver .npmrc da raiz), o pacote só existe em
// node_modules na raiz do monorepo, e o CLI resolve `templates/` relativo ao cwd do processo (não ao
// próprio pacote) — rodar via `pnpm --filter api migrate` (cwd = apps/api) sempre dá ENOENT. Este wrapper
// roda o CLI com cwd na raiz do repo e paths absolutos para as opções que dependem de apps/api.
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const apiDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const repoRoot = path.resolve(apiDir, '..', '..');
const cli = path.join(repoRoot, 'node_modules', 'node-pg-migrate', 'bin', 'node-pg-migrate.js');

const result = spawnSync(
  process.execPath,
  [
    cli,
    '-j', 'ts',
    '--tsconfig', path.join(apiDir, 'tsconfig.json'),
    '--migrations-dir', path.join(apiDir, 'migrations'),
    '--envPath', path.join(apiDir, '.env'),
    ...process.argv.slice(2),
  ],
  { cwd: repoRoot, stdio: 'inherit' },
);

process.exit(result.status ?? 1);
