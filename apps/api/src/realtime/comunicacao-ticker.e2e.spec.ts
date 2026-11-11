import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import IORedis from 'ioredis';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RealtimeMessage } from '@localle/shared/realtime';
import { MonitoringRepository } from '../monitoring/monitoring.repository';
import { SettingsRepository } from '../settings/settings.repository';
import { SettingsService } from '../settings/settings.service';
import { ComunicacaoTicker } from './comunicacao-ticker.service';
import { RealtimeStreamService } from './realtime-stream.service';
import { RealtimeHub } from './realtime.hub';

/**
 * AUD-03 (AUDITORIA_KPIS_TELEMETRIA.md): aparelho que cala não gera mensagem nenhuma, então a virada para "sem
 * sinal" tem de sair do backend com o passar do tempo, pelo stream já aberto, com o limite do cliente.
 */
describe('ComunicacaoTicker (tempo real da comunicação)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
  const hub = new RealtimeHub(connection);
  const repo = new MonitoringRepository(pool);
  const ticker = new ComunicacaoTicker(hub, repo, new SettingsService(new SettingsRepository(pool), pool));
  const stream = new RealtimeStreamService(hub, repo);

  let clientA: string;
  let clientB: string;
  let assetId: string;
  let rastreadorId: string;
  // último pacote há 49 h: dentro do limite padrão (48 h) uma hora depois dele, fora agora
  const ultimoPacote = new Date(Date.now() - 49 * 3600_000);

  beforeAll(async () => {
    const a = await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-tick-a-${randomUUID()}`]);
    const b = await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-tick-b-${randomUUID()}`]);
    clientA = a.rows[0].id;
    clientB = b.rows[0].id;
    assetId = (await pool.query<{ id: string }>('insert into assets (client_id, plate) values ($1, $2) returning id', [clientA, 'TIC1K22'])).rows[0].id;
    rastreadorId = (
      await pool.query<{ id: string }>('insert into rastreadores (imei, traccar_device_id) values ($1, $2) returning id', [
        randomUUID().replace(/-/g, '').slice(0, 15),
        200000 + Math.floor(Math.random() * 100000),
      ])
    ).rows[0].id;
    await pool.query(
      `insert into instalacoes (client_id, rastreador_id, asset_id, instalado_em, tecnico) values ($1, $2, $3, '2026-01-01T00:00:00Z', 'teste')`,
      [clientA, rastreadorId, assetId],
    );
    await pool.query(
      `insert into rastreador_comunicacao (rastreador_id, asset_id, client_id, ultimo_pacote_em, ultima_posicao_valida_em) values ($1, $2, $3, $4, $4)`,
      [rastreadorId, assetId, clientA, ultimoPacote],
    );
  });

  afterAll(async () => {
    for (const t of ['rastreador_comunicacao', 'instalacoes']) await pool.query(`delete from ${t} where rastreador_id = $1`, [rastreadorId]);
    await pool.query('delete from rastreadores where id = $1', [rastreadorId]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
    await hub.onModuleDestroy();
    connection.disconnect();
  });

  /** Abre o stream de cada cliente e espera o snapshot (a partir daí a assinatura está ativa). */
  async function abrir(...clientes: string[]) {
    const recebido = new Map<string, RealtimeMessage[]>(clientes.map((c) => [c, []]));
    const subs = await Promise.all(
      clientes.map(
        (c) =>
          new Promise<{ unsubscribe(): void }>((resolve) => {
            const sub = stream.open(c, null).subscribe((m) => {
              recebido.get(c)!.push(m);
              if (m.kind === 'snapshot') resolve(sub);
            });
          }),
      ),
    );
    return { recebido, fechar: () => subs.forEach((s) => s.unsubscribe()) };
  }

  it('só calcula para quem tem stream aberto, e o status vira com o tempo sem nenhum pacote novo', async () => {
    const { recebido, fechar } = await abrir(clientA, clientB);
    expect(hub.clientesAssinados()).toEqual(expect.arrayContaining([clientA, clientB]));

    await ticker.tick(new Date(ultimoPacote.getTime() + 3600_000));
    await ticker.tick(new Date());
    fechar();

    const deA = recebido.get(clientA)!.filter((m) => m.kind === 'comunicacao');
    expect(deA).toEqual([
      { kind: 'comunicacao', ativos: [{ assetId, comunicacao: 'online', fixTime: null }] },
      { kind: 'comunicacao', ativos: [{ assetId, comunicacao: 'sem_sinal', fixTime: null }] },
    ]);
    // isolamento: B recebe o cálculo da própria frota (vazia), nunca o ativo de A
    expect(recebido.get(clientB)!.filter((m) => m.kind === 'comunicacao')).toEqual([
      { kind: 'comunicacao', ativos: [] },
      { kind: 'comunicacao', ativos: [] },
    ]);
  });

  it('usa o limite configurado pelo cliente, não um valor fixo', async () => {
    await pool.query(
      `insert into client_settings (client_id, key, value) values ($1, 'monitoramento.sem_sinal_h', '60'::jsonb)`,
      [clientA],
    );
    try {
      const msg = await ticker.calcular(clientA, new Date());
      expect(msg.ativos).toEqual([{ assetId, comunicacao: 'online', fixTime: null }]);
    } finally {
      await pool.query(`delete from client_settings where client_id = $1`, [clientA]);
    }
  });

  // AUD-13: o limite por grupo era ignorado. Ativo em vários grupos fica com o MENOR limite (decisão de 31/10/2026).
  it('limite por grupo: vale o menor entre os grupos do ativo; grupo de outro cliente não interfere', async () => {
    const grupo = async (client: string, nome: string, valor: number) => {
      const g = await pool.query<{ id: string }>('insert into asset_groups (client_id, name) values ($1, $2) returning id', [client, `${nome}-${randomUUID()}`]);
      await pool.query('insert into asset_group_members (client_id, group_id, asset_id) values ($1, $2, $3)', [client, g.rows[0].id, assetId]);
      await pool.query(`insert into group_settings (client_id, group_id, key, value) values ($1, $2, 'monitoramento.sem_sinal_h', $3::jsonb)`, [
        client,
        g.rows[0].id,
        JSON.stringify(valor),
      ]);
      return g.rows[0].id;
    };
    const grupos: string[] = [];
    try {
      // pacote há 49 h; cliente no padrão (48 h) → sem sinal sem grupo nenhum
      grupos.push(await grupo(clientA, 'patio', 60), await grupo(clientA, 'maquinas', 50));
      expect((await ticker.calcular(clientA, new Date())).ativos[0].comunicacao).toBe('online'); // menor = 50 h

      grupos.push(await grupo(clientA, 'leves', 5));
      expect((await ticker.calcular(clientA, new Date())).ativos[0].comunicacao).toBe('sem_sinal'); // menor = 5 h

      // linha de membro com client_id de B (dado inconsistente) e limite enorme: não pode afrouxar o limite de A
      grupos.push(await grupo(clientB, 'outro', 72));
      expect((await ticker.calcular(clientA, new Date())).ativos[0].comunicacao).toBe('sem_sinal');
    } finally {
      await pool.query('delete from asset_groups where id = any($1)', [grupos]);
    }
  });

  it('sem stream aberto não consulta nem entrega nada', async () => {
    expect(hub.clientesAssinados()).not.toContain(clientA);
    await expect(ticker.tick()).resolves.toBeUndefined();
  });
});
