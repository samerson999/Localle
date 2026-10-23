import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssetsRepository } from '../assets/assets.repository';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { InstalacoesRepository } from './instalacoes.repository';
import { RastreadoresRepository } from './rastreadores.repository';
import { RastreadoresService } from './rastreadores.service';
import { SimCardsRepository } from './sim-cards.repository';

/**
 * Cobre a camada de aplicação de rastreadores/SIM cards que nasceu junto com este módulo (antes só
 * existia a garantia de banco, testada em `telemetria/schema.spec.ts`). Roda contra o Postgres local de
 * verdade (infra/plataforma) — o que está sob teste inclui a exclusion constraint de `instalacoes` sendo
 * de fato respeitada sob concorrência real, não só sequencialmente.
 */
describe('RastreadoresService', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const rastreadoresRepo = new RastreadoresRepository(pool);
  const simCardsRepo = new SimCardsRepository(pool);
  const instalacoesRepo = new InstalacoesRepository(pool);
  const assetsRepo = new AssetsRepository(pool);
  const audit = new AuditLogRepository(pool);
  const service = new RastreadoresService(rastreadoresRepo, simCardsRepo, instalacoesRepo, assetsRepo, audit, pool);

  const superadminId = randomUUID();
  let clientA: string;
  let clientB: string;
  const rastreadoresCriados: string[] = [];
  const simCardsCriados: string[] = [];

  beforeAll(async () => {
    const { rows: a } = await pool.query<{ id: string }>(
      'insert into clients (name) values ($1) returning id',
      [`teste-rastreadores-a-${randomUUID()}`],
    );
    const { rows: b } = await pool.query<{ id: string }>(
      'insert into clients (name) values ($1) returning id',
      [`teste-rastreadores-b-${randomUUID()}`],
    );
    clientA = a[0].id;
    clientB = b[0].id;
  });

  // Asset novo por teste: cada instalação deixa `instalacoes` aberta (sem desinstalar) por padrão, e a
  // exclusion constraint de asset+papel bloquearia um segundo teste que reusasse o mesmo asset.
  function novaPlaca() {
    return randomUUID().replace(/-/g, '').slice(0, 7).toUpperCase();
  }
  async function novoAsset(clientId: string) {
    return (await assetsRepo.insert(clientId, { plate: novaPlaca() })).id;
  }

  afterAll(async () => {
    for (const rastreadorId of rastreadoresCriados) {
      await pool.query('delete from rastreador_comunicacao where rastreador_id = $1', [rastreadorId]);
      await pool.query('delete from instalacoes where rastreador_id = $1', [rastreadorId]);
    }
    for (const simCardId of simCardsCriados) {
      await pool.query('delete from sim_cards where id = $1', [simCardId]);
    }
    for (const rastreadorId of rastreadoresCriados) {
      await pool.query('delete from rastreadores where id = $1', [rastreadorId]);
    }
    await pool.query("delete from audit_log where actor_id = $1", [superadminId]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  function novoImei() {
    return randomUUID().replace(/-/g, '').slice(0, 15);
  }

  it('cadastra rastreador com status inicial "cadastrado"', async () => {
    const criado = await service.cadastrarRastreador(superadminId, { imei: novoImei() });
    rastreadoresCriados.push(criado.id);
    expect(criado.status).toBe('cadastrado');
  });

  it('instala rastreador num ativo do cliente, muda status para "ativo" e audita', async () => {
    const rastreador = await service.cadastrarRastreador(superadminId, { imei: novoImei() });
    rastreadoresCriados.push(rastreador.id);

    const assetId = await novoAsset(clientA);
    const instalacao = await service.instalar(superadminId, clientA, rastreador.id, {
      assetId,
      tecnico: 'teste',
    });
    expect(instalacao.client_id).toBe(clientA);
    expect(instalacao.asset_id).toBe(assetId);

    const atualizado = await rastreadoresRepo.findById(rastreador.id);
    expect(atualizado?.status).toBe('ativo');

    const { rows } = await pool.query(
      `select * from audit_log where action = 'rastreador.instalar' and target = $1`,
      [rastreador.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].client_id).toBe(clientA);
  });

  it('rejeita instalar o mesmo rastreador em outro ativo enquanto a instalação atual está vigente', async () => {
    const rastreador = await service.cadastrarRastreador(superadminId, { imei: novoImei() });
    rastreadoresCriados.push(rastreador.id);
    const assetId1 = await novoAsset(clientA);
    const assetId2 = await novoAsset(clientB);
    await service.instalar(superadminId, clientA, rastreador.id, { assetId: assetId1, tecnico: 'teste' });

    await expect(
      service.instalar(superadminId, clientB, rastreador.id, { assetId: assetId2, tecnico: 'teste' }),
    ).rejects.toThrow(/já tem uma instalação vigente/i);
  });

  it('sob concorrência real, só uma de duas instalações simultâneas do mesmo rastreador vence', async () => {
    const rastreador = await service.cadastrarRastreador(superadminId, { imei: novoImei() });
    rastreadoresCriados.push(rastreador.id);
    const assetId1 = await novoAsset(clientA);
    const assetId2 = await novoAsset(clientB);

    const resultados = await Promise.allSettled([
      service.instalar(superadminId, clientA, rastreador.id, { assetId: assetId1, tecnico: 'teste-concorrencia-1' }),
      service.instalar(superadminId, clientB, rastreador.id, { assetId: assetId2, tecnico: 'teste-concorrencia-2' }),
    ]);

    const sucesso = resultados.filter((r) => r.status === 'fulfilled');
    const falha = resultados.filter((r) => r.status === 'rejected');
    expect(sucesso).toHaveLength(1);
    expect(falha).toHaveLength(1);
  });

  it('desinstala e devolve o rastreador para status "cadastrado"', async () => {
    const rastreador = await service.cadastrarRastreador(superadminId, { imei: novoImei() });
    rastreadoresCriados.push(rastreador.id);
    const assetId = await novoAsset(clientA);
    const instalacao = await service.instalar(superadminId, clientA, rastreador.id, {
      assetId,
      tecnico: 'teste',
    });

    const desinstalada = await service.desinstalar(superadminId, instalacao.id);
    expect(desinstalada.desinstalado_em).not.toBeNull();

    const atualizado = await rastreadoresRepo.findById(rastreador.id);
    expect(atualizado?.status).toBe('cadastrado');

    const historico = await service.historicoInstalacoes(rastreador.id);
    expect(historico).toHaveLength(1);
  });

  it('cadastra chip, vincula a um rastreador e marca ativo', async () => {
    const rastreador = await service.cadastrarRastreador(superadminId, { imei: novoImei() });
    rastreadoresCriados.push(rastreador.id);
    const chip = await service.cadastrarSimCard(superadminId, { iccid: randomUUID() });
    simCardsCriados.push(chip.id);

    const vinculado = await service.vincularSimCard(superadminId, chip.id, rastreador.id);
    expect(vinculado.rastreador_id).toBe(rastreador.id);
    expect(vinculado.status).toBe('ativo');
  });

  it('rejeita vincular um segundo chip ao mesmo rastreador', async () => {
    const rastreador = await service.cadastrarRastreador(superadminId, { imei: novoImei() });
    rastreadoresCriados.push(rastreador.id);
    const chip1 = await service.cadastrarSimCard(superadminId, { iccid: randomUUID() });
    const chip2 = await service.cadastrarSimCard(superadminId, { iccid: randomUUID() });
    simCardsCriados.push(chip1.id, chip2.id);

    await service.vincularSimCard(superadminId, chip1.id, rastreador.id);
    await expect(service.vincularSimCard(superadminId, chip2.id, rastreador.id)).rejects.toThrow(
      /já tem um chip vinculado/i,
    );
  });

  it('desvincula chip e marca inativo', async () => {
    const rastreador = await service.cadastrarRastreador(superadminId, { imei: novoImei() });
    rastreadoresCriados.push(rastreador.id);
    const chip = await service.cadastrarSimCard(superadminId, { iccid: randomUUID() });
    simCardsCriados.push(chip.id);
    await service.vincularSimCard(superadminId, chip.id, rastreador.id);

    const desvinculado = await service.desvincularSimCard(superadminId, chip.id);
    expect(desvinculado.rastreador_id).toBeNull();
    expect(desvinculado.status).toBe('inativo');
  });
});
