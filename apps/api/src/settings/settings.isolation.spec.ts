import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

describe('SettingsService — herança cliente → padrão, validação, isolamento', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new SettingsRepository(pool);
  const service = new SettingsService(repo);

  let clientA: string;
  let clientB: string;

  beforeEach(async () => {
    const a = await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [
      `teste-settings-a-${randomUUID()}`,
    ]);
    const b = await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [
      `teste-settings-b-${randomUUID()}`,
    ]);
    clientA = a.rows[0].id;
    clientB = b.rows[0].id;
  });

  afterEach(async () => {
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('sem override, resolve cai no padrão da plataforma', async () => {
    const value = await service.resolve(clientA, 'monitoramento.velocidade_limite_kmh');
    expect(value).toBe(80);
  });

  it('com override, resolve retorna o valor do cliente', async () => {
    await service.set(clientA, 'monitoramento.velocidade_limite_kmh', 100);
    const value = await service.resolve(clientA, 'monitoramento.velocidade_limite_kmh');
    expect(value).toBe(100);
  });

  it('override de um cliente não afeta outro', async () => {
    await service.set(clientA, 'monitoramento.velocidade_limite_kmh', 100);
    const value = await service.resolve(clientB, 'monitoramento.velocidade_limite_kmh');
    expect(value).toBe(80);
  });

  it('rejeita valor fora do limite (min/max do registro)', async () => {
    await expect(service.set(clientA, 'monitoramento.velocidade_limite_kmh', 200)).rejects.toThrow(
      /entre 20 e 150/,
    );
    await expect(service.set(clientA, 'monitoramento.velocidade_limite_kmh', 5)).rejects.toThrow(/entre 20 e 150/);
  });

  it('rejeita chave desconhecida', async () => {
    await expect(service.resolve(clientA, 'nao.existe')).rejects.toThrow(/não existe/);
    await expect(service.set(clientA, 'nao.existe', 1)).rejects.toThrow(/não existe/);
  });

  it('restoreDefault apaga o override e volta a herdar', async () => {
    await service.set(clientA, 'monitoramento.velocidade_limite_kmh', 100);
    const restored = await service.restoreDefault(clientA, 'monitoramento.velocidade_limite_kmh');
    expect(restored).toMatchObject({ value: 80, origin: 'padrao' });

    const value = await service.resolve(clientA, 'monitoramento.velocidade_limite_kmh');
    expect(value).toBe(80);
  });

  it('resolveAll traz todos os parâmetros, com origem certa para cada um', async () => {
    await service.set(clientA, 'monitoramento.velocidade_limite_kmh', 100);
    const all = await service.resolveAll(clientA);

    const velocidade = all.find((s) => s.key === 'monitoramento.velocidade_limite_kmh');
    expect(velocidade).toMatchObject({ value: 100, origin: 'cliente' });

    const semSinal = all.find((s) => s.key === 'monitoramento.sem_sinal_h');
    expect(semSinal).toMatchObject({ value: 6, origin: 'padrao' });
  });
});
