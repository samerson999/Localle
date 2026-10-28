import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GruposRepository } from '../grupos/grupos.repository';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

describe('SettingsService — herança grupo → cliente → padrão, validação, histórico, isolamento', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const service = new SettingsService(new SettingsRepository(pool), pool);
  const grupos = new GruposRepository(pool);
  const VEL = 'monitoramento.velocidade_limite_kmh';

  let clientA: string;
  let clientB: string;
  let userA: string;

  beforeEach(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-settings-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-settings-b-${randomUUID()}`])).rows[0].id;
    userA = (
      await pool.query<{ id: string }>("insert into users (client_id, email, password_hash, role) values ($1, $2, 'x', 'admin') returning id", [clientA, `u-${randomUUID()}@teste.local`])
    ).rows[0].id;
  });

  afterEach(async () => {
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('sem override, resolve cai no padrão da plataforma', async () => {
    expect(await service.resolve(clientA, VEL)).toBe(80);
  });

  it('com override, resolve retorna o valor do cliente; outro cliente não é afetado', async () => {
    await service.set(clientA, VEL, 100);
    expect(await service.resolve(clientA, VEL)).toBe(100);
    expect(await service.resolve(clientB, VEL)).toBe(80);
  });

  it('rejeita valor fora do limite, tipo errado e chave desconhecida', async () => {
    await expect(service.set(clientA, VEL, 200)).rejects.toThrow(/entre 20 e 150/);
    await expect(service.set(clientA, VEL, 'rapido')).rejects.toThrow(/número/);
    await expect(service.set(clientA, 'combustivel.ocr_ativo', 2)).rejects.toThrow(/0 ou 1/);
    await expect(service.resolve(clientA, 'nao.existe')).rejects.toThrow(/não existe/);
  });

  it('"abrir em tela cheia" (cliente só de monitoramento): desligado por padrão, liga por cliente sem afetar outro', async () => {
    const K = 'monitoramento.abrir_tela_cheia';
    expect(await service.resolve(clientA, K)).toBe(0);
    await service.set(clientA, K, 1);
    expect(await service.resolve(clientA, K)).toBe(1);
    expect(await service.resolve(clientB, K)).toBe(0);
  });

  it('opção: aceita só as listadas; resolveValor devolve a string', async () => {
    await expect(service.set(clientA, 'ranking.periodo_limite', 'ano')).rejects.toThrow(/semana, mes, trimestre/);
    await service.set(clientA, 'ranking.periodo_limite', 'semana');
    expect(await service.resolveValor(clientA, 'ranking.periodo_limite')).toBe('semana');
  });

  it('piso legal só endurece: jornada não afrouxa acima da lei, pneu não retira abaixo de 1,6 mm', async () => {
    await expect(service.set(clientA, 'jornada.direcao_continua_cargas_h', 6)).rejects.toThrow(/piso legal/);
    await service.set(clientA, 'jornada.direcao_continua_cargas_h', 4.5);
    await expect(service.set(clientA, 'pneus.sulco_retirada_mm', 1.5)).rejects.toThrow(/piso legal/);
  });

  it('regras cruzadas: alerta de sulco > retirada; RPM lenta < verde < amarela', async () => {
    await expect(service.set(clientA, 'pneus.sulco_alerta_mm', 3)).rejects.toThrow(/maior que o de retirada/);
    await service.set(clientA, 'pneus.sulco_retirada_mm', 4);
    await expect(service.set(clientA, 'pneus.sulco_alerta_mm', 4)).rejects.toThrow(/maior que o de retirada/);
    await service.set(clientA, 'pneus.sulco_alerta_mm', 6);
    await expect(service.set(clientA, 'can.rpm_verde_max', 900)).rejects.toThrow(/lenta < verde < amarela/);
    await service.set(clientA, 'can.rpm_verde_max', 1800);
  });

  it('camada grupo: override do grupo vence o do cliente só para o grupo e só em chave porGrupo', async () => {
    const g = await grupos.criar(clientA, 'Pesados');
    await service.set(clientA, VEL, 100);
    await service.set(clientA, VEL, 90, { groupId: g.id });
    expect(await service.resolve(clientA, VEL, g.id)).toBe(90);
    expect(await service.resolve(clientA, VEL)).toBe(100);
    await expect(service.set(clientA, 'monitoramento.parada_min_duracao_min', 3, { groupId: g.id })).rejects.toThrow(/não aceita valor por grupo/);
    await expect(service.set(clientB, VEL, 70, { groupId: g.id })).rejects.toMatchObject({ status: 404 }); // grupo de outro cliente
    const todos = await service.resolveAll(clientA, g.id);
    expect(todos.find((s) => s.key === VEL)).toMatchObject({ value: 90, origin: 'grupo' });
    expect(todos.find((s) => s.key === 'monitoramento.sem_sinal_h')).toMatchObject({ value: 6, origin: 'padrao' });
    expect(await service.restoreDefault(clientA, VEL, { groupId: g.id })).toMatchObject({ value: 100, origin: 'cliente' });
  });

  it('restoreDefault apaga o override e volta a herdar', async () => {
    await service.set(clientA, VEL, 100);
    expect(await service.restoreDefault(clientA, VEL)).toMatchObject({ value: 80, origin: 'padrao' });
    expect(await service.resolve(clientA, VEL)).toBe(80);
  });

  it('histórico guarda quem, de/para e motivo; resolveEm reconstrói o valor vigente numa data', async () => {
    await service.set(clientA, 'jornada.extras_max_h', 1, { userId: userA, reason: 'acordo coletivo' });
    // "meio" vem do relógio do banco (é ele que carimba o histórico), não do relógio deste processo
    const meio = (await pool.query<{ t: Date }>("select now() + interval '1 millisecond' as t")).rows[0].t;
    await new Promise((r) => setTimeout(r, 20));
    await service.set(clientA, 'jornada.extras_max_h', 2, { userId: userA });
    await service.restoreDefault(clientA, 'jornada.extras_max_h', { userId: userA });
    const h = await service.historico(clientA, 'jornada.extras_max_h');
    expect(h.map((x) => [x.old_value, x.new_value])).toEqual([[2, null], [1, 2], [null, 1]]);
    expect(h[2]).toMatchObject({ reason: 'acordo coletivo' });
    expect(h[2].changed_by_email).toContain('@teste.local');
    expect(await service.resolveEm(clientA, 'jornada.extras_max_h', meio)).toBe(1);
    expect(await service.resolveEm(clientA, 'jornada.extras_max_h', new Date('2020-01-01'))).toBe(2);
    expect(await service.historico(clientB, 'jornada.extras_max_h')).toEqual([]);
  });
});
