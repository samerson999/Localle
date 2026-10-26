import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PositionsIngestService } from '../ingest/positions-ingest.service';
import type { NormalizedPosition } from '../ingest/traccar-position.mapper';
import { parseRegra } from './dto/regra.dto';
import { RegrasRepository } from './regras.repository';

/** Regras contra o Postgres real: isolamento do CRUD e disparo pela ingestão (alerta, repetição, ordem). */
describe('regras — isolamento e motor na ingestão', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new RegrasRepository(pool);
  const ingest = new PositionsIngestService(pool);
  const deviceId = 990_000 + Math.floor(Math.random() * 9_000);

  let clientA: string;
  let clientB: string;
  let assetA: string;
  let rastreadorId: string;
  let posId = 0;

  const regra = (o: Record<string, unknown> = {}) =>
    parseRegra({ nome: 'Acima de 90', prioridade: 'media', condicoes: [{ field: 'velocidade', op: '>', value: '90' }], acoes: { painel: true }, ...o });

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-regras-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-regras-b-${randomUUID()}`])).rows[0].id;
    assetA = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'REG1A22') returning id", [clientA])).rows[0].id;
    rastreadorId = (
      await pool.query<{ id: string }>('insert into rastreadores (imei, traccar_device_id) values ($1, $2) returning id', [
        randomUUID().replace(/-/g, '').slice(0, 15),
        deviceId,
      ])
    ).rows[0].id;
    await pool.query(
      `insert into instalacoes (client_id, rastreador_id, asset_id, instalado_em, tecnico) values ($1, $2, $3, '2026-01-01T00:00:00Z', 'teste')`,
      [clientA, rastreadorId, assetA],
    );
  });

  afterAll(async () => {
    for (const t of ['eventos', 'rastreador_comunicacao', 'ultima_posicao', 'posicoes', 'ingest_posicoes_recebidas', 'instalacoes']) {
      await pool.query(`delete from ${t} where rastreador_id = $1`, [rastreadorId]);
    }
    await pool.query('delete from rastreadores where id = $1', [rastreadorId]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  const posicao = (fixTime: string, speedKmh: number): NormalizedPosition => ({
    traccarDeviceId: deviceId, traccarPositionId: ++posId, fixTime: new Date(fixTime), serverTime: new Date(fixTime),
    valid: true, latitude: -8.3, longitude: -35.1, speedKmh, course: 0, altitude: 0, odometerM: null, ignition: true, alarms: [], attributes: {},
  });
  const alertasDe = async (fixTime: string, speed: number) => {
    const r = await ingest.ingest(posicao(fixTime, speed));
    return r.status === 'gravada' ? r.alertas : [];
  };

  it('CRUD isolado: outro cliente não lista, não altera e não remove; o dono sim', async () => {
    const r = await repo.criar(clientA, regra({ nome: 'Só de A' }));
    expect((await repo.listar(clientB)).find((x) => x.id === r.id)).toBeUndefined();
    expect(await repo.atualizar(clientB, r.id, regra({ nome: 'invadida' }))).toBeNull();
    expect(await repo.remover(clientB, r.id)).toBe(false);
    expect((await repo.atualizar(clientA, r.id, regra({ nome: 'Renomeada', ativa: false })))?.nome).toBe('Renomeada');
    expect(await repo.remover(clientA, r.id)).toBe(true);
  });

  it('validação recusa campo/operador/valor fora do catálogo', () => {
    expect(() => regra({ condicoes: [{ field: 'inexistente', op: '>', value: '1' }] })).toThrow();
    expect(() => regra({ condicoes: [{ field: 'velocidade', op: '=', value: '1' }] })).toThrow();
    expect(() => regra({ condicoes: [{ field: 'horario', op: 'depois de', value: '25:00' }] })).toThrow();
    expect(() => regra({ condicoes: [] })).toThrow();
    // regressões do pentest: nome herdado do protótipo dava 500; valor numérico só com espaço/hex virava número
    for (const field of ['constructor', '__proto__', 'toString']) expect(() => regra({ condicoes: [{ field, op: '=', value: 'x' }] })).toThrow('field inválido');
    expect(() => regra({ condicoes: [{ field: 'velocidade', op: '>', value: ' ' }] })).toThrow('número');
    expect(() => regra({ condicoes: [{ field: 'velocidade', op: '>', value: '0x10' }] })).toThrow('número');
    expect(regra({ condicoes: [{ field: 'bateria', op: '<', value: '11.5' }] }).condicoes[0].value).toBe('11.5');
  });

  it('dispara alerta de regra uma vez, repete só depois de 15 min, ignora posição atrasada e regra de outro cliente', async () => {
    const r = await repo.criar(clientA, regra({ nome: 'Excesso 90', prioridade: 'alta' }));
    const deB = await repo.criar(clientB, regra({ nome: 'Regra de B' }));

    expect(await alertasDe('2026-07-01T10:00:00Z', 50)).toEqual([]);
    const primeiro = await alertasDe('2026-07-01T10:01:00Z', 100);
    expect(primeiro).toHaveLength(1);
    expect(primeiro[0]).toMatchObject({ origem: 'regra', tipo: 'regra', titulo: 'Excesso 90', prioridade: 'alta', detalhe: '100 km/h' });

    expect(await alertasDe('2026-07-01T10:05:00Z', 110)).toEqual([]); // dentro dos 15 min
    expect(await alertasDe('2026-07-01T09:00:00Z', 130)).toEqual([]); // atrasada
    expect(await alertasDe('2026-07-01T10:20:00Z', 120)).toHaveLength(1); // passou o intervalo

    const { rows } = await pool.query(
      "select attributes->>'regraId' as regra from eventos where rastreador_id = $1 and tipo = 'regra'",
      [rastreadorId],
    );
    expect(rows.every((x) => x.regra === r.id)).toBe(true);
    // disparos de julho/2026 ficam fora da janela "últimos 30 dias" da coluna Disparos
    expect((await repo.buscar(clientA, r.id))?.disparos30d).toBe(0);
    await repo.remover(clientA, r.id);
    await repo.remover(clientB, deB.id);
  });

  it('regra sem "Notificar no painel" registra o evento mas não cria alerta', async () => {
    const r = await repo.criar(clientA, regra({ nome: 'Só ranking', acoes: { ranking: true }, condicoes: [{ field: 'velocidade', op: '>', value: '5' }] }));
    const res = await ingest.ingest(posicao('2026-08-01T10:00:00Z', 60));
    expect(res.status === 'gravada' && res.alertas).toEqual([]);
    expect(res.status === 'gravada' && res.eventos.find((e) => e.tipo === 'regra')?.attributes).toMatchObject({ regraId: r.id, ranking: true });
    await repo.remover(clientA, r.id);
  });
});
