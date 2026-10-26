import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { PermissionsRepository } from './permissions.repository';
import { PermissionsService } from './permissions.service';

describe('PermissionsService — resolução, isolamento, proteção contra escalonamento, auditoria', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new PermissionsRepository(pool);
  const audit = new AuditLogRepository(pool);
  const service = new PermissionsService(repo, audit, pool);

  let clientA: string;
  let clientB: string;
  let adminUserIdA: string;

  beforeEach(async () => {
    const a = await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [
      `teste-perm-a-${randomUUID()}`,
    ]);
    const b = await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [
      `teste-perm-b-${randomUUID()}`,
    ]);
    clientA = a.rows[0].id;
    clientB = b.rows[0].id;

    const user = await pool.query<{ id: string }>(
      `insert into users (client_id, email, password_hash, role) values ($1, $2, 'x', 'admin') returning id`,
      [clientA, `admin-${randomUUID()}@teste.local`],
    );
    adminUserIdA = user.rows[0].id;
  });

  afterEach(async () => {
    await pool.query('delete from audit_log where client_id in ($1, $2)', [clientA, clientB]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('sem override, isAllowed usa o padrão do catálogo por papel', async () => {
    expect(await service.isAllowed(clientA, 'operador', 'ativos.editar')).toBe(false);
    expect(await service.isAllowed(clientA, 'gestor', 'ativos.editar')).toBe(true);
  });

  it('chave inexistente nunca autoriza (isAllowed), mesmo sem lançar erro', async () => {
    expect(await service.isAllowed(clientA, 'admin', 'nao.existe')).toBe(false);
  });

  it('admin pode liberar para operador uma permissão editável', async () => {
    await service.set(clientA, 'operador', 'ativos.editar', true, adminUserIdA);
    expect(await service.isAllowed(clientA, 'operador', 'ativos.editar')).toBe(true);
  });

  it('override de um cliente não vaza para outro (isolamento multi-tenant)', async () => {
    await service.set(clientA, 'operador', 'ativos.editar', true, adminUserIdA);
    expect(await service.isAllowed(clientB, 'operador', 'ativos.editar')).toBe(false);
  });

  it('rejeita alterar permissão do papel "admin" — nem o próprio admin pode mudar a si mesmo', async () => {
    await expect(service.set(clientA, 'admin', 'ativos.editar', false, adminUserIdA)).rejects.toThrow(
      /papel "admin" não podem ser alteradas/,
    );
  });

  it('rejeita alterar permissão travada ("permissoes.gerenciar") mesmo para gestor/operador', async () => {
    await expect(
      service.set(clientA, 'operador', 'permissoes.gerenciar', true, adminUserIdA),
    ).rejects.toThrow(/travada pela plataforma/);
    await expect(
      service.set(clientA, 'gestor', 'permissoes.gerenciar', true, adminUserIdA),
    ).rejects.toThrow(/travada pela plataforma/);
  });

  it('rejeita chave de permissão desconhecida em set/restoreDefault', async () => {
    await expect(service.set(clientA, 'gestor', 'nao.existe', true, adminUserIdA)).rejects.toThrow(/não existe/);
    await expect(service.restoreDefault(clientA, 'gestor', 'nao.existe', adminUserIdA)).rejects.toThrow(
      /não existe/,
    );
  });

  it('restoreDefault apaga o override e volta ao padrão do catálogo', async () => {
    await service.set(clientA, 'gestor', 'setup.configurar', true, adminUserIdA);
    expect(await service.isAllowed(clientA, 'gestor', 'setup.configurar')).toBe(true);

    const restored = await service.restoreDefault(clientA, 'gestor', 'setup.configurar', adminUserIdA);
    expect(restored).toMatchObject({ allowed: false, origin: 'padrao' });
    expect(await service.isAllowed(clientA, 'gestor', 'setup.configurar')).toBe(false);
  });

  it('resolveAll traz os três papéis com a origem certa depois de um override', async () => {
    await service.set(clientA, 'gestor', 'ativos.editar', false, adminUserIdA);
    const all = await service.resolveAll(clientA);

    const gestor = all.find((p) => p.role === 'gestor' && p.key === 'ativos.editar');
    expect(gestor).toMatchObject({ allowed: false, origin: 'cliente' });

    const operador = all.find((p) => p.role === 'operador' && p.key === 'ativos.editar');
    expect(operador).toMatchObject({ allowed: false, origin: 'padrao' });
  });

  it('registra auditoria no "set", com before/depois corretos', async () => {
    await service.set(clientA, 'gestor', 'ativos.editar', false, adminUserIdA);

    const { rows } = await pool.query(
      `select * from audit_log where client_id = $1 and action = 'permission.set' order by created_at desc limit 1`,
      [clientA],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].target).toBe('gestor:ativos.editar');
    expect(rows[0].before).toEqual({ allowed: true });
    expect(rows[0].after).toEqual({ allowed: false });
    expect(rows[0].actor_id).toBe(adminUserIdA);
    expect(rows[0].actor_type).toBe('user');
  });

  it('registra auditoria no "restoreDefault" e a revogação já é refletida na próxima verificação', async () => {
    await service.set(clientA, 'operador', 'ativos.editar', true, adminUserIdA);
    expect(await service.isAllowed(clientA, 'operador', 'ativos.editar')).toBe(true);

    await service.restoreDefault(clientA, 'operador', 'ativos.editar', adminUserIdA);

    // revogação refletida imediatamente — sem cache, resolve de novo bate no banco
    expect(await service.isAllowed(clientA, 'operador', 'ativos.editar')).toBe(false);

    const { rows } = await pool.query(
      `select * from audit_log where client_id = $1 and action = 'permission.restore_default' order by created_at desc limit 1`,
      [clientA],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].before).toEqual({ allowed: true });
    expect(rows[0].after).toEqual({ allowed: false });
  });

  it('achado #4 (atomicidade): se a auditoria falhar, o override não fica gravado (rollback)', async () => {
    const quebrado = new AuditLogRepository(pool);
    quebrado.record = async () => {
      throw new Error('falha simulada na escrita de auditoria');
    };
    const servicoComAuditoriaQuebrada = new PermissionsService(repo, quebrado, pool);

    await expect(
      servicoComAuditoriaQuebrada.set(clientA, 'operador', 'ativos.editar', true, adminUserIdA),
    ).rejects.toThrow(/falha simulada/);

    // a escrita em role_permission_overrides tem que ter sido desfeita junto com a falha da auditoria —
    // nunca uma permissão alterada sem o registro correspondente.
    expect(await service.isAllowed(clientA, 'operador', 'ativos.editar')).toBe(false);
    const { rows } = await pool.query(
      'select * from role_permission_overrides where client_id = $1 and role = $2 and permission_key = $3',
      [clientA, 'operador', 'ativos.editar'],
    );
    expect(rows).toHaveLength(0);
  });

  it('achado #5 (concorrência) — prova direta: o advisory lock bloqueia uma segunda transação na mesma chave até a primeira commitar', async () => {
    // Controle manual de duas conexões (não via service) para provar mutual exclusion de verdade, em vez
    // de inferir pelo resultado de um Promise.all (que não garante interleaving real). Revisão pós-
    // pentest de 23/10/2026: FOR UPDATE sozinho não bloqueia linha inexistente — este teste ataca
    // exatamente esse cenário (nenhum override existe ainda para a chave usada).
    const clientConn1 = await pool.connect();
    const clientConn2 = await pool.connect();
    try {
      await clientConn1.query('begin');
      await repo.lockOverrideKey(clientConn1, clientA, 'gestor', 'relatorios.ver');

      let segundaResolveu = false;
      const segunda = (async () => {
        await clientConn2.query('begin');
        await repo.lockOverrideKey(clientConn2, clientA, 'gestor', 'relatorios.ver');
        segundaResolveu = true;
        await clientConn2.query('commit');
      })();

      // dá tempo da segunda tentar e ficar bloqueada — se o lock não funcionasse, "segundaResolveu"
      // já seria true aqui.
      await new Promise((r) => setTimeout(r, 200));
      expect(segundaResolveu).toBe(false);

      await clientConn1.query('commit');
      await segunda;
      expect(segundaResolveu).toBe(true);
    } finally {
      clientConn1.release();
      clientConn2.release();
    }
  });

  it('achado #5 (concorrência): escritas simultâneas na mesma chave não corrompem dado, e a cadeia de auditoria é consistente independente da ordem', async () => {
    const resultados = await Promise.allSettled([
      service.set(clientA, 'operador', 'ativos.editar', true, adminUserIdA),
      service.set(clientA, 'operador', 'ativos.editar', false, adminUserIdA),
      service.set(clientA, 'operador', 'ativos.editar', true, adminUserIdA),
    ]);
    expect(resultados.every((r) => r.status === 'fulfilled')).toBe(true);

    // estado final é um dos valores escritos (upsert serializado pelo Postgres), nunca nulo/corrompido
    const final = await service.isAllowed(clientA, 'operador', 'ativos.editar');
    expect(typeof final).toBe('boolean');

    const { rows } = await pool.query(
      `select before, after from audit_log where client_id = $1 and action = 'permission.set'
       and target = 'operador:ativos.editar' order by id asc`,
      // `id` (identity) é atribuído no insert, dentro do advisory lock — reflete a ordem real de
      // serialização. `created_at` é `now()`, o início da transação: três transações concorrentes começam
      // quase juntas e o lock as serializa em outra ordem, o que tornava este teste intermitente.
      [clientA],
    );
    // nenhuma escrita foi perdida: uma linha de auditoria por chamada, nessa ordem exata de commit
    expect(rows).toHaveLength(3);
    // cadeia consistente: o "antes" de cada entrada é o "depois" da entrada imediatamente anterior — é
    // isso que prova que o lock serializou de verdade a leitura do "antes" com a escrita concorrente,
    // não só que "não deu erro". A primeira usa o padrão da plataforma (sem override prévio).
    expect(rows[0].before).toEqual({ allowed: false }); // padrão de operador em ativos.editar
    expect(rows[1].before).toEqual(rows[0].after);
    expect(rows[2].before).toEqual(rows[1].after);
    expect(rows[2].after).toEqual({ allowed: final });
  });

  it('achado #5 (concorrência): set concorrente em clientes diferentes não interfere um no outro', async () => {
    await Promise.all([
      service.set(clientA, 'operador', 'ativos.editar', true, adminUserIdA),
      (async () => {
        const userB = await pool.query<{ id: string }>(
          `insert into users (client_id, email, password_hash, role) values ($1, $2, 'x', 'admin') returning id`,
          [clientB, `admin-b-${randomUUID()}@teste.local`],
        );
        await service.set(clientB, 'operador', 'ativos.editar', false, userB.rows[0].id);
      })(),
    ]);

    expect(await service.isAllowed(clientA, 'operador', 'ativos.editar')).toBe(true);
    expect(await service.isAllowed(clientB, 'operador', 'ativos.editar')).toBe(false);
  });

  it('achado #5 (concorrência): set e restoreDefault simultâneos na mesma chave terminam num estado consistente', async () => {
    await service.set(clientA, 'operador', 'ativos.editar', true, adminUserIdA);

    const resultados = await Promise.allSettled([
      service.set(clientA, 'operador', 'ativos.editar', true, adminUserIdA),
      service.restoreDefault(clientA, 'operador', 'ativos.editar', adminUserIdA),
    ]);
    expect(resultados.every((r) => r.status === 'fulfilled')).toBe(true);

    // qualquer que seja a ordem final, o valor é um dos dois estados válidos — nunca erro, nunca nulo
    const final = await service.isAllowed(clientA, 'operador', 'ativos.editar');
    expect([true, false]).toContain(final);
  });
});
