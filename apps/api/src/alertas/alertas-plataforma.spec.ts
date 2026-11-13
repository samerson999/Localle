import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { PositionsIngestService } from '../ingest/positions-ingest.service';
import type { NormalizedPosition } from '../ingest/traccar-position.mapper';
import { AlertaTiposService } from './alerta-tipos.controller';
import { AlertaTiposRepository } from './alerta-tipos.repository';
import { MOTIVO_NORMALIZADO } from './alertas-plataforma';

/**
 * Alerta da plataforma por condição, pela ingestão real contra o Postgres: duração mínima, sem repetir enquanto vale,
 * encerramento automático, "notificar no celular" e o cliente desligando no Setup dele. O catálogo é global e outros
 * specs ingerem em paralelo: a condição usa um atributo com nome único, que só as posições deste teste carregam.
 */
describe('alertas da plataforma por condição', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const tipos = new AlertaTiposService(new AlertaTiposRepository(pool), new AuditLogRepository(pool));
  const ingest = new PositionsIngestService(pool);
  const deviceId = 900_000 + Math.floor(Math.random() * 90_000);
  const attr = `t${randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const superadmin = randomUUID();

  let clientId: string;
  let assetId: string;
  let userId: string;
  let rastreadorId: string;
  let chave: string;

  beforeAll(async () => {
    clientId = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-alertas-plat-${randomUUID()}`])).rows[0].id;
    assetId = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'PLA1T00') returning id", [clientId])).rows[0].id;
    userId = (await pool.query<{ id: string }>("insert into users (client_id, email, password_hash, role) values ($1, $2, 'x', 'gestor') returning id", [clientId, `u-${randomUUID()}@teste.local`])).rows[0].id;
    rastreadorId = (
      await pool.query<{ id: string }>('insert into rastreadores (imei, traccar_device_id) values ($1, $2) returning id', [randomUUID().replace(/-/g, '').slice(0, 15), deviceId])
    ).rows[0].id;
    await pool.query(`insert into instalacoes (client_id, rastreador_id, asset_id, instalado_em, tecnico) values ($1, $2, $3, '2026-01-01T00:00:00Z', 'teste')`, [clientId, rastreadorId, assetId]);
    const criado = await tipos.criar(superadmin, {
      disparo: 'condicao', nome: 'Entrada 1 acionada', prioridade: 'media', exigeTratamento: true, notificaPush: false,
      condicoes: [{ field: 'atributo', attr, op: '=', value: 'true' }], duracaoMin: 5, encerraSozinho: true, repetirMin: 0,
    });
    chave = criado.chave;
  });

  afterAll(async () => {
    for (const t of ['eventos', 'rastreador_comunicacao', 'ultima_posicao', 'posicoes', 'ingest_posicoes_recebidas', 'instalacoes']) {
      await pool.query(`delete from ${t} where rastreador_id = $1`, [rastreadorId]);
    }
    await pool.query('delete from rastreadores where id = $1', [rastreadorId]);
    await pool.query('delete from alerta_tipos where chave = $1', [chave]);
    await pool.query('delete from audit_log where target = $1', [chave]);
    await pool.query('delete from clients where id = $1', [clientId]);
    await pool.end();
  });

  let posId = 0;
  const em = (min: number, valor: boolean) =>
    ingest.ingest({
      traccarDeviceId: deviceId, traccarPositionId: ++posId, fixTime: new Date(Date.UTC(2026, 5, 1, 10, min)), serverTime: new Date(Date.UTC(2026, 5, 1, 10, min)),
      valid: true, latitude: -8.2, longitude: -35, speedKmh: 0, course: 0, altitude: 0, odometerM: null, ignition: false, alarms: [], attributes: { [attr]: valor },
    } as NormalizedPosition);
  const alertasDoTipo = async () => (await pool.query('select id, tratado_em, tratamento_motivo, exige_tratamento from alertas where client_id = $1 and tipo = $2 order by ts', [clientId, chave])).rows;
  const naFila = async (id: string) => (await pool.query('select 1 from notificacao_fila where alerta_id = $1', [id])).rowCount;

  it('valida a condição: campo fora do estado do rastreador e atributo sem nome são recusados', async () => {
    await expect(tipos.criar(superadmin, { disparo: 'condicao', nome: 'x', prioridade: 'alta', condicoes: [{ field: 'dentro_cerca', op: '=', value: 'Cliente' }] })).rejects.toMatchObject({ status: 400 });
    await expect(tipos.criar(superadmin, { disparo: 'condicao', nome: 'x', prioridade: 'alta', condicoes: [{ field: 'atributo', op: '=', value: '1' }] })).rejects.toMatchObject({ status: 400 });
    await expect(tipos.criar(superadmin, { disparo: 'condicao', nome: 'x', prioridade: 'alta' })).rejects.toMatchObject({ status: 400 });
  });

  it('só dispara depois de valer pela duração; não repete enquanto vale; sem push quando o tipo não notifica', async () => {
    await em(0, true);
    await em(3, true);
    expect(await alertasDoTipo()).toEqual([]);
    const r = await em(6, true);
    expect(r.status === 'gravada' && r.alertas.map((a) => a.tipo)).toEqual([chave]);
    await em(8, true);
    const abertos = await alertasDoTipo();
    expect(abertos).toHaveLength(1);
    expect(abertos[0]).toMatchObject({ tratado_em: null, exige_tratamento: true });
    expect(await naFila(abertos[0].id)).toBe(0);
  });

  it('deixou de valer: fecha sozinho como "Normalizado" e devolve o alerta fechado para a publicação', async () => {
    const r = await em(10, false);
    expect(r.status === 'gravada' && r.alertas.map((a) => [a.tipo, a.motivo])).toEqual([[chave, MOTIVO_NORMALIZADO]]);
    expect((await alertasDoTipo())[0]).toMatchObject({ tratamento_motivo: MOTIVO_NORMALIZADO });
    expect((await pool.query('select 1 from alerta_tipo_estado where asset_id = $1', [assetId])).rowCount).toBe(0);
  });

  it('cliente desliga no Setup: a condição não dispara para ele; religa e volta a valer (com push ligado no tipo)', async () => {
    await tipos.definirDoCliente(clientId, userId, chave, { ligado: false });
    expect((await tipos.doCliente(clientId)).find((t) => t.chave === chave)).toMatchObject({ ligado: false });
    await em(20, true);
    await em(30, true);
    expect(await alertasDoTipo()).toHaveLength(1);

    await tipos.definirDoCliente(clientId, userId, chave, { ligado: true });
    await tipos.atualizar(superadmin, chave, { notificaPush: true });
    await em(40, true);
    await em(46, true);
    const todos = await alertasDoTipo();
    expect(todos).toHaveLength(2);
    expect(await naFila(todos[1].id)).toBe(1);
    await expect(tipos.definirDoCliente(clientId, userId, 'nao_existe', { ligado: false })).rejects.toMatchObject({ status: 404 });
  });

  it('tipo padrão: não se exclui nem muda o que mede; o cliente ajusta limite e duração e a ingestão usa o ajuste', async () => {
    await expect(tipos.excluir(superadmin, 'bateria_veiculo_baixa')).rejects.toMatchObject({ status: 409 });
    await expect(tipos.atualizar(superadmin, 'bateria_veiculo_baixa', { condicoes: [{ field: 'satelites', op: '<', value: '3' }] })).rejects.toMatchObject({ status: 400 });

    const padrao = (await tipos.doCliente(clientId)).find((t) => t.chave === 'bateria_veiculo_baixa')!;
    expect(padrao).toMatchObject({ padrao: true, campo: 'tensao', operador: '<', limite: null, duracaoMin: null, ligado: true });
    // 12 V não está abaixo do padrão (11,5); com o ajuste do cliente para 12,5 V e sem duração, dispara na hora
    const tensao = (min: number, v: number) =>
      ingest.ingest({
        traccarDeviceId: deviceId, traccarPositionId: ++posId, fixTime: new Date(Date.UTC(2026, 5, 1, 11, min)), serverTime: new Date(Date.UTC(2026, 5, 1, 11, min)),
        valid: true, latitude: -8.2, longitude: -35, speedKmh: 0, course: 0, altitude: 0, odometerM: null, ignition: false, alarms: [], attributes: { power: v },
      } as NormalizedPosition);
    await tensao(0, 12);
    const bat = async () => (await pool.query("select id from alertas where client_id = $1 and tipo = 'bateria_veiculo_baixa'", [clientId])).rowCount;
    expect(await bat()).toBe(0);
    expect(await tipos.definirDoCliente(clientId, userId, 'bateria_veiculo_baixa', { valor: 12.5, duracaoMin: 0 })).toMatchObject({ limite: '12.5', duracaoMin: 0 });
    await tensao(1, 12);
    expect(await bat()).toBe(1);
    // null volta ao padrão da plataforma
    expect(await tipos.definirDoCliente(clientId, userId, 'bateria_veiculo_baixa', { valor: null, duracaoMin: null })).toMatchObject({ limite: null, duracaoMin: null });
  });
});
