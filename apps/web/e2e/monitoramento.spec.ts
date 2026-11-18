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

