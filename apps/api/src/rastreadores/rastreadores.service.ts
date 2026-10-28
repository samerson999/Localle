import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { AssetsRepository } from '../assets/assets.repository';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { PG_POOL } from '../db/pg-pool.provider';
import { withTransaction } from '../db/with-transaction';
import { TraccarClient } from '../ingest/traccar-client';
import type { InstalacaoEntity } from './instalacao.entity';
import { InstalacoesRepository } from './instalacoes.repository';
import type { RastreadorEntity } from './rastreador.entity';
import { RastreadoresRepository } from './rastreadores.repository';
import type { SimCardEntity } from './sim-card.entity';
import { SimCardsRepository } from './sim-cards.repository';
import { RastreadorVinculosRepository } from './rastreador-vinculos.repository';
import type { RastreadorVinculoEntity } from './rastreador-vinculo.entity';
import { isPgError, PG_EXCLUSION_VIOLATION, UNIQUE, violouUnique } from '../db/pg-errors';
import { normalizarIdentificador, validarIdentificador } from '@localle/shared/rastreadorModelos';
import { parseUuid } from '../common/parse-uuid';
import { RastreadorModelosRepository } from './rastreador-modelos.repository';

/** Quem executa: superadmin (Painel da Locale) ou usuário do próprio cliente (Gestão de ativos). */
export interface Ator {
  type: 'superadmin' | 'user';
  id: string;
}
const PG_FK_VIOLATION = '23503';


/**
 * Orquestra o domínio de rastreadores/SIM cards e seus dois vínculos: rastreador × cliente
 * (`rastreador_vinculos`, feito só pelo superadmin) e rastreador × ativo (`instalacoes`, feito pelo
 * próprio cliente, ou pelo superadmin, e só com rastreador vinculado a esse cliente). Mutação + auditoria
 * sempre na mesma transação, mesmo padrão de `SuperadminClientsService`.
 */
@Injectable()
export class RastreadoresService {
  private readonly logger = new Logger(RastreadoresService.name);

  constructor(
    private readonly rastreadores: RastreadoresRepository,
    private readonly simCards: SimCardsRepository,
    private readonly instalacoes: InstalacoesRepository,
    private readonly vinculos: RastreadorVinculosRepository,
    private readonly assets: AssetsRepository,
    private readonly audit: AuditLogRepository,
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly traccar: TraccarClient,
    private readonly modelos: RastreadorModelosRepository,
  ) {}

  /**
   * Cadastro-primeiro (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 1.5): sem `traccarDeviceId` informado, o
   * device é criado no Traccar aqui, dentro da transação — se o Traccar falhar, o cadastro não é
   * gravado (um rastreador sem device no Traccar nunca receberia posição). Reaproveita device já
   * existente com o mesmo IMEI, então repetir o cadastro depois de uma falha é seguro.
   */
  async cadastrarRastreador(
    superadminId: string,
    data: { imei: string; modeloId: string; traccarDeviceId?: string },
  ): Promise<RastreadorEntity> {
    // modelo obrigatório (catálogo, decisão de 28/10/2026): o identificador é validado pelo tipo que o modelo manda
    const modelo = await this.modeloAtivo(data.modeloId);
    if (typeof data.imei !== 'string') throw new BadRequestException('Informe o identificador do aparelho');
    const imei = normalizarIdentificador(data.imei);
    const invalido = validarIdentificador(modelo.tipo_identificador, imei);
    if (invalido) throw new BadRequestException(invalido);
    const nomeModelo = `${modelo.fabricante} ${modelo.nome}`;
    return withTransaction(this.pool, async (client) => {
      let criado = await this.rastreadores.create(
        { imei, traccarDeviceId: data.traccarDeviceId, modelo: nomeModelo, modeloId: modelo.id },
        client,
      );
      if (!data.traccarDeviceId) {
        const deviceId = await this.provisionarNoTraccar(criado.imei, nomeModelo);
        if (deviceId !== null) criado = await this.rastreadores.setTraccarDeviceId(criado.id, deviceId, client);
      }
      await this.audit.record(
        {
          actorType: 'superadmin',
          actorId: superadminId,
          clientId: null,
          action: 'rastreador.cadastrar',
          target: criado.id,
          after: { imei: criado.imei, modeloId: modelo.id, modelo: nomeModelo },
        },
        client,
      );
      return criado;
    });
  }

  /**
   * Rastreador × ativo do cliente. `clientId` explícito (do path para superadmin, do JWT para o cliente),
   * nunca inferido. Só com vínculo vigente do rastreador com ESSE cliente — travado na transação, para não
   * correr com um desvincular simultâneo. Rastreador de outro cliente responde 404, sem revelar que existe.
   */
  async instalar(
    ator: Ator,
    clientId: string,
    rastreadorId: string,
    data: {
      assetId: string;
      tecnico: string;
      papel?: InstalacaoEntity['papel'];
      instaladoEm?: Date;
      kmInicial?: string;
      foto?: string;
    },
  ): Promise<InstalacaoEntity> {
    const rastreador = await this.rastreadores.findById(rastreadorId);
    if (!rastreador || rastreador.status === 'desativado') throw new NotFoundException('Rastreador não encontrado');

    const asset = await this.assets.findOne(clientId, { id: data.assetId });
    if (!asset) throw new NotFoundException('Ativo não encontrado para este cliente');

    try {
      return await withTransaction(this.pool, async (client) => {
        if (!(await this.vinculos.vigenteDoCliente(clientId, rastreadorId, client))) {
          throw new NotFoundException('Rastreador não está vinculado a este cliente');
        }
        const instalacao = await this.instalacoes.instalar(
          clientId,
          {
            rastreadorId,
            assetId: data.assetId,
            papel: data.papel,
            instaladoEm: data.instaladoEm ?? new Date(),
            tecnico: data.tecnico,
            kmInicial: data.kmInicial,
            foto: data.foto,
          },
          client,
        );
        await this.rastreadores.updateStatus(rastreadorId, 'ativo', client);
        await this.audit.record(
          {
            actorType: ator.type,
            actorId: ator.id,
            clientId,
            action: 'rastreador.instalar',
            target: rastreadorId,
            after: { assetId: data.assetId, instalacaoId: instalacao.id },
          },
          client,
        );
        return instalacao;
      });
    } catch (err) {
      if (isPgError(err, PG_EXCLUSION_VIOLATION)) {
        throw new ConflictException(
          'Rastreador ou ativo já tem uma instalação vigente nesse papel para o período informado',
        );
      }
      throw err;
    }
  }

  /** `clientId` só quando quem pede é o cliente: instalação de outro cliente responde 404. */
  async desinstalar(ator: Ator, instalacaoId: string, clientId: string | null = null): Promise<InstalacaoEntity> {
    if (clientId !== null && !(await this.instalacoes.findOne(clientId, { id: instalacaoId }))) {
      throw new NotFoundException('Instalação vigente não encontrada');
    }
    return withTransaction(this.pool, async (client) => {
      const instalacao = await this.instalacoes.desinstalar(instalacaoId, new Date(), client);
      if (!instalacao) throw new NotFoundException('Instalação vigente não encontrada');
      await this.rastreadores.updateStatus(instalacao.rastreador_id, 'cadastrado', client);
      await this.audit.record(
        {
          actorType: ator.type,
          actorId: ator.id,
          clientId: instalacao.client_id,
          action: 'rastreador.desinstalar',
          target: instalacao.rastreador_id,
          after: { instalacaoId: instalacao.id },
        },
        client,
      );
      return instalacao;
    });
  }

  /** Superadmin: rastreador passa a ser do cliente (o cliente então escolhe em qual ativo instalar). */
  async vincular(superadminId: string, clientId: string, rastreadorId: string): Promise<RastreadorVinculoEntity> {
    const rastreador = await this.rastreadores.findById(rastreadorId);
    if (!rastreador || rastreador.status === 'desativado') throw new NotFoundException('Rastreador não encontrado');
    try {
      return await withTransaction(this.pool, async (client) => {
        const atual = await this.vinculos.vigentePorRastreador(rastreadorId, client);
        if (atual) {
          throw new ConflictException(
            atual.client_id === clientId ? 'Rastreador já está vinculado a este cliente' : 'Rastreador está vinculado a outro cliente — desvincule antes',
          );
        }
        const vinculo = await this.vinculos.vincular(clientId, rastreadorId, client);
        await this.audit.record(
          { actorType: 'superadmin', actorId: superadminId, clientId, action: 'rastreador.vincular', target: rastreadorId, after: { vinculoId: vinculo.id } },
          client,
        );
        return vinculo;
      });
    } catch (err) {
      if (isPgError(err, PG_FK_VIOLATION)) throw new NotFoundException('Cliente não encontrado');
      if (isPgError(err, PG_EXCLUSION_VIOLATION)) throw new ConflictException('Rastreador está vinculado a outro cliente — desvincule antes');
      throw err;
    }
  }

  /** Superadmin: encerra o vínculo vigente. Instalado num ativo do cliente, exige desinstalar antes. */
  async desvincular(superadminId: string, rastreadorId: string): Promise<RastreadorVinculoEntity> {
    return withTransaction(this.pool, async (client) => {
      const atual = await this.vinculos.vigentePorRastreador(rastreadorId, client);
      if (!atual) throw new NotFoundException('Rastreador não está vinculado a nenhum cliente');
      if (await this.instalacoes.findAtivaPorRastreador(rastreadorId, client)) {
        throw new ConflictException('Rastreador está instalado num ativo do cliente — desinstale antes de desvincular');
      }
      const encerrado = (await this.vinculos.encerrar(atual.client_id, atual.id, client))!;
      await this.audit.record(
        { actorType: 'superadmin', actorId: superadminId, clientId: atual.client_id, action: 'rastreador.desvincular', target: rastreadorId, after: { vinculoId: atual.id } },
        client,
      );
      return encerrado;
    });
  }

  async cadastrarSimCard(
    superadminId: string,
    data: { iccid: string; operadora?: string; numero?: string },
  ): Promise<SimCardEntity> {
    return withTransaction(this.pool, async (client) => {
      const criado = await this.simCards.create(data, client);
      await this.audit.record(
        {
          actorType: 'superadmin',
          actorId: superadminId,
          clientId: null,
          action: 'sim_card.cadastrar',
          target: criado.id,
          after: { iccid: criado.iccid },
        },
        client,
      );
      return criado;
    });
  }

  async vincularSimCard(superadminId: string, simCardId: string, rastreadorId: string): Promise<SimCardEntity> {
    const rastreador = await this.rastreadores.findById(rastreadorId);
    if (!rastreador) throw new NotFoundException('Rastreador não encontrado');

    try {
      return await withTransaction(this.pool, async (client) => {
        const vinculado = await this.simCards.vincular(simCardId, rastreadorId, client);
        if (!vinculado) throw new NotFoundException('Chip não encontrado');
        await this.audit.record(
          {
            actorType: 'superadmin',
            actorId: superadminId,
            clientId: null,
            action: 'sim_card.vincular',
            target: simCardId,
            after: { rastreadorId },
          },
          client,
        );
        return vinculado;
      });
    } catch (err) {
      if (violouUnique(err, UNIQUE.chipPorRastreador)) {
        throw new ConflictException('Rastreador já tem um chip vinculado');
      }
      throw err;
    }
  }

  async desvincularSimCard(superadminId: string, simCardId: string): Promise<SimCardEntity> {
    return withTransaction(this.pool, async (client) => {
      const desvinculado = await this.simCards.desvincular(simCardId, client);
      if (!desvinculado) throw new NotFoundException('Chip não encontrado');
      await this.audit.record(
        {
          actorType: 'superadmin',
          actorId: superadminId,
          clientId: null,
          action: 'sim_card.desvincular',
          target: simCardId,
        },
        client,
      );
      return desvinculado;
    });
  }

  async atualizar(
    superadminId: string,
    rastreadorId: string,
    data: { modeloId?: string; modelo?: string | null; protocolo?: string | null },
  ): Promise<RastreadorEntity> {
    // trocar o modelo do catálogo também atualiza o nome exibido; o identificador já cadastrado não é revalidado
    // (o aparelho continua mandando o mesmo), só o protocolo esperado muda
    const modelo = data.modeloId ? await this.modeloAtivo(data.modeloId) : null;
    const dados = modelo ? { ...data, modelo: `${modelo.fabricante} ${modelo.nome}` } : data;
    return withTransaction(this.pool, async (client) => {
      const antes = await this.rastreadores.findById(rastreadorId, client);
      if (!antes) throw new NotFoundException('Rastreador não encontrado');
      const depois = await this.rastreadores.updateDados(rastreadorId, dados, client);
      await this.audit.record(
        {
          actorType: 'superadmin',
          actorId: superadminId,
          clientId: null,
          action: 'rastreador.atualizar',
          target: rastreadorId,
          before: { modelo: antes.modelo, modeloId: antes.modelo_id, protocolo: antes.protocolo },
          after: { modelo: depois.modelo, modeloId: depois.modelo_id, protocolo: depois.protocolo },
        },
        client,
      );
      return depois;
    });
  }

  /**
   * Baixa do inventário (equipamento perdido, defeituoso, devolvido). Só sem instalação vigente — senão o
   * ativo do cliente perderia o rastreamento sem que ninguém tenha desinstalado. O índice único de IMEI
   * ignora `desativado`, então o mesmo IMEI pode ser recadastrado depois.
   */
  async desativar(superadminId: string, rastreadorId: string): Promise<RastreadorEntity> {
    return withTransaction(this.pool, async (client) => {
      const rastreador = await this.rastreadores.findById(rastreadorId, client);
      if (!rastreador) throw new NotFoundException('Rastreador não encontrado');
      if (await this.instalacoes.findAtivaPorRastreador(rastreadorId, client)) {
        throw new ConflictException('Rastreador tem instalação vigente — desinstale antes de desativar');
      }
      if (await this.vinculos.vigentePorRastreador(rastreadorId, client)) {
        throw new ConflictException('Rastreador está vinculado a um cliente — desvincule antes de desativar');
      }
      const desativado = (await this.rastreadores.updateStatus(rastreadorId, 'desativado', client))!;
      await this.audit.record(
        {
          actorType: 'superadmin',
          actorId: superadminId,
          clientId: null,
          action: 'rastreador.desativar',
          target: rastreadorId,
          before: { status: rastreador.status },
        },
        client,
      );
      return desativado;
    });
  }

  private async modeloAtivo(modeloId: unknown) {
    if (typeof modeloId !== 'string' || !modeloId) throw new BadRequestException('Escolha o modelo do rastreador');
    const modelo = await this.modelos.findById(parseUuid('modeloId', modeloId));
    if (!modelo) throw new NotFoundException('Modelo de rastreador não encontrado');
    if (!modelo.ativo) throw new BadRequestException(`O modelo ${modelo.fabricante} ${modelo.nome} está desativado no catálogo`);
    return modelo;
  }

  private async provisionarNoTraccar(imei: string, modelo?: string): Promise<string | null> {
    const config = this.traccar.config();
    if (!config) {
      this.logger.warn(`TRACCAR_URL não configurado — rastreador IMEI ${imei} cadastrado sem device no Traccar`);
      return null;
    }
    try {
      const device =
        (await this.traccar.findDeviceByUniqueId(config, imei)) ??
        (await this.traccar.createDevice(config, { name: imei, uniqueId: imei, ...(modelo ? { model: modelo } : {}) }));
      this.logger.log(`Rastreador IMEI ${imei} provisionado no Traccar (device ${device.id})`);
      return String(device.id);
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`Falha ao provisionar IMEI ${imei} no Traccar: ${msg}`);
      // device com esse uniqueId já existe no Traccar, mas fora do alcance do usuário da API (criado por outra conta):
      // a busca não o vê e a criação esbarra no índice único — repetir não resolve
      if (/ 400 .*(duplicate|unique|já existe)/i.test(msg)) {
        throw new ConflictException(
          `Já existe no Traccar um aparelho com o identificador ${imei}, criado por outra conta. Apague-o no painel do Traccar (ou dê acesso a ele ao usuário da API) e cadastre de novo.`,
        );
      }
      throw new ServiceUnavailableException('Não foi possível registrar o rastreador no Traccar; tente novamente');
    }
  }

  async historicoInstalacoes(rastreadorId: string): Promise<InstalacaoEntity[]> {
    const { rows } = await this.pool.query<InstalacaoEntity>(
      'select * from instalacoes where rastreador_id = $1 order by instalado_em desc',
      [rastreadorId],
    );
    return rows;
  }
}
