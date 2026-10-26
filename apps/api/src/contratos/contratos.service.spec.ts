import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ContractTerms } from '@localle/shared/contratos';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { ClientsRepository } from '../clients/clients.repository';
import { ContratosRepository } from './contratos.repository';
import { ContratosService } from './contratos.service';
import { FaturamentoService } from './faturamento.service';
import { FaturasRepository } from './faturas.repository';

/**
 * Contra o Postgres local: medição de veículos-dia sai de `instalacoes` (SQL de verdade, com fuso), e o
 * fechamento/pagamento dependem de unique, lock e transação — mockar o banco não provaria nada disso.
 */
describe('Contratos e faturamento', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const contratosRepo = new ContratosRepository(pool);
  const faturasRepo = new FaturasRepository(pool);
  const audit = new AuditLogRepository(pool);
  const service = new ContratosService(contratosRepo, new ClientsRepository(pool), audit, pool);
  const faturamento = new FaturamentoService(contratosRepo, faturasRepo, audit, pool);
  const superadminId = randomUUID();
  const clientes: string[] = [];
  const rastreadores: string[] = [];

  const termos: ContractTerms = { billingType: 'por_veiculo_ativo', fixedPrice: 0, included: 0, basePrice: 0, pricePerVehicle: 90, extraPrice: 90, modules: ['monitoramento'], maxUsers: null, historyMonths: 12, dueDay: 10, toleranceDays: 5 };
  const input = (t: Partial<ContractTerms> = {}, status: 'ativo' | 'suspenso' = 'ativo') => ({ status, inicioEm: '2026-01-01', fimEm: null, terms: { ...termos, ...t } });

  async function novoCliente() {
    const { rows } = await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-contratos-${randomUUID()}`]);
    clientes.push(rows[0].id);
    return rows[0].id;
  }
  async function instalar(clientId: string, de: string, ate: string | null) {
    const { rows: [r] } = await pool.query<{ id: string }>("insert into rastreadores (imei) values ($1) returning id", [randomUUID().replace(/-/g, '').slice(0, 15)]);
    rastreadores.push(r.id);
    const { rows: [a] } = await pool.query<{ id: string }>('insert into assets (client_id, plate) values ($1, $2) returning id', [clientId, randomUUID().slice(0, 7)]);
    await pool.query(
      `insert into instalacoes (client_id, rastreador_id, asset_id, papel, instalado_em, desinstalado_em, tecnico)
       values ($1, $2, $3, 'principal', ($4::timestamp at time zone 'America/Recife'), ($5::timestamp at time zone 'America/Recife'), 'teste')`,
      [clientId, r.id, a.id, de, ate],
    );
  }

  let clientA: string;
  beforeAll(async () => {
    clientA = await novoCliente();
    // setembro/2026 (30 dias): um veículo o mês todo, outro a partir do dia 16 → 30 + 15 = 45 veículos-dia → média 1,5
    await instalar(clientA, '2026-08-20 10:00', null);
    await instalar(clientA, '2026-09-16 08:00', null);
  });

  afterAll(async () => {
    await pool.query('delete from audit_log where actor_id = $1', [superadminId]);
    await pool.query('delete from clients where id = any($1)', [clientes]); // cascata: contratos, faturas, pagamentos, instalações
    await pool.query('delete from rastreadores where id = any($1)', [rastreadores]);
    await pool.end();
  });

  it('cria contrato com versão inicial; segundo contrato do mesmo cliente é 409', async () => {
    const c = await service.criar(superadminId, clientA, input());
    expect(c).toMatchObject({ clientId: clientA, status: 'ativo', versoes: 1, versaoAtual: { pricePerVehicle: 90 } });
    await expect(service.criar(superadminId, clientA, input())).rejects.toMatchObject({ status: 409 });
  });

  it('só termos comerciais diferentes gravam versão nova', async () => {
    const c = (await contratosRepo.findByClient(clientA))!;
    const soSituacao = await service.atualizar(superadminId, c.id, { ...input(), fimEm: '2027-12-31' });
    expect(soSituacao.versoes).toBe(1);
    expect(soSituacao.fimEm).toBe('2027-12-31');
  });

  it('medição de veículos-dia vem das instalações, no fuso local', async () => {
    const medicao = (await contratosRepo.medicaoDiaria('2026-09')).get(clientA)!;
    expect(medicao).toHaveLength(30);
    expect(medicao.find((d) => d.date === '2026-09-15')?.activeVehicles).toBe(1);
    expect(medicao.find((d) => d.date === '2026-09-16')?.activeVehicles).toBe(2);
    const linha = (await faturamento.apuracao('2026-09', '2026-10-24')).find((l) => l.clientId === clientA)!;
    expect(linha).toMatchObject({ veiculosMedia: 1.5, apurado: 135, fatura: null, veiculosAgora: 2 });
  });

  it('não fecha a competência corrente', async () => {
    await expect(faturamento.fechar(superadminId, '2026-10', { clientId: clientA, hoje: '2026-10-24' })).rejects.toMatchObject({ status: 400 });
  });

  it('fechar preserva valor e medição; mudar o contrato depois não altera a fatura; fechar de novo não duplica', async () => {
    expect(await faturamento.fechar(superadminId, '2026-09', { clientId: clientA, hoje: '2026-10-24' })).toEqual({ fechadas: 1, jaFechadas: 0 });
    const c = (await contratosRepo.findByClient(clientA))!;
    const nova = await service.atualizar(superadminId, c.id, input({ pricePerVehicle: 200 }));
    expect(nova.versoes).toBe(2);

    const linha = (await faturamento.apuracao('2026-09', '2026-10-24')).find((l) => l.clientId === clientA)!;
    expect(linha.apurado).toBe(135);
    expect(linha.fatura).toMatchObject({ vencimento: '2026-10-10', emAberto: 135, diasAtraso: 14, critico: true });
    expect(await faturamento.fechar(superadminId, '2026-09', { clientId: clientA, hoje: '2026-10-24' })).toEqual({ fechadas: 0, jaFechadas: 1 });
  });

  it('pagamento parcial reduz o saldo; acima do saldo é recusado; quitado deixa de estar em atraso', async () => {
    const faturaId = (await faturamento.apuracao('2026-09', '2026-10-24')).find((l) => l.clientId === clientA)!.fatura!.id;
    expect(await faturamento.registrarPagamento(superadminId, faturaId, { valor: 100, pagoEm: '2026-10-20', forma: 'pix', observacao: null })).toMatchObject({ saldo: 35 });
    await expect(faturamento.registrarPagamento(superadminId, faturaId, { valor: 35.01, pagoEm: '2026-10-21', forma: 'pix', observacao: null })).rejects.toMatchObject({ status: 400 });
    await faturamento.registrarPagamento(superadminId, faturaId, { valor: 35, pagoEm: '2026-10-22', forma: 'boleto', observacao: 'restante' });

    const linha = (await faturamento.apuracao('2026-09', '2026-10-24')).find((l) => l.clientId === clientA)!;
    expect(linha.fatura).toMatchObject({ pago: 135, emAberto: 0, diasAtraso: 0, critico: false });
    expect(await faturasRepo.findPagamentos(faturaId)).toHaveLength(2);
  });

  // regressão (pentest 24/10/2026): 0,001 virava 0 na coluna numeric(12,2) e estourava o check → 500;
  // 10,009 era gravado como 10,01 com saldo calculado sobre o float
  it('pagamento só em centavos exatos: sub-centavo e 3+ casas são 400', async () => {
    const faturaId = (await faturamento.apuracao('2026-09', '2026-10-24')).find((l) => l.clientId === clientA)!.fatura!.id;
    for (const valor of [0.001, 10.009, 10.999999, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(faturamento.registrarPagamento(superadminId, faturaId, { valor, pagoEm: '2026-10-20', forma: 'pix', observacao: null })).rejects.toMatchObject({ status: 400 });
    }
  });

  it('pagamentos simultâneos não ultrapassam o saldo (lock da fatura)', async () => {
    const clientB = await novoCliente();
    await service.criar(superadminId, clientB, input({ billingType: 'mensalidade_fixa', fixedPrice: 100 }));
    await faturamento.fechar(superadminId, '2026-09', { clientId: clientB, hoje: '2026-10-24' });
    const faturaId = (await faturamento.apuracao('2026-09', '2026-10-24')).find((l) => l.clientId === clientB)!.fatura!.id;
    const pagar = () => faturamento.registrarPagamento(superadminId, faturaId, { valor: 60, pagoEm: '2026-10-20', forma: 'pix', observacao: null });
    const r = await Promise.allSettled([pagar(), pagar()]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((await faturasRepo.findById(faturaId))!.pago).toBe(60);
  });
});
