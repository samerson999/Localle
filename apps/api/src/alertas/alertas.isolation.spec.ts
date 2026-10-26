import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { PositionsIngestService } from '../ingest/positions-ingest.service';
import type { NormalizedPosition } from '../ingest/traccar-position.mapper';
import type { RealtimeHub } from '../realtime/realtime.hub';
import { AlertasRepository } from './alertas.repository';
import { AlertasService } from './alertas.service';

/**
 * Alertas contra o Postgres real: nascem na ingestão (mesma transação do evento), e lido/tratamento são
 * isolados por cliente. O RealtimeHub é substituído por um coletor — o que está sob teste aqui é o que
 * vai para o canal de qual cliente, não o Redis (que tem teste próprio em realtime.e2e.spec.ts).
 */
describe('alertas — criação na ingestão, isolamento e tratamento', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new AlertasRepository(pool);
  const publicados: { clientId: string; msg: any }[] = [];
  const hub = { publish: async (clientId: string, msg: any) => void publicados.push({ clientId, msg }) } as unknown as RealtimeHub;
  const service = new AlertasService(repo, new AuditLogRepository(pool), hub, pool);
  const ingest = new PositionsIngestService(pool);
  const deviceId = 900_000 + Math.floor(Math.random() * 90_000);

  let clientA: string;
  let clientB: string;
  let assetA: string;
  let userA: string;
  let userB: string;
  let rastreadorId: string;

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-alertas-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-alertas-b-${randomUUID()}`])).rows[0].id;
    assetA = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'ALE1A22') returning id", [clientA])).rows[0].id;
    const user = async (c: string) =>
      (await pool.query<{ id: string }>("insert into users (client_id, email, password_hash, role) values ($1, $2, 'x', 'gestor') returning id", [c, `u-${randomUUID()}@teste.local`])).rows[0].id;
    userA = await user(clientA);
    userB = await user(clientB);
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
    await pool.query('delete from audit_log where client_id in ($1, $2)', [clientA, clientB]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  let posId = 0;
  const posicao = (alarms: string[]): NormalizedPosition => ({
    traccarDeviceId: deviceId, traccarPositionId: ++posId, fixTime: new Date(`2026-06-01T10:0${posId}:00Z`), serverTime: new Date(),
    valid: true, latitude: -8.2, longitude: -35, speedKmh: 0, course: 0, altitude: 0, odometerM: null, ignition: false, alarms, attributes: {},
  });

  it('SOS vira alerta alta na mesma transação; frenagem brusca fica só como evento', async () => {
    const r = await ingest.ingest(posicao(['sos', 'hardBraking']));
    expect(r.status).toBe('gravada');
    if (r.status !== 'gravada') return;
    expect(r.eventos.map((e) => e.tipo).sort()).toEqual(['hardBraking', 'sos']);
    expect(r.alertas).toHaveLength(1);
    expect(r.alertas[0]).toMatchObject({ origem: 'aparelho', tipo: 'sos', prioridade: 'alta', assetId: assetA, tratadoEm: null });
  });

  it('listagem e "marcar todos como lidos" não alcançam outro cliente; o dono vê e marca', async () => {
    expect(await service.listar(clientB, new Date(0))).toEqual([]);
    expect(await service.marcarLidos(clientB, null)).toEqual({ marcados: 0 });
    const doA = await service.listar(clientA, new Date(0));
    expect(doA.length).toBeGreaterThan(0);
    expect(doA.every((a) => a.lidoEm === null)).toBe(true);

    // ids do cliente A mandados pelo B: nada muda
    expect(await service.marcarLidos(clientB, doA.map((a) => a.id))).toEqual({ marcados: 0 });

    publicados.length = 0;
    expect((await service.marcarLidos(clientA, null)).marcados).toBe(doA.length);
    expect((await service.listar(clientA, new Date(0))).every((a) => a.lidoEm !== null)).toBe(true);
    expect(publicados.every((p) => p.clientId === clientA && p.msg.kind === 'alerta')).toBe(true);
  });

  it('tratar: outro cliente recebe 404; o dono trata (auditado, com e-mail de quem tratou); tratar de novo é 409', async () => {
    const r = await ingest.ingest(posicao(['powerCut']));
    const alerta = r.status === 'gravada' ? r.alertas[0] : null;
    expect(alerta).not.toBeNull();

    await expect(service.tratar(clientB, userB, alerta!.id, 'Falso positivo', null)).rejects.toMatchObject({ status: 404 });
    expect((await repo.buscar(clientA, alerta!.id))?.tratadoEm).toBeNull();

    publicados.length = 0;
    const tratado = await service.tratar(clientA, userA, alerta!.id, 'Contato com o motorista', 'ligou e está ok');
    expect(tratado).toMatchObject({ motivo: 'Contato com o motorista', obs: 'ligou e está ok' });
    expect(tratado.tratadoPor).toMatch(/@teste\.local$/);
    expect(tratado.lidoEm).not.toBeNull();
    expect(publicados).toEqual([{ clientId: clientA, msg: { kind: 'alerta', alerta: tratado } }]);

    await expect(service.tratar(clientA, userA, alerta!.id, 'Outro', null)).rejects.toMatchObject({ status: 409 });
    const { rows } = await pool.query("select actor_id from audit_log where action = 'alerta.tratar' and target = $1", [alerta!.id]);
    expect(rows).toEqual([{ actor_id: userA }]);
  });

  it('listar devolve todos os abertos de qualquer data, mas tratados só desde a data pedida', async () => {
    const todos = await service.listar(clientA, new Date('2099-01-01'));
    expect(todos.every((a) => a.tratadoEm === null)).toBe(true);
    expect((await service.listar(clientA, new Date(0))).some((a) => a.tratadoEm !== null)).toBe(true);
  });
});
