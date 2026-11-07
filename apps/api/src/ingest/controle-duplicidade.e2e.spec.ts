import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InboxRepository } from './inbox.repository';
import { PositionsIngestService } from './positions-ingest.service';
import type { NormalizedPosition } from './traccar-position.mapper';

// Limpeza do controle de duplicidade (migration 1793210000000): apaga só o que venceu, em lotes, e o dedup continua
// valendo dentro do prazo.
describe('limpeza do controle de duplicidade da ingestão', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const inbox = new InboxRepository(pool);
  const deviceId = 500_000 + Math.floor(Math.random() * 100_000);
  let rastreadorId: string;

  beforeAll(async () => {
    rastreadorId = (
      await pool.query<{ id: string }>('insert into rastreadores (imei, traccar_device_id) values ($1, $2) returning id', [
        randomUUID().replace(/-/g, '').slice(0, 15),
        deviceId,
      ])
    ).rows[0].id;
  });

  afterAll(async () => {
    for (const t of ['ingest_posicoes_recebidas', 'ingest_eventos_recebidos', 'rastreador_comunicacao', 'ultima_posicao', 'posicoes']) {
      await pool.query(`delete from ${t} where rastreador_id = $1`, [rastreadorId]);
    }
    await pool.query('delete from rastreadores where id = $1', [rastreadorId]);
    await pool.end();
  });

  it('apaga em lotes só o que foi recebido há mais do prazo, nas duas tabelas', async () => {
    await pool.query(
      `insert into ingest_posicoes_recebidas (rastreador_id, traccar_position_id, recebido_em)
       select $1, g, now() - make_interval(days => case when g <= 5 then 20 else 1 end) from generate_series(1, 8) g`,
      [rastreadorId],
    );
    await pool.query(
      `insert into ingest_eventos_recebidos (rastreador_id, traccar_event_id, recebido_em)
       select $1, g, now() - make_interval(days => case when g <= 3 then 15 else 13 end) from generate_series(1, 4) g`,
      [rastreadorId],
    );
    // lote de 2: obriga várias voltas do delete (as linhas antigas de outros testes/do banco local também entram na conta)
    const r = await inbox.limparControleDuplicidade(14, 2);
    expect(r.posicoes).toBeGreaterThanOrEqual(5);
    expect(r.eventos).toBeGreaterThanOrEqual(3);

    const pos = await pool.query('select traccar_position_id::int id from ingest_posicoes_recebidas where rastreador_id = $1 order by 1', [rastreadorId]);
    expect(pos.rows.map((x) => x.id)).toEqual([6, 7, 8]);
    const ev = await pool.query('select traccar_event_id::int id from ingest_eventos_recebidos where rastreador_id = $1', [rastreadorId]);
    expect(ev.rows.map((x) => x.id)).toEqual([4]);
  });

  it('dentro do prazo o dedup continua: a mesma posição não é gravada duas vezes', async () => {
    const service = new PositionsIngestService(pool);
    const p: NormalizedPosition = {
      traccarDeviceId: deviceId, traccarPositionId: 900, fixTime: new Date(), serverTime: new Date(), valid: true,
      longitude: -34.9, latitude: -8.05, speedKmh: 0, course: 0, altitude: 0, odometerM: null, ignition: null, alarms: [], attributes: {},
    };
    expect((await service.ingest(p)).status).toBe('gravada');
    await inbox.limparControleDuplicidade(14);
    expect((await service.ingest(p)).status).toBe('deduped');
  });
});
