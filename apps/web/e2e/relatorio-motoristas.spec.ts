import { expect, test, type Page } from '@playwright/test';
import { E2E_EMAIL, E2E_SENHA } from './usuario';

// Relatório de motoristas (26/11/2026): atalho no hub, filtros de motorista/veículo/período, as duas tabelas e a
// exportação (que avisa quando não há jornada no período).

const CARGA = { timeout: 30_000 };

test.describe.configure({ timeout: 90_000 });

async function entrar(page: Page) {
  await page.goto('/#/login');
  await page.getByPlaceholder('voce@empresa.com.br').fill(E2E_EMAIL);
  await page.getByPlaceholder('Sua senha').fill(E2E_SENHA);
  await page.getByRole('button', { name: 'Acessar plataforma' }).click();
  await expect(page).not.toHaveURL(/#\/login/, CARGA);
}

test('abre pelo hub, mostra filtros e tabelas, e exporta', async ({ page }) => {
  await entrar(page);
  await page.goto('/#/relatorios');
  await page.getByRole('button', { name: /Motoristas/ }).first().click();
  await expect(page).toHaveURL(/#\/relatorios\/motoristas/);
  await expect(page.getByText('Motorista', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Resumo por motorista')).toBeVisible();
  await expect(page.getByText('Jornada por dia e veículo')).toBeVisible();
  await expect(page.getByText('Todos os motoristas').first()).toBeVisible();

  await page.getByRole('button', { name: '7 dias' }).click();
  await page.getByRole('button', { name: 'Gerar relatório' }).click();
  const modal = page.getByRole('dialog', { name: 'Exportar relatório' });
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Gerar PDF' }).click();
  await expect(modal).toBeHidden(CARGA);
  await expect(page.getByText('Nada para exportar neste período.').or(page.getByText(/Relatório de motoristas gerado com/)).first()).toBeVisible();
});
