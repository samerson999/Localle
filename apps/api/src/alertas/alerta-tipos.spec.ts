import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { alertaDoAlarme } from './alarmes-aparelho';
import { AlertaTiposService, parseAlertaTipo } from './alerta-tipos.controller';
import { AlertaTiposRepository } from './alerta-tipos.repository';
import { inserirAlerta } from './alertas.repository';

/**
 * Catálogo de tipos de alerta (global, só superadmin) contra o Postgres real: o que a ingestão lê dele e de onde sai o
 * `exige_tratamento` gravado no alerta. O catálogo é compartilhado com o resto do banco: o teste só cria tipos com
 * chave própria e apaga no fim; nunca altera os tipos do seed.
 */
describe('alerta_tipos — catálogo da plataforma e exige_tratamento', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const service = new AlertaTiposService(new AlertaTiposRepository(pool), new AuditLogRepository(pool));
  const chave = `teste${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const superadmin = randomUUID();
  let clientId: string;

  beforeAll(async () => {
    clientId = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-alerta-tipos-${randomUUID()}`])).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('delete from alerta_tipos where chave = $1', [chave]);
    await pool.query("delete from audit_log where target = $1 and action like 'alerta_tipo.%'", [chave]);
    await pool.query('delete from clients where id = $1', [clientId]);
    await pool.end();
  });

  const novo = async (tipo: string, prioridade: 'alta' | 'media' | 'baixa', exigeTratamento?: boolean) =>
    (await inserirAlerta(pool, { clientId, assetId: null, eventoId: null, origem: 'aparelho', tipo, titulo: 't', detalhe: null, prioridade, ts: new Date(), exigeTratamento }))!;

  it('valida a entrada: chave reservada, prioridade e exigeTratamento fora do formato', async () => {
    await expect(service.criar(superadmin, { chave: 'regra', nome: 'x', prioridade: 'alta' })).rejects.toMatchObject({ status: 400 });
    await expect(service.criar(superadmin, { chave: 'cerca_entrada', nome: 'x', prioridade: 'alta' })).rejects.toMatchObject({ status: 400 });
    expect(() => parseAlertaTipo({ nome: 'x', prioridade: 'urgente' }, false)).toThrow(/prioridade/);
    expect(() => parseAlertaTipo({ exigeTratamento: 'sim' }, true)).toThrow(/exigeTratamento/);
    expect(parseAlertaTipo({ nome: ' Ré ', prioridade: 'baixa', exigeTratamento: null }, false)).toEqual({
      nome: 'Ré', prioridade: 'baixa', exigeTratamento: null, geraAlerta: true, notificaPush: true, repetirMin: 15, duracaoMin: 0, encerraSozinho: false,
    });
    expect(() => parseAlertaTipo({ duracaoMin: 2000 }, true)).toThrow(/duracaoMin/);
  });

  it('cria, a ingestão passa a ler, e o alerta grava exige_tratamento do catálogo (null = pela prioridade)', async () => {
    expect(await alertaDoAlarme(pool, chave)).toBeNull();
    await service.criar(superadmin, { chave, nome: 'Ré engatada', prioridade: 'media', exigeTratamento: null });
    await expect(service.criar(superadmin, { chave, nome: 'outro', prioridade: 'media' })).rejects.toMatchObject({ status: 409 });
    expect(await alertaDoAlarme(pool, chave)).toEqual({ titulo: 'Ré engatada', prioridade: 'media' });
    expect((await novo(chave, 'media')).exigeTratamento).toBe(false);
    expect((await novo(chave, 'alta')).exigeTratamento).toBe(true);

    await service.atualizar(superadmin, chave, { exigeTratamento: true });
    expect(await alertaDoAlarme(pool, chave)).toEqual({ titulo: 'Ré engatada', prioridade: 'media', exigeTratamento: true });
    expect((await novo(chave, 'media')).exigeTratamento).toBe(true);
    // quem cria decide (regra do cliente): vale sobre o catálogo
    expect((await novo(chave, 'media', false)).exigeTratamento).toBe(false);

    const { rows } = await pool.query("select action from audit_log where target = $1 and action like 'alerta_tipo.%' order by created_at", [chave]);
    expect(rows.map((r) => r.action)).toEqual(['alerta_tipo.criar', 'alerta_tipo.atualizar']);
  });

  it('fora do catálogo vale a prioridade; "gera alerta" desligado deixa o alarme só como evento', async () => {
    expect((await novo(`semcatalogo${chave}`, 'alta')).exigeTratamento).toBe(true);
    expect((await novo(`semcatalogo${chave}`, 'media')).exigeTratamento).toBe(false);
    await service.atualizar(superadmin, chave, { geraAlerta: false });
    expect(await alertaDoAlarme(pool, chave)).toBeNull();
    expect(await alertaDoAlarme(pool, 'hardBraking')).toBeNull();
  });

  it('tipo de sistema: não se exclui e mantém nome/prioridade calculados pela rotina', async () => {
    await expect(service.excluir(superadmin, 'sem_posicao')).rejects.toMatchObject({ status: 409 });
    expect(await alertaDoAlarme(pool, 'sem_posicao')).toBeNull();
    await service.excluir(superadmin, chave);
    await expect(service.excluir(superadmin, chave)).rejects.toMatchObject({ status: 404 });
  });
});
