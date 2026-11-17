import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PositionsIngestService } from '../ingest/positions-ingest.service';
import type { NormalizedPosition } from '../ingest/traccar-position.mapper';
import { RastreadorModelosRepository } from '../rastreadores/rastreador-modelos.repository';
import { situacaoLeitor } from '../rastreadores/rastreador-modelos.service';
import { MOTIVO_IDENTIFICADO, TIPO_SEM_IDENTIFICACAO } from './aviso-sem-identificacao';

/**
 * Aviso de veículo rodando sem cartão (migration 1794400000000) de ponta a ponta contra o Postgres local: só onde há
 * leitor e o gestor exige, um por viagem, fecha sozinho com a leitura; e o diagnóstico de leitor sem leitura.
 */
// cada teste ingere dezenas de posições: ~2 s numa máquina livre, passa dos 5 s padrão com a suíte inteira em paralelo
// (mesmo critério de positions-ingest.service.spec.ts)
describe('aviso de motorista não identificado', { timeout: 15_000 }, () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const ingest = new PositionsIngestService(pool);
  const modelos = new RastreadorModelosRepository(pool);

  let clientA: string;
  let modeloComLeitor: string;
  let modeloSemLeitor: string;
  const rastreadores: string[] = [];
  let deviceSeq = 920_000_000 + Math.floor(Math.random() * 1_000_000);

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-semid-${randomUUID()}`])).rows[0].id;
    const modelo = async (leitor: boolean) =>
      (await modelos.criar({
        fabricante: `Teste ${randomUUID().slice(0, 8)}`, nome: 'RFID', protocolo: 'jmak', porta: 5259, tipo_identificador: 'imei', leitor_motorista: leitor,
      })).id;
    modeloComLeitor = await modelo(true);
    modeloSemLeitor = await modelo(false);
  });

  afterAll(async () => {
    for (const id of rastreadores) {
      for (const t of ['rastreador_comunicacao', 'ultima_posicao', 'eventos', 'posicoes', 'ingest_posicoes_recebidas', 'motorista_vinculos']) {
        await pool.query(`delete from ${t} where rastreador_id = $1`, [id]);
      }
      await pool.query('delete from instalacoes where rastreador_id = $1', [id]);
      await pool.query('delete from rastreadores where id = $1', [id]);
    }
    await pool.query('delete from rastreador_modelos where id in ($1, $2)', [modeloComLeitor, modeloSemLeitor]);
    await pool.query('delete from clients where id = $1', [clientA]); // cascata: ativos, alertas, viagem_identificacao, Setup
    await pool.end();
  });

  async function setup(valores: { exigir?: boolean; toleranciaMin?: number }) {
    await pool.query('delete from client_settings where client_id = $1', [clientA]);
    if (valores.exigir !== undefined) {
      await pool.query(`insert into client_settings (client_id, key, value) values ($1, 'motoristas.exigir_identificacao', $2::jsonb)`, [clientA, valores.exigir ? '1' : '0']);
    }
    if (valores.toleranciaMin !== undefined) {
      await pool.query(`insert into client_settings (client_id, key, value) values ($1, 'motoristas.tolerancia_sem_identificacao_min', $2::jsonb)`, [clientA, String(valores.toleranciaMin)]);
    }
  }

  async function veiculo(o: { modeloId?: string; leitor?: boolean; instaladoEm?: string } = {}) {
    const deviceId = ++deviceSeq;
    const r = await pool.query<{ id: string }>(
      'insert into rastreadores (imei, traccar_device_id, modelo_id) values ($1, $2, $3) returning id',
      [randomUUID().replace(/-/g, '').slice(0, 15), deviceId, o.modeloId ?? modeloComLeitor],
    );
    rastreadores.push(r.rows[0].id);
    const asset = await pool.query<{ id: string }>('insert into assets (client_id, plate) values ($1, $2) returning id', [
      clientA, randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase(),
    ]);
    await pool.query(
      `insert into instalacoes (client_id, rastreador_id, asset_id, instalado_em, tecnico, leitor_motorista) values ($1, $2, $3, $4, 'teste', $5)`,
      [clientA, r.rows[0].id, asset.rows[0].id, o.instaladoEm ?? '2026-11-17T10:00:00Z', o.leitor ?? true],
    );
    return { deviceId, rastreadorId: r.rows[0].id, assetId: asset.rows[0].id };
  }

  let posSeq = 1;
  const t = (min: number) => new Date(Date.UTC(2026, 10, 17, 12, min));
  /** Um pacote por minuto: `v` = velocidade, `cartao` = driverUniqueId (omitido = o aparelho não informa). */
  const pacote = (deviceId: number, min: number, o: { v?: number; ignicao?: boolean; cartao?: string; em?: Date } = {}): NormalizedPosition => {
    const fix = o.em ?? t(min);
    return {
      traccarDeviceId: deviceId, traccarPositionId: posSeq++, fixTime: fix, serverTime: new Date(fix.getTime() + 2000),
      valid: true, longitude: -34.89 + posSeq / 100_000, latitude: -8.02, speedKmh: o.v ?? 40, course: 0, altitude: 0, odometerM: null,
      ignition: o.ignicao ?? true, alarms: [],
      attributes: { ignition: o.ignicao ?? true, ...(o.cartao !== undefined ? { driverUniqueId: o.cartao } : {}) },
    };
  };
  const enviar = async (deviceId: number, mins: number[], o: Parameters<typeof pacote>[2] = {}) => {
    const criados: string[] = [];
    for (const m of mins) {
      const r = await ingest.ingest(pacote(deviceId, m, o));
      if (r.status === 'gravada') criados.push(...r.alertas.filter((a) => a.tipo === TIPO_SEM_IDENTIFICACAO && !a.tratadoEm).map((a) => a.id));
    }
    return criados;
  };
  const range = (de: number, ate: number) => Array.from({ length: ate - de + 1 }, (_, i) => de + i);
  const avisos = (assetId: string) =>
    pool.query('select id, ts, exige_tratamento, prioridade, detalhe, tratado_em, tratamento_motivo from alertas where asset_id = $1 and tipo = $2 order by ts', [assetId, TIPO_SEM_IDENTIFICACAO])
      .then((r) => r.rows);

  it('sem o Setup ligado, sem leitor marcado ou com modelo sem leitor: nunca avisa', async () => {
    await setup({}); // padrão: desligado
    const v1 = await veiculo();
    await enviar(v1.deviceId, range(0, 12));
    expect(await avisos(v1.assetId)).toEqual([]);

    await setup({ exigir: true });
    const semMarcar = await veiculo({ leitor: false });
    const semCapacidade = await veiculo({ modeloId: modeloSemLeitor });
    await enviar(semMarcar.deviceId, range(0, 12));
    await enviar(semCapacidade.deviceId, range(0, 12));
    expect(await avisos(semMarcar.assetId)).toEqual([]);
    expect(await avisos(semCapacidade.assetId)).toEqual([]);
  });

  it('5 min andando sem cartão: um aviso (não exige tratamento); cartão lido fecha sozinho; tirar o cartão não repete', async () => {
    await setup({ exigir: true });
    const v = await veiculo();
    await enviar(v.deviceId, [0], { v: 0 }); // liga parado: abre a viagem
    const criados = await enviar(v.deviceId, range(1, 8)); // 1 min por pacote andando
    expect(criados).toHaveLength(1);
    let [aviso] = await avisos(v.assetId);
    expect(aviso).toMatchObject({ ts: t(5), exige_tratamento: false, prioridade: 'baixa', detalhe: 'Andou 5 min sem passar o cartão', tratado_em: null });

    await enviar(v.deviceId, [9], { cartao: '2844255995' });
    [aviso] = await avisos(v.assetId);
    expect(aviso).toMatchObject({ tratado_em: t(9), tratamento_motivo: MOTIVO_IDENTIFICADO });

    await enviar(v.deviceId, range(10, 20), { cartao: '0' }); // cartão sai, segue rodando: um aviso por viagem
    expect(await avisos(v.assetId)).toHaveLength(1);

    await enviar(v.deviceId, [21], { ignicao: false, v: 0 }); // desligou: nova viagem depois
    await enviar(v.deviceId, [30], { v: 0 });
    expect(await enviar(v.deviceId, range(31, 36))).toHaveLength(1);
    expect(await avisos(v.assetId)).toHaveLength(2);
  });

  it('manobra (até 5 km/h) não conta; buraco de sinal conta no máximo 2 min; tolerância vem do Setup', async () => {
    await setup({ exigir: true, toleranciaMin: 4 });
    const v = await veiculo();
    await enviar(v.deviceId, [0], { v: 0 });
    await enviar(v.deviceId, range(1, 15), { v: 4 }); // 15 min manobrando no pátio
    expect(await avisos(v.assetId)).toEqual([]);

    // andando: 1 min, depois um buraco de 20 min que conta só 2 (não chega aos 4)
    await enviar(v.deviceId, [16]);
    await enviar(v.deviceId, [36]);
    expect(await avisos(v.assetId)).toEqual([]);
    expect(await enviar(v.deviceId, [37])).toHaveLength(1); // 1 + 2 + 1 = 4 min
  });

  it('cartão lido antes da tolerância: nada de aviso; o gestor desligar o tipo no Setup também cala', async () => {
    await setup({ exigir: true });
    const v = await veiculo();
    await enviar(v.deviceId, [0], { v: 0 });
    await enviar(v.deviceId, range(1, 3));
    await enviar(v.deviceId, range(4, 15), { cartao: '777' });
    expect(await avisos(v.assetId)).toEqual([]);

    await pool.query(`insert into alerta_tipos_cliente (client_id, chave, ligado) values ($1, $2, false)`, [clientA, TIPO_SEM_IDENTIFICACAO]);
    try {
      const v2 = await veiculo();
      await enviar(v2.deviceId, [0], { v: 0 });
      await enviar(v2.deviceId, range(1, 10));
      expect(await avisos(v2.assetId)).toEqual([]);
    } finally {
      await pool.query('delete from alerta_tipos_cliente where client_id = $1', [clientA]);
    }
  });

  it('diagnóstico do leitor: dias rodados sem leitura contam só depois da última leitura; parado não conta', async () => {
    await setup({});
    const v = await veiculo({ instaladoEm: '2026-11-13T12:00:00Z' });
    const dia = (d: number, h: number) => new Date(Date.UTC(2026, 10, d, h));
    // rodou nos dias 14, 15 e 16 (horário de Recife), sem cartão; dia 13 é o da instalação
    for (const d of [14, 15, 16]) {
      await ingest.ingest(pacote(v.deviceId, 0, { em: dia(d, 13), v: 0 }));
      await ingest.ingest(pacote(v.deviceId, 0, { em: new Date(dia(d, 13).getTime() + 60_000) }));
    }
    await pool.query(`call refresh_continuous_aggregate('uso_5min', '2026-11-13', '2026-11-17')`);
    let l = await modelos.leitorMotoristaDoRastreador(v.rastreadorId);
    expect(l).toMatchObject({ aceita: true, instalado: true, ultima_leitura_em: null, dias_rodados_sem_leitura: 3 });
    expect(situacaoLeitor(l!)).toBe('sem_leitura');

    // leu um cartão no dia 16: só os dias rodados depois contam
    await ingest.ingest(pacote(v.deviceId, 0, { em: dia(16, 18), cartao: '123' }));
    l = await modelos.leitorMotoristaDoRastreador(v.rastreadorId);
    expect(l).toMatchObject({ dias_rodados_sem_leitura: 0, ultima_leitura_em: dia(16, 18) });
    expect(situacaoLeitor(l!)).toBe('ok');
    expect(situacaoLeitor({ ...l!, instalado: false, dias_rodados_sem_leitura: 9 })).toBe('nao_se_aplica');
  });
});
