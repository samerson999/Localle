import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

// Código de 6 dígitos por e-mail: primeiro acesso (convite) e "esqueci minha senha". O código conhecido é gravado
// direto no banco (apps/api/scripts/e2e-codigo.mjs) — nenhum e-mail sai no teste.

const CODIGO = '123456';
const CARGA = { timeout: 30_000 };
const script = (acao: string, email: string) => execFileSync(process.execPath, ['scripts/e2e-codigo.mjs', acao, email], { cwd: '../api' });

test.describe('código por e-mail', () => {
  test.describe.configure({ timeout: 90_000 });
  let email: string;

  test.beforeEach(() => { email = `e2e-codigo-${randomUUID()}@localle.test`; });
  test.afterEach(() => script('limpar', email));

  test('primeiro acesso: código errado avisa; o certo pede a senha e já entra', async ({ page, request }) => {
    script('convite', email);
    await page.goto(`/#/primeiro-acesso?email=${encodeURIComponent(email)}`);
    await expect(page.getByRole('heading', { name: 'Primeiro acesso' })).toBeVisible(CARGA);
    await expect(page.getByText(email)).toBeVisible();

    const otp = page.getByLabel('Código de 6 dígitos');
    await otp.fill('000000');
    await expect(page.getByRole('alert')).toContainText('Código inválido ou expirado');

    await otp.fill(CODIGO);
    await expect(page.getByRole('heading', { name: 'Criar sua senha' })).toBeVisible();
    await expect(page.getByText('Cliente Demo')).toBeVisible();
    const senha = `nova-${randomUUID().slice(0, 8)}`;
    await page.getByLabel('Nova senha').fill(senha);
    await page.getByLabel('Repita a senha').fill(senha);
    await page.getByRole('button', { name: 'Criar senha e entrar' }).click();
    await expect(page).not.toHaveURL(/primeiro-acesso/, CARGA);

    const r = await request.post('http://127.0.0.1:3000/auth/login', { data: { email, password: senha } });
    expect(r.ok()).toBe(true);
  });

  test('esqueci minha senha: o login leva à tela do código; com o código, a senha nova vale', async ({ page, request }) => {
    // e-mail inexistente: a API responde igual e não envia nada; só confere a navegação do login
    await page.goto('/#/login');
    await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
    await page.getByPlaceholder('voce@empresa.com.br').fill(email);
    await page.getByRole('button', { name: 'Enviar código' }).click();
    await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible(CARGA);
    await expect(page).toHaveURL(/#\/redefinir-senha\?email=/);

    script('redefinicao', email);
    await page.goto(`/#/redefinir-senha?email=${encodeURIComponent(email)}`);
    await page.getByLabel('Código de 6 dígitos').fill(CODIGO);
    await expect(page.getByRole('heading', { name: 'Nova senha' })).toBeVisible();
    const senha = `nova-${randomUUID().slice(0, 8)}`;
    await page.getByLabel('Nova senha').fill(senha);
    await page.getByLabel('Repita a senha').fill(senha);
    await page.getByRole('button', { name: 'Salvar senha e entrar' }).click();
    await expect(page).not.toHaveURL(/redefinir-senha/, CARGA);

    const r = await request.post('http://127.0.0.1:3000/auth/login', { data: { email, password: senha } });
    expect(r.ok()).toBe(true);
  });

  test('esqueci minha senha da equipe da Localle: com o código, entra no Painel da Localle', async ({ page, request }) => {
    script('redefinicao-sa', email);
    await page.goto(`/#/redefinir-senha?email=${encodeURIComponent(email)}`);
    await page.getByLabel('Código de 6 dígitos').fill(CODIGO);
    await expect(page.getByRole('heading', { name: 'Nova senha' })).toBeVisible(CARGA);
    const senha = `nova-${randomUUID().slice(0, 8)}`;
    await page.getByLabel('Nova senha').fill(senha);
    await page.getByLabel('Repita a senha').fill(senha);
    await page.getByRole('button', { name: 'Salvar senha e entrar' }).click();
    await expect(page).toHaveURL(/#\/locale/, CARGA);

    const r = await request.post('http://127.0.0.1:3000/superadmin/login', { data: { email, password: senha } });
    expect(r.ok()).toBe(true);
  });
});
