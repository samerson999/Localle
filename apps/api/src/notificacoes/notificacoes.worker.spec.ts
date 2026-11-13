import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * `web-push` é fronteira de rede externa — mockado na importação (não `vi.spyOn`: o módulo CJS exporta
 * propriedades não configuráveis sob o interop do esbuild/Vite, `spyOn` não consegue redefini-las).
 * `setVapidDetails`/`generateVAPIDKeys` continuam reais; só `sendNotification` vira `vi.fn()` controlável.
 */
vi.mock('web-push', async (importOriginal) => {
  const actual = await importOriginal<typeof import('web-push')>();
  return { ...actual, sendNotification: vi.fn() };
});
import * as webpush from 'web-push';
import { inserirAlerta } from '../alertas/alertas.repository';
import { PermissionsRepository } from '../permissions/permissions.repository';
import { PermissionsService } from '../permissions/permissions.service';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { NotificacaoFilaRepository } from './notificacao-fila.repository';
import { NotificacaoAparelhosRepository, NotificacaoPreferenciasRepository } from './notificacoes.repository';
import { NotificacoesWorker, textoDoPush } from './notificacoes.worker';

/**
 * Fila + worker de push contra o Postgres real; só o envio HTTP (`web-push`) é simulado — é fronteira de
 * rede externa, não o banco, e esta suíte prova resolução de destinatário (permissão + preferência) e
 * isolamento multi-tenant, não o protocolo Web Push em si.
 */
describe('notificações — fila nasce com o alerta, worker resolve destinatário e isola por cliente', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const fila = new NotificacaoFilaRepository(pool);
  const aparelhos = new NotificacaoAparelhosRepository(pool);
  const preferencias = new NotificacaoPreferenciasRepository(pool);
  const permissionsRepo = new PermissionsRepository(pool);
  const permissions = new PermissionsService(permissionsRepo, new AuditLogRepository(pool), pool);
  const worker = new NotificacoesWorker(pool, fila, aparelhos, preferencias, permissions);

  const keys = webpush.generateVAPIDKeys();
  let clientA: string;
  let clientB: string;
  let userA: string;
  let userBOperador: string;
  let assetA: string;

  const criarUser = async (clientId: string, role: 'gestor' | 'operador') =>
    (await pool.query<{ id: string }>("insert into users (client_id, email, password_hash, role) values ($1, $2, 'x', $3) returning id", [
      clientId,
      `u-${randomUUID()}@teste.local`,
      role,
    ])).rows[0].id;

  beforeAll(async () => {
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    webpush.setVapidDetails('mailto:teste@localle.local', keys.publicKey, keys.privateKey);

    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-push-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-push-b-${randomUUID()}`])).rows[0].id;
    assetA = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'PSH1A23') returning id", [clientA])).rows[0].id;
    userA = await criarUser(clientA, 'gestor');
    userBOperador = await criarUser(clientB, 'operador');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await pool.query('delete from notificacao_fila where client_id in ($1, $2)', [clientA, clientB]);
    await pool.query('delete from notificacao_preferencias where client_id in ($1, $2)', [clientA, clientB]);
    await pool.query('delete from notificacao_aparelhos where client_id in ($1, $2)', [clientA, clientB]);
    await pool.query('delete from role_permission_overrides where client_id in ($1, $2)', [clientA, clientB]);
    await pool.query('delete from alertas where client_id in ($1, $2)', [clientA, clientB]);
    await pool.query('delete from assets where client_id = $1', [clientA]);
    await pool.query('delete from users where client_id in ($1, $2)', [clientA, clientB]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  const novoAlerta = async (clientId: string, assetId: string | null, tipo = 'sos', prioridade: 'alta' | 'media' | 'baixa' = 'alta') =>
    (await inserirAlerta(pool, {
      clientId,
      assetId,
      eventoId: null,
      origem: 'aparelho',
      tipo,
      titulo: 'Teste de push',
      detalhe: null,
      prioridade,
      ts: new Date(),
    }))!;

  it('inserirAlerta enfileira a notificação na mesma transação (mesmo pool de teste)', async () => {
    const alerta = await novoAlerta(clientA, assetA);
    const { rows } = await pool.query('select client_id, processado_em from notificacao_fila where alerta_id = $1', [alerta.id]);
    expect(rows).toEqual([{ client_id: clientA, processado_em: null }]);
    // sem isso, a linha ficaria pendente e o próximo processarLote() (próximo teste) a pegaria junto
    await pool.query('update notificacao_fila set processado_em = now() where alerta_id = $1', [alerta.id]);
  });

  it('entrega ao aparelho do usuário com permissão e preferência ligada; marca a fila como processada', async () => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    await aparelhos.registrar(clientA, { userId: userA, canal: 'webpush', endpoint, p256dh: 'p', auth: 'a', userAgent: 'teste' });
    const enviar = vi.mocked(webpush.sendNotification).mockResolvedValue({ statusCode: 201 } as any);

    const alerta = await novoAlerta(clientA, assetA);
    const n = await worker.processarLote(10);
    expect(n).toBeGreaterThan(0);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0][0]).toMatchObject({ endpoint });
    // texto pronto para o aparelho: título curto (o veículo) e a frase no corpo — nunca o tipo cru
    expect(JSON.parse(enviar.mock.calls[0][1] as string)).toMatchObject({
      alertaId: alerta.id,
      titulo: 'PSH1A23 · Crítico',
      corpo: 'Teste de push',
    });

    const { rows } = await pool.query('select processado_em from notificacao_fila where alerta_id = $1', [alerta.id]);
    expect(rows[0].processado_em).not.toBeNull();
    await aparelhos.remover(clientA, endpoint);
  });

  it('preferência desligada para o tipo: não envia, mas conclui a fila mesmo assim', async () => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    await aparelhos.registrar(clientA, { userId: userA, canal: 'webpush', endpoint, p256dh: 'p', auth: 'a', userAgent: 'teste' });
    await preferencias.definir(clientA, userA, 'manutencao_preventiva', false);
    const enviar = vi.mocked(webpush.sendNotification).mockResolvedValue({ statusCode: 201 } as any);

    const alerta = await novoAlerta(clientA, assetA, 'manutencao_preventiva', 'alta');
    await worker.processarLote(10);
    expect(enviar).not.toHaveBeenCalled();
    const { rows } = await pool.query('select processado_em from notificacao_fila where alerta_id = $1', [alerta.id]);
    expect(rows[0].processado_em).not.toBeNull();
    await aparelhos.remover(clientA, endpoint);
  });

  it('410 do canal remove o aparelho (não insiste num endpoint morto)', async () => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    await aparelhos.registrar(clientA, { userId: userA, canal: 'webpush', endpoint, p256dh: 'p', auth: 'a', userAgent: 'teste' });
    vi.mocked(webpush.sendNotification).mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));

    await novoAlerta(clientA, assetA);
    await worker.processarLote(10);
    expect(await aparelhos.listarDoCliente(clientA, [userA])).toEqual([]);
  });

  it('isolamento: aparelho de outro cliente nunca recebe o alerta de clientA, mesmo com permissão', async () => {
    const endpointB = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    await aparelhos.registrar(clientB, { userId: userBOperador, canal: 'webpush', endpoint: endpointB, p256dh: 'p', auth: 'a', userAgent: 'teste' });
    const enviar = vi.mocked(webpush.sendNotification).mockResolvedValue({ statusCode: 201 } as any);

    await novoAlerta(clientA, assetA);
    await worker.processarLote(10);
    expect(enviar.mock.calls.every((c) => (c[0] as any).endpoint !== endpointB)).toBe(true);
    await aparelhos.remover(clientB, endpointB);
  });

  it('papel sem "monitoramento.ver" não recebe, mesmo com aparelho registrado', async () => {
    await permissions.set(clientA, 'operador', 'monitoramento.ver', false, userA);
    const userOperadorA = await criarUser(clientA, 'operador');
    const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    await aparelhos.registrar(clientA, { userId: userOperadorA, canal: 'webpush', endpoint, p256dh: 'p', auth: 'a', userAgent: 'teste' });
    const enviar = vi.mocked(webpush.sendNotification).mockResolvedValue({ statusCode: 201 } as any);

    await novoAlerta(clientA, assetA);
    await worker.processarLote(10);
    expect(enviar.mock.calls.every((c) => (c[0] as any).endpoint !== endpoint)).toBe(true);

    await aparelhos.remover(clientA, endpoint);
    await pool.query(`delete from role_permission_overrides where client_id = $1 and role = 'operador'`, [clientA]);
    await pool.query('delete from users where id = $1', [userOperadorA]);
  });

  it('textoDoPush: título curto pelo veículo, "Crítico" só na alta, e um título neutro sem veículo', () => {
    expect(textoDoPush({ veiculo: 'ABC1D23', prioridade: 'media', titulo: 'Rastreador há mais de 12 h sem enviar posição' }))
      .toEqual({ titulo: 'ABC1D23', corpo: 'Rastreador há mais de 12 h sem enviar posição' });
    expect(textoDoPush({ veiculo: 'ABC1D23', prioridade: 'alta', titulo: 'Pânico (SOS) acionado' }).titulo).toBe('ABC1D23 · Crítico');
    expect(textoDoPush({ veiculo: null, prioridade: 'baixa', titulo: 'x' }).titulo).toBe('Alerta da frota');
  });
});
