import {
  BadGatewayException,
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
import type { Queryable } from '../db/queryable';
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
import { isPgError, PG_EXCLUSION_VIOLATION, PG_FOREIGN_KEY_VIOLATION, UNIQUE, violouUnique } from '../db/pg-errors';
import { nomeDoModelo, normalizarIdentificador, validarIdentificador } from '@localle/shared/rastreadorModelos';
import { parseUuid } from '../common/parse-uuid';
import { RastreadorModelosRepository } from './rastreador-modelos.repository';
import { type PreviaModelo, TraccarAparelhosService } from './traccar-aparelhos.service';

/** Quem executa: superadmin (Painel da Locale) ou usuário do próprio cliente (Gestão de ativos). */
export interface Ator {
  type: 'superadmin' | 'user';
  id: string;
}
const PG_FK_VIOLATION = '23503';

/** Natureza do ativo vem da ficha (`dados.kind`); sem ela, o front trata como veículo. Todo o resto conta como objeto. */
const ehVeiculo = (asset: { dados: Record<string, unknown> | null }) => (asset.dados?.kind ?? 'veiculo') === 'veiculo';


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
    private readonly aparelhos: TraccarAparelhosService,
  ) {}

  /**
   * Cadastro-primeiro (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 1.5): sem `traccarDeviceId` informado, o
   * device é criado no Traccar aqui, dentro da transação — se o Traccar falhar, o cadastro não é
   * gravado (um rastreador sem device no Traccar nunca receberia posição). Reaproveita device já
   * existente com o mesmo IMEI, então repetir o cadastro depois de uma falha é seguro.
   */
  async cadastrarRastreador(
    superadminId: string,
    data: { imei: string; modeloId?: string; aparelhoId?: number; traccarDeviceId?: string },
  ): Promise<RastreadorEntity> {
    // modelo obrigatório (catálogo, decisão de 28/10/2026): o identificador é validado pelo tipo que o modelo manda
    const alvo = await this.modeloEscolhido(data);
    if (typeof data.imei !== 'string') throw new BadRequestException('Informe o identificador do aparelho');
    const imei = normalizarIdentificador(data.imei);
    const invalido = validarIdentificador(alvo.tipo_identificador, imei);
    if (invalido) throw new BadRequestException(invalido);
    const nomeModelo = nomeDoModelo(alvo);
    return withTransaction(this.pool, async (client) => {
      // aparelho da lista do Traccar sem modelo ainda: o modelo nasce aqui e some junto se o cadastro falhar
      const modelo = await this.aparelhos.criarModelo(superadminId, alvo, client);
      let criado: RastreadorEntity;
      try {
        criado = await this.rastreadores.create({ imei, modelo: nomeModelo, modeloId: modelo.id }, client);
      } catch (err) {
        if (violouUnique(err, UNIQUE.rastreadorImeiAtivo)) throw new ConflictException(`Já existe um rastreador ativo com o identificador ${imei}`);
        throw err;
      }
      // no Traccar vai só o nome: o decodificador compara o modelo do device (ex.: "VL100" no gt06), sem o fabricante
      const deviceId = data.traccarDeviceId ?? (await this.provisionarNoTraccar(criado.imei, alvo.nome));
      let deviceLiberadoDe: string | null = null;
      if (deviceId !== null) {
        // recadastro do mesmo IMEI depois de desativar: o device do Traccar ainda estava no rastreador desativado
        const { liberadoDe, ocupadoPor } = await this.rastreadores.liberarDevice(deviceId, criado.id, client);
        if (ocupadoPor) throw new ConflictException(`O device ${deviceId} do Traccar já está ligado ao rastreador ${ocupadoPor.imei}, ainda ativo na plataforma`);
        if (liberadoDe) {
          deviceLiberadoDe = liberadoDe;
          this.logger.log(`Device ${deviceId} do Traccar passou do rastreador desativado ${liberadoDe} para o novo ${criado.id} (IMEI ${imei})`);
        }
        criado = await this.rastreadores.setTraccarDeviceId(criado.id, deviceId, client);
      }
      await this.audit.record(
        {
          actorType: 'superadmin',
          actorId: superadminId,
          clientId: null,
          action: 'rastreador.cadastrar',
          target: criado.id,
          after: { imei: criado.imei, modeloId: modelo.id, modelo: nomeModelo, ...(deviceLiberadoDe ? { deviceDoRastreadorDesativado: deviceLiberadoDe } : {}) },
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
    const papel = data.papel ?? 'principal';
    if (papel === 'principal' && ehVeiculo(asset) && (await this.ehTag(rastreador.modelo_id))) {
      throw new BadRequestException('Em veículo, a tag só pode ser instalada como backup');
    }

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
            papel,
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
            after: { assetId: data.assetId, instalacaoId: instalacao.id, papel },
          },
          client,
        );
        return instalacao;
      });
    } catch (err) {
      if (isPgError(err, PG_EXCLUSION_VIOLATION)) {
        throw new ConflictException(
          papel === 'backup'
            ? 'Este ativo já tem um backup, ou o rastreador já está instalado em outro ativo'
            : 'Este ativo já tem um rastreador principal, ou o rastreador já está instalado em outro ativo',
        );
      }
      throw err;
    }
  }

  /**
   * Troca principal e backup do ativo. Fecha as duas instalações vigentes agora e reabre com os papéis trocados, no
   * mesmo instante e na mesma transação: o histórico de `instalacoes` continua dizendo quem era o principal em cada
   * momento (a ingestão resolve o papel pelo instante do dado). O mapa volta com a próxima posição do novo principal.
   */
  async trocarPrincipal(ator: Ator, clientId: string, assetId: string): Promise<InstalacaoEntity[]> {
    const asset = await this.assets.findOne(clientId, { id: assetId });
    if (!asset) throw new NotFoundException('Ativo não encontrado para este cliente');
    return withTransaction(this.pool, async (client) => {
      const { rows: vigentes } = await client.query<InstalacaoEntity & { modelo_id: string | null }>(
        `select i.*, r.modelo_id from instalacoes i join rastreadores r on r.id = i.rastreador_id
          where i.client_id = $1 and i.asset_id = $2 and i.desinstalado_em is null and i.papel in ('principal', 'backup')
          for update of i`,
        [clientId, assetId],
      );
      const principal = vigentes.find((i) => i.papel === 'principal');
      const backup = vigentes.find((i) => i.papel === 'backup');
      if (!principal || !backup) throw new ConflictException('O ativo precisa ter um principal e um backup para trocar');
      if (ehVeiculo(asset) && (await this.ehTag(backup.modelo_id, client))) {
        throw new BadRequestException('Em veículo, a tag só pode ser backup');
      }
      const agora = new Date();
      for (const i of vigentes) await this.instalacoes.desinstalar(i.id, agora, client);
      const novas: InstalacaoEntity[] = [];
      for (const [i, papel] of [[backup, 'principal'], [principal, 'backup']] as const) {
        novas.push(
          await this.instalacoes.instalar(
            clientId,
            { rastreadorId: i.rastreador_id, assetId, papel, instaladoEm: agora, tecnico: i.tecnico, kmInicial: i.km_inicial, foto: i.foto },
            client,
          ),
        );
      }
      await this.audit.record(
        {
          actorType: ator.type, actorId: ator.id, clientId, action: 'rastreador.trocar_principal', target: assetId,
          before: { principal: principal.rastreador_id, backup: backup.rastreador_id },
          after: { principal: backup.rastreador_id, backup: principal.rastreador_id },
        },
        client,
      );
      this.logger.log(`asset_id=${assetId} client_id=${clientId} principal trocado: ${principal.rastreador_id} → ${backup.rastreador_id}`);
      return novas;
    });
  }

  private async ehTag(modeloId: string | null, executor?: Queryable): Promise<boolean> {
    if (!modeloId) return false;
    return (await this.modelos.findById(modeloId, executor))?.tipo_aparelho === 'tag';
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
    data: { modeloId?: string; aparelhoId?: number; modelo?: string | null; protocolo?: string | null },
  ): Promise<RastreadorEntity> {
    // trocar o modelo do catálogo também atualiza o nome exibido; o identificador já cadastrado não é revalidado
    // (o aparelho continua mandando o mesmo), só o protocolo esperado muda
    const { aparelhoId, ...campos } = data;
    const alvo = data.modeloId !== undefined || aparelhoId !== undefined ? await this.modeloEscolhido(data) : null;
    return withTransaction(this.pool, async (client) => {
      const antes = await this.rastreadores.findById(rastreadorId, client);
      if (!antes) throw new NotFoundException('Rastreador não encontrado');
      const modelo = alvo ? await this.aparelhos.criarModelo(superadminId, alvo, client) : null;
      const dados = modelo ? { ...campos, modeloId: modelo.id, modelo: nomeDoModelo(modelo) } : campos;
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
   * Exclusão de vez, para cadastro errado: em estoque ou desativado (sem instalação nem vínculo vigentes), com o
   * histórico junto — posições, eventos, comandos, instalações e vínculos encerrados. O que foi apagado fica contado
   * na auditoria. Apaga também o device no Traccar, por último e dentro da transação: Traccar fora do ar desfaz a
   * exclusão (o rastreador continua, nada fica pela metade do lado da plataforma). O chip vinculado volta a ficar livre.
   */
  async excluir(superadminId: string, rastreadorId: string): Promise<void> {
    const { imei, apagados } = await withTransaction(this.pool, async (client) => {
      // o lock segura a ingestão (o insert de posição espera pela FK) até a exclusão terminar
      const { rows } = await client.query<RastreadorEntity>('select * from rastreadores where id = $1 for update', [rastreadorId]);
      const r = rows[0];
      if (!r) throw new NotFoundException('Rastreador não encontrado');
      if (await this.instalacoes.findAtivaPorRastreador(rastreadorId, client)) {
        throw new ConflictException('Rastreador tem instalação vigente — desinstale antes de excluir');
      }
      if (await this.vinculos.vigentePorRastreador(rastreadorId, client)) {
        throw new ConflictException('Rastreador está vinculado a um cliente — desvincule antes de excluir');
      }
      const chip = await this.simCards.findByRastreador(rastreadorId, client);
      let apagados: Record<string, number>;
      try {
        apagados = await this.rastreadores.excluirComHistorico(rastreadorId, client);
      } catch (err) {
        // referência nova ao rastreador (tabela criada depois desta regra): recusa em vez de 500
        if (isPgError(err, PG_FOREIGN_KEY_VIOLATION)) {
          this.logger.warn(`Exclusão do rastreador ${rastreadorId} barrada por referência não prevista: ${(err as Error).message}`);
          throw new ConflictException(`O rastreador ${r.imei} tem histórico que a exclusão ainda não sabe apagar. Use Desativar.`);
        }
        throw err;
      }
      await this.audit.record(
        {
          actorType: 'superadmin', actorId: superadminId, clientId: null, action: 'rastreador.excluir', target: rastreadorId,
          before: { imei: r.imei, modeloId: r.modelo_id, modelo: r.modelo, traccarDeviceId: r.traccar_device_id, status: r.status, simCardId: chip?.id ?? null, apagados },
        },
        client,
      );
      if (r.traccar_device_id) await this.apagarNoTraccar(r.imei, Number(r.traccar_device_id));
      return { imei: r.imei, apagados };
    });
    this.logger.log(`Rastreador ${rastreadorId} (IMEI ${imei}) excluído por ${superadminId}; histórico apagado: ${JSON.stringify(apagados)}`);
  }

  private async apagarNoTraccar(imei: string, deviceId: number): Promise<void> {
    const config = this.traccar.config();
    if (!config) {
      this.logger.warn(`TRACCAR_URL não configurado — device ${deviceId} do rastreador IMEI ${imei} não foi apagado no Traccar`);
      return;
    }
    try {
      await this.traccar.deleteDevice(config, deviceId);
    } catch (err) {
      this.logger.error(`Exclusão do rastreador IMEI ${imei} desfeita: o Traccar não apagou o device ${deviceId}: ${(err as Error).message}`);
      throw new BadGatewayException('O Traccar não respondeu ao apagar o device. Nada foi excluído; tente de novo em instantes.');
    }
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

  /** Modelo do catálogo (`modeloId`) ou aparelho da lista do Traccar (`aparelhoId`, prévia: ainda pode não existir). */
  private async modeloEscolhido(data: { modeloId?: unknown; aparelhoId?: unknown }): Promise<PreviaModelo> {
    if (data.aparelhoId === undefined) return this.modeloAtivo(data.modeloId);
    if (data.modeloId !== undefined) throw new BadRequestException('Informe "modeloId" ou "aparelhoId", não os dois');
    if (typeof data.aparelhoId !== 'number' || !Number.isSafeInteger(data.aparelhoId) || data.aparelhoId <= 0) {
      throw new BadRequestException('"aparelhoId" precisa ser o id de um aparelho da lista do Traccar');
    }
    return this.aparelhos.previa(data.aparelhoId);
  }

  private async modeloAtivo(modeloId: unknown) {
    if (typeof modeloId !== 'string' || !modeloId) throw new BadRequestException('Escolha o modelo do rastreador');
    const modelo = await this.modelos.findById(parseUuid('modeloId', modeloId));
    if (!modelo) throw new NotFoundException('Modelo de rastreador não encontrado');
    if (!modelo.ativo) throw new BadRequestException(`O modelo ${nomeDoModelo(modelo)} está desativado no catálogo`);
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
