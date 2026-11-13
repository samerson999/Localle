import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { DespesasService, parseDespesa } from './despesas.controller';
import { custoDoMes, type Despesa, DespesasRepository } from './despesas.repository';

const despesa = (d: Partial<Despesa>): Despesa => ({
  id: randomUUID(), nome: 'x', tipo: 'fixa', valor: 0, inicioEm: '2026-01', fimEm: null, observacao: null, atualizadoEm: '', ...d,
});

describe('custoDoMes', () => {
  it('soma fixas e por veículo vigentes no mês; fora da vigência não entra', () => {
    const lista = [
      despesa({ tipo: 'fixa', valor: 650 }),
      despesa({ tipo: 'por_veiculo', valor: 9.9 }),
      despesa({ tipo: 'fixa', valor: 100, inicioEm: '2026-12' }), // ainda não começou
      despesa({ tipo: 'fixa', valor: 200, fimEm: '2026-10' }), // encerrada no mês anterior
      despesa({ tipo: 'fixa', valor: 50, fimEm: '2026-11' }), // último mês: entra
    ];
    const c = custoDoMes(lista, '2026-11', 3);
    expect(c).toMatchObject({ fixas: 700, porVeiculo: 29.7, total: 729.7 });
    expect(c.itens).toHaveLength(3);
  });

  it('sem despesa cadastrada o custo é zero', () => {
    expect(custoDoMes([], '2026-11', 10)).toMatchObject({ fixas: 0, porVeiculo: 0, total: 0, itens: [] });
  });
});

describe('parseDespesa', () => {
  const ok = { nome: ' Servidor ', tipo: 'fixa', valor: 120.456, inicioEm: '2026-11' };
  it('normaliza nome, valor em centavos e fim vazio', () => {
    expect(parseDespesa({ ...ok, fimEm: '' })).toEqual({ nome: 'Servidor', tipo: 'fixa', valor: 120.46, inicioEm: '2026-11', fimEm: null, observacao: null });
  });
  it('recusa tipo, mês, valor e fim antes do início inválidos', () => {
    expect(() => parseDespesa({ ...ok, tipo: 'anual' })).toThrow(/tipo/);
    expect(() => parseDespesa({ ...ok, inicioEm: '2026-13' })).toThrow(/inicioEm/);
    expect(() => parseDespesa({ ...ok, valor: -1 })).toThrow(/valor/);
    expect(() => parseDespesa({ ...ok, valor: '10' })).toThrow(/valor/);
    expect(() => parseDespesa({ ...ok, fimEm: '2026-10' })).toThrow(/fimEm/);
    expect(() => parseDespesa({ ...ok, nome: '' })).toThrow(/nome/);
  });
});

/** Contra o Postgres local: cadastro, vigência guardada no dia 1 e auditoria. */
describe('DespesasService', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new DespesasRepository(pool);
  const service = new DespesasService(repo, new AuditLogRepository(pool));
  const superadminId = randomUUID();
  const criadas: string[] = [];

  afterAll(async () => {
    await pool.query('delete from audit_log where actor_id = $1', [superadminId]);
    await pool.query('delete from despesas_plataforma where id = any($1::uuid[])', [criadas]);
    await pool.end();
  });

  it('cria, altera, lista e exclui, registrando cada passo na auditoria', async () => {
    const nome = `teste-despesa-${randomUUID()}`;
    const d = await service.criar(superadminId, { nome, tipo: 'por_veiculo', valor: 9.5, inicioEm: '2026-11', fimEm: null, observacao: null });
    criadas.push(d.id);
    expect(d).toMatchObject({ nome, tipo: 'por_veiculo', valor: 9.5, inicioEm: '2026-11', fimEm: null });

    const alterada = await service.atualizar(superadminId, d.id, { nome, tipo: 'por_veiculo', valor: 10, inicioEm: '2026-11', fimEm: '2027-02', observacao: 'reajuste' });
    expect(alterada).toMatchObject({ valor: 10, fimEm: '2027-02', observacao: 'reajuste' });
    expect((await service.listar()).find((x) => x.id === d.id)).toMatchObject({ valor: 10 });

    await service.excluir(superadminId, d.id);
    expect(await repo.buscar(d.id)).toBeNull();
    await expect(service.excluir(superadminId, d.id)).rejects.toThrow(/não encontrada/);

    const { rows } = await pool.query('select action from audit_log where actor_id = $1 and target = $2 order by created_at', [superadminId, d.id]);
    expect(rows.map((r) => r.action)).toEqual(['despesa.criar', 'despesa.atualizar', 'despesa.excluir']);
  });

  it('o banco recusa vigência fora do dia 1 e fim antes do início', async () => {
    await expect(pool.query("insert into despesas_plataforma (nome, tipo, valor, inicio_em) values ('x', 'fixa', 1, '2026-11-15')")).rejects.toThrow(/check/);
    await expect(pool.query("insert into despesas_plataforma (nome, tipo, valor, inicio_em, fim_em) values ('x', 'fixa', 1, '2026-11-01', '2026-10-01')")).rejects.toThrow(/check/);
  });
});
