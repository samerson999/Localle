import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SettingsRepository } from '../settings/settings.repository';
import { SettingsService } from '../settings/settings.service';
import { parseMovimento, parsePneu } from './pneus.controller';
import { PneusRepository } from './pneus.repository';
import { nivelSulco, PneusService } from './pneus.service';

describe('pneus — cadastro, máquina de estados das movimentações, nível de sulco e isolamento', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new PneusRepository(pool);
  const settings = new SettingsService(new SettingsRepository(pool), pool);
  const service = new PneusService(repo, settings);
  let clientA: string;
  let clientB: string;
  let assetA: string;
  let assetB: string;
  let pneu: string;

  const mov = (tipo: string, extra: Record<string, unknown> = {}) => parseMovimento({ tipo, ...extra });

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-pneu-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-pneu-b-${randomUUID()}`])).rows[0].id;
    assetA = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'PNU1A22') returning id", [clientA])).rows[0].id;
    assetB = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'PNU1B22') returning id", [clientB])).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('cadastro = compra: estoque, vida 1, movimento registrado; fogo único por cliente', async () => {
    const p = await repo.criar(clientA, parsePneu({ numeroFogo: 'F-001', marca: 'Michelin', medida: '295/80R22.5', sulcoInicialMm: 16, custo: 2200 }), new Date(), null);
    pneu = p.id;
    expect(p).toMatchObject({ status: 'estoque', vida_atual: 1, sulco_atual_mm: '16.0', custo_total: '2200.00' });
    expect((await repo.movimentos(clientA, pneu)).map((m) => m.tipo)).toEqual(['compra']);
    await expect(repo.criar(clientA, parsePneu({ numeroFogo: 'F-001', sulcoInicialMm: 16 }), new Date(), null)).rejects.toMatchObject({ code: '23505' });
    expect(await repo.buscar(clientB, pneu)).toBeNull();
    expect(await repo.movimentos(clientB, pneu)).toEqual([]);
  });

  it('montagem → rodízio → retirada acumulam km; posição ocupada e ativo alheio são recusados', async () => {
    await expect(service.movimentar(clientA, pneu, mov('montagem', { assetId: assetB, posicao: '1E', kmVeiculo: 1000 }), null)).rejects.toMatchObject({ status: 400 });
    await expect(service.movimentar(clientB, pneu, mov('montagem', { assetId: assetB, posicao: '1E', kmVeiculo: 1000 }), null)).rejects.toMatchObject({ status: 404 });
    let r = await service.movimentar(clientA, pneu, mov('montagem', { assetId: assetA, posicao: '1E', kmVeiculo: 1000 }), null);
    expect(r.pneu).toMatchObject({ status: 'montado', asset_id: assetA, posicao: '1E', km_montagem: '1000.0' });

    const outro = await repo.criar(clientA, parsePneu({ numeroFogo: 'F-002', sulcoInicialMm: 16 }), new Date(), null);
    await expect(service.movimentar(clientA, outro.id, mov('montagem', { assetId: assetA, posicao: '1E', kmVeiculo: 1000 }), null)).rejects.toMatchObject({ status: 409 });
    await expect(service.movimentar(clientA, outro.id, mov('rodizio', { posicao: '1D', kmVeiculo: 1000 }), null)).rejects.toMatchObject({ status: 409 });

    r = await service.movimentar(clientA, pneu, mov('rodizio', { posicao: '2E', kmVeiculo: 6000 }), null);
    expect(r.pneu).toMatchObject({ posicao: '2E', km_acumulado: '5000.0', km_montagem: '6000.0' });
    expect(r.movimento.asset_id).toBe(assetA);
    r = await service.movimentar(clientA, pneu, mov('retirada', { kmVeiculo: 9000 }), null);
    expect(r.pneu).toMatchObject({ status: 'estoque', asset_id: null, posicao: null, km_acumulado: '8000.0' });
    expect(r.movimento).toMatchObject({ asset_id: assetA, posicao: '2E' });
  });

  it('medição e nível de sulco pelo Setup; recapagem soma vida e custo padrão; descarte final', async () => {
    expect(nivelSulco(1.6, 5, 3)).toBe('ilegal');
    expect(nivelSulco(3, 5, 3)).toBe('retirar');
    expect(nivelSulco(4.5, 5, 3)).toBe('atencao');
    expect(nivelSulco(8, 5, 3)).toBe('ok');
    await expect(service.movimentar(clientA, pneu, mov('medicao', { sulcoMm: 17 }), null)).rejects.toMatchObject({ status: 409 });
    await service.movimentar(clientA, pneu, mov('medicao', { sulcoMm: 2.8 }), null);
    let [p] = (await service.listarComNivel(clientA, null, null)).filter((x) => x.id === pneu);
    expect(p.nivel).toBe('retirar');
    await settings.set(clientA, 'pneus.sulco_retirada_mm', 2);
    [p] = (await service.listarComNivel(clientA, null, null)).filter((x) => x.id === pneu);
    expect(p.nivel).toBe('atencao');

    await expect(service.movimentar(clientA, pneu, mov('recapagem', { sulcoMm: 14 }), null)).rejects.toMatchObject({ status: 409 }); // não está na recapadora
    await service.movimentar(clientA, pneu, mov('envio_recapagem'), null);
    const r = await service.movimentar(clientA, pneu, mov('recapagem', { sulcoMm: 14 }), null);
    expect(r.pneu).toMatchObject({ status: 'estoque', vida_atual: 2, sulco_inicial_mm: '14.0', sulco_atual_mm: '14.0', custo_total: '2850.00' }); // 2200 + 650 padrão
    expect(r.movimento.custo).toBe('650.00');

    await service.movimentar(clientA, pneu, mov('descarte', { obs: 'carcaça condenada' }), null);
    await expect(service.movimentar(clientA, pneu, mov('medicao', { sulcoMm: 1 }), null)).rejects.toMatchObject({ status: 409 });
    expect((await repo.movimentos(clientA, pneu)).map((m) => m.tipo)).toEqual(['descarte', 'recapagem', 'envio_recapagem', 'medicao', 'retirada', 'rodizio', 'montagem', 'compra']);
  });

  it('rodízio com troca: os dois pneus trocam de posição, cada um acumula o próprio km; sem "troca" continua recusado', async () => {
    const a = await repo.criar(clientA, parsePneu({ numeroFogo: 'T-A', sulcoInicialMm: 16 }), new Date(), null);
    const b = await repo.criar(clientA, parsePneu({ numeroFogo: 'T-B', sulcoInicialMm: 16 }), new Date(), null);
    await service.movimentar(clientA, a.id, mov('montagem', { assetId: assetA, posicao: '3E', kmVeiculo: 10_000 }), null);
    await service.movimentar(clientA, b.id, mov('montagem', { assetId: assetA, posicao: '3D', kmVeiculo: 12_000 }), null);

    await expect(service.movimentar(clientA, a.id, mov('rodizio', { posicao: '3D', kmVeiculo: 20_000 }), null)).rejects.toMatchObject({ status: 409 });
    const r = await service.movimentar(clientA, a.id, mov('rodizio', { posicao: '3D', kmVeiculo: 20_000, troca: true }), null);
    expect(r.pneu).toMatchObject({ posicao: '3D', km_acumulado: '10000.0', km_montagem: '20000.0' });
    expect(await repo.buscar(clientA, b.id)).toMatchObject({ status: 'montado', asset_id: assetA, posicao: '3E', km_acumulado: '8000.0', km_montagem: '20000.0' });
    expect((await repo.movimentos(clientA, b.id))[0]).toMatchObject({ tipo: 'rodizio', asset_id: assetA, posicao: '3E' });
  });

  it('detalhes da movimentação (fornecedor, banda, origem da medição) e histórico do cliente inteiro, sem vazar para outro', async () => {
    const p = await repo.criar(clientA, parsePneu({ numeroFogo: 'D-001', sulcoInicialMm: 16, custo: 1800 }), new Date(), null, { fornecedor: 'Pneus Sul' });
    await service.movimentar(clientA, p.id, mov('medicao', { sulcoMm: 12, dados: { fonte: 'profundimetro' } }), null);
    await expect(Promise.resolve().then(() => mov('medicao', { sulcoMm: 12, dados: { fonte: true } }))).rejects.toThrow(/dados.fonte/);

    const todos = await repo.todosMovimentos(clientA);
    const deste = todos.filter((m) => m.pneu_id === p.id);
    expect(deste.map((m) => [m.tipo, m.dados])).toEqual([['compra', { fornecedor: 'Pneus Sul' }], ['medicao', { fonte: 'profundimetro' }]]);
    expect(todos.every((m) => m.client_id === clientA)).toBe(true);
    expect((await repo.todosMovimentos(clientB)).some((m) => m.pneu_id === p.id)).toBe(false);
  });
});
