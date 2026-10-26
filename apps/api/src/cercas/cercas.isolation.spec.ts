import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PositionsIngestService } from '../ingest/positions-ingest.service';
import type { NormalizedPosition } from '../ingest/traccar-position.mapper';
import type { CercaInput } from './cerca.entity';
import { CercasRepository } from './cercas.repository';
import { parseCerca } from './dto/cerca.dto';

/**
 * Cercas contra Postgres/PostGIS reais: isolamento do CRUD por client_id e detecção de entrada/saída
 * pela ingestão de posições de verdade (a mesma transação que grava a posição).
 */
describe('cercas — isolamento e detecção na ingestão', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new CercasRepository(pool);
  const ingest = new PositionsIngestService(pool);
  const deviceId = 800_000 + Math.floor(Math.random() * 100_000);

  let clientA: string;
  let clientB: string;
  let assetA: string;
  let rastreadorId: string;
  let posId = 0;

  // Recife: círculo de 300 m em torno de (-8.05, -34.88)
  const circulo = (o: Partial<CercaInput> = {}): CercaInput =>
    parseCerca({ nome: 'Pátio', tipo: 'Pátio', forma: 'circulo', centro: [-8.05, -34.88], raioM: 300, alertaEntrada: true, alertaSaida: true, ...o });

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-cercas-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-cercas-b-${randomUUID()}`])).rows[0].id;
    assetA = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'CER1A22') returning id", [clientA])).rows[0].id;
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

  function posicao(fixTime: string, lat: number, lon: number): NormalizedPosition {
    posId += 1;
    return {
      traccarDeviceId: deviceId, traccarPositionId: posId, fixTime: new Date(fixTime), serverTime: new Date(fixTime),
      valid: true, latitude: lat, longitude: lon, speedKmh: 20, course: 0, altitude: 0, odometerM: null, ignition: true,
      alarms: [], attributes: {},
    };
  }
  async function eventosDeCerca(result: Awaited<ReturnType<PositionsIngestService['ingest']>>) {
    return result.status === 'gravada' ? result.eventos.filter((e) => e.tipo.startsWith('cerca_')) : [];
  }

  describe('CRUD', () => {
    it('cria círculo e polígono e devolve a geometria no formato do front ([lat, lon], sem repetir o 1º ponto)', async () => {
      const c = await repo.criar(clientA, circulo({ nome: 'Círculo CRUD', alertaEntrada: false, alertaSaida: false }));
      expect(c).toMatchObject({ forma: 'circulo', centro: [-8.05, -34.88], raioM: 300, pontos: null });
      const pontos: [number, number][] = [[-8.1, -34.9], [-8.1, -34.89], [-8.09, -34.89], [-8.09, -34.9]];
      const p = await repo.criar(clientA, parseCerca({ nome: 'Polígono', tipo: 'Cliente', forma: 'poligono', pontos }));
      expect(p.pontos).toEqual(pontos);
      await repo.remover(clientA, c.id);
      await repo.remover(clientA, p.id);
    });

    it('polígono que se cruza é recusado com 400', async () => {
      const gravata = parseCerca({ nome: 'X', tipo: 'Outro', forma: 'poligono', pontos: [[0, 0], [1, 1], [1, 0], [0, 1]] });
      await expect(repo.criar(clientA, gravata)).rejects.toMatchObject({ status: 400 });
    });

    it('outro cliente não lista, não lê, não altera e não remove; o dono segue podendo', async () => {
      const c = await repo.criar(clientA, circulo({ nome: 'Só de A', alertaEntrada: false, alertaSaida: false }));
      expect((await repo.listar(clientB)).find((x) => x.id === c.id)).toBeUndefined();
      expect(await repo.buscar(clientB, c.id)).toBeNull();
      expect(await repo.atualizar(clientB, c.id, circulo({ nome: 'invadida' }))).toBeNull();
      expect(await repo.remover(clientB, c.id)).toBe(false);

      expect((await repo.buscar(clientA, c.id))?.nome).toBe('Só de A');
      expect((await repo.atualizar(clientA, c.id, circulo({ nome: 'Renomeada' })))?.nome).toBe('Renomeada');
      expect(await repo.remover(clientA, c.id)).toBe(true);
      expect(await repo.buscar(clientA, c.id)).toBeNull();
    });
  });

  describe('detecção', () => {
    it('entrada, permanência sem evento, saída — com horário da posição e alerta decidido pela cerca', async () => {
      const cerca = await repo.criar(clientA, circulo({ nome: 'Pátio Det', tipo: 'Área de risco', alertaSaida: false }));
      // cerca de B no mesmo lugar: não pode ser considerada para o ativo de A
      const deB = await repo.criar(clientB, circulo({ nome: 'Cerca de B' }));

      const fora1 = await eventosDeCerca(await ingest.ingest(posicao('2026-03-01T10:00:00Z', -8.06, -34.88)));
      expect(fora1).toEqual([]);

      const entrou = await eventosDeCerca(await ingest.ingest(posicao('2026-03-01T10:01:00Z', -8.05, -34.88)));
      expect(entrou).toHaveLength(1);
      expect(entrou[0]).toMatchObject({
        tipo: 'cerca_entrada',
        attributes: { cercaId: cerca.id, nome: 'Pátio Det' },
        alerta: { titulo: 'Entrada em Pátio Det', prioridade: 'alta' },
      });
      expect(entrou[0].ts.toISOString()).toBe('2026-03-01T10:01:00.000Z');

      expect(await eventosDeCerca(await ingest.ingest(posicao('2026-03-01T10:02:00Z', -8.0501, -34.8801)))).toEqual([]);

      const saiu = await eventosDeCerca(await ingest.ingest(posicao('2026-03-01T10:03:00Z', -8.06, -34.88)));
      expect(saiu).toHaveLength(1);
      expect(saiu[0]).toMatchObject({ tipo: 'cerca_saida', alerta: null });

      const { rows } = await pool.query(
        "select tipo, client_id from eventos where rastreador_id = $1 and tipo like 'cerca_%' order by ts",
        [rastreadorId],
      );
      expect(rows).toEqual([
        { tipo: 'cerca_entrada', client_id: clientA },
        { tipo: 'cerca_saida', client_id: clientA },
      ]);
      expect(rows.some((r) => r.client_id === clientB)).toBe(false);
      await repo.remover(clientA, cerca.id);
      await repo.remover(clientB, deB.id);
    });

    it('posição atrasada (fix_time anterior ao último avaliado) não mexe no estado nem gera evento', async () => {
      const cerca = await repo.criar(clientA, circulo({ nome: 'Atraso' }));
      await ingest.ingest(posicao('2026-04-01T10:00:00Z', -8.05, -34.88)); // entra
      const atrasada = await eventosDeCerca(await ingest.ingest(posicao('2026-04-01T09:00:00Z', -8.06, -34.88))); // fora, mas antiga
      expect(atrasada).toEqual([]);
      const { rowCount } = await pool.query('select 1 from cerca_presenca where asset_id = $1 and cerca_id = $2', [assetA, cerca.id]);
      expect(rowCount).toBe(1);
      await repo.remover(clientA, cerca.id);
    });

    it('cerca removida com o veículo dentro não gera "saída" falsa na posição seguinte', async () => {
      const cerca = await repo.criar(clientA, circulo({ nome: 'Removida' }));
      await ingest.ingest(posicao('2026-05-01T10:00:00Z', -8.05, -34.88));
      await repo.remover(clientA, cerca.id);
      expect(await eventosDeCerca(await ingest.ingest(posicao('2026-05-01T10:01:00Z', -8.06, -34.88)))).toEqual([]);
    });
  });
});
