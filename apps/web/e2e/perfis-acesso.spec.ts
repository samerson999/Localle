import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { E2E_EMAIL, E2E_SENHA } from './usuario';

// Setup › Equipe e acessos (20/11/2026): o admin do cliente cria perfis próprios e marca o que cada um vê e faz; quem
// está num perfil sem a tela não a vê no menu nem entra pela URL, e não vê o botão de comando ao rastreador.

const CARGA = { timeout: 30_000 };
const script = (...args: string[]) => execFileSync(process.execPath, ['scripts/e2e-perfis.mjs', ...args], { cwd: '../api' });

async function entrar(page: Page, email: string, senha: string) {
  await page.goto('/#/login');
  await page.getByPlaceholder('voce@empresa.com.br').fill(email);
  await page.getByPlaceholder('Sua senha').fill(senha);
  await page.getByRole('button', { name: 'Acessar plataforma' }).click();
  await expect(page).not.toHaveURL(/#\/login/, CARGA);
}

test.describe('perfis de acesso', () => {
  test.describe.configure({ timeout: 90_000 });

  test('admin cria e exclui um perfil no Setup; /equipe leva até lá', async ({ page }) => {
    await entrar(page, E2E_EMAIL, E2E_SENHA);
    await page.goto('/#/equipe');
    await expect(page).toHaveURL(/#\/setup\?aba=equipe/, CARGA);
    await expect(page.getByText('Pessoas com acesso')).toBeVisible(CARGA);
    await expect(page.getByText('Perfis e permissões')).toBeVisible();

    const nome = `Portaria ${randomUUID().slice(0, 8)}`;
    await page.getByRole('button', { name: 'Novo perfil' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Nome').fill(nome);
    await dialogo.getByRole('button', { name: 'Criar perfil' }).click();
    const coluna = page.getByRole('columnheader').filter({ hasText: nome });
    await expect(coluna).toBeVisible(CARGA);
    // a caixa do perfil novo para "Ver a tela de Multas" existe e salva
    const caixa = page.getByRole('checkbox', { name: `Ver a tela de Multas para ${nome}` });
    await expect(caixa).toBeChecked();
    await caixa.locator('..').click(); // o input do Check é sr-only: clica no rótulo dele
    await expect(caixa).not.toBeChecked(CARGA);

    await coluna.getByRole('button', { name: 'Excluir' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByRole('columnheader').filter({ hasText: nome })).toHaveCount(0, CARGA);
  });

  test.describe('pessoa num perfil sem Multas e sem comandos', () => {
    let email: string;
    const senha = `senha-${randomUUID().slice(0, 8)}`;

    test.beforeEach(() => {
      email = `e2e-perfil-${randomUUID()}@localle.test`;
      script('criar', email, senha);
    });
    test.afterEach(() => { script('limpar', email); });

    test('não entra em Multas, não vê Equipe no Setup', async ({ page }) => {
      await entrar(page, email, senha);
      await page.goto('/#/multas');
      await expect(page.getByText('Seu perfil não tem acesso a esta tela')).toBeVisible(CARGA);
      await expect(page.getByRole('link', { name: 'Multas', exact: true })).toHaveCount(0);

      await page.goto('/#/setup');
      await expect(page.getByRole('tab', { name: 'Alertas da plataforma' })).toBeVisible(CARGA);
      await expect(page.getByRole('tab', { name: 'Equipe e acessos' })).toHaveCount(0);
    });
  });
});
