import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { E2E_EMAIL, E2E_SENHA } from './usuario';

// Identificação do motorista pelo cartão (17/11/2026): cartão lido sem cadastro, cadastro do motorista a partir dele,
// leitor de cartão na ficha do veículo e os parâmetros do Setup. Os dados (veículo, rastreador com leitor e o cartão
// lido) são semeados direto no banco local por apps/api/scripts/e2e-cartao-motorista.mjs — o cartão lido só nasce
// da ingestão, que não tem tela.

interface Dados { assetId: string; codigo: string; instalacaoId: string }

// login + carga da frota (60 ativos do Cliente Demo) com os dois projetos em paralelo passa dos 5 s padrão do expect
const CARGA = { timeout: 30_000 };

const script = (acao: 'preparar' | 'limpar', tag: string) =>
  execFileSync(process.execPath, ['scripts/e2e-cartao-motorista.mjs', acao, tag], { cwd: '../api', encoding: 'utf8' });

async function entrar(page: Page) {
  await page.goto('/#/login');
  await page.getByPlaceholder('voce@empresa.com.br').fill(E2E_EMAIL);
  await page.getByPlaceholder('Sua senha').fill(E2E_SENHA);
  await page.getByRole('button', { name: 'Acessar plataforma' }).click();
  await expect(page).not.toHaveURL(/#\/login/, CARGA);
}

test.describe('cartão do motorista', () => {
  // em série dentro do projeto: seis navegadores ao mesmo tempo contra o Vite de desenvolvimento não carregam a tela em 30 s
  test.describe.configure({ mode: 'serial', timeout: 90_000 });
  let tag: string;
  let dados: Dados;

  test.beforeEach(async ({ page }) => {
    tag = randomBytes(5).toString('hex');
    dados = JSON.parse(script('preparar', tag));
    await entrar(page);
  });

  test.afterEach(() => {
    script('limpar', tag);
  });

  test('cartão lido sem motorista: aparece na aba Motoristas e sai depois de cadastrar com o código', async ({ page }) => {
    await page.goto('/#/ativos?aba=motoristas');
    await expect(page.getByText('Cartões lidos sem motorista')).toBeVisible(CARGA);
    // linha (ou cartão, no celular) deste código: o elemento mais interno que tem o código e o botão
    const linha = page.locator('tr, div').filter({ hasText: dados.codigo }).filter({ has: page.getByRole('button', { name: 'Cadastrar motorista' }) }).last();
    await linha.getByRole('button', { name: 'Cadastrar motorista' }).click();

    await expect(page.getByLabel('Cartão do motorista')).toHaveValue(dados.codigo);
    await page.getByLabel('Nome', { exact: true }).fill(`Motorista ${tag}`);
    await page.getByRole('button', { name: 'Salvar motorista' }).click();

    await expect(page.getByText('Motorista cadastrado.')).toBeVisible();
    // o vínculo só é ligado no próximo pacote, mas o código já tem dono: sai da lista na hora
    await expect(page.getByText(dados.codigo)).toHaveCount(0);
  });

  test('ficha do veículo: histórico mostra o cartão sem cadastro e o leitor de cartão é marcado na hora', async ({ page }) => {
    await page.goto(`/#/ativos?ativo=lc_${dados.assetId}`);
    await page.getByRole('tab', { name: 'Histórico', exact: true }).click(CARGA);
    await expect(page.getByText(`Cartão ${dados.codigo} (sem cadastro)`)).toBeVisible();

    await page.getByRole('tab', { name: 'Rastreador', exact: true }).click();
    const leitor = page.getByRole('checkbox', { name: /Leitor de cartão do motorista instalado/ });
    await expect(leitor).not.toBeChecked();
    // o input é sr-only dentro do rótulo: clica no rótulo, como o usuário
    await page.getByText('Leitor de cartão do motorista instalado').click();
    await expect(page.getByText('Leitor de cartão marcado.')).toBeVisible();
    await expect(leitor).toBeChecked();

    // gravado na API: continua marcado depois de recarregar (a ficha sai da URL ao abrir; reabre pelo link)
    await page.reload();
    await page.goto(`/#/ativos?ativo=lc_${dados.assetId}`);
    await page.getByRole('tab', { name: 'Rastreador', exact: true }).click(CARGA);
    await expect(page.getByRole('checkbox', { name: /Leitor de cartão do motorista instalado/ })).toBeChecked(CARGA);
  });

  test('Setup › Motoristas: exigir identificação e tolerância sem cartão', async ({ page }) => {
    await page.goto('/#/setup?aba=motoristas');
    await expect(page.getByText('Exigir identificação do motorista pelo cartão (avisa veículo rodando sem)').filter({ visible: true }).first()).toBeVisible(CARGA);
    await expect(page.getByText('Tempo andando sem cartão antes do aviso (min)').filter({ visible: true }).first()).toBeVisible();
  });
});
