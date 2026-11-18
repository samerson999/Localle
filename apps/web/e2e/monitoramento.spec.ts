import { expect, test } from '@playwright/test';
import { E2E_EMAIL, E2E_SENHA } from './usuario';

// card de status da faixa (só no desktop): mostra o limite de horas do Setup (monitoramento.sem_sinal_h)
test('card de comunicação atrasada mostra o limite do Setup', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a faixa de KPIs não aparece no celular');
  await page.goto('/#/login');
  await page.getByPlaceholder('voce@empresa.com.br').fill(E2E_EMAIL);
  await page.getByPlaceholder('Sua senha').fill(E2E_SENHA);
  await page.getByRole('button', { name: 'Acessar plataforma' }).click();
  await expect(page).not.toHaveURL(/#\/login/);

  await page.goto('/#/monitoramento');
  const faixa = page.getByRole('region', { name: 'KPIs da frota' });
  await expect(faixa.getByText(/^Comunicação atrasada \+\d+h$/)).toBeVisible();
  await expect(faixa.getByText('Sem sinal', { exact: true })).toHaveCount(0);
});

// mapa em tela cheia: desligado, parado ligado e em movimento sobre o mapa, clicáveis como os da faixa
test('mapa em tela cheia mostra os cards de status', async ({ page, isMobile }) => {
  test.skip(isMobile, 'o celular usa o globo, sem o mapa em tela cheia');
  await page.goto('/#/login');
  await page.getByPlaceholder('voce@empresa.com.br').fill(E2E_EMAIL);
  await page.getByPlaceholder('Sua senha').fill(E2E_SENHA);
  await page.getByRole('button', { name: 'Acessar plataforma' }).click();
  await expect(page).not.toHaveURL(/#\/login/);

  await page.goto('/#/monitoramento');
  await page.getByRole('button', { name: 'Mapa em tela cheia' }).click();
  const cards = page.getByRole('group', { name: 'Status da frota no mapa' });
  await expect(cards.getByRole('button')).toHaveCount(3);
  for (const rotulo of ['Em movimento', 'Parado ligado', 'Ignição desligada']) await expect(cards.getByText(rotulo, { exact: true })).toBeVisible();

  const desligado = cards.getByRole('button').filter({ hasText: 'Ignição desligada' });
  await desligado.click();
  await expect(desligado).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Sair da tela cheia' }).click();
  await expect(cards).toHaveCount(0);
});
