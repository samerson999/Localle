import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PositionsIngestService } from '../ingest/positions-ingest.service';
import type { NormalizedPosition } from '../ingest/traccar-position.mapper';
import { RastreadorModelosRepository } from '../rastreadores/rastreador-modelos.repository';
import { lerCodigoMotorista } from './identificacao-motorista';
import { MotoristaVinculosRepository } from './motorista-vinculos.repository';
import { parseMotorista } from './motoristas.controller';
import { MotoristasRepository } from './motoristas.repository';

describe('identificação do motorista — leitura do código (qualquer aparelho)', () => {
  it('lê driverUniqueId por padrão e a chave do modelo quando configurada', () => {
    expect(lerCodigoMotorista({ driverUniqueId: '2844255995' })).toEqual({ tipo: 'codigo', codigo: '2844255995' });
    expect(lerCodigoMotorista({ driverUniqueId: '0' })).toEqual({ tipo: 'sem_codigo' });
    expect(lerCodigoMotorista({ ignition: true })).toEqual({ tipo: 'ausente' });
    expect(lerCodigoMotorista({ driverUniqueId: null })).toEqual({ tipo: 'ausente' });
    expect(lerCodigoMotorista({ card: 'abc123', driverUniqueId: '9' }, 'card')).toEqual({ tipo: 'codigo', codigo: 'ABC123' });
    expect(lerCodigoMotorista(null)).toEqual({ tipo: 'ausente' });
  });
});

/**
 * De ponta a ponta contra o Postgres local (migration 1794390000000): a ingestão da posição abre e encerra o vínculo
 * motorista × veículo, pacote atrasado não mexe no histórico, e o histórico é isolado por cliente.
 */
describe('identificação do motorista — ingestão e isolamento', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const ingest = new PositionsIngestService(pool);
  const modelos = new RastreadorModelosRepository(pool);
  const motoristas = new MotoristasRepository(pool);
  const vinculos = new MotoristaVinculosRepository(pool);

  let clientA: string;
  let clientB: string;
  const modelosCriados: string[] = [];
  const rastreadores: string[] = [];
  let deviceSeq = 910_000_000 + Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const cli = (n: string) => pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-motid-${n}-${randomUUID()}`]);
    clientA = (await cli('a')).rows[0].id;
    clientB = (await cli('b')).rows[0].id;
  });

  afterAll(async () => {
    for (const id of rastreadores) {
      for (const t of ['rastreador_comunicacao', 'ultima_posicao', 'eventos', 'posicoes', 'ingest_posicoes_recebidas']) {
        await pool.query(`delete from ${t} where rastreador_id = $1`, [id]);
      }
      await pool.query('delete from instalacoes where rastreador_id = $1', [id]);
      await pool.query('delete from motorista_vinculos where rastreador_id = $1', [id]);
      await pool.query('delete from rastreadores where id = $1', [id]);
    }
    for (const id of modelosCriados) await pool.query('delete from rastreador_modelos where id = $1', [id]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]); // cascata: ativos, motoristas, vínculos
    await pool.end();
  });

  async function modelo(atributoMotorista: string | null = null) {
    const m = await modelos.criar({
      fabricante: `Teste ${randomUUID().slice(0, 8)}`, nome: 'RFID', protocolo: 'jmak', porta: 5259, tipo_identificador: 'imei',
      atributo_motorista: atributoMotorista,
    });
    modelosCriados.push(m.id);
    return m.id;
  }

  /** Rastreador instalado num veículo novo do cliente. */
  async function veiculo(clientId: string, modeloId?: string) {
    const deviceId = ++deviceSeq;
    const r = await pool.query<{ id: string }>(
      'insert into rastreadores (imei, traccar_device_id, modelo_id) values ($1, $2, $3) returning id',
      [randomUUID().replace(/-/g, '').slice(0, 15), deviceId, modeloId ?? (await modelo())],
    );
    rastreadores.push(r.rows[0].id);
    const placa = randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase();
    const asset = await pool.query<{ id: string }>('insert into assets (client_id, plate) values ($1, $2) returning id', [clientId, placa]);
    await pool.query(
      `insert into instalacoes (client_id, rastreador_id, asset_id, instalado_em, tecnico) values ($1, $2, $3, '2026-11-17T10:00:00Z', 'teste')`,
      [clientId, r.rows[0].id, asset.rows[0].id],
    );
    return { deviceId, rastreadorId: r.rows[0].id, assetId: asset.rows[0].id };
  }

  let posSeq = 1;
  const posicao = (deviceId: number, min: number, attributes: Record<string, unknown>, ignition: boolean | null = true): NormalizedPosition => ({
    traccarDeviceId: deviceId, traccarPositionId: posSeq++,
    fixTime: new Date(Date.UTC(2026, 10, 17, 13, min)), serverTime: new Date(Date.UTC(2026, 10, 17, 13, min, 2)),
    valid: true, longitude: -34.89 + min / 10_000, latitude: -8.02, speedKmh: 0, course: 0, altitude: 0, odometerM: null, ignition,
    alarms: [], attributes: ignition === null ? attributes : { ...attributes, ignition },
  });

  const doAtivo = (clientId: string, assetId: string) =>
    pool.query('select motorista_id, codigo, inicio, fim, encerrado_por from motorista_vinculos where client_id = $1 and asset_id = $2 order by inicio, criado_em', [clientId, assetId])
      .then((r) => r.rows);
  const em = (min: number) => new Date(Date.UTC(2026, 10, 17, 13, min));

  it('sequência do J-R10 da HML: liga sem tag, identifica, desliga com a tag, outro motorista, zera', async () => {
    const v = await veiculo(clientA);
    const maria = await motoristas.criar(clientA, parseMotorista({ nome: 'Maria', codigoIdentificacao: '2844255995' }));

    await ingest.ingest(posicao(v.deviceId, 0, { driverUniqueId: '0' })); // ignição ligada, tag ainda zerada
    await ingest.ingest(posicao(v.deviceId, 1, { driverUniqueId: '2844255995', event: 126 })); // st 1: identificou
    await ingest.ingest(posicao(v.deviceId, 2, { driverUniqueId: '2844255995' })); // mesmo código: nada muda
    await ingest.ingest(posicao(v.deviceId, 3, { driverUniqueId: '2844255995' }, false)); // desligou, tag ainda presente
    await ingest.ingest(posicao(v.deviceId, 9, { driverUniqueId: '2837467883' })); // outro cartão, ainda não cadastrado
    await ingest.ingest(posicao(v.deviceId, 12, { driverUniqueId: '0' })); // tag zerada com a ignição ligada

    expect(await doAtivo(clientA, v.assetId)).toEqual([
      { motorista_id: maria.id, codigo: '2844255995', inicio: em(1), fim: em(3), encerrado_por: 'ignicao_desligada' },
      { motorista_id: null, codigo: '2837467883', inicio: em(9), fim: em(12), encerrado_por: 'sem_codigo' },
    ]);
  });

  it('liga e passa o cartão, desliga, religa com o mesmo cartão, depois com um sem cadastro; a ingestão devolve cada mudança', async () => {
    const v = await veiculo(clientA);
    const carla = await motoristas.criar(clientA, parseMotorista({ nome: 'Carla', codigoIdentificacao: '880011' }));
    const mudancas = async (min: number, attrs: Record<string, unknown>, ignicao: boolean) => {
      const r = await ingest.ingest(posicao(v.deviceId, min, attrs, ignicao));
      return r.status === 'gravada' ? r.motoristas.map((m) => ({ acao: m.acao, motoristaId: m.motoristaId, codigo: m.codigo, ts: m.ts, encerradoPor: m.encerradoPor })) : null;
    };

    expect(await mudancas(0, { driverUniqueId: '880011' }, true)).toEqual([{ acao: 'abriu', motoristaId: carla.id, codigo: '880011', ts: em(0), encerradoPor: undefined }]);
    expect(await mudancas(5, { driverUniqueId: '880011' }, false)).toEqual([
      { acao: 'encerrou', motoristaId: carla.id, codigo: '880011', ts: em(5), encerradoPor: 'ignicao_desligada' },
    ]);
    expect(await mudancas(6, { driverUniqueId: '0' }, false)).toEqual([]); // desligado: nada aberto, nada muda
    expect(await mudancas(10, { driverUniqueId: '880011' }, true)).toEqual([{ acao: 'abriu', motoristaId: carla.id, codigo: '880011', ts: em(10), encerradoPor: undefined }]);
    expect(await mudancas(15, { driverUniqueId: '880011' }, false)).toHaveLength(1);
    expect(await mudancas(20, { driverUniqueId: '990022' }, true)).toEqual([{ acao: 'abriu', motoristaId: null, codigo: '990022', ts: em(20), encerradoPor: undefined }]);

    const linhas = await doAtivo(clientA, v.assetId);
    expect(linhas.map((l) => [l.motorista_id, l.codigo, l.encerrado_por])).toEqual([
      [carla.id, '880011', 'ignicao_desligada'], [carla.id, '880011', 'ignicao_desligada'], [null, '990022', null],
    ]);
  });

  it('cartão cadastrado com o vínculo aberto devolve o mesmo vínculo, agora com o motorista', async () => {
    const v = await veiculo(clientA);
    const r1 = await ingest.ingest(posicao(v.deviceId, 0, { driverUniqueId: '660033' }));
    const dani = await motoristas.criar(clientA, parseMotorista({ nome: 'Dani', codigoIdentificacao: '660033' }));
    const r2 = await ingest.ingest(posicao(v.deviceId, 1, { driverUniqueId: '660033' }));
    if (r1.status !== 'gravada' || r2.status !== 'gravada') throw new Error('posição não gravada');
    expect(r2.motoristas).toEqual([{ ...r1.motoristas[0], motoristaId: dani.id }]);
  });

  it('ativos com leitor: só a instalação principal vigente marcada, e só do próprio cliente', async () => {
    const comLeitor = await veiculo(clientA);
    const semLeitor = await veiculo(clientA);
    await pool.query('update instalacoes set leitor_motorista = true where rastreador_id = $1', [comLeitor.rastreadorId]);
    const ativosA = await vinculos.ativosComLeitor(clientA);
    expect(ativosA).toContain(comLeitor.assetId);
    expect(ativosA).not.toContain(semLeitor.assetId);
    expect(await vinculos.ativosComLeitor(clientB)).not.toContain(comLeitor.assetId);
  });

  it('troca de cartão encerra o anterior; código cadastrado depois liga o vínculo aberto; aparelho sem ignição usa só o código', async () => {
    const v = await veiculo(clientA);
    await ingest.ingest(posicao(v.deviceId, 0, { driverUniqueId: '00000000A1B2C3D4' }, null));
    const joao = await motoristas.criar(clientA, parseMotorista({ nome: 'João', codigoIdentificacao: 'a1:b2:c3:d4' }));
    await ingest.ingest(posicao(v.deviceId, 1, { driverUniqueId: 'A1B2C3D4' }, null)); // agora cadastrado
    await ingest.ingest(posicao(v.deviceId, 2, { driverUniqueId: 'FFEE' }, null));

    expect(await doAtivo(clientA, v.assetId)).toEqual([
      { motorista_id: joao.id, codigo: 'A1B2C3D4', inicio: em(0), fim: em(2), encerrado_por: 'troca' },
      { motorista_id: null, codigo: 'FFEE', inicio: em(2), fim: null, encerrado_por: null },
    ]);
  });

  it('o mesmo motorista identificado em outro veículo encerra o vínculo no anterior', async () => {
    const v1 = await veiculo(clientA);
    const v2 = await veiculo(clientA);
    await motoristas.criar(clientA, parseMotorista({ nome: 'Pedro', codigoIdentificacao: '777001' }));
    await ingest.ingest(posicao(v1.deviceId, 0, { driverUniqueId: '777001' }));
    await ingest.ingest(posicao(v2.deviceId, 5, { driverUniqueId: '777001' }));

    expect(await doAtivo(clientA, v1.assetId)).toMatchObject([{ codigo: '777001', fim: em(5), encerrado_por: 'troca' }]);
    expect(await doAtivo(clientA, v2.assetId)).toMatchObject([{ codigo: '777001', inicio: em(5), fim: null }]);
  });

  it('pacote atrasado (buffer do aparelho) não abre nem encerra vínculo', async () => {
    const v = await veiculo(clientA);
    await ingest.ingest(posicao(v.deviceId, 10, { driverUniqueId: '555' }));
    await ingest.ingest(posicao(v.deviceId, 4, { driverUniqueId: '0' }, false)); // chegou depois, mas é de antes
    expect(await doAtivo(clientA, v.assetId)).toMatchObject([{ codigo: '555', inicio: em(10), fim: null }]);
  });

  it('modelo com chave própria: lê a chave do modelo e ignora driverUniqueId', async () => {
    const v = await veiculo(clientA, await modelo('rfidCard'));
    await ingest.ingest(posicao(v.deviceId, 0, { driverUniqueId: '111', rfidCard: '222' }));
    expect(await doAtivo(clientA, v.assetId)).toMatchObject([{ codigo: '222', fim: null }]);
  });

  it('código do cartão é único por cliente entre motoristas ativos, normalizado; outro cliente pode usar o mesmo', async () => {
    await motoristas.criar(clientA, parseMotorista({ nome: 'Ana', codigoIdentificacao: '0099AA' }));
    await expect(motoristas.criar(clientA, parseMotorista({ nome: 'Bia', codigoIdentificacao: '99-aa' }))).rejects.toMatchObject({ code: '23505' });
    expect((await motoristas.criar(clientB, parseMotorista({ nome: 'Bia', codigoIdentificacao: '99AA' }))).client_id).toBe(clientB);
    expect(() => parseMotorista({ nome: 'X', codigoIdentificacao: '000' })).toThrow(/codigoIdentificacao/);
  });

  it('cartão de motorista de outro cliente não identifica ninguém aqui', async () => {
    await motoristas.criar(clientB, parseMotorista({ nome: 'Só do B', codigoIdentificacao: '424242' }));
    const v = await veiculo(clientA);
    await ingest.ingest(posicao(v.deviceId, 0, { driverUniqueId: '424242' }));
    expect(await doAtivo(clientA, v.assetId)).toMatchObject([{ motorista_id: null, codigo: '424242' }]);
  });

  it('histórico isolado: outro cliente não lê, não altera nem apaga; o dono lê', async () => {
    const v = await veiculo(clientA);
    await ingest.ingest(posicao(v.deviceId, 0, { driverUniqueId: '31337' }));
    const desde = new Date(Date.UTC(2026, 10, 1));
    const doDono = (await vinculos.listar(clientA, desde)).find((x) => x.asset_id === v.assetId)!;
    expect(doDono).toMatchObject({ codigo: '31337', origem: 'rastreador', rastreador_id: v.rastreadorId });

    expect((await vinculos.listar(clientB, desde)).map((x) => x.id)).not.toContain(doDono.id);
    expect(await vinculos.findOne(clientB, { id: doDono.id })).toBeNull();
    expect(await vinculos.update(clientB, doDono.id, { codigo: 'HACK' })).toBeNull();
    expect(await vinculos.delete(clientB, doDono.id)).toBe(false);
    expect(await vinculos.findOne(clientA, { id: doDono.id })).toMatchObject({ codigo: '31337' });
  });
});
