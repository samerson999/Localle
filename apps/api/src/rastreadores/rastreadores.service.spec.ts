import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssetsRepository } from '../assets/assets.repository';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { TraccarClient, type TraccarConfig, type TraccarDevice, type TraccarProtocolo } from '../ingest/traccar-client';
import { InstalacoesRepository } from './instalacoes.repository';
import { RastreadoresRepository } from './rastreadores.repository';
import { RastreadorVinculosRepository } from './rastreador-vinculos.repository';
import { RastreadoresService } from './rastreadores.service';
import { RastreadorModelosRepository } from './rastreador-modelos.repository';
import { RastreadorModelosService } from './rastreador-modelos.service';
import { parseAtualizarModelo } from './dto/parse-rastreador-modelo';
import { SimCardsRepository } from './sim-cards.repository';
import type { ModeloDados } from './rastreador-modelos.repository';
import { TraccarAparelhosRepository } from './traccar-aparelhos.repository';
import { TraccarAparelhosService, type PreviaModelo } from './traccar-aparelhos.service';
import { parseUpdateRastreador } from './dto/update-rastreador.dto';

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
  // ficha do modelo: versão, protocolos (null = Traccar anterior à 6.17) e comandos por device
  versao = '6.17.0';
  protocolos: TraccarProtocolo[] | null = [];
  tiposPorDevice = new Map<number, string[]>();
  consultados: number[] = [];
  async serverVersion() {
    if (this.falhar) throw new Error('Traccar fora do ar');
    return this.versao;
  }
  async protocols() {
    return this.protocolos;
  }
  apagados: number[] = [];
  falharAoApagar = false;
  async deleteDevice(_: TraccarConfig, deviceId: number) {
    if (this.falharAoApagar) throw new Error('Traccar DELETE /api/devices falhou: 503 Service Unavailable');
    this.apagados.push(deviceId);
  }
  online = new Set<number>();
  async deviceStatus(_: TraccarConfig, deviceId: number) {
    return this.online.has(deviceId) ? 'online' : 'offline';
  }
  async commandTypes(_: TraccarConfig, deviceId: number) {
    this.consultados.push(deviceId);
    return this.tiposPorDevice.get(deviceId) ?? ['custom'];
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
  const modelos = new RastreadorModelosService(modelosRepo, audit, traccar);
  // a lista do Traccar é trocada inteira pelo traccar-aparelhos.spec (roda em paralelo): a prévia vem daqui, a gravação é real
  const previas = new Map<number, ModeloDados>();
  class AparelhosDeTeste extends TraccarAparelhosService {
    async previa(aparelhoId: number): Promise<PreviaModelo> {
      const d = previas.get(aparelhoId);
      if (!d) throw new NotFoundException('Aparelho não encontrado na lista do Traccar');
      return (await modelosRepo.findByNome(d.fabricante, d.nome)) ?? { id: null, ...d };
    }
  }
  const aparelhos = new AparelhosDeTeste(new TraccarAparelhosRepository(pool), modelosRepo, modelos, traccar, audit);
  const service = new RastreadoresService(rastreadoresRepo, simCardsRepo, instalacoesRepo, vinculosRepo, assetsRepo, audit, pool, traccar, modelosRepo, aparelhos);
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
      await pool.query('delete from ultima_posicao where rastreador_id = $1', [rastreadorId]);
      await pool.query('delete from posicoes where rastreador_id = $1', [rastreadorId]);
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
    ).rejects.toThrow(/já está instalado em outro ativo/i);
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

    // só o nome, sem o fabricante: o decodificador do Traccar compara o modelo do device (ex.: "VL100" no gt06)
    it('o device criado no Traccar leva o nome do modelo, sem o fabricante', async () => {
      traccar.cfg = { url: 'http://traccar.fake', user: 'u', password: 'p' };
      const imei = digitos(15);
      const r = await service.cadastrarRastreador(superadminId, { modeloId: modeloImei, imei });
      rastreadoresCriados.push(r.id);
      traccar.cfg = null;
      expect(traccar.devices.get(imei)).toMatchObject({ uniqueId: imei, model: 'IMEI' });
      expect(r.modelo).toBe(`Teste ${sufixo} IMEI`);
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
      const { rows } = await pool.query("select before, after from audit_log where action = 'rastreador_modelo.atualizar' and target = $1 order by id", [modeloJt808]);
      expect(rows.at(-1)).toEqual({ before: { porta: 5015 }, after: { porta: 5016 } });
      await expect(modelos.atualizar(superadminId, randomUUID(), { ativo: false })).rejects.toMatchObject({ status: 404 });
    });

    it('mapeamento da telemetria: grava, volta ao padrão com vazio e lista os atributos recebidos do modelo', async () => {
      const m = await modelos.atualizar(superadminId, modeloImei, parseAtualizarModelo({ atributoTensao: 'adc1', sinalMax: 4 }));
      expect(m).toMatchObject({ atributo_tensao: 'adc1', sinal_max: 4, atributo_bloqueio: null });
      expect(await modelos.atualizar(superadminId, modeloImei, parseAtualizarModelo({ atributoTensao: '', sinalMax: null }))).toMatchObject({ atributo_tensao: null, sinal_max: null });
      expect(() => parseAtualizarModelo({ atributoTensao: 'adc1; drop table x' })).toThrow(/nome do atributo/);
      expect(() => parseAtualizarModelo({ sinalMax: 0 })).toThrow(/sinalMax/);

      const r = await service.cadastrarRastreador(superadminId, { modeloId: modeloImei, imei: digitos(15) });
      rastreadoresCriados.push(r.id);
      await pool.query(
        `insert into rastreador_comunicacao (rastreador_id, ultimo_pacote_em, ultimos_atributos, atributos_em) values ($1, now(), '{"adc1": 13.3, "rssi": 4}', now())`,
        [r.id],
      );
      expect(await modelos.atributosRecebidos(modeloImei)).toEqual([expect.objectContaining({ imei: r.imei, atributos: { adc1: 13.3, rssi: 4 } })]);
      await expect(modelos.atributosRecebidos(randomUUID())).rejects.toMatchObject({ status: 404 });
    });

    // Catálogo = modelos em uso (migrations 1793160000000 e 1793170000000): os três da HML ficam; os de mercado saíram
    // (vêm da lista do Traccar quando forem usados).
    it('catálogo: os três modelos em uso ficam, os de mercado sem rastreador saíram; cadastrado pela tela é manual', async () => {
      const lista = await modelos.listar();
      expect(lista.find((m) => m.fabricante === 'EVOO-X' && m.nome === 'GT06')).toMatchObject({ protocolo: 'gt06', porta: 5023, origem: 'catalogo' });
      expect(lista.find((m) => m.fabricante === 'Teltonika' && m.nome === 'FMC125')).toMatchObject({ protocolo: 'teltonika', porta: 5027, origem: 'catalogo' });
      // o JR12 pode já existir pela tela (não é sobrescrito): se é do catálogo, é com os dados da lista do Traccar
      const jr12 = lista.find((m) => m.fabricante === 'JMAK' && m.nome === 'JR12');
      expect(jr12).toBeDefined();
      if (jr12!.origem === 'catalogo') expect(jr12).toMatchObject({ protocolo: 'jmak', porta: 5259 });
      const gt06n = lista.find((m) => m.fabricante === 'Concox' && m.nome === 'GT06N');
      if (gt06n) expect(gt06n.rastreadores).toBeGreaterThan(0);
      expect(lista.find((m) => m.id === modeloImei)?.origem).toBe('manual');
    });

    describe('ficha do modelo no Traccar', () => {
      const cfg = { url: 'http://traccar.fake', user: 'u', password: 'p' };
      afterAll(() => {
        traccar.cfg = null;
        traccar.falhar = false;
      });

      it('sem Traccar configurado ou fora do ar: diz isso, sem lançar; modelo inexistente: 404', async () => {
        traccar.cfg = null;
        expect(await modelos.fichaTraccar(modeloImei)).toEqual({ traccar: { configurado: false, versao: null, erro: null }, protocolo: null, comandos: null });
        traccar.cfg = cfg;
        traccar.falhar = true;
        expect((await modelos.fichaTraccar(modeloImei)).traccar).toMatchObject({ configurado: true, erro: expect.stringMatching(/não respondeu/) });
        traccar.falhar = false;
        await expect(modelos.fichaTraccar(randomUUID())).rejects.toMatchObject({ status: 404 });
      });

      it('protocolo: ativo e porta vindos de /api/protocols; desabilitado ou ausente = inativo; Traccar antigo = null', async () => {
        traccar.cfg = cfg;
        traccar.protocolos = [{ protocolo: 'gt06', porta: 5023, transporte: 'TCP' }];
        expect(await modelos.fichaTraccar(modeloImei)).toMatchObject({ traccar: { versao: '6.17.0' }, protocolo: { ativo: true, porta: 5023, transporte: 'TCP' } });
        traccar.protocolos = [{ protocolo: 'gt06', porta: 5023, transporte: 'DISABLED' }];
        expect((await modelos.fichaTraccar(modeloImei)).protocolo).toMatchObject({ ativo: false });
        expect((await modelos.fichaTraccar(modeloJt808)).protocolo).toEqual({ ativo: false, porta: null, transporte: null });
        traccar.protocolos = null;
        expect((await modelos.fichaTraccar(modeloImei)).protocolo).toBeNull();
      });

      it('comandos: só de aparelho do modelo com posição no protocolo do modelo; sem ele, null', async () => {
        traccar.cfg = cfg;
        const m = (await modelos.criar(superadminId, { fabricante: `Teste ${sufixo}`, nome: 'Ficha', protocolo: 'jmak', porta: 5259, tipo_identificador: 'imei' })).id;
        modelosCriados.push(m);
        const r = await service.cadastrarRastreador(superadminId, { modeloId: m, imei: digitos(15) });
        rastreadoresCriados.push(r.id);
        const deviceId = Number(r.traccar_device_id);
        traccar.tiposPorDevice.set(deviceId, ['engineStop', 'engineResume', 'custom']);
        // sem posição o Traccar não sabe o protocolo do device: não serve de referência
        expect((await modelos.fichaTraccar(m)).comandos).toBeNull();
        await pool.query("update rastreadores set protocolo = 'huabao' where id = $1", [r.id]);
        expect((await modelos.fichaTraccar(m)).comandos).toBeNull();
        await pool.query("update rastreadores set protocolo = 'jmak' where id = $1", [r.id]);
        expect((await modelos.fichaTraccar(m)).comandos).toEqual({ tipos: ['engineStop', 'engineResume', 'custom'], imei: r.imei });
        expect(traccar.consultados.at(-1)).toBe(deviceId);
      });

      it('aparelho da lista do Traccar: o modelo só nasce no cadastro do rastreador, e não nasce se o cadastro falhar', async () => {
        const nomeAparelho = `Lista ${sufixo}`;
        previas.set(1, { fabricante: nomeAparelho, nome: 'A1', protocolo: 'gt06', porta: 5023, tipo_identificador: 'imei', origem: 'catalogo' });
        const doCatalogo = () => modelosRepo.findByNome(nomeAparelho, 'A1');
        // identificador inválido para o modelo: recusado antes de gravar qualquer coisa
        await expect(service.cadastrarRastreador(superadminId, { aparelhoId: 1, imei: '123' })).rejects.toMatchObject({ status: 400 });
        // IMEI já ativo: o cadastro desfaz e o modelo criado na mesma transação vai junto
        const existente = await service.cadastrarRastreador(superadminId, { modeloId: modeloImei, imei: digitos(15) });
        rastreadoresCriados.push(existente.id);
        await expect(service.cadastrarRastreador(superadminId, { aparelhoId: 1, imei: existente.imei })).rejects.toMatchObject({ status: 409 });
        expect(await doCatalogo()).toBeNull();

        const r = await service.cadastrarRastreador(superadminId, { aparelhoId: 1, imei: digitos(15) });
        rastreadoresCriados.push(r.id);
        const m = (await doCatalogo())!;
        modelosCriados.push(m.id);
        expect(r).toMatchObject({ modelo_id: m.id, modelo: `${nomeAparelho} A1` });
        // 2º rastreador do mesmo aparelho reaproveita o modelo
        const r2 = await service.cadastrarRastreador(superadminId, { aparelhoId: 1, imei: digitos(15) });
        rastreadoresCriados.push(r2.id);
        expect(r2.modelo_id).toBe(m.id);
        await expect(service.cadastrarRastreador(superadminId, { aparelhoId: 1, modeloId: m.id, imei: digitos(15) })).rejects.toMatchObject({ status: 400 });
      });

      it('trocar o modelo para um aparelho da lista do Traccar cria o modelo na troca', async () => {
        previas.set(2, { fabricante: `Lista ${sufixo}`, nome: 'A2', protocolo: 'jmak', porta: 5259, tipo_identificador: 'imei', origem: 'catalogo' });
        const r = await service.cadastrarRastreador(superadminId, { modeloId: modeloImei, imei: digitos(15) });
        rastreadoresCriados.push(r.id);
        const depois = await service.atualizar(superadminId, r.id, parseUpdateRastreador({ aparelhoId: 2 }));
        const m = (await modelosRepo.findByNome(`Lista ${sufixo}`, 'A2'))!;
        modelosCriados.push(m.id);
        expect(depois).toMatchObject({ modelo_id: m.id, modelo: `Lista ${sufixo} A2` });
        expect(() => parseUpdateRastreador({ aparelhoId: 2, modeloId: m.id })).toThrow(/não os dois/);
        expect(() => parseUpdateRastreador({ aparelhoId: '2' })).toThrow(/aparelhoId/);
      });

      it('excluir rastreador: só cadastro errado; apaga o device no Traccar e libera o chip; auditado', async () => {
        traccar.cfg = cfg;
        const r = await service.cadastrarRastreador(superadminId, { modeloId: modeloImei, imei: digitos(15) });
        rastreadoresCriados.push(r.id);
        const chip = await service.cadastrarSimCard(superadminId, { iccid: randomUUID() });
        simCardsCriados.push(chip.id);
        await service.vincularSimCard(superadminId, chip.id, r.id);

        // Traccar fora do ar: nada é excluído
        traccar.falharAoApagar = true;
        await expect(service.excluir(superadminId, r.id)).rejects.toMatchObject({ status: 502 });
        expect(await rastreadoresRepo.findById(r.id)).not.toBeNull();
        traccar.falharAoApagar = false;

        await service.excluir(superadminId, r.id);
        expect(await rastreadoresRepo.findById(r.id)).toBeNull();
        expect(traccar.apagados).toContain(Number(r.traccar_device_id));
        expect((await pool.query('select rastreador_id from sim_cards where id = $1', [chip.id])).rows[0].rastreador_id).toBeNull();
        const { rows } = await pool.query("select before from audit_log where action = 'rastreador.excluir' and target = $1", [r.id]);
        expect(rows[0].before).toMatchObject({ imei: r.imei, simCardId: chip.id });
        await expect(service.excluir(superadminId, r.id)).rejects.toMatchObject({ status: 404 });
      });

      it('excluir rastreador: recusa quem já transmitiu ou já foi de cliente (desativado também), sem apagar no Traccar', async () => {
        traccar.cfg = cfg;
        const transmitiu = await service.cadastrarRastreador(superadminId, { modeloId: modeloImei, imei: digitos(15) });
        const foiDeCliente = await service.cadastrarRastreador(superadminId, { modeloId: modeloImei, imei: digitos(15) });
        rastreadoresCriados.push(transmitiu.id, foiDeCliente.id);
        await pool.query('insert into rastreador_comunicacao (rastreador_id, ultimo_pacote_em) values ($1, now())', [transmitiu.id]);
        await service.vincular(superadminId, clientA, foiDeCliente.id);
        await service.desvincular(superadminId, foiDeCliente.id);
        await service.desativar(superadminId, foiDeCliente.id);
        const apagadosAntes = traccar.apagados.length;

        await expect(service.excluir(superadminId, transmitiu.id)).rejects.toThrow(/já transmitiu.*Desativar/);
        await expect(service.excluir(superadminId, foiDeCliente.id)).rejects.toThrow(/já foi vinculado a um cliente/);
        expect(await rastreadoresRepo.findById(transmitiu.id)).not.toBeNull();
        expect(await rastreadoresRepo.findById(foiDeCliente.id)).not.toBeNull();
        expect(traccar.apagados.length).toBe(apagadosAntes);
      });

      it('excluir modelo: só sem nenhum rastreador, nem desativado; auditado', async () => {
        const livre = (await modelos.criar(superadminId, { fabricante: `Teste ${sufixo}`, nome: 'Excluir', protocolo: 'gt06', porta: 5023, tipo_identificador: 'imei' })).id;
        modelosCriados.push(livre);
        await modelos.excluir(superadminId, livre);
        expect(await modelosRepo.findById(livre)).toBeNull();
        const { rows } = await pool.query("select before from audit_log where action = 'rastreador_modelo.excluir' and target = $1", [livre]);
        expect(rows[0].before).toMatchObject({ nome: 'Excluir' });
        await expect(modelos.excluir(superadminId, livre)).rejects.toMatchObject({ status: 404 });

        const usado = (await modelos.criar(superadminId, { fabricante: `Teste ${sufixo}`, nome: 'Usado', protocolo: 'gt06', porta: 5023, tipo_identificador: 'imei' })).id;
        modelosCriados.push(usado);
        const r = await service.cadastrarRastreador(superadminId, { modeloId: usado, imei: digitos(15) });
        rastreadoresCriados.push(r.id);
        await service.desativar(superadminId, r.id);
        await expect(modelos.excluir(superadminId, usado)).rejects.toThrow(/1 rastreador \(contando desativados\)/);
        expect(await modelosRepo.findById(usado)).not.toBeNull();
      });

      it('transmissão: todos os não desativados, com cliente/placa, posição, telemetria e pacotes da última hora pelo server_time', async () => {
        const [mudo, fala, desativado] = await Promise.all([0, 1, 2].map(() => service.cadastrarRastreador(superadminId, { modeloId: modeloImei, imei: digitos(15) })));
        rastreadoresCriados.push(mudo.id, fala.id, desativado.id);
        // o fluxo de desativar tem teste próprio: aqui só importa o status
        await pool.query("update rastreadores set status = 'desativado' where id = $1", [desativado.id]);
        await service.vincular(superadminId, clientA, fala.id);
        await pool.query(
          `insert into rastreador_comunicacao (rastreador_id, ultimo_pacote_em, ultima_posicao_valida_em, ultimos_atributos, atributos_em)
           values ($1, now(), now(), '{"power": 12.4, "rssi": 4}', now())`,
          [fala.id],
        );
        await pool.query(
          `insert into ultima_posicao (rastreador_id, posicao_id, fix_time, geom, speed_kmh, ignition)
           values ($1, 1, now(), st_setsrid(st_makepoint(-38.5, -3.7), 4326), 0, false)`,
          [fala.id],
        );
        // 2 pacotes recebidos agora (um com fix_time de 3 h atrás, descarregado da memória do aparelho) e 1 de duas horas atrás
        await pool.query(
          `insert into posicoes (rastreador_id, traccar_position_id, fix_time, server_time, valid, geom)
           values ($1, 1, now() - interval '3 hours', now(), true, st_setsrid(st_makepoint(-38.5, -3.7), 4326)),
                  ($1, 2, now(), now(), true, st_setsrid(st_makepoint(-38.5, -3.7), 4326)),
                  ($1, 3, now() - interval '2 hours', now() - interval '2 hours', true, st_setsrid(st_makepoint(-38.5, -3.7), 4326))`,
          [fala.id],
        );

        const lista = await modelos.transmissao();
        expect(lista.find((t) => t.id === desativado.id)).toBeUndefined();
        expect(lista.find((t) => t.id === mudo.id)).toMatchObject({
          imei: mudo.imei, modeloId: modeloImei, modelo: `Teste ${sufixo} IMEI`, modeloProtocolo: 'gt06', modeloPorta: 5023,
          ultimoPacoteEm: null, pacotesUltimaHora: 0, ultimaPosicao: null, atributos: {}, cliente: null, placa: null,
        });
        const t = lista.find((x) => x.id === fala.id)!;
        expect(t).toMatchObject({ cliente: expect.any(String), pacotesUltimaHora: 2, atributos: { power: 12.4, rssi: 4 } });
        expect(t.telemetria).toMatchObject({ tensaoV: 12.4, sinalGsm: 4 });
        expect(t.ultimaPosicao).toMatchObject({ latitude: -3.7, longitude: -38.5, velocidadeKmh: 0, ignicao: false });
        // quem transmite vem antes de quem nunca transmitiu
        expect(lista.findIndex((x) => x.id === fala.id)).toBeLessThan(lista.findIndex((x) => x.id === mudo.id));
      });

      it('diagnóstico do rastreador: conexão, comandos do próprio aparelho, atributos e ficha do modelo; 404 se não existe', async () => {
        traccar.cfg = cfg;
        traccar.protocolos = [{ protocolo: 'gt06', porta: 5023, transporte: 'ALL' }];
        const r = await service.cadastrarRastreador(superadminId, { modeloId: modeloImei, imei: digitos(15) });
        rastreadoresCriados.push(r.id);
        const deviceId = Number(r.traccar_device_id);
        traccar.tiposPorDevice.set(deviceId, ['engineStop', 'engineResume', 'custom']);

        // recém-cadastrado: sem posição, comandos não são consultados (o Traccar responderia só `custom`)
        const antes = await modelos.diagnostico(r.id);
        expect(antes).toMatchObject({ imei: r.imei, modeloId: modeloImei, protocoloDetectado: null, online: false, comandos: null, atributos: {}, ultimoPacoteEm: null });
        expect(antes.ficha?.protocolo).toMatchObject({ ativo: true, porta: 5023 });

        traccar.online.add(deviceId);
        await pool.query("update rastreadores set protocolo = 'gt06' where id = $1", [r.id]);
        await pool.query(
          `insert into rastreador_comunicacao (rastreador_id, ultimo_pacote_em, ultimos_atributos, atributos_em) values ($1, now(), '{"versionFw": "1.2", "power": 12.6}', now())`,
          [r.id],
        );
        const depois = await modelos.diagnostico(r.id);
        expect(depois).toMatchObject({ protocoloDetectado: 'gt06', online: true, comandos: ['engineStop', 'engineResume', 'custom'], atributos: { versionFw: '1.2', power: 12.6 } });
        expect(depois.ultimoPacoteEm).toBeInstanceOf(Date);
        expect(depois.telemetria).toMatchObject({ tensaoV: 12.6, bloqueado: null });
        // pacote sem fix de GPS: comunica, mas não há posição para mostrar
        expect(depois.ultimaPosicao).toBeNull();
        await pool.query(
          `insert into ultima_posicao (rastreador_id, posicao_id, fix_time, geom, speed_kmh, ignition)
           values ($1, 1, now(), st_setsrid(st_makepoint(-38.5, -3.7), 4326), 42, true)`,
          [r.id],
        );
        expect((await modelos.diagnostico(r.id)).ultimaPosicao).toMatchObject({ latitude: -3.7, longitude: -38.5, velocidadeKmh: 42, ignicao: true, em: expect.any(Date) });

        // Traccar fora do ar: a ficha diz o erro e o resto não é consultado
        traccar.falhar = true;
        expect(await modelos.diagnostico(r.id)).toMatchObject({ online: null, comandos: null, ficha: { traccar: { erro: expect.any(String) } } });
        traccar.falhar = false;
        await expect(modelos.diagnostico(randomUUID())).rejects.toMatchObject({ status: 404 });
      });
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

  // 14/11/2026: principal + backup no mesmo ativo; tag em veículo só como backup
  describe('principal, backup e tag', () => {
    let modeloTag: string;
    beforeAll(async () => {
      modeloTag = (await modelosRepo.criar({ fabricante: `Teste ${sufixo}`, nome: 'Tag', protocolo: 'gt06', porta: 5023, tipo_identificador: 'outro', tipo_aparelho: 'tag' })).id;
      modelosCriados.push(modeloTag);
    });
    async function tagVinculadaA(clientId: string) {
      const r = await service.cadastrarRastreador(superadminId, { modeloId: modeloTag, imei: novoImei() });
      rastreadoresCriados.push(r.id);
      await service.vincular(superadminId, clientId, r.id);
      return r;
    }
    const objeto = async (clientId: string) =>
      (await assetsRepo.insert(clientId, { identificador: novaPlaca(), dados: { kind: 'equipamento' } })).id;

    it('veículo: tag não entra como principal, entra como backup ao lado do rastreador', async () => {
      const assetId = await novoAsset(clientA);
      const tag = await tagVinculadaA(clientA);
      await expect(service.instalar(usuarioCliente, clientA, tag.id, { assetId, tecnico: 'T' })).rejects.toThrow(/tag só pode ser instalada como backup/);

      const principal = await vinculadoA(clientA);
      await service.instalar(usuarioCliente, clientA, principal.id, { assetId, tecnico: 'T' });
      const backup = await service.instalar(usuarioCliente, clientA, tag.id, { assetId, tecnico: 'T', papel: 'backup' });
      expect(backup.papel).toBe('backup');

      const outra = await tagVinculadaA(clientA);
      await expect(service.instalar(usuarioCliente, clientA, outra.id, { assetId, tecnico: 'T', papel: 'backup' })).rejects.toThrow(/já tem um backup/);
      // trocar deixaria a tag como principal do veículo
      await expect(service.trocarPrincipal(usuarioCliente, clientA, assetId)).rejects.toThrow(/tag só pode ser backup/);
    });

    it('objeto: tag pode ser principal', async () => {
      const assetId = await objeto(clientA);
      const tag = await tagVinculadaA(clientA);
      expect((await service.instalar(usuarioCliente, clientA, tag.id, { assetId, tecnico: 'T' })).papel).toBe('principal');
    });

    it('troca principal e backup preservando o histórico; outro cliente não troca', async () => {
      const assetId = await novoAsset(clientA);
      const a = await vinculadoA(clientA);
      const b = await vinculadoA(clientA);
      await service.instalar(usuarioCliente, clientA, a.id, { assetId, tecnico: 'Ana', instaladoEm: new Date(Date.now() - 60_000) });
      await service.instalar(usuarioCliente, clientA, b.id, { assetId, tecnico: 'Bia', papel: 'backup', instaladoEm: new Date(Date.now() - 60_000) });

      await expect(service.trocarPrincipal(usuarioCliente, clientB, assetId)).rejects.toThrow(NotFoundException);

      await service.trocarPrincipal(usuarioCliente, clientA, assetId);
      const { rows } = await pool.query(
        'select rastreador_id, papel, tecnico from instalacoes where asset_id = $1 and desinstalado_em is null order by papel desc',
        [assetId],
      );
      expect(rows).toEqual([
        { rastreador_id: b.id, papel: 'principal', tecnico: 'Bia' },
        { rastreador_id: a.id, papel: 'backup', tecnico: 'Ana' },
      ]);
      const fechadas = await pool.query('select count(*)::int as n from instalacoes where asset_id = $1 and desinstalado_em is not null', [assetId]);
      expect(fechadas.rows[0].n).toBe(2);
    });

    it('trocar sem backup responde conflito', async () => {
      const assetId = await novoAsset(clientA);
      const a = await vinculadoA(clientA);
      await service.instalar(usuarioCliente, clientA, a.id, { assetId, tecnico: 'T' });
      await expect(service.trocarPrincipal(usuarioCliente, clientA, assetId)).rejects.toThrow(/principal e um backup/);
    });
  });
});
