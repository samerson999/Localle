import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { E2E_EMAIL, E2E_SENHA } from './usuario';

// Apelido na lista de ativos (23/11/2026): veículo com placa mostra o apelido abaixo dela — na tabela (desktop) e no
// card (mobile, acima do modelo). Dados semeados por apps/api/scripts/e2e-apelido-ativo.mjs.

const CARGA = { timeout: 30_000 };
const script = (acao: 'preparar' | 'limpar', tag: string) =>
  execFileSync(process.execPath, ['scripts/e2e-apelido-ativo.mjs', acao, tag], { cwd: '../api', encoding: 'utf8' });

test.describe('apelido na lista de ativos', () => {
  test.describe.configure({ mode: 'serial', timeout: 150_000 });
  let tag: string;
  let dados: { placa: string; apelido: string };

  test.beforeEach(async ({ page }) => {
    tag = randomBytes(5).toString('hex');
    dados = JSON.parse(script('preparar', tag));
    await page.goto('/#/login');
    await page.getByPlaceholder('voce@empresa.com.br').fill(E2E_EMAIL);
    await page.getByPlaceholder('Sua senha').fill(E2E_SENHA);
    await page.getByRole('button', { name: 'Acessar plataforma' }).click();
    await expect(page).not.toHaveURL(/#\/login/, CARGA);
  });

  test.afterEach(() => {
    script('limpar', tag);
  });

  test('mostra o apelido junto da placa', async ({ page }) => {
    await page.goto('/#/ativos');
    await page.getByRole('searchbox', { name: 'Buscar ativo' }).or(page.getByLabel('Buscar ativo')).filter({ visible: true }).first().fill(dados.placa, { timeout: 90_000 });
    await expect(page.getByText(dados.apelido, { exact: true }).filter({ visible: true }).first()).toBeVisible(CARGA);
    await expect(page.getByText('VW 13.180 CNM').filter({ visible: true }).first()).toBeVisible();
  });

  test('Monitoramento acha o veículo pelo apelido e o mostra na lista', async ({ page, isMobile }) => {
    await page.goto('/#/monitoramento');
    await page.getByPlaceholder('Buscar placa, motorista ou modelo').filter({ visible: true }).first().fill(dados.apelido, { timeout: 90_000 });
    const lista = isMobile ? page.getByRole('list', { name: 'Veículos' }) : page.getByRole('list', { name: /veículos$/ });
    const item = lista.getByRole('button').filter({ hasText: dados.placa });
    await expect(item).toHaveCount(1, CARGA);
    await expect(item.getByText(dados.apelido, { exact: true })).toBeVisible();
  });
});
