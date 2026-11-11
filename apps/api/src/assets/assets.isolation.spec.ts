import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AssetEntity } from './asset.entity';
import { AssetsRepository } from './assets.repository';

/**
 * Suite exigida por docs/ARQUITETURA-BACKEND.md § 2.1 antes de qualquer dado real de múltiplos
 * clientes: para cada endpoint/query sensível, tenta ler dado de um `client_id` autenticado como
 * outro e falha o build se conseguir. Roda contra o Postgres local de verdade (infra/plataforma),
 * não um mock — o que está em teste é o `BaseRepository`, não uma simulação dele.
 */
describe('isolamento por client_id (assets)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new AssetsRepository(pool);

  let clientA: string;
  let clientB: string;
  let assetOfA: string;

  beforeAll(async () => {
    const { rows: a } = await pool.query<{ id: string }>(
      'insert into clients (name) values ($1) returning id',
      [`teste-isolamento-a-${randomUUID()}`],
    );
    const { rows: b } = await pool.query<{ id: string }>(
      'insert into clients (name) values ($1) returning id',
      [`teste-isolamento-b-${randomUUID()}`],
    );
    clientA = a[0].id;
    clientB = b[0].id;

    const asset = await repo.insert(clientA, { plate: 'ABC1D23' });
    assetOfA = asset.id;
  });

  afterAll(async () => {
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('não lista ativo de outro cliente em findMany', async () => {
    const rows = await repo.findMany(clientB);
    expect(rows.find((r) => r.id === assetOfA)).toBeUndefined();
  });

  it('não encontra ativo de outro cliente em findOne por id', async () => {
    const found = await repo.findOne(clientB, { id: assetOfA });
    expect(found).toBeNull();
  });

  it('não atualiza ativo de outro cliente', async () => {
    const updated = await repo.update(clientB, assetOfA, { plate: 'ZZZ9Z99' });
    expect(updated).toBeNull();

    const stillOriginal = await repo.findOne(clientA, { id: assetOfA });
    expect(stillOriginal?.plate).toBe('ABC1D23');
  });

  it('não apaga ativo de outro cliente', async () => {
    const deleted = await repo.delete(clientB, assetOfA);
    expect(deleted).toBe(false);

    const stillThere = await repo.findOne(clientA, { id: assetOfA });
    expect(stillThere).not.toBeNull();
  });

  it('atualizar (placa/status) não alcança ativo de outro cliente', async () => {
    const updated = await repo.atualizar(clientB, assetOfA, { plate: 'ZZZ9Z99', status: 'baixado' });
    expect(updated).toBeNull();

    const stillOriginal = await repo.findOne(clientA, { id: assetOfA });
    expect(stillOriginal?.status).toBe('ativo');
  });

  it('atualizar pelo dono muda o status e só move status_desde quando o status muda de fato', async () => {
    const outro = await repo.insert(clientA, { plate: 'CIC1L00' });

    const mesmoStatus = (await repo.atualizar(clientA, outro.id, { status: 'ativo' })) as AssetEntity;
    expect(mesmoStatus.status_desde.getTime()).toBe(outro.status_desde.getTime());

    const vendido = (await repo.atualizar(clientA, outro.id, { status: 'vendido' })) as AssetEntity;
    expect(vendido.status).toBe('vendido');
    expect(vendido.plate).toBe('CIC1L00');
    expect(vendido.status_desde.getTime()).toBeGreaterThan(outro.status_desde.getTime());

    // motorista de outro cliente (ou inexistente) não entra; do próprio, entra e `null` limpa
    expect(await repo.atualizar(clientA, outro.id, { status: null, motoristaId: randomUUID() })).toBe('motorista_invalido');
    const motorista = (await pool.query<{ id: string }>("insert into motoristas (client_id, nome) values ($1, 'M') returning id", [clientA])).rows[0].id;
    expect(((await repo.atualizar(clientA, outro.id, { status: null, motoristaId: motorista })) as AssetEntity).motorista_id).toBe(motorista);
    expect(((await repo.atualizar(clientA, outro.id, { status: null, motoristaId: null })) as AssetEntity).motorista_id).toBeNull();

    const ativos = await repo.findMany(clientA, { status: 'ativo' });
    expect(ativos.find((r) => r.id === outro.id)).toBeUndefined();
  });

  it('ícone ilustrado: o dono grava e limpa; outro cliente não alcança; ausente não mexe; o banco recusa formato inválido', async () => {
    expect(await repo.atualizar(clientB, assetOfA, { status: null, icone: '02-sedan' })).toBeNull();
    expect((await repo.findOne(clientA, { id: assetOfA }))?.icone).toBeNull();

    expect(((await repo.atualizar(clientA, assetOfA, { status: null, icone: '02-sedan' })) as AssetEntity).icone).toBe('02-sedan');
    // trocar só a placa não apaga o ícone
    const soPlaca = (await repo.atualizar(clientA, assetOfA, { plate: 'ICO1N00', status: null })) as AssetEntity;
    expect(soPlaca.icone).toBe('02-sedan');
    expect(((await repo.atualizar(clientA, assetOfA, { status: null, icone: null })) as AssetEntity).icone).toBeNull();

    await expect(repo.atualizar(clientA, assetOfA, { status: null, icone: '../x.png' })).rejects.toThrow();
  });

  it('ficha (dados) e operação: o dono grava; operação de outro cliente é recusada; outro cliente não alcança; ausente não mexe', async () => {
    const opA = (await pool.query<{ id: string }>("insert into operacoes (client_id, nome) values ($1, 'Contrato A') returning id", [clientA])).rows[0].id;
    const opB = (await pool.query<{ id: string }>("insert into operacoes (client_id, nome) values ($1, 'Contrato B') returning id", [clientB])).rows[0].id;
    const ficha = { kind: 'veiculo', brand: 'Volvo', specs: { Motor: 'D13' }, fuelGoal: 2.4 };

    expect(await repo.atualizar(clientA, assetOfA, { status: null, operacaoId: opB })).toBe('operacao_invalida');
    expect(await repo.atualizar(clientB, assetOfA, { status: null, dados: { x: 1 }, operacaoId: opB })).toBeNull();

    const salvo = (await repo.atualizar(clientA, assetOfA, { status: null, dados: ficha, operacaoId: opA })) as AssetEntity;
    expect(salvo.dados).toEqual(ficha);
    expect(salvo.operacao_id).toBe(opA);
    // trocar só a placa não apaga ficha nem operação
    const soPlaca = (await repo.atualizar(clientA, assetOfA, { plate: 'FIC1H00', status: null })) as AssetEntity;
    expect(soPlaca.dados).toEqual(ficha);
    expect(soPlaca.operacao_id).toBe(opA);
    // apagar a operação deixa o ativo sem operação, sem apagar o ativo
    await pool.query('delete from operacoes where id = $1', [opA]);
    expect((await repo.findOne(clientA, { id: assetOfA }))?.operacao_id).toBeNull();
  });

  // regressão do teste da FD Locação (09/11/2026): o 2º equipamento sem placa não salvava
  it('ativo sem placa: vários do mesmo cliente pelo identificador; rótulo é a placa ou o identificador; sem os dois o banco recusa', async () => {
    const retro = await repo.insert(clientA, { plate: null, identificador: 'RETRO-01' });
    const escav = await repo.insert(clientA, { plate: null, identificador: 'ESC-02' });
    expect([retro.rotulo, escav.rotulo]).toEqual(['RETRO-01', 'ESC-02']);
    expect(retro.plate).toBeNull();

    // picape com placa e código de frota: o rótulo é a placa
    const picape = await repo.insert(clientA, { plate: 'PIC1A00', identificador: 'FROTA-15' });
    expect(picape.rotulo).toBe('PIC1A00');
    // limpar a placa (placa inventada) mantém o ativo pelo identificador
    const semPlaca = (await repo.atualizar(clientA, picape.id, { plate: null, status: null })) as AssetEntity;
    expect([semPlaca.plate, semPlaca.rotulo]).toEqual([null, 'FROTA-15']);
    // ...mas tirar também o identificador deixaria o ativo sem nome
    expect(await repo.atualizar(clientA, picape.id, { identificador: null, status: null })).toBe('sem_identificacao');
    expect((await repo.findOne(clientA, { id: picape.id }))?.identificador).toBe('FROTA-15');
    await expect(repo.insert(clientA, { plate: null, identificador: null })).rejects.toThrow(/assets_placa_ou_identificador/);

    // outro cliente não troca o identificador
    expect(await repo.atualizar(clientB, retro.id, { identificador: 'INVADIDO', status: null })).toBeNull();
    expect((await repo.findOne(clientA, { id: retro.id }))?.identificador).toBe('RETRO-01');
  });

  it('o próprio dono enxerga e consegue alterar o ativo', async () => {
    const found = await repo.findOne(clientA, { id: assetOfA });
    expect(found?.id).toBe(assetOfA);

    const updated = await repo.update(clientA, assetOfA, { plate: 'OWN1E22' });
    expect(updated?.plate).toBe('OWN1E22');
  });
});
