import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { ActiveUserRepository } from '../auth/active-user.repository';
import { ClientsRepository } from '../clients/clients.repository';
import { ConvitesService } from '../convites/convites.service';
import type { MailService } from '../mail/mail.service';
import { UsersRepository } from '../users/users.repository';
import { UsersService } from '../users/users.service';
import { PerfisRepository } from './perfis.repository';
import { PerfisService } from './perfis.service';
import { PermissionsRepository } from './permissions.repository';
import { PermissionsService } from './permissions.service';

/**
 * Perfis de acesso próprios do cliente (migration 1794430000000): resolução da permissão pelo perfil do usuário,
 * isolamento entre clientes (perfil de A é "não encontrado" para B, e a FK composta barra usuário de B em perfil de
 * A), proteção contra escalonamento e troca de perfil valendo na hora. Postgres local real.
 */
describe('Perfis de acesso — resolução, isolamento e troca de perfil', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const audit = new AuditLogRepository(pool);
  const perfisRepo = new PerfisRepository(pool);
  const rolesRepo = new PermissionsRepository(pool);
  const perfis = new PerfisService(perfisRepo, rolesRepo, audit, pool);
  const permissions = new PermissionsService(rolesRepo, perfisRepo, audit, pool);
  const usersRepo = new UsersRepository(pool);
  const semEmail = { send: async () => false } as unknown as MailService;
  const users = new UsersService(usersRepo, audit, new ClientsRepository(pool), new ConvitesService(pool, semEmail, new ActiveUserRepository(pool), audit), pool);

  let clientA: string;
  let clientB: string;
  let adminA: string;
  let adminB: string;
  let membroA: string;
  let membroB: string;
  const email = () => `perfil-${randomUUID()}@teste.local`;

  beforeAll(async () => {
    const ins = (n: string) => pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-perfis-${n}-${randomUUID()}`]);
    clientA = (await ins('a')).rows[0].id;
    clientB = (await ins('b')).rows[0].id;
    adminA = (await usersRepo.create({ clientId: clientA, email: email(), passwordHash: 'x', role: 'admin' })).id;
    adminB = (await usersRepo.create({ clientId: clientB, email: email(), passwordHash: 'x', role: 'admin' })).id;
    membroA = (await usersRepo.create({ clientId: clientA, email: email(), passwordHash: 'x', role: 'operador' })).id;
    membroB = (await usersRepo.create({ clientId: clientB, email: email(), passwordHash: 'x', role: 'operador' })).id;
  });

  afterAll(async () => {
    await pool.query('delete from audit_log where client_id in ($1, $2)', [clientA, clientB]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('perfil nasce copiando o que vale hoje para o papel de origem, inclusive o ajuste do cliente', async () => {
    await permissions.set(clientA, 'operador', 'multas.editar', true, adminA);
    const p = await perfis.criar(clientA, adminA, { nome: `Portaria ${randomUUID().slice(0, 6)}`, descricao: null, copiarDe: 'operador' });
    const de = (k: string) => p.permissoes.find((x) => x.key === k)!;
    expect(p.baseRole).toBe('operador');
    expect(de('multas.editar').allowed).toBe(true);
    expect(de('comandos.bloquear').allowed).toBe(false);
    expect(de('permissoes.gerenciar')).toMatchObject({ allowed: false, editableByClient: false });
    await permissions.restoreDefault(clientA, 'operador', 'multas.editar', adminA);
  });

  it('usuário no perfil é autorizado pelo perfil, e a mudança vale na hora', async () => {
    const p = await perfis.criar(clientA, adminA, { nome: `Financeiro ${randomUUID().slice(0, 6)}`, descricao: 'só multas', copiarDe: 'operador' });
    await users.definirPerfil(clientA, adminA, membroA, { role: p.baseRole, perfilId: p.id });

    expect(await permissions.isAllowedForUser(clientA, membroA, 'multas.ver')).toBe(true);
    await perfis.definirPermissao(clientA, adminA, p.id, 'multas.ver', false);
    expect(await permissions.isAllowedForUser(clientA, membroA, 'multas.ver')).toBe(false);
    expect(await permissions.permissoesDoUsuario(clientA, membroA)).not.toContain('multas.ver');

    // voltar ao padrão = padrão do papel-base
    await perfis.definirPermissao(clientA, adminA, p.id, 'multas.ver', null);
    expect(await permissions.isAllowedForUser(clientA, membroA, 'multas.ver')).toBe(true);

    // o papel-base de quem está no perfil não muda o resultado: vale o perfil, não o override do papel
    await permissions.set(clientA, 'operador', 'pneus.ver', false, adminA);
    expect(await permissions.isAllowedForUser(clientA, membroA, 'pneus.ver')).toBe(true);
    await permissions.restoreDefault(clientA, 'operador', 'pneus.ver', adminA);

    // de volta ao Operador embutido: segue o papel de novo
    await users.definirPerfil(clientA, adminA, membroA, { role: 'operador', perfilId: null });
    await perfis.definirPermissao(clientA, adminA, p.id, 'multas.ver', false);
    expect(await permissions.isAllowedForUser(clientA, membroA, 'multas.ver')).toBe(true);
  });

  it('permissão travada pela plataforma não é editável no perfil (sem autoescalonamento)', async () => {
    const p = await perfis.criar(clientA, adminA, { nome: `Trava ${randomUUID().slice(0, 6)}`, descricao: null, copiarDe: 'gestor' });
    await expect(perfis.definirPermissao(clientA, adminA, p.id, 'permissoes.gerenciar', true)).rejects.toThrow(/travada/);
    // nem com linha gravada à força no banco
    await pool.query(`insert into perfil_permissoes (client_id, perfil_id, permission_key, allowed) values ($1, $2, 'permissoes.gerenciar', true)`, [clientA, p.id]);
    await users.definirPerfil(clientA, adminA, membroA, { role: 'gestor', perfilId: p.id });
    expect(await permissions.isAllowedForUser(clientA, membroA, 'permissoes.gerenciar')).toBe(false);
    expect(await permissions.permissoesDoUsuario(clientA, membroA)).not.toContain('permissoes.gerenciar');
    await users.definirPerfil(clientA, adminA, membroA, { role: 'operador', perfilId: null });
  });

  it('cliente B não lê, não altera e não exclui perfil do cliente A; o dono continua alterando', async () => {
    const p = await perfis.criar(clientA, adminA, { nome: `Isolado ${randomUUID().slice(0, 6)}`, descricao: null, copiarDe: 'operador' });
    expect((await perfis.listar(clientB)).map((x) => x.id)).not.toContain(p.id);
    await expect(perfis.buscar(clientB, p.id)).rejects.toThrow(/não encontrado/);
    await expect(perfis.renomear(clientB, adminB, p.id, { nome: 'Invadido', descricao: null })).rejects.toThrow(/não encontrado/);
    await expect(perfis.definirPermissao(clientB, adminB, p.id, 'multas.ver', false)).rejects.toThrow(/não encontrado/);
    await expect(perfis.excluir(clientB, adminB, p.id)).rejects.toThrow(/não encontrado/);
    await expect(perfis.criar(clientB, adminB, { nome: 'Cópia', descricao: null, copiarDe: p.id })).rejects.toThrow(/não encontrado/);
    await expect(perfis.baseRoleDe(clientB, p.id)).rejects.toThrow(/não encontrado/);

    const dono = await perfis.renomear(clientA, adminA, p.id, { nome: `Renomeado ${randomUUID().slice(0, 6)}`, descricao: 'ok' });
    expect(dono.descricao).toBe('ok');
    expect((await perfis.listar(clientA)).map((x) => x.id)).toContain(p.id);
  });

  it('a FK composta barra usuário de B em perfil de A, mesmo sem passar pelo serviço', async () => {
    const p = await perfis.criar(clientA, adminA, { nome: `FK ${randomUUID().slice(0, 6)}`, descricao: null, copiarDe: 'operador' });
    await expect(usersRepo.setPerfil(clientB, membroB, 'operador', p.id)).rejects.toThrow(/users_perfil_fk/);
    await expect(users.definirPerfil(clientB, adminB, membroA, { role: 'operador', perfilId: null })).rejects.toThrow(/não encontrado/);
  });

  it('perfil com pessoas não é excluído; vazio sai', async () => {
    const p = await perfis.criar(clientA, adminA, { nome: `Ocupado ${randomUUID().slice(0, 6)}`, descricao: null, copiarDe: 'operador' });
    await users.definirPerfil(clientA, adminA, membroA, { role: 'operador', perfilId: p.id });
    await expect(perfis.excluir(clientA, adminA, p.id)).rejects.toThrow(/Mova as pessoas/);
    await users.definirPerfil(clientA, adminA, membroA, { role: 'operador', perfilId: null });
    await perfis.excluir(clientA, adminA, p.id);
    await expect(perfis.buscar(clientA, p.id)).rejects.toThrow(/não encontrado/);
  });

  it('nome repetido no mesmo cliente é recusado; em outro cliente pode', async () => {
    const nome = `Repetido ${randomUUID().slice(0, 6)}`;
    await perfis.criar(clientA, adminA, { nome, descricao: null, copiarDe: 'operador' });
    await expect(perfis.criar(clientA, adminA, { nome: nome.toUpperCase(), descricao: null, copiarDe: 'gestor' })).rejects.toThrow(/Já existe/);
    await expect(perfis.criar(clientB, adminB, { nome, descricao: null, copiarDe: 'operador' })).resolves.toBeTruthy();
  });

  it('troca de perfil: nunca o próprio nem o admin; registra na auditoria', async () => {
    await expect(users.definirPerfil(clientA, adminA, adminA, { role: 'gestor', perfilId: null })).rejects.toThrow(/próprio acesso/);
    const outroAdmin = (await usersRepo.create({ clientId: clientA, email: email(), passwordHash: 'x', role: 'admin' })).id;
    await expect(users.definirPerfil(clientA, adminA, outroAdmin, { role: 'operador', perfilId: null })).rejects.toThrow(/admin/);

    const r = await users.definirPerfil(clientA, adminA, membroA, { role: 'gestor', perfilId: null });
    expect(r.role).toBe('gestor');
    const { rows } = await pool.query(`select before, after from audit_log where client_id = $1 and action = 'user.perfil' and target = $2 order by created_at desc limit 1`, [clientA, membroA]);
    expect(rows[0].after).toMatchObject({ role: 'gestor', perfilId: null });
    await users.definirPerfil(clientA, adminA, membroA, { role: 'operador', perfilId: null });
  });

  it('admin tem todas as permissões do catálogo e perfil não muda isso', async () => {
    const todas = await permissions.permissoesDoUsuario(clientA, adminA);
    expect(todas).toContain('permissoes.gerenciar');
    expect(todas).toContain('comandos.bloquear');
    expect(await permissions.isAllowedForUser(clientB, adminA, 'ativos.ver')).toBe(false); // usuário de A no cliente B: não existe lá
  });
});
