import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { ContratosRepository } from '../contratos/contratos.repository';
import { FaturamentoService } from '../contratos/faturamento.service';
import { FaturasRepository } from '../contratos/faturas.repository';
import { TraccarClient } from '../ingest/traccar-client';
import { MailService } from '../mail/mail.service';
import type { PositionsQueue } from '../queue/positions.queue';
import { PainelRepository } from './painel.repository';
import { mesesAte, PainelService } from './painel.service';

/** Agregados contra o Postgres local. O banco tem outros dados, então só se afirma sobre os clientes daqui. */
describe('PainelService', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const contratos = new ContratosRepository(pool);
  const faturas = new FaturasRepository(pool);
  const faturamento = new FaturamentoService(contratos, faturas, new AuditLogRepository(pool), pool);
  const fila = { queue: { getJobCounts: async () => ({ waiting: 3, active: 1, failed: 0, delayed: 0 }) } } as unknown as PositionsQueue;
  class TraccarFora extends TraccarClient {
    config() { return { url: 'http://127.0.0.1:1', user: 'x', password: 'x' }; }
  }
  const painel = new PainelService(new PainelRepository(pool), contratos, faturas, faturamento, new TraccarFora(), fila, new MailService());
  const superadminId = randomUUID();
  const clientes: string[] = [];
  const rastreadores: string[] = [];
  let cancelado: string;
  let ativo: string;

  async function cliente(nome: string, status: string, fimEm: string | null) {
    const { rows: [c] } = await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`${nome}-${randomUUID()}`]);
    clientes.push(c.id);
    const { rows: [k] } = await pool.query<{ id: string }>(
      'insert into contratos (client_id, status, inicio_em, fim_em) values ($1, $2, $3, $4) returning id',
      [c.id, status, '2026-01-01', fimEm],
    );
    await pool.query(
      `insert into contrato_versoes (contrato_id, client_id, tipo_cobranca, mensalidade_fixa, historico_meses, dia_vencimento, tolerancia_dias, criado_por)
       values ($1, $2, 'mensalidade_fixa', 500, 12, 5, 3, $3)`,
      [k.id, c.id, superadminId],
    );
    return c.id;
  }
  async function instalar(clientId: string) {
    const { rows: [r] } = await pool.query<{ id: string }>('insert into rastreadores (imei) values ($1) returning id', [randomUUID().replace(/-/g, '').slice(0, 15)]);
    rastreadores.push(r.id);
    const { rows: [a] } = await pool.query<{ id: string }>('insert into assets (client_id, plate) values ($1, $2) returning id', [clientId, 'PNL0001']);
    await pool.query(
      `insert into instalacoes (client_id, rastreador_id, asset_id, papel, instalado_em, tecnico) values ($1, $2, $3, 'principal', now() - interval '60 days', 'teste')`,
      [clientId, r.id, a.id],
    );
    return r.id;
  }

  beforeAll(async () => {
    ativo = await cliente('teste-painel-ativo', 'ativo', '2026-11-30');
    cancelado = await cliente('teste-painel-cancelado', 'cancelado', null);
    const comunicando = await instalar(ativo);
    await pool.query('insert into rastreador_comunicacao (rastreador_id, ultimo_pacote_em) values ($1, now())', [comunicando]);
    await instalar(cancelado); // nunca comunicou e o contrato foi cancelado: a recolher
    await faturamento.fechar(superadminId, '2026-09', { clientId: ativo, hoje: '2026-10-24' });
  });

  afterAll(async () => {
    await pool.query('delete from audit_log where actor_id = $1', [superadminId]);
    await pool.query('delete from rastreador_comunicacao where rastreador_id = any($1)', [rastreadores]);
    await pool.query('delete from clients where id = any($1)', [clientes]);
    await pool.query('delete from rastreadores where id = any($1)', [rastreadores]);
    await pool.end();
  });

  it('mesesAte cruza o ano', () => {
    expect(mesesAte('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('visão geral: inadimplente vencido, contrato vencendo, a recolher e sem sinal', async () => {
    const v = await painel.visaoGeral('2026-10-24');
    // fatura de setembro (R$ 500, vence 05/10) em aberto: 19 dias de atraso, acima da tolerância de 3
    expect(v.inadimplentes.find((i) => i.clientId === ativo)).toMatchObject({ competencia: '2026-09', emAberto: 500, diasAtraso: 19, critico: true });
    expect(v.aRecolher.filter((r) => r.clientName.startsWith('teste-painel-cancelado'))).toHaveLength(1);
    expect(v.aRecolher.some((r) => r.clientName.startsWith('teste-painel-ativo'))).toBe(false);
    expect(v.historico.map((h) => h.competencia)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(v.historico[4].fechado).toBe(true);
    expect(v.historico[5].fechado).toBe(false);
    expect(v.rastreadoresSemSinal24h).toBeGreaterThanOrEqual(1);
  });

  it('contrato vencendo em 60 dias (relativo a hoje do banco)', async () => {
    await pool.query("update contratos set fim_em = current_date + 30 where client_id = $1", [ativo]);
    const vencendo = await new PainelRepository(pool).contratosVencendo(60);
    expect(vencendo.some((c) => c.clientId === ativo)).toBe(true);
    expect(vencendo.some((c) => c.clientId === cancelado)).toBe(false);
  });

  it('saúde: Traccar fora vira "fora" sem derrubar o resto; fila e banco respondem', async () => {
    const s = await painel.saude();
    expect(s.gateway.status).toBe('fora');
    expect(s.fila).toMatchObject({ status: 'ok', aguardando: 3 });
    expect(s.banco.tamanhoBytes).toBeGreaterThan(0);
    expect(s.inbox.pendentes).toBeGreaterThanOrEqual(0);
  });
});
