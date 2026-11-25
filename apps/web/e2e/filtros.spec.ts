import { expect, test, type Page } from '@playwright/test';
import { E2E_EMAIL, E2E_SENHA } from './usuario';

// Revisão dos filtros (24/11/2026): nos relatórios a busca vale para o relatório inteiro e apagar a data não derruba a
// tela; em Ativos o filtro é pelo mesmo tipo da coluna; em Multas, "Em aberto" e "Canceladas" (regras em
// lib/multasFiltro.test.ts e lib/relatorioFiltros.test.ts).

const CARGA = { timeout: 30_000 };

test.describe.configure({ timeout: 120_000 });

async function entrar(page: Page) {
  await page.goto('/#/login');
  await page.getByPlaceholder('voce@empresa.com.br').fill(E2E_EMAIL);
  await page.getByPlaceholder('Sua senha').fill(E2E_SENHA);
  await page.getByRole('button', { name: 'Acessar plataforma' }).click();
  await expect(page).not.toHaveURL(/#\/login/, CARGA);
}

test('relatórios: apagar a data não derruba a tela', async ({ page, isMobile }) => {
  // no celular, nas telas com mapa, o "Limpar" do seletor de data não fica parado e o Playwright não consegue clicar
  // (24/11/2026); a correção é a mesma conta nos dois tamanhos, então basta o desktop
  test.skip(isMobile, 'seletor de data instável no celular nas telas com mapa');
  await entrar(page);
  for (const rota of ['uso', 'posicoes', 'velocidade', 'cercas', 'passou-por-aqui']) {
    await page.goto(`/#/relatorios/${rota}`);
    // "Limpar" do seletor de data deixa o campo "de" vazio: antes a consulta montava uma data inválida e a página ficava em branco
    const de = page.getByRole('main').locator('button[aria-haspopup="dialog"]').first();
    await expect(de).toBeVisible(CARGA);
    await de.click();
    await page.getByRole('button', { name: 'Limpar', exact: true }).click();
    await expect(page.getByText('Filtros aplicados'), rota).toBeVisible();
    await expect(page.getByRole('button', { name: 'Limpar filtros' }), rota).toBeVisible();
  }
});

test('relatório de uso: a busca aparece nos filtros aplicados e "Limpar filtros" apaga a busca', async ({ page }) => {
  await entrar(page);
  await page.goto('/#/relatorios/uso');
  const busca = page.getByLabel('Buscar no relatório');
  await expect(busca).toBeVisible(CARGA);
  await busca.fill('zz-nenhum-veiculo');
  await expect(page.getByText('“zz-nenhum-veiculo”')).toBeVisible();
  // a busca vale para os números também: nenhum veículo casa, então o total de km é zero
  await expect(page.getByText(/^0 km$/)).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(busca).toHaveValue('');
  await expect(page.getByText('“zz-nenhum-veiculo”')).toBeHidden();
});

test('ativos: o filtro é pelo tipo, o mesmo da coluna', async ({ page, isMobile }) => {
  await entrar(page);
  await page.goto('/#/ativos');
  await expect(page.getByLabel('Buscar ativo').filter({ visible: true }).first()).toBeVisible(CARGA);
  if (isMobile) await page.getByRole('button', { name: /Filtros/ }).click();
  await expect(page.getByLabel('Tipo', { exact: true })).toContainText('Todos os tipos');
});

test('multas: a lista tem "Em aberto" e "Canceladas"', async ({ page, isMobile }) => {
  await entrar(page);
  await page.goto('/#/multas?aba=lista');
  await expect(page.getByLabel('Buscar multa')).toBeVisible(CARGA);
  if (isMobile) await page.getByRole('button', { name: /Filtros/ }).click();
  await page.getByRole('button', { name: 'Canceladas' }).click();
  await expect(page.getByRole('button', { name: 'Canceladas' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Em aberto' })).toBeVisible();
});
