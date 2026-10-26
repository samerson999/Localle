import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { estadoVencimento, parseMotorista } from './motoristas.controller';
import { MotoristasRepository } from './motoristas.repository';

describe('motoristas — cadastro, CNH única por cliente, vencimentos e isolamento', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new MotoristasRepository(pool);
  let clientA: string;
  let clientB: string;

  const base = { nome: 'Anderson Silva', cnh: '04512378901', cnhCategoria: 'E', regime: 'cargas', ear: true, cnhValidade: '2027-05-01', toxicologicoValidade: '2026-11-01' };

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-mot-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-mot-b-${randomUUID()}`])).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('valida o corpo: nome obrigatório, CNH numérica, categoria e regime do catálogo', () => {
    expect(() => parseMotorista({})).toThrow(/nome/);
    expect(() => parseMotorista({ nome: 'X', cnh: 'abc' })).toThrow(/cnh/);
    expect(() => parseMotorista({ nome: 'X', cnhCategoria: 'Z' })).toThrow(/cnhCategoria/);
    expect(() => parseMotorista({ nome: 'X', regime: 'misto' })).toThrow(/regime/);
    expect(parseMotorista(base)).toMatchObject({ nome: 'Anderson Silva', cnh: '04512378901', regime: 'cargas', ear: true });
  });

  it('cria, atualiza, desativa; a mesma CNH pode ser reusada em outro cliente, não no mesmo (ativo)', async () => {
    const m = await repo.criar(clientA, parseMotorista(base));
    expect(m.id).toBeTruthy();
    await expect(repo.criar(clientA, parseMotorista(base))).rejects.toMatchObject({ code: '23505' });
    const outro = await repo.criar(clientB, parseMotorista(base)); // outro cliente: pode
    expect(outro.client_id).toBe(clientB);

    const atualizado = await repo.atualizar(clientA, m.id, parseMotorista({ ...base, telefone: '(81) 90000-0001' }));
    expect(atualizado).toMatchObject({ telefone: '(81) 90000-0001', cnh_validade: '2027-05-01' });

    await repo.setDesativado(clientA, m.id, true);
    expect((await repo.listar(clientA, false)).map((x) => x.id)).not.toContain(m.id);
    expect((await repo.listar(clientA, true)).map((x) => x.id)).toContain(m.id);
    const denovo = await repo.criar(clientA, parseMotorista(base)); // desativado libera a CNH
    expect(denovo.id).not.toBe(m.id);
  });

  it('outro cliente não lê, não altera nem desativa', async () => {
    const [m] = await repo.listar(clientA, false);
    expect(await repo.buscar(clientB, m.id)).toBeNull();
    expect(await repo.atualizar(clientB, m.id, parseMotorista({ nome: 'Hacker' }))).toBeNull();
    expect(await repo.setDesativado(clientB, m.id, true)).toBeNull();
    expect((await repo.buscar(clientA, m.id))!.nome).toBe('Anderson Silva');
  });

  it('estado de vencimento segue os dias de atenção/crítico', () => {
    const hoje = new Date('2026-10-26T12:00:00Z');
    expect(estadoVencimento(null, 30, 7, hoje)).toBe('sem_data');
    expect(estadoVencimento('2026-10-20', 30, 7, hoje)).toBe('vencido');
    expect(estadoVencimento('2026-10-30', 30, 7, hoje)).toBe('critico');
    expect(estadoVencimento('2026-11-20', 30, 7, hoje)).toBe('atencao');
    expect(estadoVencimento('2027-01-01', 30, 7, hoje)).toBe('ok');
  });

  it('assets.motorista_id aceita só motorista existente e some quando ele é apagado', async () => {
    const asset = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'MOT1A22') returning id", [clientA])).rows[0].id;
    const m = await repo.criar(clientA, parseMotorista({ nome: 'Temporário' }));
    await pool.query('update assets set motorista_id = $2 where id = $1', [asset, m.id]);
    await pool.query('delete from motoristas where id = $1', [m.id]);
    const { rows } = await pool.query('select motorista_id from assets where id = $1', [asset]);
    expect(rows[0].motorista_id).toBeNull();
  });
});
