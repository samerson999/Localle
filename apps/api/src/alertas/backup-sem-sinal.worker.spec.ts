import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RealtimeHub } from '../realtime/realtime.hub';
import { SemPosicaoWorker } from './sem-posicao.worker';

/**
 * Aviso de backup sem comunicar (14/11/2026) contra o Postgres real: um aviso baixo por queda, preso ao ativo, só para
 * instalação de papel `backup`, e publicado só no canal do dono.
 */
describe('SemPosicaoWorker — backup sem comunicar', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const publicados: { clientId: string; msg: any }[] = [];
  const hub = { publish: async (clientId: string, msg: any) => void publicados.push({ clientId, msg }) } as unknown as RealtimeHub;
  const worker = new SemPosicaoWorker(pool, hub);
  const ultimoPacote = new Date('2026-11-10T10:00:00Z');
  const em = (h: number) => new Date(ultimoPacote.getTime() + h * 3600_000);

  let clientA: string;
  let clientB: string;
  let assetId: string;
  const rastreadores: string[] = [];

  const avisos = async () =>
    (await pool.query(`select client_id, prioridade, titulo, ts from alertas where asset_id = $1 and tipo = 'backup_sem_sinal' order by ts`, [assetId])).rows;

  async function rastreador() {
    const { rows } = await pool.query<{ id: string }>('insert into rastreadores (imei) values ($1) returning id', [randomUUID().replace(/-/g, '').slice(0, 15)]);
    rastreadores.push(rows[0].id);
    return rows[0].id;
  }

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-backup-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-backup-b-${randomUUID()}`])).rows[0].id;
    assetId = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'BKP1S22') returning id", [clientA])).rows[0].id;
    const principal = await rastreador();
    const backup = await rastreador();
    const instalar = (r: string, papel: string) =>
      pool.query(`insert into instalacoes (client_id, rastreador_id, asset_id, papel, instalado_em, tecnico) values ($1, $2, $3, $4, '2026-01-01T00:00:00Z', 't')`, [
        clientA, r, assetId, papel,
      ]);
    await instalar(principal, 'principal');
    await instalar(backup, 'backup');
    // o principal também está calado há muito tempo: ele é assunto do alerta sem_posicao, não deste aviso
    for (const r of [principal, backup]) {
      await pool.query(`insert into rastreador_comunicacao (rastreador_id, asset_id, client_id, ultimo_pacote_em) values ($1, $2, $3, $4)`, [r, assetId, clientA, ultimoPacote]);
    }
  });

  afterAll(async () => {
    for (const r of rastreadores) {
      for (const t of ['rastreador_comunicacao', 'instalacoes']) await pool.query(`delete from ${t} where rastreador_id = $1`, [r]);
      await pool.query('delete from rastreadores where id = $1', [r]);
    }
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('antes de 24 h sem pacote não avisa', async () => {
    await worker.tick(em(23.9), clientA);
    expect(await avisos()).toEqual([]);
  });

  it('com 24 h cria um aviso baixo no ativo, só no canal do dono, e não repete', async () => {
    await worker.tick(em(24), clientB);
    expect(await avisos()).toEqual([]);

    await worker.tick(em(24), clientA);
    expect(await avisos()).toEqual([{ client_id: clientA, prioridade: 'baixa', titulo: 'Backup há mais de 24 h sem comunicar', ts: ultimoPacote }]);
    const pub = publicados.filter((p) => p.msg.alerta?.tipo === 'backup_sem_sinal');
    expect(pub.map((p) => p.clientId)).toEqual([clientA]);

    await worker.tick(em(48), clientA);
    expect(await avisos()).toHaveLength(1);
  });

  it('voltou a comunicar e calou de novo: é outra queda, outro aviso', async () => {
    const volta = em(50);
    await pool.query(`update rastreador_comunicacao set ultimo_pacote_em = $2 where rastreador_id = $1`, [rastreadores[1], volta]);
    await worker.tick(em(60), clientA);
    expect(await avisos()).toHaveLength(1);
    await worker.tick(em(74), clientA);
    expect((await avisos()).map((a) => a.ts)).toEqual([ultimoPacote, volta]);
  });
});
