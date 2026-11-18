import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RealtimeHub } from '../realtime/realtime.hub';
import { SemPosicaoWorker } from './sem-posicao.worker';

/**
 * Aviso de veículo parado contra o Postgres real: nasce com o limite do Setup do cliente, só se o rastreador está
 * comunicando (calado é sem_posicao), um por parada, fecha sozinho quando o veículo volta a andar e nunca vai para
 * o canal de outro cliente.
 */
describe('SemPosicaoWorker — aviso de veículo parado', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const publicados: { clientId: string; msg: any }[] = [];
  const hub = { publish: async (clientId: string, msg: any) => void publicados.push({ clientId, msg }) } as unknown as RealtimeHub;
  const worker = new SemPosicaoWorker(pool, hub);
  const parouEm = new Date('2026-11-10T10:00:00Z');
  const em = (h: number) => new Date(parouEm.getTime() + h * 3600_000);

  let clientA: string;
  let clientB: string;
  let assetId: string;
  let rastreadorId: string;

  const avisos = async () =>
    (await pool.query(`select id, client_id, prioridade, titulo, ts, tratado_em, tratamento_motivo from alertas where asset_id = $1 and tipo = 'veiculo_parado' order by ts`, [assetId])).rows;
  const comunicou = (ts: Date) => pool.query('update rastreador_comunicacao set ultimo_pacote_em = $2 where rastreador_id = $1', [rastreadorId, ts]);

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-parado-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-parado-b-${randomUUID()}`])).rows[0].id;
    assetId = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'PAR1A22') returning id", [clientA])).rows[0].id;
    rastreadorId = (
      await pool.query<{ id: string }>('insert into rastreadores (imei, traccar_device_id) values ($1, $2) returning id', [
        randomUUID().replace(/-/g, '').slice(0, 15),
        400000 + Math.floor(Math.random() * 100000),
      ])
    ).rows[0].id;
    await pool.query(
      `insert into instalacoes (client_id, rastreador_id, asset_id, instalado_em, tecnico) values ($1, $2, $3, '2026-01-01T00:00:00Z', 'teste')`,
      [clientA, rastreadorId, assetId],
    );
    await pool.query(
      `insert into ultima_posicao (rastreador_id, asset_id, client_id, posicao_id, fix_time, geom, speed_kmh, ignition, movimento_em)
       values ($1, $2, $3, 1, $4, st_setsrid(st_makepoint(-46.6, -23.5), 4326), 0, false, $4)`,
      [rastreadorId, assetId, clientA, parouEm],
    );
    await pool.query(
      `insert into rastreador_comunicacao (rastreador_id, asset_id, client_id, ultimo_pacote_em, ultima_posicao_valida_em) values ($1, $2, $3, $4, $4)`,
      [rastreadorId, assetId, clientA, parouEm],
    );
    await pool.query(`insert into client_settings (client_id, key, value) values ($1, 'monitoramento.parado_alerta_h', '6'::jsonb)`, [clientA]);
  });

  afterAll(async () => {
    for (const t of ['rastreador_comunicacao', 'ultima_posicao', 'instalacoes']) await pool.query(`delete from ${t} where rastreador_id = $1`, [rastreadorId]);
    await pool.query('delete from rastreadores where id = $1', [rastreadorId]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('antes do limite do Setup (6 h) não avisa', async () => {
    await comunicou(em(5.9));
    await worker.tick(em(5.9), clientA);
    expect(await avisos()).toEqual([]);
  });

  it('rastreador calado (sem pacote há mais de 4 h) não vira "parado"', async () => {
    await comunicou(em(1));
    await worker.tick(em(7), clientA);
    expect(await avisos()).toEqual([]);
  });

  it('parado e comunicando além do limite: um aviso baixo por parada, só no canal do cliente', async () => {
    await comunicou(em(6.5));
    await worker.tick(em(7), clientA);
    await worker.tick(em(8), clientA);
    const lista = await avisos();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ client_id: clientA, prioridade: 'baixa', titulo: 'Veículo parado há mais de 6 h', ts: parouEm, tratado_em: null });
    const pub = publicados.filter((p) => p.msg.alerta?.tipo === 'veiculo_parado');
    expect(pub).toHaveLength(1);
    expect(pub.every((p) => p.clientId === clientA)).toBe(true);
  });

  it('voltou a andar: o aviso fecha sozinho; a parada nova gera outro aviso', async () => {
    await pool.query('update ultima_posicao set movimento_em = $2 where rastreador_id = $1', [rastreadorId, em(9)]);
    await comunicou(em(9));
    await worker.tick(em(9), clientA);
    let lista = await avisos();
    expect(lista).toHaveLength(1);
    expect(lista[0].tratado_em).not.toBeNull();
    expect(lista[0].tratamento_motivo).toBeTruthy();

    await comunicou(em(15.5));
    await worker.tick(em(15.5), clientA);
    lista = await avisos();
    expect(lista).toHaveLength(2);
    expect(lista[1]).toMatchObject({ ts: em(9), tratado_em: null });
  });

  it('cliente que desligou o tipo no Setup não recebe', async () => {
    await pool.query(`update alertas set tratado_em = now(), tratamento_motivo = 'teste' where asset_id = $1 and tratado_em is null`, [assetId]);
    await pool.query(`insert into alerta_tipos_cliente (client_id, chave, ligado) values ($1, 'veiculo_parado', false)`, [clientA]);
    await pool.query('update ultima_posicao set movimento_em = $2 where rastreador_id = $1', [rastreadorId, em(20)]);
    await comunicou(em(30));
    await worker.tick(em(30), clientA);
    expect((await avisos()).filter((a) => a.ts.getTime() === em(20).getTime())).toEqual([]);
  });
});
