import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';

/** Folga entre o relógio da API (`iat` do token) e o do banco (`senha_alterada_em`) — ver `isActive`. */
const TOLERANCIA_RELOGIO = "interval '1 second'";

/**
 * Consulta mínima do `AuthGuard`: o usuário do token ainda existe e não foi desativado? Fica aqui (e não
 * em `UsersRepository`) para `AuthGuardsModule` continuar sem importar `UsersModule` — ver o achado #7 em
 * `auth-guards.module.ts`. Busca por PK, uma por requisição autenticada.
 */
@Injectable()
export class ActiveUserRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Ativo = não desativado e o contrato do cliente não está suspenso/cancelado (decidido em 24/10/2026: a
   * suspensão corta o acesso na hora, inclusive de token já emitido). Cliente sem contrato (implantação)
   * continua acessando. Mesma consulta por PK de antes, com um join a mais pelo `client_id` (unique).
   */
  /**
   * `tokenIat`: segundo da emissão do token (JWT `iat`, truncado pelo próprio formato — sem fração).
   * Sessão persistente (docs/PLANO-APK-TWA.md § 2): token emitido antes da última troca de senha deixa de
   * ser aceito na hora, mesmo que ainda não tenha expirado nem tenha sido renovado — sem isso, trocar a
   * senha não derrubaria uma sessão de dias já aberta em outro aparelho. `date_trunc('second', ...)` nos
   * dois lados: sem isso, um login no MESMO segundo (em wall-clock) da troca de senha falharia essa
   * checagem por causa da fração de segundo que só `senha_alterada_em` carrega — o login não pode ter
   * emitido um token anterior à senha que ele acabou de validar, então o mesmo segundo é sempre seguro.
   * Tolerância de 1 s (`TOLERANCIA_RELOGIO`): o `iat` sai do relógio da API e `senha_alterada_em` do relógio do banco.
   * Medido em 11/11/2026 no Docker do Windows, sob carga: o banco chegou a 66 ms à frente da API — um login logo após a
   * troca, na virada do segundo, era recusado. O custo é um token emitido até 1 s antes da troca continuar valendo.
   */
  async isActive(userId: string, tokenIat: number): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `select 1 from users u
         left join contratos c on c.client_id = u.client_id
        where u.id = $1 and u.desativado_em is null and (c.status is null or c.status not in ('suspenso', 'cancelado'))
          and to_timestamp($2) + ${TOLERANCIA_RELOGIO} >= date_trunc('second', u.senha_alterada_em)`,
      [userId, tokenIat],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Para o login: o cliente está com o contrato suspenso/cancelado? */
  async isClientBlocked(clientId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `select 1 from contratos where client_id = $1 and status in ('suspenso', 'cancelado')`,
      [clientId],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Superadmin removido perde o acesso na hora, não só quando o token de 8h expirar. */
  async isSuperadmin(id: string, tokenIat: number): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `select 1 from superadmins
        where id = $1 and desativado_em is null and to_timestamp($2) + ${TOLERANCIA_RELOGIO} >= date_trunc('second', senha_alterada_em)`,
      [id, tokenIat],
    );
    return (rowCount ?? 0) > 0;
  }
}
