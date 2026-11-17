import { expect, test } from '@playwright/test';
import { E2E_EMAIL, E2E_SENHA } from './usuario';

test.describe('login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/login');
  });

  test('senha errada mantém na tela de login com mensagem de erro', async ({ page }) => {
    await page.getByPlaceholder('voce@empresa.com.br').fill(E2E_EMAIL);
    await page.getByPlaceholder('Sua senha').fill('senha-errada');
    await page.getByRole('button', { name: 'Acessar plataforma' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/#\/login/);
  });

  test('credencial certa entra na plataforma', async ({ page }) => {
    await page.getByPlaceholder('voce@empresa.com.br').fill(E2E_EMAIL);
    await page.getByPlaceholder('Sua senha').fill(E2E_SENHA);
    await page.getByRole('button', { name: 'Acessar plataforma' }).click();

    await expect(page).not.toHaveURL(/#\/login/);
  });
});
