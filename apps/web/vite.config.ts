import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import Icons from 'unplugin-icons/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Proxy da API de rastreamento: o navegador chama /api-rastreio?cmd=... e a chave é anexada aqui.
  // Comandos para o veículo (OBJECT_CMD_*) ficam bloqueados até serem liberados de propósito.
  // Integração desligada (VITE_RASTREIO_ON diferente de "true"): sem proxy, nenhuma chamada chega à API.
  const proxy = env.VITE_RASTREIO_ON !== 'true' ? {} : {
    '/api-rastreio': {
      target: env.RASTREIO_API_URL || 'https://rastreamento.ong.br',
      changeOrigin: true,
      bypass: (req: any) => (/cmd=OBJECT_CMD/i.test(decodeURIComponent(req.url || '')) ? false : undefined),
      rewrite: (p: string) => '/api/api.php?api=user&ver=1.0&key=' + (env.RASTREIO_API_KEY || '') + '&' + (p.split('?')[1] || ''),
    },
  };
  return {
    plugins: [react(), Icons({ compiler: 'jsx', jsx: 'react' })],
    resolve: {
      // motores/regras de negócio compartilháveis com o futuro backend (ver packages/shared/).
      alias: { '@localle/shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)) },
    },
    server: { port: 5173, open: true, proxy },
    preview: { proxy },
  };
});
