import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import { UNIQUE, violouUnique } from '../db/pg-errors';
import { changedCommercial } from '@localle/shared/contratos';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { ClientsRepository } from '../clients/clients.repository';
import { PG_POOL } from '../db/pg-pool.provider';
import { withTransaction } from '../db/with-transaction';
import { ContratosRepository, type ContratoRow } from './contratos.repository';
import type { ContratoInput } from './dto/parse-contrato';


/** Contrato do cliente: mutação + auditoria na mesma transação, como as demais ações de superadmin. */
@Injectable()
export class ContratosService {
  private readonly logger = new Logger(ContratosService.name);

  constructor(
    private readonly repo: ContratosRepository,
    private readonly clients: ClientsRepository,
    private readonly audit: AuditLogRepository,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async criar(superadminId: string, clientId: string, input: ContratoInput): Promise<ContratoRow> {
    if (!(await this.clients.findById(clientId))) throw new NotFoundException('Cliente não encontrado');
    try {
      const contrato = await withTransaction(this.pool, async (tx) => {
        const id = await this.repo.insertContrato({ clientId, status: input.status, inicioEm: input.inicioEm, fimEm: input.fimEm }, tx);
        await this.repo.insertVersao(id, clientId, input.terms, superadminId, tx);
        await this.audit.record(
          { actorType: 'superadmin', actorId: superadminId, clientId, action: 'contrato.create', target: id, after: input },
          tx,
        );
        return (await this.repo.findById(id, tx))!;
      });
      this.logger.log(`contrato criado contrato_id=${contrato.id} client_id=${clientId} status=${input.status}`);
      return contrato;
    } catch (err) {
      if (violouUnique(err, UNIQUE.contratoPorCliente)) throw new ConflictException('Cliente já tem contrato');
      throw err;
    }
  }

  /** Termos comerciais diferentes gravam versão nova; situação e vigência só atualizam o contrato. */
  async atualizar(superadminId: string, contratoId: string, input: ContratoInput): Promise<ContratoRow> {
    const atual = await this.repo.findById(contratoId);
    if (!atual) throw new NotFoundException('Contrato não encontrado');
    const novaVersao = changedCommercial(atual.versaoAtual, input.terms);
    const contrato = await withTransaction(this.pool, async (tx) => {
      await this.repo.updateMeta(contratoId, { status: input.status, fimEm: input.fimEm }, tx);
      if (novaVersao) await this.repo.insertVersao(contratoId, atual.clientId, input.terms, superadminId, tx);
      await this.audit.record(
        {
          actorType: 'superadmin',
          actorId: superadminId,
          clientId: atual.clientId,
          action: novaVersao ? 'contrato.nova_versao' : 'contrato.update',
          target: contratoId,
          before: { status: atual.status, fimEm: atual.fimEm, ...(novaVersao ? { terms: atual.versaoAtual } : {}) },
          after: { status: input.status, fimEm: input.fimEm, ...(novaVersao ? { terms: input.terms } : {}) },
        },
        tx,
      );
      return (await this.repo.findById(contratoId, tx))!;
    });
    if (atual.status !== input.status) {
      this.logger.log(`contrato_id=${contratoId} client_id=${atual.clientId} status ${atual.status} → ${input.status}`);
    }
    return contrato;
  }
}
