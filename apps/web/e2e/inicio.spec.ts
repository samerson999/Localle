import { expect, test } from '@playwright/test';
import { E2E_EMAIL, E2E_SENHA } from './usuario';

// Início em linguagem do usuário final: sem termos de rastreamento/conectividade.
test('início não mostra termos técnicos de rastreamento', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByPlaceholder('voce@empresa.com.br').fill(E2E_EMAIL);
  await page.getByPlaceholder('Sua senha').fill(E2E_SENHA);
  await page.getByRole('button', { name: 'Acessar plataforma' }).click();
  await expect(page).not.toHaveURL(/#\/login/);

  await page.goto('/#/inicio');
  await expect(page.getByText(/Resumo da frota|Nenhum veículo rastreado ainda/).first()).toBeVisible();
  for (const t of ['Conectividade dos rastreadores', 'Sem GPS', 'Sem comunicação', 'Transmitindo', 'com posição nos últimos 30 min', 'Sem sinal', 'Frota real (rastreador)'])
    await expect(page.getByText(t)).toHaveCount(0);
});
