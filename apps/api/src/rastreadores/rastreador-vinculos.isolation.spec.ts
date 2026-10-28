import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssetsRepository } from '../assets/assets.repository';
import { InstalacoesRepository } from './instalacoes.repository';
import { RastreadorVinculosRepository } from './rastreador-vinculos.repository';
import { RastreadoresRepository } from './rastreadores.repository';

/**
 * Isolamento multi-tenant de `rastreador_vinculos` contra o Postgres local de verdade: o cliente B não lê,
 * não altera nem encerra o vínculo do cliente A — e A continua vendo e encerrando o próprio. Cobre também a
 * exclusion constraint (mesmo rastreador vinculado a dois clientes ao mesmo tempo é barrado no banco).
 */
describe('RastreadorVinculosRepository — isolamento por client_id', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new RastreadorVinculosRepository(pool);
  const rastreadores = new RastreadoresRepository(pool);
  const instalacoes = new InstalacoesRepository(pool);
  const assets = new AssetsRepository(pool);

  let clientA: string;
  let clientB: string;
  const rastreadoresCriados: string[] = [];

  const novoImei = () => randomUUID().replace(/-/g, '').slice(0, 15);
  const novaPlaca = () => randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase();
  async function rastreador() {
    const r = await rastreadores.create({ imei: novoImei(), modelo: 'GT06', protocolo: 'gt06' });
    rastreadoresCriados.push(r.id);
    return r;
  }

  beforeAll(async () => {
    const ins = (n: string) => pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-vinculos-${n}-${randomUUID()}`]);
    clientA = (await ins('a')).rows[0].id;
    clientB = (await ins('b')).rows[0].id;
  });

  afterAll(async () => {
    for (const id of rastreadoresCriados) {
      await pool.query('delete from instalacoes where rastreador_id = $1', [id]);
      await pool.query('delete from rastreador_vinculos where rastreador_id = $1', [id]);
      await pool.query('delete from rastreadores where id = $1', [id]);
    }
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('findMany/findOne do outro cliente não enxergam o vínculo; o dono enxerga', async () => {
    const r = await rastreador();
    const v = await repo.vincular(clientA, r.id);

    expect(await repo.findMany(clientB, { rastreador_id: r.id })).toEqual([]);
    expect(await repo.findOne(clientB, { id: v.id })).toBeNull();
    expect(await repo.findOne(clientA, { id: v.id })).toMatchObject({ id: v.id, client_id: clientA });
  });

  it('vigenteDoCliente e doCliente só respondem ao dono', async () => {
    const r = await rastreador();
    await repo.vincular(clientA, r.id);

    expect(await repo.vigenteDoCliente(clientB, r.id)).toBeNull();
    expect(await repo.vigenteDoCliente(clientA, r.id)).toMatchObject({ rastreador_id: r.id });
    expect((await repo.doCliente(clientB)).some((x) => x.id === r.id)).toBe(false);
    expect((await repo.doCliente(clientA)).find((x) => x.id === r.id)).toMatchObject({ imei: r.imei, modelo: 'GT06', instalacao_id: null });
  });

  it('update/delete/encerrar pelo outro cliente não afetam o vínculo; o dono encerra', async () => {
    const r = await rastreador();
    const v = await repo.vincular(clientA, r.id);

    expect(await repo.update(clientB, v.id, { desvinculado_em: new Date() })).toBeNull();
    expect(await repo.delete(clientB, v.id)).toBe(false);
    expect(await repo.encerrar(clientB, v.id)).toBeNull();
    expect((await repo.findOne(clientA, { id: v.id }))?.desvinculado_em).toBeNull();

    const encerrado = await repo.encerrar(clientA, v.id);
    expect(encerrado?.desvinculado_em).not.toBeNull();
    expect((await repo.doCliente(clientA)).some((x) => x.id === r.id)).toBe(false);
  });

  it('doCliente mostra o ativo da instalação vigente do próprio cliente', async () => {
    const r = await rastreador();
    await repo.vincular(clientA, r.id);
    const asset = await assets.insert(clientA, { plate: novaPlaca() });
    const inst = await instalacoes.instalar(clientA, { rastreadorId: r.id, assetId: asset.id, instaladoEm: new Date(), tecnico: 'teste' });

    expect((await repo.doCliente(clientA)).find((x) => x.id === r.id)).toMatchObject({ instalacao_id: inst.id, asset_id: asset.id, asset_plate: asset.plate });
  });

  it('o banco barra o mesmo rastreador vinculado a dois clientes ao mesmo tempo', async () => {
    const r = await rastreador();
    await repo.vincular(clientA, r.id);
    await expect(repo.vincular(clientB, r.id)).rejects.toMatchObject({ code: '23P01' });
  });
});
