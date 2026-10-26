import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { conferir, parseModelo, parseResposta } from './checklist.controller';
import { ChecklistRepository, type ModeloRow } from './checklist.repository';

describe('checklist — modelos, respostas com não conformidades e isolamento', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new ChecklistRepository(pool);
  let clientA: string;
  let clientB: string;
  let assetA: string;
  let modelo: ModeloRow;

  const modeloBody = {
    nome: 'Checklist diário de saída',
    agenda: { type: 'diario' },
    perguntas: [
      { id: 'q1', label: 'Quilometragem', type: 'km', required: true },
      { id: 'q3', label: 'Estado dos pneus', type: 'multipla', options: ['Bom', 'Regular', 'Ruim'], required: true, flagValues: ['Ruim'] },
      { id: 'q5', label: 'Luzes ok?', type: 'sim_nao', flagValues: ['Não'] },
      { id: 'q8', label: 'Organização', type: 'nota', scaleMax: 5, flagBelow: 2 },
    ],
  };

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-chk-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-chk-b-${randomUUID()}`])).rows[0].id;
    assetA = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'CHK1A22') returning id", [clientA])).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('modelo: valida agenda e perguntas; CRUD isolado por cliente', async () => {
    expect(() => parseModelo({ nome: 'x', agenda: { type: 'anual' }, perguntas: [] })).toThrow(/agenda.type/);
    expect(() => parseModelo({ nome: 'x', agenda: { type: 'datas', dates: [] }, perguntas: [] })).toThrow(/agenda.dates/);
    expect(() => parseModelo({ ...modeloBody, perguntas: [{ id: 'a', label: 'x', type: 'multipla', options: ['só uma'] }] })).toThrow(/options/);
    expect(() => parseModelo({ ...modeloBody, perguntas: [{ id: 'a', label: 'x', type: 'texto' }, { id: 'a', label: 'y', type: 'texto' }] })).toThrow(/repetido/);
    modelo = (await repo.salvarModelo(clientA, parseModelo(modeloBody), null))!;
    expect(modelo.perguntas).toHaveLength(4);
    expect(modelo.agenda).toEqual({ type: 'diario', sundays: false });
    expect(await repo.salvarModelo(clientB, parseModelo(modeloBody), modelo.id)).toBeNull();
    expect(await repo.listarModelos(clientB)).toEqual([]);
    expect(await repo.removerModelo(clientB, modelo.id)).toBe(false);
  });

  it('resposta: obrigatória vazia recusa; opção fora da lista recusa; flags contam pela regra compartilhada', async () => {
    const r = (respostas: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
      parseResposta({ modeloId: modelo.id, assetId: assetA, iniciadoEm: '2026-10-20T06:00:00Z', finalizadoEm: '2026-10-20T06:05:00Z', respostas, ...extra });
    expect(() => conferir(modelo, r({ q3: { value: 'Bom' } }))).toThrow(/obrigatória/);
    expect(() => conferir(modelo, r({ q1: { value: 123 }, q3: { value: 'Péssimo' } }))).toThrow(/fora das opções/);
    expect(conferir(modelo, r({ q1: { value: 123 }, q3: { value: 'Bom' }, q5: { value: 'Sim' }, q8: { value: '4' } }))).toBe(0);
    const comFlags = r({ q1: { value: 123 }, q3: { value: 'Ruim' }, q5: { value: 'Não' }, q8: { value: '2' } });
    expect(conferir(modelo, comFlags)).toBe(3);
    expect(() => r({}, { finalizadoEm: '2026-10-20T05:00:00Z' })).toThrow(/anterior/);

    const salva = await repo.criarResposta(clientA, comFlags, 3);
    expect(salva).toMatchObject({ nao_conformidades: 3, asset_id: assetA });
    expect(await repo.criarResposta(clientB, comFlags, 3)).toBe('modelo_invalido');
    expect(await repo.criarResposta(clientA, r({ q1: { value: 1 }, q3: { value: 'Bom' } }, { motoristaId: randomUUID() }), 0)).toBe('motorista_invalido');
    const lista = await repo.listarRespostas(clientA, new Date('2026-10-01'), new Date('2026-10-31'), modelo.id);
    expect(lista).toHaveLength(1);
    expect(await repo.listarRespostas(clientB, new Date('2026-10-01'), new Date('2026-10-31'), null)).toEqual([]);
  });
});
