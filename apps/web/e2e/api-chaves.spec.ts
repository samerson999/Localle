import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { E2E_LOCALE_EMAIL, E2E_LOCALE_SENHA } from './usuario';

// API pública de consulta (docs/PLANO-API-PUBLICA.md): no Console › API, o superadmin gera a chave vinculada a um
// cliente (64 caracteres), ela consulta /api/v1/veiculos, o reset troca o valor e a revogação corta. A chave mestra
// consulta pelo caminho do cliente. O Swagger em /api/v1/docs não menciona a chave mestra.

const CARGA = { timeout: 30_000 };
const limpar = () => execFileSync(process.execPath, ['scripts/e2e-api-chaves.mjs', 'limpar'], { cwd: '../api' });

async function entrar(page: Page, email: string, senha: string) {
  await page.goto('/#/login');
  await page.getByPlaceholder('voce@empresa.com.br').fill(email);
  await page.getByPlaceholder('Sua senha').fill(senha);
  await page.getByRole('button', { name: 'Acessar plataforma' }).click();
  // a primeira entrada da execução pega o Vite e a API compilando a frio
  await expect(page).not.toHaveURL(/#\/login/, { timeout: 60_000 });
}

/** Lê a chave do modal "mostrada uma vez" e fecha. */
async function chaveDoModal(page: Page) {
  const campo = page.getByTestId('chave-criada');
  await expect(campo).toBeVisible(CARGA);
  const chave = await campo.inputValue();
  await page.getByRole('dialog').getByRole('button', { name: 'Já guardei' }).click();
  return chave;
}

test.describe('API pública', () => {
  // as duas viewports usam o mesmo cliente e o mesmo limite de chaves: em série
  test.describe.configure({ mode: 'serial', timeout: 90_000 });
  test.beforeAll(limpar);
  test.afterAll(limpar);

  test('Console: gera a chave do cliente, consulta os veículos, reseta e revoga', async ({ page }) => {
    await entrar(page, E2E_LOCALE_EMAIL, E2E_LOCALE_SENHA);
    await page.goto('/#/locale/api');
    // primeira tela da execução: o Vite do e2e compila a página a frio (passa de 30 s na primeira vez)
    await expect(page.getByRole('heading', { name: 'Chaves dos clientes' })).toBeVisible({ timeout: 60_000 });

    const nome = `E2E ${randomUUID().slice(0, 8)}`;
    await page.getByRole('button', { name: 'Gerar chave' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Cliente').click();
    await page.getByRole('option', { name: 'Cliente Demo', exact: true }).click();
    await dialogo.getByLabel('Nome').fill(nome);
    await dialogo.getByText('Frota e cadastros').click();
    await dialogo.getByRole('button', { name: 'Gerar chave' }).click();
    const chave = await chaveDoModal(page);
    expect(chave).toMatch(/^[A-Za-z0-9!#%*+\-.=@^_~]{64}$/);
    await expect(linhaDaChave(page, nome)).toBeVisible(CARGA);

    const auth = (k: string) => ({ authorization: `Bearer ${k}` });
    const r = await page.request.get('/api/v1/veiculos?limite=5', { headers: auth(chave) });
    expect(r.status()).toBe(200);
    expect(Array.isArray((await r.json()).dados)).toBe(true);
    expect(r.headers()['x-request-id']).toBeTruthy();
    expect((await page.request.get('/api/v1/veiculos', { headers: auth('x'.repeat(64)) })).status()).toBe(401);

    // reset: valor novo; o anterior para na hora
    await linhaDaChave(page, nome).getByRole('button', { name: 'Resetar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Resetar' }).click();
    const nova = await chaveDoModal(page);
    expect(nova).not.toBe(chave);
    expect((await page.request.get('/api/v1/veiculos', { headers: auth(chave) })).status()).toBe(401);
    expect((await page.request.get('/api/v1/veiculos', { headers: auth(nova) })).status()).toBe(200);

    // revogar: a chave passa a receber 401
    await linhaDaChave(page, nome).getByRole('button', { name: 'Revogar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Revogar' }).click();
    await expect(page.getByText('Chave revogada.')).toBeVisible(CARGA);
    expect((await page.request.get('/api/v1/veiculos', { headers: auth(nova) })).status()).toBe(401);
  });

  test('o Swagger fica em /api/v1/docs e não menciona a chave mestra', async ({ page }) => {
    const r = await page.request.get('/api/v1/openapi.json');
    expect(r.status()).toBe(200);
    const doc = await r.json();
    expect(Object.keys(doc.paths)).toContain('/v1/veiculos');
    expect(JSON.stringify(doc).toLowerCase()).not.toMatch(/clientes|master|mestra/);
    await page.goto('/api/v1/docs');
    await expect(page.getByText('API de consulta').first()).toBeVisible(CARGA);
  });

  test('Console: chave mestra consulta pelo caminho do cliente e é revogada', async ({ page }) => {
    await entrar(page, E2E_LOCALE_EMAIL, E2E_LOCALE_SENHA);
    await page.goto('/#/locale/api?aba=mestras');
    await expect(page.getByRole('heading', { name: 'Chaves mestras' })).toBeVisible(CARGA);

    const nome = `E2E ${randomUUID().slice(0, 8)}`;
    await page.getByRole('button', { name: 'Nova chave mestra' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Nome').fill(nome);
    // o Vite repassa a chamada à API a partir da própria máquina
    await dialogo.getByLabel('IPs permitidos').fill('127.0.0.1, ::1');
    await dialogo.getByRole('button', { name: 'Gerar chave' }).click();
    const chave = await chaveDoModal(page);
    expect(chave).toHaveLength(64);

    const auth = { authorization: `Bearer ${chave}` };
    const clientes = await page.request.get('/api/v1/clientes', { headers: auth });
    expect(clientes.status()).toBe(200);
    const lista: { id: string; nome: string }[] = (await clientes.json()).dados;
    expect(lista.length).toBeGreaterThan(0);
    expect((await page.request.get(`/api/v1/clientes/${lista[0].id}/veiculos?limite=1`, { headers: auth })).status()).toBe(200);
    // sem o cliente no caminho, a chave mestra não consulta
    expect((await page.request.get('/api/v1/veiculos', { headers: auth })).status()).toBe(401);

    const linha = linhaDaChave(page, nome);
    await linha.getByRole('button', { name: 'Acessos' }).click();
    await expect(page.getByRole('dialog').getByText(`/v1/clientes/${lista[0].id}/veiculos`).filter({ visible: true }).first()).toBeVisible(CARGA);
    await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).first().click();

    await linha.getByRole('button', { name: 'Revogar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Revogar' }).click();
    await expect(page.getByText('Chave revogada.')).toBeVisible(CARGA);
    expect((await page.request.get('/api/v1/clientes', { headers: auth })).status()).toBe(401);
  });
});

/** Linha da tabela (desktop) ou cartão da lista (celular) da chave com esse nome — a que estiver visível. */
function linhaDaChave(page: Page, nome: string) {
  return page.getByRole('row').or(page.getByRole('listitem')).filter({ hasText: nome, visible: true }).first();
}
