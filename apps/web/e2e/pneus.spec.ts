import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { E2E_EMAIL, E2E_SENHA } from './usuario';

// Pneus na API (18/11/2026): antes ficavam só no navegador. O cadastro tem que sobreviver a um navegador limpo
// (outro aparelho, cache apagado), e as movimentações também.

const CARGA = { timeout: 30_000 };

async function entrar(page: Page) {
  await page.goto('/#/login');
  await page.getByPlaceholder('voce@empresa.com.br').fill(E2E_EMAIL);
  await page.getByPlaceholder('Sua senha').fill(E2E_SENHA);
  await page.getByRole('button', { name: 'Acessar plataforma' }).click();
  await expect(page).not.toHaveURL(/#\/login/, CARGA);
}

test.describe('pneus', () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 });
  let numero: string;

  test.beforeEach(async ({ page }) => {
    numero = String(randomInt(100_000, 999_999_999));
    await entrar(page);
  });

  test.afterEach(() => {
    execFileSync(process.execPath, ['scripts/e2e-pneus.mjs', 'limpar', numero], { cwd: '../api' });
  });

  test('pneu cadastrado continua lá num navegador limpo, e o envio à recapadora também', async ({ page, isMobile }) => {
    await page.goto('/#/pneus?aba=lista');
    await page.getByRole('button', { name: 'Cadastrar pneu' }).first().click();
    await page.getByPlaceholder('1024').fill(numero);
    await page.getByLabel('Valor de compra (R$)').fill('2100');
    await page.getByLabel('Fornecedor').fill('Pneus E2E');
    await page.getByRole('button', { name: 'Salvar pneu' }).click();
    await expect(page.getByText(`Pneu LC-${numero} cadastrado no estoque.`)).toBeVisible();

    // navegador limpo: nada do store local sobra, a lista vem só da API
    await page.evaluate(() => localStorage.clear());
    await entrar(page);
    await page.goto('/#/pneus?aba=lista');
    await page.getByLabel('Buscar pneu').fill(numero);
    const pneu = page.locator(isMobile ? 'div' : 'tr').filter({ hasText: `LC-${numero}` }).filter({ has: page.getByRole('button', { name: 'Abrir' }) }).last();
    await expect(pneu).toBeVisible(CARGA);

    await pneu.getByRole('button', { name: 'Abrir' }).click();
    await page.getByRole('button', { name: 'Enviar para recapagem' }).click();
    await expect(page.getByText(`LC-${numero} enviado à recapadora.`)).toBeVisible();

    await page.evaluate(() => localStorage.clear());
    await entrar(page);
    await page.goto('/#/pneus?aba=lista');
    await page.getByLabel('Buscar pneu').fill(numero);
    const linha = page.locator(isMobile ? 'div' : 'tr').filter({ hasText: `LC-${numero}` }).last();
    await expect(linha).toContainText('Na recapadora', CARGA);
  });
});
