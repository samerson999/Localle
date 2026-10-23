import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import { AssetsRepository } from '../assets/assets.repository';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { PG_POOL } from '../db/pg-pool.provider';
import { withTransaction } from '../db/with-transaction';
import type { InstalacaoEntity } from './instalacao.entity';
import { InstalacoesRepository } from './instalacoes.repository';
import type { RastreadorEntity } from './rastreador.entity';
import { RastreadoresRepository } from './rastreadores.repository';
import type { SimCardEntity } from './sim-card.entity';
import { SimCardsRepository } from './sim-cards.repository';

const PG_EXCLUSION_VIOLATION = '23P01';
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Orquestra o domínio de rastreadores/SIM cards (inventário da Locale, cedido em comodato) e o vínculo
 * com o ativo do cliente (`instalacoes`). Mutação + auditoria sempre na mesma transação, mesmo padrão de
 * `SuperadminClientsService` — quem chama é sempre o superadmin, nunca o cliente (rastreador e chip não
 * são recurso do cliente, só o vínculo vigente é visível para ele via monitoramento/relatórios).
 */
@Injectable()
export class RastreadoresService {
  constructor(
    private readonly rastreadores: RastreadoresRepository,
    private readonly simCards: SimCardsRepository,
    private readonly instalacoes: InstalacoesRepository,
    private readonly assets: AssetsRepository,
    private readonly audit: AuditLogRepository,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async cadastrarRastreador(
    superadminId: string,
    data: { imei: string; traccarDeviceId?: string; modelo?: string; protocolo?: string },
  ): Promise<RastreadorEntity> {
    return withTransaction(this.pool, async (client) => {
      const criado = await this.rastreadores.create(
        { imei: data.imei, traccarDeviceId: data.traccarDeviceId, modelo: data.modelo, protocolo: data.protocolo },
        client,
      );
      await this.audit.record(
        {
          actorType: 'superadmin',
          actorId: superadminId,
          clientId: null,
          action: 'rastreador.cadastrar',
          target: criado.id,
          after: { imei: criado.imei },
        },
        client,
      );
      return criado;
    });
  }

  /** Vínculo rastreador × ativo de um cliente. `clientId` explícito, nunca inferido. */
  async instalar(
    superadminId: string,
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
    if (!rastreador) throw new NotFoundException('Rastreador não encontrado');

    const asset = await this.assets.findOne(clientId, { id: data.assetId });
    if (!asset) throw new NotFoundException('Ativo não encontrado para este cliente');

    try {
      return await withTransaction(this.pool, async (client) => {
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
            actorType: 'superadmin',
            actorId: superadminId,
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

  async desinstalar(superadminId: string, instalacaoId: string): Promise<InstalacaoEntity> {
    return withTransaction(this.pool, async (client) => {
      const instalacao = await this.instalacoes.desinstalar(instalacaoId, new Date(), client);
      if (!instalacao) throw new NotFoundException('Instalação vigente não encontrada');
      await this.rastreadores.updateStatus(instalacao.rastreador_id, 'cadastrado', client);
      await this.audit.record(
        {
          actorType: 'superadmin',
          actorId: superadminId,
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
      if (isPgError(err, PG_UNIQUE_VIOLATION)) {
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

  async historicoInstalacoes(rastreadorId: string): Promise<InstalacaoEntity[]> {
    const { rows } = await this.pool.query<InstalacaoEntity>(
      'select * from instalacoes where rastreador_id = $1 order by instalado_em desc',
      [rastreadorId],
    );
    return rows;
  }
}

function isPgError(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === code;
}
