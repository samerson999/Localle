import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssetsRepository } from '../assets/assets.repository';
import { CatalogoAtivosRepository, type Marca, type Modelo, type Tipo } from './catalogo-ativos.repository';

/** Contra o Postgres real: a chave gerada (mesmo nome com outra grafia) e as FKs compostas são garantias do banco. */
describe('catálogo de ativos (marcas, modelos, tipos)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new CatalogoAtivosRepository(pool);
  const assets = new AssetsRepository(pool);
  let clientA: string;
  let clientB: string;

  beforeAll(async () => {
    const novo = async (n: string) => (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-catalogo-${n}-${randomUUID()}`])).rows[0].id;
    clientA = await novo('a');
    clientB = await novo('b');
  });

  afterAll(async () => {
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('a chave ignora acento, pontuação, espaço e maiúsculas', async () => {
    const { rows } = await pool.query<{ a: string; b: string; c: string }>(
      "select fn_chave_catalogo('13.190') a, fn_chave_catalogo(' 13190 ') b, fn_chave_catalogo('Pá-Carregadeira São') c",
    );
    expect(rows[0]).toEqual({ a: '13190', b: '13190', c: 'pacarregadeirasao' });
  });

  // caso do áudio do teste da FD Locação: "13190" e "13.190" viraram modelos diferentes
  it('marca e modelo com outra grafia não duplicam: devolve o que já existe', async () => {
    const vw = (await repo.criarMarca(clientA, 'Volkswagen')) as Marca;
    expect(await repo.criarMarca(clientA, 'VOLKSWAGEN ')).toEqual({ repetido: { id: vw.id, nome: 'Volkswagen' } });

    const m = (await repo.criarModelo(clientA, vw.id, '13.190')) as Modelo;
    expect(m).toMatchObject({ marcaId: vw.id, nome: '13.190' });
    expect(await repo.criarModelo(clientA, vw.id, '13190')).toEqual({ repetido: { id: m.id, nome: '13.190' } });
    // nome mais longo é outro modelo (a tela é que avisa "parecido")
    expect(await repo.criarModelo(clientA, vw.id, '13.190 CR 4x2')).toMatchObject({ nome: '13.190 CR 4x2' });

    // mesmo nome em outra marca é outro modelo
    const mb = (await repo.criarMarca(clientA, 'Mercedes-Benz')) as Marca;
    expect(await repo.criarModelo(clientA, mb.id, '13.190')).toMatchObject({ marcaId: mb.id });

    // renomear para a grafia de outro modelo da mesma marca também é repetido
    const outro = (await repo.criarModelo(clientA, vw.id, 'Delivery 9.170')) as Modelo;
    expect(await repo.renomearModelo(clientA, outro.id, '13 190')).toEqual({ repetido: { id: m.id, nome: '13.190' } });
  });

  it('isolamento: outro cliente não vê, não renomeia e não usa marca/modelo alheio; o dono continua usando', async () => {
    const marca = (await repo.criarMarca(clientA, 'Caterpillar')) as Marca;
    const modelo = (await repo.criarModelo(clientA, marca.id, '416F')) as Modelo;

    const deB = await repo.listar(clientB);
    expect(deB.marcas.find((x) => x.id === marca.id)).toBeUndefined();
    expect(deB.modelos.find((x) => x.id === modelo.id)).toBeUndefined();
    // B pode ter a mesma marca: a lista é por cliente
    expect(await repo.criarMarca(clientB, 'Caterpillar')).toMatchObject({ nome: 'Caterpillar' });

    expect(await repo.renomearMarca(clientB, marca.id, 'Invadida')).toBeNull();
    expect(await repo.renomearModelo(clientB, modelo.id, 'Invadido')).toBeNull();
    // FK composta: modelo pendurado na marca de outro cliente é recusado
    expect(await repo.criarModelo(clientB, marca.id, '420F')).toBe('marca_invalida');

    // ativo de B não aponta para modelo de A; ativo de A aponta e o modelo some com set null ao apagar a marca
    const ativoB = await assets.insert(clientB, { plate: 'BBB1B11' });
    expect(await assets.atualizar(clientB, ativoB.id, { status: null, modeloId: modelo.id })).toBe('modelo_invalido');
    const ativoA = await assets.insert(clientA, { plate: null, identificador: 'RETRO-01' });
    expect(await assets.atualizar(clientA, ativoA.id, { status: null, modeloId: modelo.id })).toMatchObject({ modelo_id: modelo.id });

    expect(await repo.renomearMarca(clientA, marca.id, 'CAT')).toEqual({ id: marca.id, nome: 'CAT' });
    const deA = await repo.listar(clientA);
    expect(deA.marcas.find((x) => x.id === marca.id)?.nome).toBe('CAT');
    expect(deA.modelos.find((x) => x.id === modelo.id)?.nome).toBe('416F');

    await pool.query('delete from ativo_marcas where id = $1', [marca.id]);
    expect((await assets.findOne(clientA, { id: ativoA.id }))?.modelo_id).toBeNull();
  });

  it('tipos: do cliente ou renomeando um pronto (um por pronto); nome repetido devolve o existente; isolado por cliente', async () => {
    const trator = (await repo.criarTipo(clientA, { nome: 'Trator de esteira', base: 'linha_amarela', padrao: null, icone: '39-escavadeira' })) as Tipo;
    expect(trator).toMatchObject({ base: 'linha_amarela', padrao: null, icone: '39-escavadeira' });
    expect(await repo.criarTipo(clientA, { nome: 'trator de ESTEIRA', base: 'linha_amarela', padrao: null, icone: null })).toEqual({ repetido: { id: trator.id, nome: 'Trator de esteira' } });

    const compactador = (await repo.criarTipo(clientA, { nome: 'Compactador', base: 'veiculo', padrao: 'caminhao', icone: '18-coletor' })) as Tipo;
    expect(compactador.padrao).toBe('caminhao');
    expect(await repo.criarTipo(clientA, { nome: 'Caminhão toco', base: 'veiculo', padrao: 'caminhao', icone: null })).toBe('padrao_repetido');

    // atualizar troca nome, base e ícone, mas não o tipo pronto que a linha renomeia
    expect(await repo.atualizarTipo(clientA, compactador.id, { nome: 'Caminhão compactador', base: 'veiculo', padrao: null, icone: null })).toMatchObject({ nome: 'Caminhão compactador', padrao: 'caminhao', icone: null });

    expect((await repo.listar(clientB)).tipos.find((t) => t.id === trator.id)).toBeUndefined();
    expect(await repo.atualizarTipo(clientB, trator.id, { nome: 'Invadido', base: 'veiculo', padrao: null, icone: null })).toBeNull();
    expect((await repo.listar(clientA)).tipos.find((t) => t.id === trator.id)?.nome).toBe('Trator de esteira');
  });
});
