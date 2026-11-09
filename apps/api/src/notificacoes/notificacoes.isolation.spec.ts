import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotificacaoAparelhosRepository, NotificacaoPreferenciasRepository } from './notificacoes.repository';

/**
 * `notificacao_aparelhos`/`notificacao_preferencias` contra o Postgres real: um cliente nunca lê, apaga
 * nem altera aparelho/preferência de outro; o dono continua vendo e alterando os seus.
 */
describe('notificações — isolamento multi-tenant', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const aparelhos = new NotificacaoAparelhosRepository(pool);
  const preferencias = new NotificacaoPreferenciasRepository(pool);

  let clientA: string;
  let clientB: string;
  let userA: string;
  let userB: string;
  const endpointA = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-notif-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-notif-b-${randomUUID()}`])).rows[0].id;
    const user = async (c: string) =>
      (await pool.query<{ id: string }>("insert into users (client_id, email, password_hash, role) values ($1, $2, 'x', 'gestor') returning id", [c, `u-${randomUUID()}@teste.local`])).rows[0].id;
    userA = await user(clientA);
    userB = await user(clientB);
  });

  afterAll(async () => {
    await pool.query('delete from notificacao_preferencias where client_id in ($1, $2)', [clientA, clientB]);
    await pool.query('delete from notificacao_aparelhos where client_id in ($1, $2)', [clientA, clientB]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('registrar aparelho: outro cliente não apaga; o dono apaga normalmente', async () => {
    const a = await aparelhos.registrar(clientA, { userId: userA, canal: 'webpush', endpoint: endpointA, p256dh: 'p', auth: 'a', userAgent: 'teste' });
    expect(a.client_id).toBe(clientA);

    expect(await aparelhos.listarDoCliente(clientB, [userA])).toEqual([]);
    expect(await aparelhos.remover(clientB, endpointA)).toBe(false);
    expect(await aparelhos.listarDoCliente(clientA, [userA])).toHaveLength(1);

    expect(await aparelhos.remover(clientA, endpointA)).toBe(true);
    expect(await aparelhos.listarDoCliente(clientA, [userA])).toEqual([]);
  });

  it('reassinar o mesmo endpoint atualiza a linha em vez de duplicar', async () => {
    await aparelhos.registrar(clientA, { userId: userA, canal: 'webpush', endpoint: endpointA, p256dh: 'p1', auth: 'a1', userAgent: 'ua1' });
    const r2 = await aparelhos.registrar(clientA, { userId: userA, canal: 'webpush', endpoint: endpointA, p256dh: 'p2', auth: 'a2', userAgent: 'ua2' });
    expect(r2.p256dh).toBe('p2');
    expect(await aparelhos.listarDoCliente(clientA, [userA])).toHaveLength(1);
    await aparelhos.remover(clientA, endpointA);
  });

  it('removerDoUsuario só afeta os aparelhos do próprio cliente e usuário', async () => {
    const e1 = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    const e2 = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    await aparelhos.registrar(clientA, { userId: userA, canal: 'webpush', endpoint: e1, p256dh: null, auth: null, userAgent: null });
    await aparelhos.registrar(clientB, { userId: userB, canal: 'webpush', endpoint: e2, p256dh: null, auth: null, userAgent: null });

    expect(await aparelhos.removerDoUsuario(clientB, userA)).toBe(0);
    expect(await aparelhos.listarDoCliente(clientA, [userA])).toHaveLength(1);

    expect(await aparelhos.removerDoUsuario(clientA, userA)).toBe(1);
    expect(await aparelhos.listarDoCliente(clientA, [userA])).toEqual([]);
    expect(await aparelhos.listarDoCliente(clientB, [userB])).toHaveLength(1);
    await aparelhos.removerDoUsuario(clientB, userB);
  });

  it('preferências: outro cliente não lê nem grava para um usuário que não é dele; o dono define as suas', async () => {
    expect(await preferencias.definir(clientA, userA, 'manutencao', false)).toBe(true);

    expect(await preferencias.listar(clientB, userA)).toEqual([]);
    expect(await preferencias.definir(clientB, userA, 'manutencao', true)).toBe(false); // B tenta gravar para userA
    const doA = await preferencias.listar(clientA, userA);
    expect(doA).toEqual([{ client_id: clientA, user_id: userA, tipo: 'manutencao', ativo: false }]);

    expect(await preferencias.definir(clientA, userA, 'manutencao', true)).toBe(true);
    expect((await preferencias.listar(clientA, userA))[0].ativo).toBe(true);
  });
});
