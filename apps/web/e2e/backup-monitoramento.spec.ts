import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { E2E_EMAIL, E2E_SENHA } from './usuario';

// Backup no card do Monitoramento (23/11/2026): o marcador do mapa continua do principal, mas o card do ativo mostra a
// última posição do backup, com Google Maps/Street View no ponto dele. Dados semeados por apps/api/scripts/e2e-backup-ativo.mjs.

interface Dados { assetId: string; placa: string; imeiBackup: string }

const CARGA = { timeout: 30_000 };
const script = (acao: 'preparar' | 'limpar', tag: string) =>
  execFileSync(process.execPath, ['scripts/e2e-backup-ativo.mjs', acao, tag], { cwd: '../api', encoding: 'utf8' });

test.describe('backup no card do Monitoramento', () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 });
  let tag: string;
  let dados: Dados;

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

  test('card do ativo mostra a última posição do backup e abre o Google Maps nela', async ({ page, isMobile }) => {
    await page.goto('/#/monitoramento');
    await page.getByPlaceholder('Buscar placa, motorista ou modelo').filter({ visible: true }).first().fill(dados.placa, CARGA);
    if (isMobile) await page.getByRole('list', { name: 'Veículos' }).getByRole('button').filter({ hasText: dados.placa }).first().click(CARGA);
    else await page.getByRole('button').filter({ hasText: dados.placa }).first().click(CARGA);

    const card = isMobile ? page.getByRole('region', { name: `Veículo ${dados.placa}` }) : page.getByRole('region', { name: 'Backup' });
    await expect(card.getByText(/backup/i).first()).toBeVisible(CARGA);
    if (!isMobile) await expect(card.getByText(dados.imeiBackup)).toBeVisible();
    // o link do backup aponta para o ponto do backup (Campinas), não para o do principal (São Paulo)
    const maps = isMobile ? card.getByRole('link', { name: 'Abrir no Google Maps (backup)' }) : card.getByRole('link', { name: 'Abrir no Google Maps' });
    await expect(maps).toHaveAttribute('href', /query=-22\.90556,-47\.06083/);
  });
});
