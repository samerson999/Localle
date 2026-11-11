import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';

/**
 * Foto do avatar (`usuario_avatares`, `superadmin_avatares`). Só o próprio dono lê e grava a sua: o controller passa
 * `clientId` e `userId` do JWT, e os dois entram no `where` — como `UsersRepository`, não estende `BaseRepository`
 * porque a chave é o usuário, mas o `client_id` nunca sai do filtro. A FK composta (user_id, client_id) impede gravar
 * para um usuário de outro cliente.
 */
@Injectable()
export class AvatarRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async doUsuario(clientId: string, userId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ imagem: string }>(
      'select imagem from usuario_avatares where client_id = $1 and user_id = $2',
      [clientId, userId],
    );
    return rows[0]?.imagem ?? null;
  }

  async salvarDoUsuario(clientId: string, userId: string, imagem: string): Promise<void> {
    await this.pool.query(
      `insert into usuario_avatares (user_id, client_id, imagem) values ($2, $1, $3)
       on conflict (user_id) do update set imagem = excluded.imagem, atualizado_em = now()
       where usuario_avatares.client_id = $1`,
      [clientId, userId, imagem],
    );
  }

  async removerDoUsuario(clientId: string, userId: string): Promise<void> {
    await this.pool.query('delete from usuario_avatares where client_id = $1 and user_id = $2', [clientId, userId]);
  }

  async doSuperadmin(superadminId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ imagem: string }>('select imagem from superadmin_avatares where superadmin_id = $1', [superadminId]);
    return rows[0]?.imagem ?? null;
  }

  async salvarDoSuperadmin(superadminId: string, imagem: string): Promise<void> {
    await this.pool.query(
      `insert into superadmin_avatares (superadmin_id, imagem) values ($1, $2)
       on conflict (superadmin_id) do update set imagem = excluded.imagem, atualizado_em = now()`,
      [superadminId, imagem],
    );
  }

  async removerDoSuperadmin(superadminId: string): Promise<void> {
    await this.pool.query('delete from superadmin_avatares where superadmin_id = $1', [superadminId]);
  }
}
