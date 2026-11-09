import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { BaseRepository } from '../db/base.repository';
import { PG_POOL } from '../db/pg-pool.provider';
import { validarEndpointPush } from './endpoint-push';

export interface AparelhoRow {
  id: string;
  client_id: string;
  user_id: string;
  canal: 'webpush';
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
  user_agent: string | null;
  criado_em: Date;
  ultimo_envio_em: Date | null;
  falhas: number;
}

export interface RegistrarAparelho {
  userId: string;
  canal: 'webpush';
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
  userAgent: string | null;
}

export interface PreferenciaRow {
  client_id: string;
  user_id: string;
  tipo: string;
  ativo: boolean;
}

/** `notificacao_aparelhos`: uma assinatura de push por aparelho/navegador (endpoint é único). */
@Injectable()
export class NotificacaoAparelhosRepository extends BaseRepository<AparelhoRow> {
  protected readonly table = 'notificacao_aparelhos';

  /**
   * `endpoint` é único no navegador, não por cliente — reassinar no mesmo aparelho (troca de chaves,
   * reinstalação) atualiza a linha em vez de duplicar. Sempre realinha `client_id`/`user_id` ao dono atual.
   */
  async registrar(clientId: string, a: RegistrarAparelho): Promise<AparelhoRow> {
    // 2ª camada (achado do security-review de 09/11/2026, SSRF): o controller já valida, mas o repository
    // nunca deve confiar que todo chamador validou — aqui também recusa host que não é push de navegador.
    const motivo = validarEndpointPush(a.endpoint);
    if (motivo) throw new BadRequestException(motivo);
    const { rows } = await this.pool.query<AparelhoRow>(
      `insert into notificacao_aparelhos (client_id, user_id, canal, endpoint, p256dh, auth, user_agent)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (endpoint) do update set
         client_id = excluded.client_id, user_id = excluded.user_id, p256dh = excluded.p256dh,
         auth = excluded.auth, user_agent = excluded.user_agent, falhas = 0
       returning *`,
      [clientId, a.userId, a.canal, a.endpoint, a.p256dh, a.auth, a.userAgent],
    );
    return rows[0];
  }

  /** Só remove se o endpoint pertencer a este cliente — não deixa um usuário apagar assinatura alheia. */
  async remover(clientId: string, endpoint: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `delete from notificacao_aparelhos where client_id = $1 and endpoint = $2`,
      [clientId, endpoint],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Usuário desativado ou com senha trocada: todos os aparelhos dele saem (docs/PLANO-APK-TWA.md § 2). */
  async removerDoUsuario(clientId: string, userId: string): Promise<number> {
    const { rowCount } = await this.pool.query(
      `delete from notificacao_aparelhos where client_id = $1 and user_id = $2`,
      [clientId, userId],
    );
    return rowCount ?? 0;
  }

  async listarDoCliente(clientId: string, userIds: string[]): Promise<AparelhoRow[]> {
    if (userIds.length === 0) return [];
    const { rows } = await this.pool.query<AparelhoRow>(
      `select * from notificacao_aparelhos where client_id = $1 and user_id = any($2::uuid[])`,
      [clientId, userIds],
    );
    return rows;
  }

  /** Resposta 404/410 do canal: o endpoint não existe mais, sem valor em manter tentando. */
  async apagarPorEndpoint(endpoint: string): Promise<void> {
    await this.pool.query(`delete from notificacao_aparelhos where endpoint = $1`, [endpoint]);
  }

  async registrarFalha(endpoint: string): Promise<void> {
    await this.pool.query(
      `update notificacao_aparelhos set falhas = falhas + 1 where endpoint = $1`,
      [endpoint],
    );
  }

  async registrarEnvio(endpoint: string): Promise<void> {
    await this.pool.query(
      `update notificacao_aparelhos set ultimo_envio_em = now(), falhas = 0 where endpoint = $1`,
      [endpoint],
    );
  }
}

/**
 * `notificacao_preferencias`: chave é `(user_id, tipo)`, não `id` — não estende `BaseRepository`
 * (seus métodos genéricos assumem coluna `id`); cada método ainda recebe `clientId` primeiro e filtra por ele.
 */
@Injectable()
export class NotificacaoPreferenciasRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listar(clientId: string, userId: string): Promise<PreferenciaRow[]> {
    const { rows } = await this.pool.query<PreferenciaRow>(
      `select client_id, user_id, tipo, ativo from notificacao_preferencias where client_id = $1 and user_id = $2`,
      [clientId, userId],
    );
    return rows;
  }

  /**
   * `select ... from users where id = $2 and client_id = $1` em vez de usar `clientId` recebido direto no
   * insert: sem essa checagem, um `userId` de outro cliente (bug upstream, não deveria acontecer vindo do
   * JWT) gravaria uma preferência com `client_id` emprestado — aqui não insere nada se o usuário não for
   * deste cliente.
   */
  async definir(clientId: string, userId: string, tipo: string, ativo: boolean): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `insert into notificacao_preferencias (client_id, user_id, tipo, ativo)
       select u.client_id, u.id, $3, $4 from users u where u.id = $2 and u.client_id = $1
       on conflict (user_id, tipo) do update set ativo = excluded.ativo, atualizado_em = now()`,
      [clientId, userId, tipo, ativo],
    );
    return (rowCount ?? 0) > 0;
  }
}
