import { defineConfig, devices } from '@playwright/test';

// Testes de ponta a ponta do front (pnpm --filter web e2e). Sobem um Vite próprio na 5180, para não
// mexer no dev server do dia a dia (5174), e reaproveitam a API se ela já estiver na 3000.
// Pré-requisito: banco local no ar (infra/plataforma) — a API e o login são reais, sem mock.
const WEB_PORT = 5180;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  retries: 0,
  // login (bcrypt) e carga da frota com desktop + mobile em paralelo contra o Vite de desenvolvimento passam dos 5 s
  // padrão do expect nesta máquina; o que se espera de cada tela não muda, só a paciência
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }, // 412px, perto da auditoria de 390px
  ],
  webServer: [
    {
      command: 'pnpm --filter api dev',
      cwd: '../..',
      port: 3000,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort --open false --host 127.0.0.1`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
