import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PositionsIngestService } from '../ingest/positions-ingest.service';
import type { NormalizedPosition } from '../ingest/traccar-position.mapper';
import { RastreadorModelosRepository } from '../rastreadores/rastreador-modelos.repository';
import { atualizarSinaisMotor } from './instalacao-sinais.repository';
import { SEM_MAPEAMENTO_SINAIS } from './sinais-motor';

/**
 * Sinais de motor de ponta a ponta contra o Postgres local de verdade (migration 1793180000000): a ingestão grava o
 * estado por instalação a partir dos atributos DA POSIÇÃO, pacote atrasado não regride, reinstalação em outro cliente
 * começa do zero e o banco não aceita estado com cliente diferente da instalação.
 */
describe('instalacao_sinais — ingestão e isolamento', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const ingest = new PositionsIngestService(pool);
  const modelos = new RastreadorModelosRepository(pool);

  let clientA: string;
  let clientB: string;
  let modeloId: string;
  const rastreadores: string[] = [];
  let deviceSeq = 900_000_000 + Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    const cli = (n: string) => pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-sinais-${n}-${randomUUID()}`]);
    clientA = (await cli('a')).rows[0].id;
    clientB = (await cli('b')).rows[0].id;
    const m = await modelos.criar({
      fabricante: `Teste ${randomUUID().slice(0, 8)}`, nome: 'CAN', protocolo: 'teltonika', porta: 5027, tipo_identificador: 'imei',
      suporte_can: 'nativo', sinais_motor: ['rpm'],
    });
    modeloId = m.id;
  });

  afterAll(async () => {
    for (const id of rastreadores) {
      for (const t of ['rastreador_comunicacao', 'ultima_posicao', 'eventos', 'posicoes', 'ingest_posicoes_recebidas']) {
        await pool.query(`delete from ${t} where rastreador_id = $1`, [id]);
      }
      await pool.query('delete from instalacoes where rastreador_id = $1', [id]); // cascata leva os sinais
      await pool.query('delete from rastreadores where id = $1', [id]);
    }
    await pool.query('delete from rastreador_modelos where id = $1', [modeloId]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  async function rastreador() {
    const deviceId = ++deviceSeq;
    const { rows } = await pool.query<{ id: string }>(
      'insert into rastreadores (imei, traccar_device_id, modelo_id) values ($1, $2, $3) returning id',
      [randomUUID().replace(/-/g, '').slice(0, 15), deviceId, modeloId],
    );
    rastreadores.push(rows[0].id);
    return { id: rows[0].id, deviceId };
  }

  // um veículo por instalação: o banco não deixa duas instalações principais no mesmo veículo ao mesmo tempo
  async function instalar(clientId: string, rastreadorId: string, em: string) {
    const placa = randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase();
    const asset = await pool.query<{ id: string }>('insert into assets (client_id, plate) values ($1, $2) returning id', [clientId, placa]);
    const { rows } = await pool.query<{ id: string }>(
      `insert into instalacoes (client_id, rastreador_id, asset_id, instalado_em, tecnico) values ($1, $2, $3, $4, 'teste') returning id`,
      [clientId, rastreadorId, asset.rows[0].id, em],
    );
    return rows[0].id;
  }

  let posSeq = 1;
  const posicao = (deviceId: number, min: number, attributes: Record<string, unknown>, o: Partial<NormalizedPosition> = {}): NormalizedPosition => ({
    traccarDeviceId: deviceId, traccarPositionId: posSeq++,
    fixTime: new Date(Date.UTC(2026, 10, 4, 12, min)), serverTime: new Date(Date.UTC(2026, 10, 4, 12, min, 1)),
    valid: true, longitude: -34.88, latitude: -8.05, speedKmh: 40, course: 0, altitude: 0, odometerM: null, ignition: true,
    alarms: [], attributes, ...o,
  });

  const sinais = (instalacaoId: string) =>
    pool.query('select * from instalacao_sinais where instalacao_id = $1 order by sinal', [instalacaoId]).then((r) => r.rows);

  it('aparelho sem instalação (bancada) não gera estado de sinal', async () => {
    const r = await rastreador();
    await ingest.ingest(posicao(r.deviceId, 0, { rpm: 1500 }));
    expect((await pool.query('select 1 from instalacao_sinais where rastreador_id = $1', [r.id])).rowCount).toBe(0);
  });

  it('grava o sinal recebido da posição, com histórico só na mudança de status', async () => {
    const r = await rastreador();
    const inst = await instalar(clientA, r.id, '2026-11-04T11:00:00Z');
    await ingest.ingest(posicao(r.deviceId, 0, { rpm: 0, ignition: true }, { speedKmh: 0 }));
    await ingest.ingest(posicao(r.deviceId, 1, { rpm: 1850 }));

    const [rpm] = await sinais(inst);
    expect(rpm).toMatchObject({ client_id: clientA, sinal: 'rpm', status: 'recebido', ultimo_valor: 1850, atributo_origem: 'rpm' });
    // modelo não promete combustível/odômetro e eles não chegaram: nada cobrado
    expect((await sinais(inst)).map((s) => s.sinal)).toEqual(['rpm']);
    const hist = await pool.query('select status_anterior, status from instalacao_sinais_historico where instalacao_id = $1', [inst]);
    expect(hist.rows).toEqual([{ status_anterior: null, status: 'recebido' }]);
  });

  it('ausência no pacote conta mesmo com o valor ainda em ultimos_atributos (não reaproveita leitura antiga)', async () => {
    const r = await rastreador();
    const inst = await instalar(clientA, r.id, '2026-11-04T11:00:00Z');
    await ingest.ingest(posicao(r.deviceId, 0, { rpm: 1850 }));
    for (let i = 1; i <= 5; i++) await ingest.ingest(posicao(r.deviceId, i, { sat: 10 }));

    const ultimos = await pool.query('select ultimos_atributos from rastreador_comunicacao where rastreador_id = $1', [r.id]);
    expect(ultimos.rows[0].ultimos_atributos.rpm).toBe(1850); // o merge da telemetria guarda o último valor…
    const [rpm] = await sinais(inst);
    // …mas o diagnóstico viu 5 posições em movimento sem o rpm
    expect(rpm).toMatchObject({ status: 'nao_recebido', ultimo_valor: 1850, sem_sinal_em_operacao: 5 });
    expect(rpm.ultima_leitura_em).toEqual(new Date(Date.UTC(2026, 10, 4, 12, 0)));
  });

  it('dado que chegava e parou gera um alerta para o gestor (uma vez); o que nunca chegou não gera', async () => {
    const r = await rastreador();
    const inst = await instalar(clientA, r.id, '2026-11-04T11:00:00Z');
    await ingest.ingest(posicao(r.deviceId, 0, { rpm: 1850 }));
    const resultados = [];
    for (let i = 1; i <= 7; i++) resultados.push(await ingest.ingest(posicao(r.deviceId, i, { sat: 10 })));

    const alertas = resultados.flatMap((x) => (x.status === 'gravada' ? x.alertas : []));
    expect(alertas).toHaveLength(1); // na 5ª posição sem rpm; as seguintes não repetem
    expect(alertas[0]).toMatchObject({ origem: 'aparelho', tipo: 'sinais_painel_pararam', titulo: 'Dados do painel pararam de chegar', prioridade: 'media' });
    expect(alertas[0].detalhe).toBe('RPM: sem leitura desde 04/11 às 09:00, com o veículo em movimento');
    const gravado = await pool.query('select client_id from alertas where id = $1', [alertas[0].id]);
    expect(gravado.rows[0].client_id).toBe(clientA);

    // outro rastreador do mesmo modelo, sem nunca mandar rpm: vira "não recebido" só no diagnóstico
    const r2 = await rastreador();
    const inst2 = await instalar(clientA, r2.id, '2026-11-04T11:00:00Z');
    const semRpm = [];
    for (let i = 0; i < 6; i++) semRpm.push(await ingest.ingest(posicao(r2.deviceId, i, { sat: 10 })));
    expect(semRpm.flatMap((x) => (x.status === 'gravada' ? x.alertas : []))).toEqual([]);
    expect((await sinais(inst2))[0]).toMatchObject({ status: 'nao_recebido', ultima_leitura_em: null });
    expect((await sinais(inst))[0]).toMatchObject({ status: 'nao_recebido' });
  });

  it('posição atrasada não sobrescreve a leitura mais recente', async () => {
    const r = await rastreador();
    const inst = await instalar(clientA, r.id, '2026-11-04T11:00:00Z');
    await ingest.ingest(posicao(r.deviceId, 10, { rpm: 2000 }));
    await ingest.ingest(posicao(r.deviceId, 5, { rpm: 900 }));
    const [rpm] = await sinais(inst);
    expect(rpm).toMatchObject({ status: 'recebido', ultimo_valor: 2000 });
    expect(rpm.avaliado_ate).toEqual(new Date(Date.UTC(2026, 10, 4, 12, 10)));
  });

  it('reinstalação em outro cliente começa diagnóstico novo; o estado do cliente anterior fica com ele', async () => {
    const r = await rastreador();
    const instA = await instalar(clientA, r.id, '2026-11-04T11:00:00Z');
    await ingest.ingest(posicao(r.deviceId, 0, { rpm: 1850 }));
    await pool.query(`update instalacoes set desinstalado_em = '2026-11-04T12:30:00Z' where id = $1`, [instA]);
    const instB = await instalar(clientB, r.id, '2026-11-04T12:30:00Z');
    await ingest.ingest(posicao(r.deviceId, 40, { ignition: true }, { speedKmh: 0 }));

    expect(await sinais(instA)).toMatchObject([{ client_id: clientA, status: 'recebido', ultimo_valor: 1850 }]);
    expect(await sinais(instB)).toMatchObject([{ client_id: clientB, status: 'aguardando', ultimo_valor: null, ultima_leitura_em: null }]);
    // o diagnóstico do superadmin olha só a instalação vigente
    expect((await modelos.sinaisDaInstalacaoVigente(r.id)).map((s) => s.client_id)).toEqual([clientB]);
  });

  it('o banco recusa estado com o cliente diferente do dono da instalação', async () => {
    const r = await rastreador();
    const instA = await instalar(clientA, r.id, '2026-11-04T11:00:00Z');
    await expect(
      atualizarSinaisMotor(pool, {
        clientId: clientB, instalacaoId: instA, rastreadorId: r.id, attributes: { rpm: 1000 },
        ctx: { fixTime: new Date(), serverTime: new Date(), gpsValido: true, velocidadeKmh: 40 },
        mapeamento: SEM_MAPEAMENTO_SINAIS, mapeamentoVersao: null,
      }),
    ).rejects.toMatchObject({ code: '23503' }); // foreign_key_violation (instalacao_id, client_id)
  });

  it('catálogo: suporte e sinais fora da lista são recusados pelo banco', async () => {
    await expect(pool.query(`update rastreador_modelos set suporte_can = 'talvez' where id = $1`, [modeloId])).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(`update rastreador_modelos set sinais_motor = '{rpm,pressao}' where id = $1`, [modeloId])).rejects.toMatchObject({ code: '23514' });
  });
});
