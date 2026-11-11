import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RealtimeHub } from '../realtime/realtime.hub';
import { SemPosicaoWorker } from './sem-posicao.worker';

/**
 * Alerta de rastreador sem posição contra o Postgres real: um alerta por queda que sobe de nível (4/12/24 h),
 * notificando (fila de push + canal do cliente) a cada nível, e nunca no canal de outro cliente.
 */
describe('SemPosicaoWorker — alerta que sobe de nível', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const publicados: { clientId: string; msg: any }[] = [];
  const hub = { publish: async (clientId: string, msg: any) => void publicados.push({ clientId, msg }) } as unknown as RealtimeHub;
  const worker = new SemPosicaoWorker(pool, hub);
  const ultimaPosicao = new Date('2026-11-10T10:00:00Z');
  const em = (h: number) => new Date(ultimaPosicao.getTime() + h * 3600_000);

  let clientA: string;
  let clientB: string;
  let assetId: string;
  let rastreadorId: string;

  const alertas = async () =>
    (await pool.query(`select id, client_id, prioridade, titulo, lido_em, ts from alertas where asset_id = $1 and tipo = 'sem_posicao'`, [assetId])).rows;
  const fila = async (alertaId: string) =>
    (await pool.query(`select processado_em, tentativas from notificacao_fila where alerta_id = $1`, [alertaId])).rows;

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-sempos-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-sempos-b-${randomUUID()}`])).rows[0].id;
    assetId = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'SEM1P22') returning id", [clientA])).rows[0].id;
    rastreadorId = (
      await pool.query<{ id: string }>('insert into rastreadores (imei, traccar_device_id) values ($1, $2) returning id', [
        randomUUID().replace(/-/g, '').slice(0, 15),
        300000 + Math.floor(Math.random() * 100000),
      ])
    ).rows[0].id;
    await pool.query(
      `insert into instalacoes (client_id, rastreador_id, asset_id, instalado_em, tecnico) values ($1, $2, $3, '2026-01-01T00:00:00Z', 'teste')`,
      [clientA, rastreadorId, assetId],
    );
    // fala (pacote recente), mas sem posição válida: "sem GPS" também alerta
    await pool.query(
      `insert into rastreador_comunicacao (rastreador_id, asset_id, client_id, ultimo_pacote_em, ultima_posicao_valida_em) values ($1, $2, $3, $4, $5)`,
      [rastreadorId, assetId, clientA, em(30), ultimaPosicao],
    );
  });

  afterAll(async () => {
    for (const t of ['rastreador_comunicacao', 'instalacoes']) await pool.query(`delete from ${t} where rastreador_id = $1`, [rastreadorId]);
    await pool.query('delete from rastreadores where id = $1', [rastreadorId]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('antes de 4 h não cria nada', async () => {
    await worker.tick(em(3.9), clientA);
    expect(await alertas()).toEqual([]);
  });

  it('4 h baixo → 12 h médio → 24 h crítico, sempre o mesmo alerta, notificando a cada nível', async () => {
    await worker.tick(em(4), clientA);
    const [baixo] = await alertas();
    expect(baixo).toMatchObject({ client_id: clientA, prioridade: 'baixa', ts: ultimaPosicao });
    expect(await fila(baixo.id)).toHaveLength(1);

    // mesmo nível: nada muda nem notifica de novo
    await pool.query('update notificacao_fila set processado_em = now() where alerta_id = $1', [baixo.id]);
    await pool.query('update alertas set lido_em = now() where id = $1', [baixo.id]);
    await worker.tick(em(5), clientA);
    expect((await fila(baixo.id))[0].processado_em).not.toBeNull();

    await worker.tick(em(12), clientA);
    let lista = await alertas();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id: baixo.id, prioridade: 'media', lido_em: null });
    expect(await fila(baixo.id)).toEqual([{ processado_em: null, tentativas: 0 }]);

    await worker.tick(em(24), clientA);
    lista = await alertas();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id: baixo.id, prioridade: 'alta', titulo: 'Rastreador há mais de 24 h sem enviar posição' });

    const niveis = publicados.filter((p) => p.msg.alerta?.id === baixo.id).map((p) => p.msg.alerta.prioridade);
    expect(niveis).toEqual(['baixa', 'media', 'alta']);
    expect(publicados.every((p) => p.clientId === clientA)).toBe(true);
  });

  it('alerta tratado não sobe mais', async () => {
    await pool.query(`update rastreador_comunicacao set ultima_posicao_valida_em = $2 where rastreador_id = $1`, [rastreadorId, em(40)]);
    await worker.tick(em(44), clientA);
    const nova = (await alertas()).find((a) => a.ts.getTime() === em(40).getTime())!;
    expect(nova.prioridade).toBe('baixa'); // queda nova = alerta novo
    await pool.query(`update alertas set tratado_em = now(), tratamento_motivo = 'teste' where id = $1`, [nova.id]);
    await worker.tick(em(70), clientA);
    expect((await alertas()).find((a) => a.id === nova.id)!.prioridade).toBe('baixa');
  });

  it('a volta de outro cliente não toca o ativo de A', async () => {
    const antes = publicados.length;
    await worker.tick(em(100), clientB);
    expect(publicados.length).toBe(antes);
  });
});
