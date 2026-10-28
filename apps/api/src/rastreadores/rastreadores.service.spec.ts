import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssetsRepository } from '../assets/assets.repository';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { TraccarClient, type TraccarConfig, type TraccarDevice } from '../ingest/traccar-client';
import { InstalacoesRepository } from './instalacoes.repository';
import { RastreadoresRepository } from './rastreadores.repository';
import { RastreadorVinculosRepository } from './rastreador-vinculos.repository';
import { RastreadoresService } from './rastreadores.service';
import { RastreadorModelosRepository } from './rastreador-modelos.repository';
import { RastreadorModelosService } from './rastreador-modelos.service';
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
  /** uniqueId que já existe no Traccar, mas invisível ao usuário da API (criado por outra conta) */
  duplicados = new Set<string>();
  async createDevice(_: TraccarConfig, device: { name: string; uniqueId: string }) {
    if (this.duplicados.has(device.uniqueId)) throw new Error('Traccar POST /api/devices falhou: 400 Bad Request — Duplicate entry for key uniqueid');
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
  const vinculosRepo = new RastreadorVinculosRepository(pool);
  const modelosRepo = new RastreadorModelosRepository(pool);
  const modelos = new RastreadorModelosService(modelosRepo, audit);
  const service = new RastreadoresService(rastreadoresRepo, simCardsRepo, instalacoesRepo, vinculosRepo, assetsRepo, audit, pool, traccar, modelosRepo);
  // modelo de teste com identificador livre: os testes antigos usam IMEI aleatório em hexadecimal
  const sufixo = randomUUID().slice(0, 8);
  let modeloTeste: string;
  const modelosCriados: string[] = [];

  const superadminId = randomUUID();
  const sa = { type: 'superadmin' as const, id: superadminId };
  const usuarioCliente = { type: 'user' as const, id: randomUUID() };
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
    modeloTeste = (await modelosRepo.criar({ fabricante: `Teste ${sufixo}`, nome: 'Livre', protocolo: 'gt06', porta: 5023, tipo_identificador: 'outro' })).id;
    modelosCriados.push(modeloTeste);
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
      await pool.query('delete from rastreador_vinculos where rastreador_id = $1', [rastreadorId]);
    }
    for (const simCardId of simCardsCriados) {
      await pool.query('delete from sim_cards where id = $1', [simCardId]);
    }
    for (const rastreadorId of rastreadoresCriados) {
      await pool.query('delete from rastreadores where id = $1', [rastreadorId]);
    }
    for (const id of modelosCriados) await pool.query('delete from rastreador_modelos where id = $1', [id]);
    await pool.query('delete from audit_log where actor_id in ($1, $2)', [superadminId, usuarioCliente.id]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  function novoImei() {
    return randomUUID().replace(/-/g, '').slice(0, 15);
  }

  /** Rastreador cadastrado e já vinculado ao cliente (pré-requisito de instalar). */
  async function vinculadoA(clientId: string) {
    const rastreador = await service.cadastrarRastreador(superadminId, { modeloId: modeloTeste, imei: novoImei() });
    rastreadoresCriados.push(rastreador.id);
    await service.vincular(superadminId, clientId, rastreador.id);
    return rastreador;
  }

  it('cadastra rastreador com status inicial "cadastrado"', async () => {
    const criado = await service.cadastrarRastreador(superadminId, { modeloId: modeloTeste, imei: novoImei() });
    rastreadoresCriados.push(criado.id);
    expect(criado.status).toBe('cadastrado');
  });

  it('vincula rastreador a um cliente e audita; não vincula de novo nem a outro cliente sem desvincular', async () => {
    const rastreador = await service.cadastrarRastreador(superadminId, { modeloId: modeloTeste, imei: novoImei() });
    rastreadoresCriados.push(rastreador.id);

    const vinculo = await service.vincular(superadminId, clientA, rastreador.id);
    expect(vinculo).toMatchObject({ client_id: clientA, rastreador_id: rastreador.id, desvinculado_em: null });
    const { rows } = await pool.query("select client_id from audit_log where action = 'rastreador.vincular' and target = $1", [rastreador.id]);
    expect(rows).toEqual([{ client_id: clientA }]);

    await expect(service.vincular(superadminId, clientA, rastreador.id)).rejects.toThrow(/já está vinculado a este cliente/);
    await expect(service.vincular(superadminId, clientB, rastreador.id)).rejects.toThrow(/vinculado a outro cliente/);
  });

  it('vincular a cliente inexistente responde 404, sem deixar vínculo', async () => {
    const rastreador = await service.cadastrarRastreador(superadminId, { modeloId: modeloTeste, imei: novoImei() });
    rastreadoresCriados.push(rastreador.id);
    await expect(service.vincular(superadminId, randomUUID(), rastreador.id)).rejects.toThrow(/Cliente não encontrado/);
    expect(await vinculosRepo.vigentePorRastreador(rastreador.id)).toBeNull();
  });

  it('sob concorrência real, só um de dois vínculos simultâneos do mesmo rastreador vence', async () => {
    const rastreador = await service.cadastrarRastreador(superadminId, { modeloId: modeloTeste, imei: novoImei() });
    rastreadoresCriados.push(rastreador.id);
    const resultados = await Promise.allSettled([
      service.vincular(superadminId, clientA, rastreador.id),
      service.vincular(superadminId, clientB, rastreador.id),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('cliente instala rastreador vinculado a ele num ativo dele: status "ativo" e auditoria com o usuário', async () => {
    const rastreador = await vinculadoA(clientA);
    const assetId = await novoAsset(clientA);
    const instalacao = await service.instalar(usuarioCliente, clientA, rastreador.id, { assetId, tecnico: 'teste' });
    expect(instalacao).toMatchObject({ client_id: clientA, asset_id: assetId });

    const atualizado = await rastreadoresRepo.findById(rastreador.id);
    expect(atualizado?.status).toBe('ativo');

    const { rows } = await pool.query(
      "select actor_type, actor_id, client_id from audit_log where action = 'rastreador.instalar' and target = $1",
      [rastreador.id],
    );
    expect(rows).toEqual([{ actor_type: 'user', actor_id: usuarioCliente.id, client_id: clientA }]);
  });

  it('não instala rastreador sem vínculo nem vinculado a outro cliente (404, nada gravado)', async () => {
    const solto = await service.cadastrarRastreador(superadminId, { modeloId: modeloTeste, imei: novoImei() });
    rastreadoresCriados.push(solto.id);
    const deA = await vinculadoA(clientA);
    const assetB = await novoAsset(clientB);

    await expect(service.instalar(usuarioCliente, clientB, solto.id, { assetId: assetB, tecnico: 'teste' })).rejects.toThrow(/não está vinculado/);
    await expect(service.instalar(usuarioCliente, clientB, deA.id, { assetId: assetB, tecnico: 'teste' })).rejects.toThrow(/não está vinculado/);
    expect(await instalacoesRepo.findAtivaPorRastreador(solto.id)).toBeNull();
    expect(await instalacoesRepo.findAtivaPorRastreador(deA.id)).toBeNull();
  });

  it('não instala rastreador do cliente em ativo de outro cliente', async () => {
    const rastreador = await vinculadoA(clientA);
    const assetB = await novoAsset(clientB);
    await expect(service.instalar(usuarioCliente, clientA, rastreador.id, { assetId: assetB, tecnico: 'teste' })).rejects.toThrow(/Ativo não encontrado/);
  });

  it('rejeita instalar o mesmo rastreador em outro ativo enquanto a instalação atual está vigente', async () => {
    const rastreador = await vinculadoA(clientA);
    await service.instalar(usuarioCliente, clientA, rastreador.id, { assetId: await novoAsset(clientA), tecnico: 'teste' });
    await expect(
      service.instalar(usuarioCliente, clientA, rastreador.id, { assetId: await novoAsset(clientA), tecnico: 'teste' }),
    ).rejects.toThrow(/já tem uma instalação vigente/i);
  });

  it('sob concorrência real, só uma de duas instalações simultâneas do mesmo rastreador vence', async () => {
    const rastreador = await vinculadoA(clientA);
    const [assetId1, assetId2] = [await novoAsset(clientA), await novoAsset(clientA)];
    const resultados = await Promise.allSettled([
      service.instalar(usuarioCliente, clientA, rastreador.id, { assetId: assetId1, tecnico: 'teste-concorrencia-1' }),
      service.instalar(usuarioCliente, clientA, rastreador.id, { assetId: assetId2, tecnico: 'teste-concorrencia-2' }),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('desinstala e devolve o rastreador para status "cadastrado"', async () => {
    const rastreador = await vinculadoA(clientA);
    const instalacao = await service.instalar(sa, clientA, rastreador.id, { assetId: await novoAsset(clientA), tecnico: 'teste' });

    const desinstalada = await service.desinstalar(sa, instalacao.id);
    expect(desinstalada.desinstalado_em).not.toBeNull();
    expect((await rastreadoresRepo.findById(rastreador.id))?.status).toBe('cadastrado');
    expect(await service.historicoInstalacoes(rastreador.id)).toHaveLength(1);
  });

  it('cliente só desinstala instalação dele (outra responde 404 e continua vigente)', async () => {
    const rastreador = await vinculadoA(clientA);
    const instalacao = await service.instalar(usuarioCliente, clientA, rastreador.id, { assetId: await novoAsset(clientA), tecnico: 'teste' });

    await expect(service.desinstalar(usuarioCliente, instalacao.id, clientB)).rejects.toThrow(/não encontrada/);
    expect(await instalacoesRepo.findAtivaPorRastreador(rastreador.id)).not.toBeNull();

    const desinstalada = await service.desinstalar(usuarioCliente, instalacao.id, clientA);
    expect(desinstalada.desinstalado_em).not.toBeNull();
  });

  it('não desvincula rastreador instalado; desinstalado, desvincula e o cliente não instala mais', async () => {
    const rastreador = await vinculadoA(clientA);
    const instalacao = await service.instalar(usuarioCliente, clientA, rastreador.id, { assetId: await novoAsset(clientA), tecnico: 'teste' });

    await expect(service.desvincular(superadminId, rastreador.id)).rejects.toThrow(/desinstale antes/);
    await service.desinstalar(usuarioCliente, instalacao.id, clientA);
    const encerrado = await service.desvincular(superadminId, rastreador.id);
    expect(encerrado.desvinculado_em).not.toBeNull();
    await expect(service.desvincular(superadminId, rastreador.id)).rejects.toThrow(/não está vinculado/);

    await expect(
      service.instalar(usuarioCliente, clientA, rastreador.id, { assetId: await novoAsset(clientA), tecnico: 'teste' }),
    ).rejects.toThrow(/não está vinculado/);
    // desvinculado, pode ir para outro cliente (o histórico do primeiro fica)
    await service.vincular(superadminId, clientB, rastreador.id);
    const { rows } = await pool.query('select client_id from rastreador_vinculos where rastreador_id = $1 order by vinculado_em', [rastreador.id]);
    expect(rows.map((r) => r.client_id)).toEqual([clientA, clientB]);
  });

  it('cadastra chip, vincula a um rastreador e marca ativo', async () => {
    const rastreador = await service.cadastrarRastreador(superadminId, { modeloId: modeloTeste, imei: novoImei() });
    rastreadoresCriados.push(rastreador.id);
    const chip = await service.cadastrarSimCard(superadminId, { iccid: randomUUID() });
    simCardsCriados.push(chip.id);

    const vinculado = await service.vincularSimCard(superadminId, chip.id, rastreador.id);
    expect(vinculado.rastreador_id).toBe(rastreador.id);
    expect(vinculado.status).toBe('ativo');
  });

  it('rejeita vincular um segundo chip ao mesmo rastreador', async () => {
    const rastreador = await service.cadastrarRastreador(superadminId, { modeloId: modeloTeste, imei: novoImei() });
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
    const rastreador = await service.cadastrarRastreador(superadminId, { modeloId: modeloTeste, imei: novoImei() });
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
      const criado = await service.cadastrarRastreador(superadminId, { modeloId: modeloTeste, imei: novoImei() });
      rastreadoresCriados.push(criado.id);
      expect(criado.traccar_device_id).toBeNull();
    });

    it('cria o device no Traccar e grava o id; um device já existente com o mesmo IMEI é reaproveitado', async () => {
      traccar.cfg = cfg;
      const imei = novoImei();
      const criado = await service.cadastrarRastreador(superadminId, { modeloId: modeloTeste, imei });
      rastreadoresCriados.push(criado.id);
      expect(criado.traccar_device_id).toBe(String(traccar.devices.get(imei)!.id));

      const imeiExistente = novoImei();
      traccar.devices.set(imeiExistente, { id: 123_456_789 + Math.floor(Math.random() * 1000), uniqueId: imeiExistente, name: 'x' });
      const reaproveitado = await service.cadastrarRastreador(superadminId, { modeloId: modeloTeste, imei: imeiExistente });
      rastreadoresCriados.push(reaproveitado.id);
      expect(reaproveitado.traccar_device_id).toBe(String(traccar.devices.get(imeiExistente)!.id));
      traccar.cfg = null;
    });

    it('Traccar fora do ar desfaz o cadastro inteiro (nenhuma linha, nenhuma auditoria)', async () => {
      traccar.cfg = cfg;
      traccar.falhar = true;
      const imei = novoImei();
      try {
        await expect(service.cadastrarRastreador(superadminId, { modeloId: modeloTeste, imei })).rejects.toThrow(/Traccar/);
      } finally {
        traccar.cfg = null;
        traccar.falhar = false;
      }
      const { rowCount } = await pool.query('select 1 from rastreadores where imei = $1', [imei]);
      expect(rowCount).toBe(0);
    });
  });

  it('atualiza protocolo e audita o antes e o depois', async () => {
    const rastreador = await service.cadastrarRastreador(superadminId, { modeloId: modeloTeste, imei: novoImei() });
    rastreadoresCriados.push(rastreador.id);
    const nome = `Teste ${sufixo} Livre`;
    expect(rastreador).toMatchObject({ modelo: nome, modelo_id: modeloTeste });
    const atualizado = await service.atualizar(superadminId, rastreador.id, { protocolo: 'gt06' });
    expect(atualizado).toMatchObject({ modelo: nome, protocolo: 'gt06' });

    const { rows } = await pool.query(
      "select before, after from audit_log where action = 'rastreador.atualizar' and target = $1",
      [rastreador.id],
    );
    expect(rows[0]).toEqual({
      before: { modelo: nome, modeloId: modeloTeste, protocolo: null },
      after: { modelo: nome, modeloId: modeloTeste, protocolo: 'gt06' },
    });
  });

  // Catálogo de modelos (decisão de 28/10/2026): modelo obrigatório no cadastro, identificador validado pelo tipo do
  // modelo, modelo enviado ao Traccar e divergência de protocolo marcada no inventário.
  describe('catálogo de modelos', () => {
    let modeloImei: string;
    let modeloJt808: string;
    beforeAll(async () => {
      modeloImei = (await modelos.criar(superadminId, { fabricante: `Teste ${sufixo}`, nome: 'IMEI', protocolo: 'gt06', porta: 5023, tipo_identificador: 'imei' })).id;
      modeloJt808 = (await modelos.criar(superadminId, { fabricante: `Teste ${sufixo}`, nome: 'JT808', protocolo: 'huabao', porta: 5015, tipo_identificador: 'terminal_jt808' })).id;
      modelosCriados.push(modeloImei, modeloJt808);
    });
    const digitos = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

    it('cadastro sem modelo, com modelo inexistente ou desativado é recusado, sem gravar nada', async () => {
      const imei = digitos(15);
      await expect(service.cadastrarRastreador(superadminId, { imei } as any)).rejects.toMatchObject({ status: 400 });
      await expect(service.cadastrarRastreador(superadminId, { imei, modeloId: randomUUID() })).rejects.toMatchObject({ status: 404 });
      const inativo = (await modelos.criar(superadminId, { fabricante: `Teste ${sufixo}`, nome: 'Inativo', protocolo: 'gt06', porta: 5023, tipo_identificador: 'imei' })).id;
      modelosCriados.push(inativo);
      await modelos.atualizar(superadminId, inativo, { ativo: false });
      await expect(service.cadastrarRastreador(superadminId, { imei, modeloId: inativo })).rejects.toThrow(/desativado/);
      const { rowCount } = await pool.query('select 1 from rastreadores where imei = $1', [imei]);
      expect(rowCount).toBe(0);
    });

    it('identificador validado pelo tipo do modelo: IMEI de 15 dígitos; JT808 recusa o IMEI e aceita o terminal', async () => {
      await expect(service.cadastrarRastreador(superadminId, { modeloId: modeloImei, imei: 'ABC123' })).rejects.toThrow(/15 dígitos/);
      await expect(service.cadastrarRastreador(superadminId, { modeloId: modeloJt808, imei: digitos(15) })).rejects.toThrow(/12 dígitos/);
      const terminal = digitos(12);
      const r = await service.cadastrarRastreador(superadminId, { modeloId: modeloJt808, imei: ` ${terminal.slice(0, 6)} ${terminal.slice(6)} ` });
      rastreadoresCriados.push(r.id);
      expect(r.imei).toBe(terminal); // espaços digitados não vão para o Traccar
    });

    it('o device criado no Traccar leva o modelo', async () => {
      traccar.cfg = { url: 'http://traccar.fake', user: 'u', password: 'p' };
      const imei = digitos(15);
      const r = await service.cadastrarRastreador(superadminId, { modeloId: modeloImei, imei });
      rastreadoresCriados.push(r.id);
      traccar.cfg = null;
      expect(traccar.devices.get(imei)).toMatchObject({ uniqueId: imei, model: `Teste ${sufixo} IMEI` });
    });

    it('inventário mostra o modelo e marca protocolo detectado diferente do modelo', async () => {
      const r = await service.cadastrarRastreador(superadminId, { modeloId: modeloImei, imei: digitos(15) });
      rastreadoresCriados.push(r.id);
      const linha = async () => (await rastreadoresRepo.findAllPainel()).find((x) => x.id === r.id)!;
      expect(await linha()).toMatchObject({ modelo_protocolo: 'gt06', modelo_porta: 5023, protocolo_divergente: false });
      await pool.query("update rastreadores set protocolo = 'gt06' where id = $1", [r.id]);
      expect((await linha()).protocolo_divergente).toBe(false);
      await pool.query("update rastreadores set protocolo = 'huabao' where id = $1", [r.id]);
      expect((await linha()).protocolo_divergente).toBe(true);
      // trocar para o modelo certo resolve a divergência
      await service.atualizar(superadminId, r.id, { modeloId: modeloJt808 });
      expect(await linha()).toMatchObject({ protocolo_divergente: false, modelo: `Teste ${sufixo} JT808` });
    });

    it('identificador já usado no Traccar por outra conta: 409 explicando o que fazer, nada gravado', async () => {
      traccar.cfg = { url: 'http://traccar.fake', user: 'u', password: 'p' };
      const imei = digitos(15);
      traccar.duplicados.add(imei);
      await expect(service.cadastrarRastreador(superadminId, { modeloId: modeloImei, imei })).rejects.toMatchObject({ status: 409 });
      await expect(service.cadastrarRastreador(superadminId, { modeloId: modeloImei, imei })).rejects.toThrow(/Apague-o no painel do Traccar/);
      traccar.cfg = null;
      const { rowCount } = await pool.query('select 1 from rastreadores where imei = $1', [imei]);
      expect(rowCount).toBe(0);
    });

    // HML, 28/10/2026: recadastrar o JR12 depois de desativar dava 500 (device do Traccar preso ao rastreador desativado)
    it('recadastro do mesmo IMEI depois de desativar reaproveita o device do Traccar; IMEI ou device de rastreador ativo: 409', async () => {
      traccar.cfg = { url: 'http://traccar.fake', user: 'u', password: 'p' };
      const imei = digitos(15);
      const primeiro = await service.cadastrarRastreador(superadminId, { modeloId: modeloImei, imei });
      rastreadoresCriados.push(primeiro.id);
      await expect(service.cadastrarRastreador(superadminId, { modeloId: modeloImei, imei })).rejects.toMatchObject({ status: 409 });

      await service.desativar(superadminId, primeiro.id);
      const segundo = await service.cadastrarRastreador(superadminId, { modeloId: modeloImei, imei });
      rastreadoresCriados.push(segundo.id);
      traccar.cfg = null;
      expect(segundo.traccar_device_id).toBe(primeiro.traccar_device_id);
      const antigo = await rastreadoresRepo.findById(primeiro.id);
      expect(antigo).toMatchObject({ status: 'desativado', traccar_device_id: null });
      const { rows } = await pool.query("select after from audit_log where action = 'rastreador.cadastrar' and target = $1", [segundo.id]);
      expect(rows[0].after).toMatchObject({ deviceDoRastreadorDesativado: primeiro.id });

      // device informado explicitamente, já ligado a um rastreador ativo: recusa sem gravar
      const outro = digitos(15);
      await expect(service.cadastrarRastreador(superadminId, { modeloId: modeloImei, imei: outro, traccarDeviceId: segundo.traccar_device_id! }))
        .rejects.toThrow(/já está ligado ao rastreador/);
      const { rowCount } = await pool.query('select 1 from rastreadores where imei = $1', [outro]);
      expect(rowCount).toBe(0);
    });

    it('catálogo: fabricante + nome únicos (sem diferenciar maiúsculas), alteração auditada', async () => {
      await expect(modelos.criar(superadminId, { fabricante: `TESTE ${sufixo}`, nome: 'imei', protocolo: 'gt06', porta: 5023, tipo_identificador: 'imei' }))
        .rejects.toMatchObject({ status: 409 });
      const atualizado = await modelos.atualizar(superadminId, modeloJt808, { porta: 5016 });
      expect(atualizado.porta).toBe(5016);
      const { rows } = await pool.query("select before, after from audit_log where action = 'rastreador_modelo.atualizar' and target = $1", [modeloJt808]);
      expect(rows.at(-1)).toEqual({ before: { porta: 5015 }, after: { porta: 5016 } });
      await expect(modelos.atualizar(superadminId, randomUUID(), { ativo: false })).rejects.toMatchObject({ status: 404 });
    });
  });

  it('não desativa rastreador instalado nem vinculado; desinstalado e desvinculado, desativa e libera o IMEI', async () => {
    const imei = novoImei();
    const rastreador = await service.cadastrarRastreador(superadminId, { modeloId: modeloTeste, imei });
    rastreadoresCriados.push(rastreador.id);
    await service.vincular(superadminId, clientA, rastreador.id);
    const instalacao = await service.instalar(sa, clientA, rastreador.id, { assetId: await novoAsset(clientA), tecnico: 'teste' });

    await expect(service.desativar(superadminId, rastreador.id)).rejects.toThrow(/instalação vigente/);
    await service.desinstalar(sa, instalacao.id);
    await expect(service.desativar(superadminId, rastreador.id)).rejects.toThrow(/desvincule antes/);
    await service.desvincular(superadminId, rastreador.id);
    expect((await service.desativar(superadminId, rastreador.id)).status).toBe('desativado');

    const recadastrado = await service.cadastrarRastreador(superadminId, { modeloId: modeloTeste, imei });
    rastreadoresCriados.push(recadastrado.id);
    expect(recadastrado.id).not.toBe(rastreador.id);
  });

  it('findAllPainel traz cliente do vínculo, instalação vigente e chip; sem vínculo, campos nulos', async () => {
    const instalado = await vinculadoA(clientA);
    const livre = await service.cadastrarRastreador(superadminId, { modeloId: modeloTeste, imei: novoImei() });
    rastreadoresCriados.push(livre.id);
    const assetId = await novoAsset(clientA);
    const instalacao = await service.instalar(sa, clientA, instalado.id, { assetId, tecnico: 'teste' });
    const chip = await simCardsRepo.create({ iccid: `8955${randomUUID().replace(/-/g, '').slice(0, 15)}`, operadora: 'Vivo' });
    simCardsCriados.push(chip.id);
    await simCardsRepo.vincular(chip.id, instalado.id);

    const painel = await rastreadoresRepo.findAllPainel();
    const a = painel.find((r) => r.id === instalado.id);
    const b = painel.find((r) => r.id === livre.id);
    expect(a).toMatchObject({ instalacao_id: instalacao.id, client_id: clientA, asset_id: assetId, sim_card_id: chip.id, operadora: 'Vivo' });
    expect(a?.client_name).toMatch(/^teste-rastreadores-a-/);
    expect(b).toMatchObject({ vinculo_id: null, instalacao_id: null, client_id: null, sim_card_id: null });

    // desinstalado: continua do cliente (vínculo), sem ativo; uma linha só, sem duplicar pelo histórico
    await service.desinstalar(sa, instalacao.id);
    let depois = (await rastreadoresRepo.findAllPainel()).filter((r) => r.id === instalado.id);
    expect(depois).toHaveLength(1);
    expect(depois[0]).toMatchObject({ client_id: clientA, instalacao_id: null, asset_id: null });

    // desvinculado: sai do cliente
    await service.desvincular(superadminId, instalado.id);
    depois = (await rastreadoresRepo.findAllPainel()).filter((r) => r.id === instalado.id);
    expect(depois[0]).toMatchObject({ vinculo_id: null, client_id: null });
  });
});
