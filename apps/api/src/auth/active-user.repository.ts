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
    return (await this.situacao(userId, tokenIat)) !== null;
  }

  /**
   * Mesma checagem de `isActive`, devolvendo também se a pessoa vê só parte da frota — o `AuthGuard` faz uma consulta só
   * para quem vê tudo (o caso comum) e a segunda (`ativosVisiveis`) só para quem é restrito. Admin nunca é restrito.
   */
  async situacao(userId: string, tokenIat: number): Promise<{ escopoRestrito: boolean } | null> {
    const { rows } = await this.pool.query<{ escopo_restrito: boolean }>(
      `select u.escopo_restrito and u.role <> 'admin' as escopo_restrito from users u
         left join contratos c on c.client_id = u.client_id
        where u.id = $1 and u.desativado_em is null and u.excluido_em is null and (c.status is null or c.status not in ('suspenso', 'cancelado'))
          and to_timestamp($2) + ${TOLERANCIA_RELOGIO} >= date_trunc('second', u.senha_alterada_em)`,
      [userId, tokenIat],
    );
    return rows[0] ? { escopoRestrito: rows[0].escopo_restrito } : null;
  }

  /**
   * Veículos que um usuário restrito vê (migration 1794490000000): está num grupo marcado, OU numa operação marcada,
   * OU — com "sem grupo/operação" — não está em grupo nenhum e não tem operação. Inclui ativos inativos (o
   * histórico deles continua do escopo de quem os via).
   */
  async ativosVisiveis(clientId: string, userId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ id: string }>(
      `select a.id from assets a join users u on u.id = $2 and u.client_id = a.client_id
        where a.client_id = $1 and (
          exists (select 1 from asset_group_members m join user_escopo_grupos ug on ug.group_id = m.group_id and ug.user_id = u.id where m.asset_id = a.id)
          or exists (select 1 from user_escopo_operacoes uo where uo.user_id = u.id and uo.operacao_id = a.operacao_id)
          or (u.escopo_sem_grupo and a.operacao_id is null and not exists (select 1 from asset_group_members m where m.asset_id = a.id)))`,
      [clientId, userId],
    );
    return rows.map((r) => r.id);
  }

  /** Para o login: o cliente está com o contrato suspenso/cancelado? */
  async isClientBlocked(clientId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `select 1 from contratos where client_id = $1 and status in ('suspenso', 'cancelado')`,
      [clientId],
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * O que o cliente acessa, pela versão vigente (a mais recente) do contrato. Sem contrato (implantação), tudo
   * liberado — `modules: null` —, como no bloqueio por situação acima (decidido em 14/11/2026).
   */
  async acessosDoCliente(clientId: string): Promise<{ modules: string[] | null; blockedPages: string[] }> {
    const { rows } = await this.pool.query<{ modulos: string[]; paginas_bloqueadas: string[] }>(
      `select v.modulos, v.paginas_bloqueadas from contrato_versoes v
        where v.client_id = $1 order by v.criado_em desc, v.id desc limit 1`,
      [clientId],
    );
    return rows[0] ? { modules: rows[0].modulos, blockedPages: rows[0].paginas_bloqueadas } : { modules: null, blockedPages: [] };
  }

  /**
   * E-mail e usuário da própria conta, para o perfil (Minha conta). `email` nulo = nasceu por nome de usuário e ainda não
   * confirmou um e-mail — o front pede no primeiro acesso.
   */
  async conta(userId: string): Promise<{ email: string | null; usuario: string | null }> {
    const { rows } = await this.pool.query<{ email: string | null; username: string | null }>('select email, username from users where id = $1', [userId]);
    return { email: rows[0]?.email ?? null, usuario: rows[0]?.username ?? null };
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
