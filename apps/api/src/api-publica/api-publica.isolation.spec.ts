import 'dotenv/config';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import IORedis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AssetsRepository } from '../assets/assets.repository';
import { ActiveUserRepository } from '../auth/active-user.repository';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { ApiChaveGuard } from './auth/api-chave.guard';
import { CacheDeChaves } from './auth/cache-de-chaves';
import type { Escopo } from './auth/escopos';
import { LimitadorDeTaxa, LIMITES } from './auth/limitador';
import { SO_MESTRA, type ApiAuth } from './auth/metadata';
import { ApiChavesMestrasRepository } from './chaves-mestras/api-chaves-mestras.repository';
import { ApiChavesMestrasService } from './chaves-mestras/api-chaves-mestras.service';
import { ApiChavesRepository } from './chaves/api-chaves.repository';
import { ApiChavesService } from './chaves/api-chaves.service';
import { gerarChave } from './chaves/chave';
import { VeiculosController } from './veiculos/veiculos.controller';

/**
 * API pública de consulta (docs/PLANO-API-PUBLICA.md): isolamento das chaves entre clientes, todas as recusas do
 * `ApiChaveGuard` e a chave mestra. Contra o Postgres e o Redis locais (`infra/plataforma`), sem mock de banco.
 */
describe('API pública — chaves, guard e isolamento', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // localhost → ::1 no Windows dá ECONNRESET com o Docker (memória infra-local-ipv6)
  const redis = new IORedis((process.env.REDIS_URL ?? 'redis://localhost:6379').replace('localhost', '127.0.0.1'), { maxRetriesPerRequest: null });
  const mail = { send: vi.fn().mockResolvedValue(true) } as any;
  const acessos = new ActiveUserRepository(pool);
  const audit = new AuditLogRepository(pool);
  const chavesRepo = new ApiChavesRepository(pool);
  const mestrasRepo = new ApiChavesMestrasRepository(pool);
  // um cache só, como no módulo: a revogação limpa o que o guard guardou
  const cache = new CacheDeChaves();
  const chaves = new ApiChavesService(chavesRepo, acessos, audit, mail, cache);
  const mestras = new ApiChavesMestrasService(mestrasRepo, audit, mail, cache);
  const limitador = new LimitadorDeTaxa(redis);
  const assets = new VeiculosController(new AssetsRepository(pool));

  let clienteA: string;
  let clienteB: string;
  let clienteSemFrota: string;
  let adminA: string;
  let adminB: string;
  let superadminId: string;
  let veiculoA: string;
  let veiculoB: string;

  const novoCliente = async (nome: string) =>
    (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`${nome}-${randomUUID()}`])).rows[0].id;
  const novoAdmin = async (clientId: string) =>
    (await pool.query<{ id: string }>("insert into users (client_id, email, password_hash, role) values ($1, $2, 'x', 'admin') returning id", [clientId, `api-${randomUUID()}@teste.local`])).rows[0].id;
  const contratar = async (clientId: string, modulos: string[], status = 'ativo') => {
    const k = (await pool.query<{ id: string }>('insert into contratos (client_id, status) values ($1, $2) returning id', [clientId, status])).rows[0].id;
    await pool.query(
      `insert into contrato_versoes (contrato_id, client_id, tipo_cobranca, historico_meses, dia_vencimento, modulos, paginas_bloqueadas, criado_por)
       values ($1, $2, 'mensalidade_fixa', 12, 5, $3, '{}', $4)`,
      [k, clientId, modulos, randomUUID()],
    );
  };

  /** Guard com a rota, o caminho e o IP desejados; devolve o que ele pôs em `request.apiAuth` e os cabeçalhos. */
  async function chamar(o: { chave?: string; escopo: Escopo | typeof SO_MESTRA; clientId?: string; ip?: string; metodo?: string; url?: string }) {
    const headers: Record<string, string> = {};
    const finais: (() => void)[] = [];
    const res = { statusCode: 200, setHeader: (k: string, v: string) => (headers[k] = v), on: (_: string, f: () => void) => finais.push(f) };
    const req: any = {
      method: o.metodo ?? 'GET',
      headers: o.chave === undefined ? {} : { authorization: `Bearer ${o.chave}` },
      params: o.clientId === undefined ? {} : { clientId: o.clientId },
      ip: o.ip ?? '127.0.0.1',
      originalUrl: o.url ?? '/v1/veiculos',
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
      getHandler: () => function handler() {},
      getClass: () => class C {},
    } as unknown as ExecutionContext;
    const reflector = { getAllAndOverride: () => o.escopo } as unknown as Reflector;
    const guard = new ApiChaveGuard(reflector, chavesRepo, mestrasRepo, acessos, limitador, mail, cache);
    await guard.canActivate(ctx);
    return { auth: req.apiAuth as ApiAuth, headers, finalizar: async () => { for (const f of finais) f(); await guard.aguardarRegistros(); } };
  }

  beforeAll(async () => {
    clienteA = await novoCliente('api-a');
    clienteB = await novoCliente('api-b');
    clienteSemFrota = await novoCliente('api-sem-frota');
    adminA = await novoAdmin(clienteA);
    adminB = await novoAdmin(clienteB);
    await contratar(clienteSemFrota, ['monitoramento']);
    superadminId = (await pool.query<{ id: string }>("insert into superadmins (email, password_hash) values ($1, 'x') returning id", [`api-sa-${randomUUID()}@teste.local`])).rows[0].id;
    veiculoA = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'AAA1A11') returning id", [clienteA])).rows[0].id;
    veiculoB = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'BBB2B22') returning id", [clienteB])).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('delete from api_chaves_mestras where criada_por = $1', [superadminId]);
    await pool.query('delete from clients where id = any($1)', [[clienteA, clienteB, clienteSemFrota]]);
    await pool.query('delete from superadmins where id = $1', [superadminId]);
    await pool.end();
    redis.disconnect();
  });

  /** Chave de cliente gerada pelo superadmin no Console. */
  const gerar = (clientId: string, b: { nome: string; escopos: unknown; expiraEm?: string }) => chaves.criar(superadminId, { clientId, ...b });

  describe('gestão das chaves pelo Console', () => {
    it('gera a chave do cliente com 64 caracteres (letras, números e símbolos), devolve o valor uma vez e guarda só o hash', async () => {
      const { chave, dados } = await gerar(clienteA, { nome: 'Power BI', escopos: ['frota', 'posicoes'] });
      expect(chave).toHaveLength(64);
      expect(chave).toMatch(/^[A-Za-z0-9!#%*+\-.=@^_~]{64}$/);
      expect(dados).not.toHaveProperty('hash');
      expect(dados).toMatchObject({ client_id: clienteA, escopos: ['frota', 'posicoes'] });
      const { rows } = await pool.query('select hash, prefixo, criada_por_superadmin from api_chaves where id = $1', [dados.id]);
      expect(rows[0].hash).not.toEqual(Buffer.from(chave));
      expect(chave.startsWith(rows[0].prefixo)).toBe(true);
      expect(rows[0].criada_por_superadmin).toBe(superadminId);
      expect(mail.send).toHaveBeenCalled();
    });

    it('lista filtrada pelo cliente só traz as chaves dele', async () => {
      const a = await gerar(clienteA, { nome: 'ERP', escopos: ['frota'] });
      const b = await gerar(clienteB, { nome: 'ERP B', escopos: ['frota'] });
      const deA = (await chaves.listar(clienteA)).map((c) => c.id);
      expect(deA).toContain(a.dados.id);
      expect(deA).not.toContain(b.dados.id);
      expect((await chaves.listar(null)).map((c) => c.id)).toEqual(expect.arrayContaining([a.dados.id, b.dados.id]));
    });

    it('reset: valor novo na mesma chave (mesmo id e escopos); o anterior para na hora, mesmo já em cache', async () => {
      const { chave, dados } = await gerar(clienteA, { nome: 'Reset', escopos: ['frota'] });
      expect((await chamar({ chave, escopo: 'frota' })).auth.clientId).toBe(clienteA); // entra no cache
      const novo = await chaves.resetar(superadminId, dados.id);
      expect(novo.chave).not.toBe(chave);
      expect(novo.dados).toMatchObject({ id: dados.id, escopos: ['frota'] });
      expect(novo.dados.resetada_em).not.toBeNull();
      await expect(chamar({ chave, escopo: 'frota' })).rejects.toThrow(UnauthorizedException);
      expect((await chamar({ chave: novo.chave, escopo: 'frota' })).auth.clientId).toBe(clienteA);
    });

    it('revogada não reseta nem revoga de novo; id inexistente: 404', async () => {
      const { dados } = await gerar(clienteA, { nome: 'Revogar', escopos: ['frota'] });
      await chaves.revogar(superadminId, dados.id);
      await expect(chaves.resetar(superadminId, dados.id)).rejects.toThrow(NotFoundException);
      await expect(chaves.revogar(superadminId, dados.id)).rejects.toThrow(NotFoundException);
      await expect(chaves.revogar(superadminId, randomUUID())).rejects.toThrow(NotFoundException);
    });

    it('recusa cliente inexistente, escopo desconhecido, escopo de módulo não contratado, lista vazia e validade no passado', async () => {
      await expect(gerar(randomUUID(), { nome: 'x', escopos: ['frota'] })).rejects.toThrow(NotFoundException);
      await expect(chaves.criar(superadminId, { nome: 'x', escopos: ['frota'] })).rejects.toThrow(BadRequestException);
      await expect(gerar(clienteA, { nome: 'x', escopos: ['tudo'] })).rejects.toThrow(BadRequestException);
      await expect(gerar(clienteA, { nome: 'x', escopos: [] })).rejects.toThrow(BadRequestException);
      await expect(gerar(clienteA, { nome: 'x', escopos: ['frota'], expiraEm: '2020-01-01T00:00:00Z' })).rejects.toThrow(BadRequestException);
      await expect(gerar(clienteSemFrota, { nome: 'x', escopos: ['frota'] })).rejects.toThrow(/não contratou/);
      expect((await chaves.escoposDisponiveis(clienteSemFrota)).map((e) => e.key)).not.toContain('frota');
    });

    it('no máximo 10 chaves ativas por cliente', async () => {
      const ativas = await chavesRepo.contarAtivas(clienteB);
      for (let i = ativas; i < 10; i++) await gerar(clienteB, { nome: `b${i}`, escopos: ['frota'] });
      await expect(gerar(clienteB, { nome: 'demais', escopos: ['frota'] })).rejects.toThrow(ConflictException);
    });
  });

  describe('ApiChaveGuard — chave de cliente', () => {
    let chaveA: string;
    beforeAll(async () => {
      chaveA = (await gerar(clienteA, { nome: 'guard', escopos: ['frota'] })).chave;
    });

    it('chave válida: cliente da própria chave, cabeçalhos de limite e X-Request-Id', async () => {
      const { auth, headers } = await chamar({ chave: chaveA, escopo: 'frota' });
      expect(auth).toMatchObject({ tipo: 'cliente', clientId: clienteA });
      expect(headers['X-Request-Id']).toMatch(/^[0-9a-f-]{36}$/);
      expect(Number(headers['X-RateLimit-Limite'])).toBe(LIMITES.cliente.porMinuto);
    });

    it('a consulta só traz os veículos do cliente da chave', async () => {
      const { auth } = await chamar({ chave: chaveA, escopo: 'frota' });
      const pagina = await assets.listar(auth.clientId!);
      expect(pagina.dados.map((v) => v.id)).toContain(veiculoA);
      expect(pagina.dados.map((v) => v.id)).not.toContain(veiculoB);
      await expect(assets.buscar(auth.clientId!, veiculoB)).rejects.toThrow(NotFoundException);
      expect((await assets.buscar(auth.clientId!, veiculoA)).placa).toBe('AAA1A11');
    });

    it('sem cabeçalho, JWT, chave inventada ou valor truncado: 401', async () => {
      await expect(chamar({ escopo: 'frota' })).rejects.toThrow(UnauthorizedException);
      await expect(chamar({ chave: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc', escopo: 'frota' })).rejects.toThrow(UnauthorizedException);
      await expect(chamar({ chave: gerarChave().chave, escopo: 'frota' })).rejects.toThrow(UnauthorizedException);
      await expect(chamar({ chave: chaveA.slice(0, -1), escopo: 'frota' })).rejects.toThrow(UnauthorizedException);
    });

    it('revogada (na hora, mesmo já em cache) e vencida: 401', async () => {
      const r = await gerar(clienteA, { nome: 'revogar', escopos: ['frota'] });
      expect((await chamar({ chave: r.chave, escopo: 'frota' })).auth.clientId).toBe(clienteA); // entra no cache
      await chaves.revogar(superadminId, r.dados.id);
      await expect(chamar({ chave: r.chave, escopo: 'frota' })).rejects.toThrow(UnauthorizedException);
      const v = await gerar(clienteA, { nome: 'vencer', escopos: ['frota'] });
      await pool.query("update api_chaves set expira_em = now() - interval '1 minute' where id = $1", [v.dados.id]);
      await expect(chamar({ chave: v.chave, escopo: 'frota' })).rejects.toThrow(UnauthorizedException);
    });

    it('chave de cliente no caminho da chave mestra (outro cliente ou o próprio): 401', async () => {
      await expect(chamar({ chave: chaveA, escopo: 'frota', clientId: clienteB })).rejects.toThrow(UnauthorizedException);
      await expect(chamar({ chave: chaveA, escopo: 'frota', clientId: clienteA })).rejects.toThrow(UnauthorizedException);
      await expect(chamar({ chave: chaveA, escopo: SO_MESTRA })).rejects.toThrow(UnauthorizedException);
    });

    it('escopo que a chave não tem: 403', async () => {
      await expect(chamar({ chave: chaveA, escopo: 'posicoes' })).rejects.toThrow(ForbiddenException);
    });

    it('módulo que sai do contrato corta a chave na hora; contrato suspenso dá 401', async () => {
      const c = await novoCliente('api-contrato');
      try {
        const u = await novoAdmin(c);
        const { chave } = await gerar(c, { nome: 'k', escopos: ['frota'] });
        expect((await chamar({ chave, escopo: 'frota' })).auth.clientId).toBe(c);
        await contratar(c, ['monitoramento']);
        await expect(chamar({ chave, escopo: 'frota' })).rejects.toThrow(ForbiddenException);
        await pool.query("update contratos set status = 'suspenso' where client_id = $1", [c]);
        await expect(chamar({ chave, escopo: 'frota' })).rejects.toThrow(UnauthorizedException);
      } finally {
        await pool.query('delete from clients where id = $1', [c]);
      }
    });

    it('método diferente de GET: 405', async () => {
      await expect(chamar({ chave: chaveA, escopo: 'frota', metodo: 'POST' })).rejects.toMatchObject({ status: 405 });
    });

    it('acima do limite por minuto: 429 com Retry-After', async () => {
      const { chave, dados } = await gerar(clienteA, { nome: 'limite', escopos: ['frota'] });
      const minuto = Math.floor(Date.now() / 60_000);
      await redis.set(`api:lim:${dados.id}:m:${minuto}`, LIMITES.cliente.porMinuto, 'EX', 120);
      await redis.set(`api:lim:${dados.id}:m:${minuto + 1}`, LIMITES.cliente.porMinuto, 'EX', 180); // virada do minuto no meio do teste
      const erro = await chamar({ chave, escopo: 'frota' }).catch((e) => e);
      expect(erro).toBeInstanceOf(HttpException);
      expect(erro.getStatus()).toBe(429);
      expect(erro.getResponse()).toMatchObject({ codigo: 'limite_excedido' });
    });
  });

  describe('ApiChaveGuard — chave mestra', () => {
    let mestra: string;
    let mestraId: string;
    const expira = () => new Date(Date.now() + 30 * 86_400_000).toISOString();

    beforeAll(async () => {
      const r = await mestras.criar(superadminId, { nome: 'Suporte', ips: ['200.141.18.98', '10.0.0.0/8'], expiraEm: expira() });
      mestra = r.chave;
      mestraId = r.dados.id;
      expect(mestra).toHaveLength(64);
    });

    it('criação exige IPs válidos e validade de até 90 dias', async () => {
      await expect(mestras.criar(superadminId, { nome: 'x', ips: [], expiraEm: expira() })).rejects.toThrow(BadRequestException);
      await expect(mestras.criar(superadminId, { nome: 'x', ips: ['abc'], expiraEm: expira() })).rejects.toThrow(BadRequestException);
      await expect(mestras.criar(superadminId, { nome: 'x', ips: ['1.2.3.4'] })).rejects.toThrow(BadRequestException);
      await expect(mestras.criar(superadminId, { nome: 'x', ips: ['1.2.3.4'], expiraEm: new Date(Date.now() + 91 * 86_400_000).toISOString() })).rejects.toThrow(BadRequestException);
    });

    it('do IP permitido, consulta qualquer cliente pelo caminho e cada consulta fica registrada', async () => {
      const a = await chamar({ chave: mestra, escopo: 'frota', clientId: clienteA, ip: '200.141.18.98', url: `/v1/clientes/${clienteA}/veiculos` });
      expect(a.auth).toMatchObject({ tipo: 'mestra', clientId: clienteA });
      const b = await chamar({ chave: mestra, escopo: 'frota', clientId: clienteB, ip: '10.9.8.7', url: `/v1/clientes/${clienteB}/veiculos` });
      expect(b.auth.clientId).toBe(clienteB);
      await a.finalizar();
      await b.finalizar();
      const log = await mestrasRepo.acessos(mestraId);
      expect(log.map((l) => l.client_id)).toEqual(expect.arrayContaining([clienteA, clienteB]));
      expect(log.find((l) => l.client_id === clienteA)?.rota).toBe(`/v1/clientes/${clienteA}/veiculos`);
    });

    it('IP fora da lista: 401', async () => {
      await expect(chamar({ chave: mestra, escopo: 'frota', clientId: clienteA, ip: '200.141.18.99' })).rejects.toThrow(UnauthorizedException);
    });

    it('sem cliente no caminho (rota da chave de cliente): 401; cliente inexistente: 404', async () => {
      await expect(chamar({ chave: mestra, escopo: 'frota', ip: '200.141.18.98' })).rejects.toThrow(UnauthorizedException);
      await expect(chamar({ chave: mestra, escopo: 'frota', clientId: randomUUID(), ip: '200.141.18.98' })).rejects.toThrow(NotFoundException);
    });

    it('lista de clientes só com a chave mestra', async () => {
      const { auth } = await chamar({ chave: mestra, escopo: SO_MESTRA, ip: '200.141.18.98', url: '/v1/clientes' });
      expect(auth).toMatchObject({ tipo: 'mestra', clientId: null });
      expect((await mestrasRepo.listarClientes()).map((c) => c.id)).toEqual(expect.arrayContaining([clienteA, clienteB]));
    });

    it('revogada: 401', async () => {
      const r = await mestras.criar(superadminId, { nome: 'revogar', ips: ['200.141.18.98'], expiraEm: expira() });
      expect((await chamar({ chave: r.chave, escopo: 'frota', clientId: clienteA, ip: '200.141.18.98' })).auth.tipo).toBe('mestra');
      await mestras.revogar(superadminId, r.dados.id);
      await expect(chamar({ chave: r.chave, escopo: 'frota', clientId: clienteA, ip: '200.141.18.98' })).rejects.toThrow(UnauthorizedException);
    });

    it('reset da chave mestra: o valor anterior para na hora', async () => {
      const r = await mestras.criar(superadminId, { nome: 'reset', ips: ['200.141.18.98'], expiraEm: expira() });
      expect((await chamar({ chave: r.chave, escopo: 'frota', clientId: clienteA, ip: '200.141.18.98' })).auth.tipo).toBe('mestra');
      const novo = await mestras.resetar(superadminId, r.dados.id);
      await expect(chamar({ chave: r.chave, escopo: 'frota', clientId: clienteA, ip: '200.141.18.98' })).rejects.toThrow(UnauthorizedException);
      expect((await chamar({ chave: novo.chave, escopo: 'frota', clientId: clienteA, ip: '200.141.18.98' })).auth.tipo).toBe('mestra');
    });

    it('a lista de chaves dos clientes não traz as mestras', async () => {
      expect((await chaves.listar(null)).some((c) => c.id === mestraId)).toBe(false);
    });
  });
});
