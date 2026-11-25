import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { E2E_EMAIL, E2E_SENHA } from './usuario';

// Setup › Equipe e acessos sem convite por e-mail (25/11/2026): o admin cria usuário + senha e escolhe os grupos que a
// pessoa vê; ela entra pelo usuário, cadastra o e-mail no primeiro acesso (código conhecido gravado no banco por
// apps/api/scripts/e2e-equipe.mjs — nenhum e-mail sai) e a API só devolve os veículos do grupo. Excluída, não entra mais.

const CARGA = { timeout: 30_000 };
const API = 'http://127.0.0.1:3000';
const script = (...args: string[]) => execFileSync(process.execPath, ['scripts/e2e-equipe.mjs', ...args], { cwd: '../api' }).toString();

async function entrar(page: Page, login: string, senha: string) {
  await page.goto('/#/login');
  await page.getByLabel('E-mail ou usuário').fill(login);
  await page.getByPlaceholder('Sua senha').fill(senha);
  await page.getByRole('button', { name: 'Acessar plataforma' }).click();
  await expect(page).not.toHaveURL(/#\/login/, CARGA);
}

test.describe('equipe por usuário + senha', () => {
  test.describe.configure({ timeout: 120_000 });
  const id = randomUUID().replace(/-/g, '').slice(0, 8);
  const usuario = `e2e-${id}`;
  const email = `e2e-${id}@localle.test`;
  const senha = `senha-${id}`;
  let grupo: { grupo: string; assetId: string };

  test.beforeAll(() => { grupo = JSON.parse(script('grupo', id)); });
  test.afterAll(() => { script('limpar', id, usuario); });

  test('admin cria acesso restrito a um grupo; a pessoa entra pelo usuário, cadastra o e-mail (que aparece no perfil) e só vê o grupo; excluída, não entra', async ({ page, browser, request }, info) => {
    test.skip(info.project.name !== 'desktop', 'cria um usuário de verdade: roda uma vez só');

    await entrar(page, E2E_EMAIL, E2E_SENHA);
    await page.goto('/#/setup?aba=equipe');
    await page.getByRole('button', { name: 'Novo acesso' }).first().click(CARGA);
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Usuário').fill(usuario.toUpperCase());
    await dialogo.getByLabel('Senha').fill(senha);
    await dialogo.getByText('Só alguns grupos ou operações').click();
    await expect(dialogo.getByText('Marque ao menos um grupo')).toBeVisible();
    await expect(dialogo.getByRole('button', { name: 'Criar acesso' })).toBeDisabled();
    await dialogo.getByText(grupo.grupo, { exact: true }).click();
    await dialogo.getByRole('button', { name: 'Criar acesso' }).click();
    const linha = page.getByRole('row').filter({ hasText: usuario });
    await expect(linha).toBeVisible(CARGA);
    await expect(linha).toContainText(grupo.grupo);
    await expect(linha).toContainText('E-mail ainda não cadastrado');

    // a pessoa, em outra sessão
    const ctx = await browser.newContext();
    const pessoa = await ctx.newPage();
    await pessoa.route('**/conta/email', (route) => route.request().method() === 'POST' ? route.fulfill({ json: { enviado: true } }) : route.continue());
    await entrar(pessoa, usuario, senha);
    await expect(pessoa.getByRole('heading', { name: 'Cadastre seu e-mail' })).toBeVisible(CARGA);
    await pessoa.getByLabel('Seu e-mail').fill(email);
    await pessoa.getByRole('button', { name: 'Enviar código' }).click();
    await expect(pessoa.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible(CARGA);
    script('codigo', usuario, email);
    await pessoa.getByLabel('Código de 6 dígitos').fill('123456');
    await expect(pessoa.getByRole('heading', { name: 'Cadastre seu e-mail' })).toHaveCount(0, CARGA);
    await expect(pessoa.getByRole('heading', { name: 'Confira seu e-mail' })).toHaveCount(0);
    // o perfil mostra o e-mail confirmado e o usuário, não o que foi digitado no login
    await pessoa.goto('/#/conta');
    await expect(pessoa.getByText(email, { exact: true })).toBeVisible(CARGA);
    await expect(pessoa.getByText(`Usuário: ${usuario}`)).toBeVisible();
    await ctx.close();

    // a API só devolve o veículo do grupo — inclusive para o login pelo e-mail recém-confirmado
    const login = await request.post(`${API}/auth/login`, { data: { email, password: senha } });
    expect(login.ok()).toBe(true);
    const headers = { Authorization: `Bearer ${(await login.json()).accessToken}` };
    const ativos = await (await request.get(`${API}/assets?incluirInativos=true`, { headers })).json();
    expect(ativos.map((a: { id: string }) => a.id)).toEqual([grupo.assetId]);
    const atual = await (await request.get(`${API}/monitoring/current`, { headers })).json();
    expect(atual.every((p: { assetId: string }) => p.assetId === grupo.assetId)).toBe(true);

    // o admin vê o e-mail na equipe e exclui o acesso
    await page.reload();
    await expect(linha).toContainText(email, CARGA);
    await linha.getByRole('button', { name: `Ações de ${usuario}` }).click();
    await page.getByRole('menuitem', { name: 'Excluir' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByRole('row').filter({ hasText: usuario })).toHaveCount(0, CARGA);
    expect((await request.post(`${API}/auth/login`, { data: { email: usuario, password: senha } })).status()).toBe(401);
    expect((await request.get(`${API}/assets`, { headers })).status()).toBe(401);
  });
});
