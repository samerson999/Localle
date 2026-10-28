import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import IORedis from 'ioredis';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RealtimeMessage } from '@localle/shared/realtime';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { TraccarClient, type TraccarConfig, type TraccarEventoComando } from '../ingest/traccar-client';
import { RealtimeHub } from '../realtime/realtime.hub';
import { SettingsRepository } from '../settings/settings.repository';
import { SettingsService } from '../settings/settings.service';
import { ComandosRepository } from './comandos.repository';
import { ComandosService } from './comandos.service';

/** Traccar falso: registra o que foi enviado e devolve 200 (`enviado`) ou 202 (`aguardando`), conforme pedido. */
class TraccarFake extends TraccarClient {
  enviados: { deviceId: number; type: string }[] = [];
  configurado = true;
  queued = false;
  falhar = false;
  override config(): TraccarConfig | null {
    return this.configurado ? { url: 'http://traccar.fake', user: 'u', password: 'p' } : null;
  }
  override async sendCommand(_c: TraccarConfig, command: { deviceId: number; type: string }) {
    if (this.falhar) throw new Error('Traccar POST /api/commands/send falhou: 503 Service Unavailable');
    this.enviados.push(command);
    return { queued: this.queued, id: 100 + this.enviados.length };
  }
  /** `commandResult` gravados "no Traccar", para a conciliação. */
  eventos: TraccarEventoComando[] = [];
  consultas = 0;
  override async commandResults(_c: TraccarConfig, deviceId: number) {
    this.consultas++;
    return this.eventos.filter((e) => e.deviceId === deviceId);
  }
}

/**
 * Comandos contra Postgres e Redis reais (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4.6): condições de
 * segurança do bloqueio, um pendente por tipo, precedência do oposto, `commandResult` (inclusive tardio),
 * expiração por timeout, auditoria, tempo real e isolamento por cliente.
 */
describe('comandos ao rastreador', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
  const hub = new RealtimeHub(redis);
  const traccar = new TraccarFake();
  const repo = new ComandosRepository(pool);
  const service = new ComandosService(repo, traccar, new SettingsService(new SettingsRepository(pool), pool), new AuditLogRepository(pool), hub, pool);
  const deviceId = 900_000 + Math.floor(Math.random() * 100_000);

  let clientA: string;
  let clientB: string;
  let assetA: string;
  let assetSemRastreador: string;
  let userA: string;
  let userB: string;
  let rastreadorId: string;

  const posicao = (fixTime: string, speedKmh: number) =>
    pool.query(
      `insert into ultima_posicao (rastreador_id, asset_id, client_id, posicao_id, fix_time, geom, speed_kmh, ignition)
       values ($1, $2, $3, 1, $4, st_setsrid(st_makepoint(-34.88, -8.05), 4326), $5, true)
       on conflict (rastreador_id) do update set fix_time = excluded.fix_time, speed_kmh = excluded.speed_kmh`,
      [rastreadorId, assetA, clientA, fixTime, speedKmh],
    );
  const agora = () => new Date().toISOString();
  const limpar = () => pool.query('delete from comandos where rastreador_id = $1', [rastreadorId]);

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-cmd-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-cmd-b-${randomUUID()}`])).rows[0].id;
    assetA = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'CMD1A22') returning id", [clientA])).rows[0].id;
    assetSemRastreador = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'CMD2A22') returning id", [clientA])).rows[0].id;
    const user = async (c: string) =>
      (
        await pool.query<{ id: string }>("insert into users (client_id, email, password_hash, role) values ($1, $2, 'x', 'admin') returning id", [
          c,
          `u-${randomUUID()}@teste.local`,
        ])
      ).rows[0].id;
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
    await limpar();
    await pool.query('delete from ultima_posicao where rastreador_id = $1', [rastreadorId]);
    await pool.query('delete from instalacoes where rastreador_id = $1', [rastreadorId]);
    await pool.query('delete from rastreadores where id = $1', [rastreadorId]);
    await pool.query('delete from audit_log where client_id in ($1, $2)', [clientA, clientB]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await hub.onModuleDestroy();
    redis.disconnect();
    await pool.end();
  });

  it('bloqueio recusado em movimento, sem posição ou com posição velha — nada é criado nem enviado', async () => {
    await limpar();
    await expect(service.solicitar(clientA, userA, { assetId: assetA, tipo: 'engineStop', motivo: 'furto' })).rejects.toMatchObject({ status: 409 });
    await posicao(agora(), 60);
    await expect(service.solicitar(clientA, userA, { assetId: assetA, tipo: 'engineStop', motivo: 'furto' })).rejects.toThrow(/60 km\/h/);
    await posicao(new Date(Date.now() - 2 * 3600_000).toISOString(), 0);
    await expect(service.solicitar(clientA, userA, { assetId: assetA, tipo: 'engineStop', motivo: 'furto' })).rejects.toThrow(/120 min/);
    expect(traccar.enviados).toEqual([]);
    expect(await service.listar(clientA, assetA)).toEqual([]);
  });

  it('bloqueio com veículo parado: enviado ao Traccar, auditado, publicado no canal do cliente', async () => {
    await limpar();
    await posicao(agora(), 3);
    const recebidas: RealtimeMessage[] = [];
    const cancelar = await hub.subscribe(clientA, (m) => recebidas.push(m));

    const c = await service.solicitar(clientA, userA, { assetId: assetA, tipo: 'engineStop', motivo: 'veículo furtado' });
    expect(c).toMatchObject({ tipo: 'engineStop', status: 'enviado', assetId: assetA, rastreadorId, motivo: 'veículo furtado' });
    expect(c.enviadoEm).not.toBeNull();
    expect(traccar.enviados.at(-1)).toEqual({ deviceId, type: 'engineStop' });
    const { rows } = await pool.query('select traccar_command_id from comandos where id = $1', [c.id]);
    expect(Number(rows[0].traccar_command_id)).toBeGreaterThan(100);

    const audit = await pool.query("select action, target from audit_log where client_id = $1 and action = 'comando.solicitar'", [clientA]);
    expect(audit.rows).toContainEqual({ action: 'comando.solicitar', target: c.id });

    await new Promise((r) => setTimeout(r, 200));
    await cancelar();
    expect(recebidas.map((m) => m.kind === 'comando_status' && m.comando.status)).toEqual(['enviado']);
  });

  it('um pendente por tipo: segundo engineStop → 409; engineResume cancela o engineStop pendente (precedência)', async () => {
    await expect(service.solicitar(clientA, userA, { assetId: assetA, tipo: 'engineStop', motivo: 'de novo' })).rejects.toMatchObject({ status: 409 });

    traccar.queued = true; // aparelho offline: Traccar enfileira (202)
    const resume = await service.solicitar(clientA, userA, { assetId: assetA, tipo: 'engineResume', motivo: 'recuperado' });
    traccar.queued = false;
    expect(resume.status).toBe('aguardando');

    const lista = await service.listar(clientA, assetA);
    const stop = lista.find((x) => x.tipo === 'engineStop')!;
    expect(stop.status).toBe('cancelado');
    expect(stop.resultado).toEqual({ motivo: 'substituido_por_oposto' });
    const audit = await pool.query("select target, after from audit_log where client_id = $1 and action = 'comando.cancelar'", [clientA]);
    expect(audit.rows).toEqual([{ target: stop.id, after: { substituidoPor: resume.id } }]);
  });

  it('commandResult confirma o pendente; um segundo, sem pendente, fica como tardio no último resolvido', async () => {
    await service.receberResultado(deviceId, { result: 'OK' }, new Date('2026-10-26T12:00:00Z'));
    const [resume] = (await service.listar(clientA, assetA)).filter((x) => x.tipo === 'engineResume');
    expect(resume.status).toBe('confirmado');
    expect(resume.resultado).toEqual({ result: 'OK', recebidoEm: '2026-10-26T12:00:00.000Z' });
    expect(resume.resolvidoEm).not.toBeNull();

    await service.receberResultado(deviceId, { result: 'OK' }, new Date('2026-10-26T12:05:00Z'));
    const [depois] = (await service.listar(clientA, assetA)).filter((x) => x.tipo === 'engineResume');
    expect(depois.status).toBe('confirmado');
    expect(depois.resultado).toMatchObject({ tardio: true, recebidoEm: '2026-10-26T12:05:00.000Z' });
  });

  it('expira pendente vencido; commandResult depois disso não muda o estado', async () => {
    const c = await service.solicitar(clientA, userA, { assetId: assetA, tipo: 'positionSingle', motivo: null });
    expect(c.status).toBe('enviado');
    expect(await service.expirarVencidos()).toBe(0);
    await pool.query("update comandos set solicitado_em = now() - interval '30 min', expira_em = now() - interval '1 min' where id = $1", [c.id]);
    expect(await service.expirarVencidos()).toBe(1);
    const [expirado] = (await service.listar(clientA, assetA)).filter((x) => x.id === c.id);
    expect(expirado.status).toBe('expirado');

    await service.receberResultado(deviceId, { result: 'OK' }, new Date());
    const [ainda] = (await service.listar(clientA, assetA)).filter((x) => x.id === c.id);
    expect(ainda.status).toBe('expirado');
    expect(ainda.resultado).toMatchObject({ tardio: true });
  });

  it('Traccar fora ou não configurado: comando fica `falhou` com o erro, sem exceção para o usuário', async () => {
    await limpar();
    traccar.falhar = true;
    const c = await service.solicitar(clientA, userA, { assetId: assetA, tipo: 'positionSingle', motivo: null });
    traccar.falhar = false;
    expect(c.status).toBe('falhou');
    expect(c.resultado).toEqual({ erro: 'Traccar POST /api/commands/send falhou: 503 Service Unavailable' });

    traccar.configurado = false;
    const d = await service.solicitar(clientA, userA, { assetId: assetA, tipo: 'positionSingle', motivo: null });
    traccar.configurado = true;
    expect(d.status).toBe('falhou');
    expect(d.resultado).toEqual({ erro: 'traccar_nao_configurado' });
  });

  it('conciliação: commandResult que não veio pelo Forwarding é buscado no Traccar; o mesmo evento nunca conta duas vezes', async () => {
    await limpar();
    const evento = (id: number): TraccarEventoComando => ({ id, deviceId, type: 'commandResult', eventTime: agora(), attributes: { result: 'RELAY OK' } });
    const c = await service.solicitar(clientA, userA, { assetId: assetA, tipo: 'positionSingle', motivo: null });
    traccar.eventos = [evento(7001)];
    // recém-enviado: espera o Forwarding antes de consultar o Traccar
    traccar.consultas = 0;
    expect(await service.conciliar()).toBe(0);
    expect(traccar.consultas).toBe(0);

    await pool.query("update comandos set enviado_em = now() - interval '30 seconds' where id = $1", [c.id]);
    expect(await service.conciliar()).toBe(1);
    const [confirmado] = (await service.listar(clientA, assetA)).filter((x) => x.id === c.id);
    expect(confirmado.status).toBe('confirmado');
    expect(confirmado.resultado).toMatchObject({ result: 'RELAY OK', traccarEventId: 7001 });

    // o Forwarding entrega o mesmo evento depois: ignorado, não vira "tardio"
    expect(await service.receberResultado(deviceId, { result: 'RELAY OK' }, new Date(), 7001)).toBe('ignorado');
    const [igual] = (await service.listar(clientA, assetA)).filter((x) => x.id === c.id);
    expect(igual.resultado).not.toHaveProperty('tardio');

    // ao contrário: chegou pelo Forwarding, a conciliação não reaproveita o evento para outro comando pendente
    const d = await service.solicitar(clientA, userA, { assetId: assetA, tipo: 'positionSingle', motivo: null });
    expect(await service.receberResultado(deviceId, { result: 'OK' }, new Date(), 7002)).toBe('confirmado');
    const e = await service.solicitar(clientA, userA, { assetId: assetA, tipo: 'positionSingle', motivo: null });
    await pool.query("update comandos set enviado_em = now() - interval '30 seconds' where id = $1", [e.id]);
    traccar.eventos = [evento(7001), evento(7002)];
    expect(await service.conciliar()).toBe(0);
    const lista = await service.listar(clientA, assetA);
    expect(lista.find((x) => x.id === d.id)!.status).toBe('confirmado');
    expect(lista.find((x) => x.id === e.id)!.status).toBe('enviado');
    traccar.eventos = [];
  });

  it('ativo sem rastreador → 404; outro cliente não comanda nem lista o ativo alheio', async () => {
    await expect(service.solicitar(clientA, userA, { assetId: assetSemRastreador, tipo: 'positionSingle', motivo: null })).rejects.toMatchObject({ status: 404 });
    await expect(service.solicitar(clientB, userB, { assetId: assetA, tipo: 'positionSingle', motivo: null })).rejects.toMatchObject({ status: 404 });
    expect(await service.listar(clientB, assetA)).toEqual([]);
    expect(await service.listar(clientB, null)).toEqual([]);
    expect((await service.listar(clientA, null)).length).toBeGreaterThan(0);
  });
});
