import { expect, test, type Page } from '@playwright/test';
import { E2E_EMAIL, E2E_LOCALE_EMAIL, E2E_LOCALE_SENHA, E2E_SENHA } from './usuario';

// Exportação de relatório (23/11/2026): o modal só fecha quando o arquivo sai de verdade, e uma falha na geração
// aparece na tela em vez de sumir (antes a barra enchia em 1,1 s, o modal fechava e o download chegava minutos depois,
// ou nunca).

const CARGA = { timeout: 30_000 };

test.describe.configure({ timeout: 90_000 });

async function entrar(page: Page, email: string, senha: string) {
  await page.goto('/#/login');
  await page.getByPlaceholder('voce@empresa.com.br').fill(email);
  await page.getByPlaceholder('Sua senha').fill(senha);
  await page.getByRole('button', { name: 'Acessar plataforma' }).click();
  await expect(page).not.toHaveURL(/#\/login/, CARGA);
}

test('modal de exportação conclui e avisa quando não há o que exportar', async ({ page }) => {
  await entrar(page, E2E_EMAIL, E2E_SENHA);
  await page.goto('/#/relatorios/uso');
  await page.getByRole('button', { name: 'Gerar relatório' }).click();
  const modal = page.getByRole('dialog', { name: 'Exportar relatório' });
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Gerar PDF' }).click();
  await expect(modal).toBeHidden(CARGA);
  const vazio = page.getByText('Nada para exportar neste período.');
  const gerado = page.getByText(/Relatório de uso gerado com/);
  await expect(vazio.or(gerado).first()).toBeVisible();
});

test('planilha do faturamento baixa; sem o gerador, avisa na tela', async ({ page }) => {
  await entrar(page, E2E_LOCALE_EMAIL, E2E_LOCALE_SENHA);
  await page.goto('/#/locale/faturamento');
  const exportar = page.getByRole('button', { name: 'Exportar para o financeiro' });
  await expect(exportar).toBeVisible(CARGA);
  test.skip(await exportar.isDisabled(), 'banco local sem clientes no faturamento');

  const download = page.waitForEvent('download');
  await exportar.click();
  expect((await download).suggestedFilename()).toMatch(/^Faturamento_\d{4}-\d{2}\.xlsx$/);

  // gerador indisponível (sem rede, ou arquivo de um deploy anterior que saiu do servidor): aviso, não silêncio
  await page.reload();
  await page.route(/xlsx\.js/, (r) => r.abort());
  await expect(exportar).toBeEnabled(CARGA);
  await exportar.click();
  await expect(page.getByText('Não foi possível gerar a planilha')).toBeVisible();
});
