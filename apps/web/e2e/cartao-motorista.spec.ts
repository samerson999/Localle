import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { E2E_EMAIL, E2E_SENHA } from './usuario';

// Identificação do motorista pelo cartão (17/11/2026): cartão lido sem cadastro, cadastro do motorista a partir dele,
// leitor de cartão na ficha do veículo e os parâmetros do Setup. Os dados (veículo, rastreador com leitor e o cartão
// lido) são semeados direto no banco local por apps/api/scripts/e2e-cartao-motorista.mjs — o cartão lido só nasce
// da ingestão, que não tem tela.

interface Dados { assetId: string; codigo: string; placa: string; instalacaoId: string }

// login + carga da frota (60 ativos do Cliente Demo) com os dois projetos em paralelo passa dos 5 s padrão do expect
const CARGA = { timeout: 30_000 };

const script = (acao: 'preparar' | 'desligar' | 'limpar', tag: string) =>
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

  // regra de 18/11/2026: cartão sem cadastro aparece como tal; ignição desligada = "Sem motorista" (nunca o fixo da ficha)
  test('Monitoramento: "Cartão não cadastrado" com o cartão lido e "Sem motorista" depois de desligar', async ({ page }) => {
    const veiculo = async () => {
      await page.goto('/#/monitoramento');
      await page.getByPlaceholder('Buscar placa, motorista ou modelo').filter({ visible: true }).first().fill(dados.placa, CARGA);
    };
    await veiculo();
    await expect(page.getByText(/Cartão não cadastrado/).filter({ visible: true }).first()).toBeVisible(CARGA);

    script('desligar', tag);
    await page.reload();
    await veiculo();
    await expect(page.getByText(/Sem motorista/).filter({ visible: true }).first()).toBeVisible(CARGA);
    await expect(page.getByText(/Cartão não cadastrado/).filter({ visible: true })).toHaveCount(0);
  });

  // 20/11/2026 (KOZ5H91 na HML): o "encerrou" do tempo real se perdeu com o celular bloqueado e o nome do motorista ficou
  // no veículo desligado. Com o tempo real fora do ar, a reconexão tem que trazer o cartão encerrado da API.
  test('Monitoramento: sem tempo real, a reconexão encerra o cartão sem recarregar a página', async ({ page }) => {
    await page.route('**/monitoring/stream**', (route) => route.fulfill({ status: 503, body: '' }));
    await page.reload(); // o login já abriu o stream; recarregando, toda conexão cai na rota acima
    await page.goto('/#/monitoramento');
    await page.getByPlaceholder('Buscar placa, motorista ou modelo').filter({ visible: true }).first().fill(dados.placa, CARGA);
    await expect(page.getByText(/Cartão não cadastrado/).filter({ visible: true }).first()).toBeVisible(CARGA);

    script('desligar', tag); // só no banco: nenhuma mensagem de tempo real chega
    await expect(page.getByText(/Sem motorista/).filter({ visible: true }).first()).toBeVisible({ timeout: 45_000 });
  });

  // conexão pendurada (celular bloqueado): o stream nem cai nem entrega, então não há reconexão — vale a volta do app à tela
  test('Monitoramento: conexão pendurada, o app volta à tela e o cartão encerrado aparece', async ({ page }) => {
    await page.route('**/monitoring/stream**', () => { /* nunca responde: nem erro, nem dado */ });
    await page.reload();
    await page.goto('/#/monitoramento');
    await page.getByPlaceholder('Buscar placa, motorista ou modelo').filter({ visible: true }).first().fill(dados.placa, CARGA);
    await expect(page.getByText(/Cartão não cadastrado/).filter({ visible: true }).first()).toBeVisible(CARGA);

    script('desligar', tag);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByText(/Sem motorista/).filter({ visible: true }).first()).toBeVisible(CARGA);
  });
});
