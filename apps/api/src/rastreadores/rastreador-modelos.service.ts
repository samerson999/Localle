import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { UNIQUE, violouUnique } from '../db/pg-errors';
import type { RastreadorModeloEntity } from './rastreador-modelo.entity';
import { type ModeloDados, RastreadorModelosRepository } from './rastreador-modelos.repository';

/** Catálogo de modelos (docs na migration 1793110000000): só superadmin; toda alteração vai para a auditoria. */
@Injectable()
export class RastreadorModelosService {
  private readonly logger = new Logger(RastreadorModelosService.name);

  constructor(
    private readonly repo: RastreadorModelosRepository,
    private readonly audit: AuditLogRepository,
  ) {}

  listar() {
    return this.repo.listar();
  }

  async criar(superadminId: string, d: ModeloDados): Promise<RastreadorModeloEntity> {
    let criado: RastreadorModeloEntity;
    try {
      criado = await this.repo.criar(d);
    } catch (err) {
      if (violouUnique(err, UNIQUE.modeloRastreador)) throw new ConflictException(`Já existe o modelo ${d.fabricante} ${d.nome}`);
      throw err;
    }
    await this.audit.record({ actorType: 'superadmin', actorId: superadminId, clientId: null, action: 'rastreador_modelo.criar', target: criado.id, after: d });
    this.logger.log(`Modelo de rastreador ${criado.fabricante} ${criado.nome} criado (${criado.protocolo}:${criado.porta}) por ${superadminId}`);
    return criado;
  }

  async atualizar(superadminId: string, id: string, d: Partial<ModeloDados & { ativo: boolean }>): Promise<RastreadorModeloEntity> {
    const antes = await this.repo.findById(id);
    if (!antes) throw new NotFoundException('Modelo não encontrado');
    let depois: RastreadorModeloEntity | null;
    try {
      depois = await this.repo.atualizar(id, d);
    } catch (err) {
      if (violouUnique(err, UNIQUE.modeloRastreador)) throw new ConflictException('Já existe outro modelo com esse fabricante e nome');
      throw err;
    }
    const campos = Object.keys(d) as (keyof typeof d)[];
    await this.audit.record({
      actorType: 'superadmin', actorId: superadminId, clientId: null, action: 'rastreador_modelo.atualizar', target: id,
      before: Object.fromEntries(campos.map((k) => [k, (antes as any)[k]])), after: d,
    });
    return depois!;
  }
}
