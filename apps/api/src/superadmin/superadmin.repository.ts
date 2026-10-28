import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import type { Queryable } from '../db/queryable';
import type { SuperadminEntity } from './superadmin.entity';

export interface MembroEquipe {
  id: string;
  email: string;
  created_at: Date;
  desativado_em: Date | null;
  /** Convidado que ainda não definiu a senha. */
  pendente: boolean;
}

/** Tabela própria, sem `client_id` — superadmin está fora da hierarquia de clientes de propósito. */
@Injectable()
export class SuperadminRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<SuperadminEntity | null> {
    const { rows } = await this.pool.query<SuperadminEntity>('select * from superadmins where email = $1', [email]);
    return rows[0] ?? null;
  }

  async findById(id: string, executor: Queryable = this.pool): Promise<SuperadminEntity | null> {
    const { rows } = await executor.query<SuperadminEntity>('select * from superadmins where id = $1', [id]);
    return rows[0] ?? null;
  }

  /** Equipe da Locale para o painel — nunca devolve `password_hash`. */
  async findAll(): Promise<MembroEquipe[]> {
    const { rows } = await this.pool.query<MembroEquipe>(
      'select id, email, created_at, desativado_em, password_hash is null as pendente from superadmins order by email',
    );
    return rows;
  }

  async criarConvidado(email: string, executor: Queryable = this.pool): Promise<SuperadminEntity> {
    const { rows } = await executor.query<SuperadminEntity>(
      'insert into superadmins (email, password_hash) values ($1, null) returning *',
      [email],
    );
    return rows[0];
  }

  async setDesativadoEm(id: string, quando: Date | null, executor: Queryable = this.pool): Promise<SuperadminEntity | null> {
    const { rows } = await executor.query<SuperadminEntity>(
      'update superadmins set desativado_em = $2, updated_at = now() where id = $1 returning *',
      [id, quando],
    );
    return rows[0] ?? null;
  }

  async definirSenha(id: string, passwordHash: string, executor: Queryable = this.pool): Promise<void> {
    await executor.query('update superadmins set password_hash = $2, updated_at = now() where id = $1', [id, passwordHash]);
  }

  /** Revoga convites ainda abertos do mesmo superadmin e emite um novo (só o hash do token é gravado). */
  async emitirConvite(
    executor: Queryable,
    data: { superadminId: string; tokenHash: string; validadeH: number; criadoPor: string },
  ): Promise<void> {
    await executor.query(
      'update superadmin_convites set revogado_em = now() where superadmin_id = $1 and usado_em is null and revogado_em is null',
      [data.superadminId],
    );
    await executor.query(
      `insert into superadmin_convites (superadmin_id, token_hash, expira_em, criado_por)
       values ($1, $2, now() + make_interval(hours => $3), $4)`,
      [data.superadminId, data.tokenHash, data.validadeH, data.criadoPor],
    );
  }

  /** Convite válido (não usado, não revogado, não expirado) de superadmin ativo. */
  async conviteAberto(executor: Queryable, tokenHash: string, lock = false): Promise<{ id: string; superadmin_id: string; email: string } | null> {
    const { rows } = await executor.query<{ id: string; superadmin_id: string; email: string }>(
      `select cv.id, cv.superadmin_id, s.email
         from superadmin_convites cv
         join superadmins s on s.id = cv.superadmin_id
        where cv.token_hash = $1 and cv.usado_em is null and cv.revogado_em is null and cv.expira_em > now()
          and s.desativado_em is null
        ${lock ? 'for update of cv' : ''}`,
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  async marcarConviteUsado(executor: Queryable, id: string): Promise<void> {
    await executor.query('update superadmin_convites set usado_em = now() where id = $1', [id]);
  }
}
