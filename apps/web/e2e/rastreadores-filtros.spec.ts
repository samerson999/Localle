import { expect, test } from '@playwright/test';
import { E2E_LOCALE_EMAIL, E2E_LOCALE_SENHA } from './usuario';

// Console › Rastreadores (23/11/2026): o inventário filtra por situação, cliente e placa e busca pelo IMEI ou número de série.

const CARGA = { timeout: 30_000 };

test.describe.configure({ timeout: 90_000 });

test('inventário de rastreadores busca pelo IMEI ou série e tem filtro de cliente e placa', async ({ page, isMobile }) => {
  await page.goto('/#/login');
  await page.getByPlaceholder('voce@empresa.com.br').fill(E2E_LOCALE_EMAIL);
  await page.getByPlaceholder('Sua senha').fill(E2E_LOCALE_SENHA);
  await page.getByRole('button', { name: 'Acessar plataforma' }).click();
  await expect(page).not.toHaveURL(/#\/login/, CARGA);

  await page.goto('/#/locale/rastreadores');
  const titulo = page.getByRole('heading', { name: /^\d+ rastreadores$/ });
  await expect(titulo).toBeVisible(CARGA);
  // espera a lista chegar (durante a carga o título mostra 0): ou o total já carregado, ou o vazio
  await expect(page.getByRole('heading', { name: /^[1-9]\d* rastreadores$/ }).or(page.getByText('Nenhum rastreador cadastrado')).first()).toBeVisible(CARGA);
  const antes = await titulo.textContent();

  const imei = page.getByLabel('Buscar pelo IMEI ou número de série');
  await imei.fill('000000000000000123456789');
  await expect(page.getByRole('heading', { name: '0 rastreadores' })).toBeVisible();
  await imei.fill('');
  await expect(page.getByRole('heading', { name: antes! })).toBeVisible();

  if (isMobile) await page.getByRole('button', { name: /Filtros/ }).click();
  await expect(page.getByLabel('Filtrar por cliente')).toBeVisible();
  const placa = page.getByLabel('Filtrar por placa');
  await placa.fill('ZZZ9Z99');
  await expect(page.getByRole('heading', { name: '0 rastreadores' })).toBeAttached();
});
