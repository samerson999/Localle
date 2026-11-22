import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { E2E_LOCALE_EMAIL, E2E_LOCALE_SENHA } from './usuario';

// Console da Locale › Clientes › Usuários: a Locale define a senha nova de um usuário do cliente, e ele entra com ela.

const CARGA = { timeout: 30_000 };
const script = (acao: string, email: string) => execFileSync(process.execPath, ['scripts/e2e-redefinir-senha.mjs', acao, email], { cwd: '../api' });

test.describe('redefinir senha pelo Console', () => {
  test.describe.configure({ timeout: 90_000 });
  let email: string;

  test.beforeEach(() => {
    email = `e2e-senha-${randomUUID()}@localle.test`;
    script('criar', email);
  });

  test.afterEach(() => script('limpar', email));

  test('Locale define a senha e o usuário entra com ela', async ({ page, request }) => {
    await page.goto('/#/login');
    await page.getByPlaceholder('voce@empresa.com.br').fill(E2E_LOCALE_EMAIL);
    await page.getByPlaceholder('Sua senha').fill(E2E_LOCALE_SENHA);
    await page.getByRole('button', { name: 'Acessar plataforma' }).click();
    await expect(page).not.toHaveURL(/#\/login/, CARGA);

    await page.goto('/#/locale/clientes');
    const linha = page.locator('tr:visible, li:visible').filter({ hasText: 'Cliente Demo' }).first();
    await linha.getByRole('button', { name: 'Usuários' }).click();

    const dialogo = page.getByRole('dialog');
    await dialogo.locator('tr:visible, li:visible').filter({ hasText: email }).getByRole('button', { name: 'Redefinir senha' }).click();
    await page.getByRole('dialog').getByText('Outra senha').click(); // o padrão é a senha de reset da API
    const senha = `nova-${randomUUID().slice(0, 8)}`;
    await page.getByLabel('Nova senha').fill(senha);
    await page.getByLabel('Repita a senha').fill(senha);
    await page.getByRole('dialog').getByRole('button', { name: 'Redefinir senha' }).click();
    await expect(page.getByText(`Senha de ${email} redefinida.`)).toBeVisible();

    const r = await request.post('http://127.0.0.1:3000/auth/login', { data: { email, password: senha } });
    expect(r.ok()).toBe(true);
  });
});
