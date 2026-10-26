import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssetsRepository } from '../assets/assets.repository';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { TraccarClient, type TraccarConfig, type TraccarDevice } from '../ingest/traccar-client';
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
/** Só a fronteira HTTP com o Traccar é falsa; banco, transação e auditoria são reais. */
class FakeTraccar extends TraccarClient {
  cfg: TraccarConfig | null = null;
  falhar = false;
  devices = new Map<string, TraccarDevice>();
  private nextId = 900_000_000 + Math.floor(Math.random() * 1_000_000);

  config() {
    return this.cfg;
  }
  async findDeviceByUniqueId(_: TraccarConfig, uniqueId: string) {
    if (this.falhar) throw new Error('Traccar fora do ar');
    return this.devices.get(uniqueId) ?? null;
  }
  async createDevice(_: TraccarConfig, device: { name: string; uniqueId: string }) {
    const criado = { id: this.nextId++, ...device };
    this.devices.set(device.uniqueId, criado);
    return criado;
  }
}

describe('RastreadoresService', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const rastreadoresRepo = new RastreadoresRepository(pool);
  const simCardsRepo = new SimCardsRepository(pool);
  const instalacoesRepo = new InstalacoesRepository(pool);
  const assetsRepo = new AssetsRepository(pool);
  const audit = new AuditLogRepository(pool);
  const traccar = new FakeTraccar();
  const service = new RastreadoresService(rastreadoresRepo, simCardsRepo, instalacoesRepo, assetsRepo, audit, pool, traccar);

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

  describe('provisionamento no Traccar (cadastro-primeiro)', () => {
    const cfg = { url: 'http://traccar.teste', user: 'u', password: 'p' };

    it('sem Traccar configurado, cadastra sem traccar_device_id', async () => {
      traccar.cfg = null;
      const criado = await service.cadastrarRastreador(superadminId, { imei: novoImei() });
      rastreadoresCriados.push(criado.id);
      expect(criado.traccar_device_id).toBeNull();
    });

    it('cria o device no Traccar e grava o id; um device já existente com o mesmo IMEI é reaproveitado', async () => {
      traccar.cfg = cfg;
      const imei = novoImei();
      const criado = await service.cadastrarRastreador(superadminId, { imei });
      rastreadoresCriados.push(criado.id);
      expect(criado.traccar_device_id).toBe(String(traccar.devices.get(imei)!.id));

      const imeiExistente = novoImei();
      traccar.devices.set(imeiExistente, { id: 123_456_789 + Math.floor(Math.random() * 1000), uniqueId: imeiExistente, name: 'x' });
      const reaproveitado = await service.cadastrarRastreador(superadminId, { imei: imeiExistente });
      rastreadoresCriados.push(reaproveitado.id);
      expect(reaproveitado.traccar_device_id).toBe(String(traccar.devices.get(imeiExistente)!.id));
      traccar.cfg = null;
    });

    it('Traccar fora do ar desfaz o cadastro inteiro (nenhuma linha, nenhuma auditoria)', async () => {
      traccar.cfg = cfg;
      traccar.falhar = true;
      const imei = novoImei();
      try {
        await expect(service.cadastrarRastreador(superadminId, { imei })).rejects.toThrow(/Traccar/);
      } finally {
        traccar.cfg = null;
        traccar.falhar = false;
      }
      const { rowCount } = await pool.query('select 1 from rastreadores where imei = $1', [imei]);
      expect(rowCount).toBe(0);
    });
  });

  it('atualiza modelo/protocolo e audita o antes e o depois', async () => {
    const rastreador = await service.cadastrarRastreador(superadminId, { imei: novoImei(), modelo: 'GT06' });
    rastreadoresCriados.push(rastreador.id);
    const atualizado = await service.atualizar(superadminId, rastreador.id, { protocolo: 'gt06' });
    expect(atualizado).toMatchObject({ modelo: 'GT06', protocolo: 'gt06' });

    const { rows } = await pool.query(
      "select before, after from audit_log where action = 'rastreador.atualizar' and target = $1",
      [rastreador.id],
    );
    expect(rows[0]).toEqual({ before: { modelo: 'GT06', protocolo: null }, after: { modelo: 'GT06', protocolo: 'gt06' } });
  });

  it('não desativa rastreador com instalação vigente; desinstalado, desativa e libera o IMEI para recadastro', async () => {
    const imei = novoImei();
    const rastreador = await service.cadastrarRastreador(superadminId, { imei });
    rastreadoresCriados.push(rastreador.id);
    const instalacao = await service.instalar(superadminId, clientA, rastreador.id, {
      assetId: await novoAsset(clientA),
      tecnico: 'teste',
    });

    await expect(service.desativar(superadminId, rastreador.id)).rejects.toThrow(/instalação vigente/);

    await service.desinstalar(superadminId, instalacao.id);
    const desativado = await service.desativar(superadminId, rastreador.id);
    expect(desativado.status).toBe('desativado');

    const recadastrado = await service.cadastrarRastreador(superadminId, { imei });
    rastreadoresCriados.push(recadastrado.id);
    expect(recadastrado.id).not.toBe(rastreador.id);
  });

  it('findAllPainel traz instalação vigente, chip e cliente; sem instalação vigente, campos nulos', async () => {
    const instalado = await service.cadastrarRastreador(superadminId, { imei: novoImei() });
    const livre = await service.cadastrarRastreador(superadminId, { imei: novoImei() });
    rastreadoresCriados.push(instalado.id, livre.id);
    const assetId = await novoAsset(clientA);
    const instalacao = await service.instalar(superadminId, clientA, instalado.id, { assetId, tecnico: 'teste' });
    const chip = await simCardsRepo.create({ iccid: `8955${randomUUID().replace(/-/g, '').slice(0, 15)}`, operadora: 'Vivo' });
    simCardsCriados.push(chip.id);
    await simCardsRepo.vincular(chip.id, instalado.id);

    const painel = await rastreadoresRepo.findAllPainel();
    const a = painel.find((r) => r.id === instalado.id);
    const b = painel.find((r) => r.id === livre.id);
    expect(a).toMatchObject({ instalacao_id: instalacao.id, client_id: clientA, asset_id: assetId, sim_card_id: chip.id, operadora: 'Vivo' });
    expect(a?.client_name).toMatch(/^teste-rastreadores-a-/);
    expect(b).toMatchObject({ instalacao_id: null, client_id: null, sim_card_id: null });

    // desinstalado: sai do cliente, continua no inventário (uma linha só, sem duplicar pelo histórico)
    await service.desinstalar(superadminId, instalacao.id);
    const depois = (await rastreadoresRepo.findAllPainel()).filter((r) => r.id === instalado.id);
    expect(depois).toHaveLength(1);
    expect(depois[0].client_id).toBeNull();
  });
});
