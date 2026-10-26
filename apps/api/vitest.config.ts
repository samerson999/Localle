import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Mesmo mapeamento do `paths` do tsconfig (e de src/shared-alias.ts em runtime): a API importa código de
// packages/shared, não só tipos.
export default defineConfig({
  resolve: {
    alias: { '@localle/shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)) },
  },
});
