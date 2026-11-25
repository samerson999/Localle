import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { ActiveUserRepository } from '../auth/active-user.repository';
import { AuthService } from '../auth/auth.service';
import type { MailService } from '../mail/mail.service';
import { parseEscopo, parseNovoMembro } from './dto/create-team-user.dto';
import { EmailContaService } from './email-conta.service';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

/**
 * Equipe criada pelo admin com nome de usuário + senha (25/11/2026): login por usuário, escopo de veículos por grupo e
 * operação, exclusão que preserva o histórico e o e-mail confirmado no primeiro acesso. Postgres local real; só o
 * envio de e-mail é falso.
 */
describe('Equipe do cliente — usuário + senha, escopo e exclusão', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new UsersRepository(pool);
  const audit = new AuditLogRepository(pool);
  const service = new UsersService(repo, audit, pool);
  const activeUsers = new ActiveUserRepository(pool);
  const auth = new AuthService(repo, activeUsers);
  const enviados: { to: string; text: string }[] = [];
  const mail = { send: async (m: { to: string; text: string }) => (enviados.push(m), true) } as unknown as MailService;
  const emailConta = new EmailContaService(repo, mail, audit, pool);
  const senha = 'senha-teste-123';
  const tudo = parseEscopo({ restrito: false });
  const nome = () => `u${randomUUID().slice(0, 8)}`;

  let clientA: string;
  let clientB: string;
  let adminA: string;
  let adminB: string;
  let grupoA: string;
  let grupoB: string;
  let operacaoA: string;
  const ativo: Record<'noGrupo' | 'naOperacao' | 'solto' | 'outroGrupo', string> = {} as never;

  beforeAll(async () => {
    const ins = (n: string) => pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-equipe-${n}-${randomUUID()}`]);
    clientA = (await ins('a')).rows[0].id;
    clientB = (await ins('b')).rows[0].id;
    adminA = (await repo.create({ clientId: clientA, email: `adm-${randomUUID()}@teste.local`, passwordHash: 'x', role: 'admin' })).id;
    adminB = (await repo.create({ clientId: clientB, email: `adm-${randomUUID()}@teste.local`, passwordHash: 'x', role: 'admin' })).id;
    const grupo = async (c: string, n: string) => (await pool.query<{ id: string }>('insert into asset_groups (client_id, name) values ($1, $2) returning id', [c, n])).rows[0].id;
    grupoA = await grupo(clientA, 'Grupo A');
    const outroGrupoA = await grupo(clientA, 'Outro A');
    grupoB = await grupo(clientB, 'Grupo B');
    operacaoA = (await pool.query<{ id: string }>("insert into operacoes (client_id, nome) values ($1, 'Op A') returning id", [clientA])).rows[0].id;
    const asset = async (placa: string, operacao: string | null = null) =>
      (await pool.query<{ id: string }>('insert into assets (client_id, plate, operacao_id) values ($1, $2, $3) returning id', [clientA, placa, operacao])).rows[0].id;
    ativo.noGrupo = await asset(`T${randomUUID().slice(0, 6)}`);
    ativo.naOperacao = await asset(`T${randomUUID().slice(0, 6)}`, operacaoA);
    ativo.solto = await asset(`T${randomUUID().slice(0, 6)}`);
    ativo.outroGrupo = await asset(`T${randomUUID().slice(0, 6)}`);
    await pool.query('insert into asset_group_members (client_id, group_id, asset_id) values ($1, $2, $3), ($1, $4, $5)', [clientA, grupoA, ativo.noGrupo, outroGrupoA, ativo.outroGrupo]);
  });

  afterAll(async () => {
    await pool.query('delete from audit_log where client_id in ($1, $2)', [clientA, clientB]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('cria por usuário + senha, sem e-mail; entra pelo usuário (sem diferenciar maiúsculas); auditado', async () => {
    const username = nome();
    const u = await service.criarMembro(clientA, adminA, { username, senha, role: 'operador', perfilId: null, escopo: tudo });
    expect(u).toMatchObject({ client_id: clientA, username, email: null, role: 'operador' });
    expect(u.password_hash).not.toBeNull();
    await expect(auth.login(username.toUpperCase(), senha)).resolves.toHaveProperty('accessToken');
    await expect(auth.login(username, 'senha-errada-1')).rejects.toThrow(UnauthorizedException);
    const { rows } = await pool.query("select actor_id from audit_log where action = 'user.create' and target = $1", [u.id]);
    expect(rows).toEqual([{ actor_id: adminA }]);
  });

  it('usuário repetido (mesmo de outro cliente) é recusado com 409', async () => {
    const username = nome();
    await service.criarMembro(clientA, adminA, { username, senha, role: 'gestor', perfilId: null, escopo: tudo });
    await expect(service.criarMembro(clientB, adminB, { username, senha, role: 'gestor', perfilId: null, escopo: tudo })).rejects.toThrow(ConflictException);
  });

  it('DTO: usuário fora do formato, senha curta e escopo restrito vazio são recusados; admin não é criável', async () => {
    expect(() => parseNovoMembro({ usuario: 'João Silva', senha, perfil: 'gestor' })).toThrow(/usuario/);
    expect(() => parseNovoMembro({ usuario: 'joao', senha: '123', perfil: 'gestor' })).toThrow(/senha/);
    expect(() => parseNovoMembro({ usuario: 'joao', senha, perfil: 'admin' })).toThrow(/perfil/);
    expect(() => parseEscopo({ restrito: true })).toThrow(/ao menos um/);
    expect(parseNovoMembro({ usuario: ' Joao.Silva ', senha, perfil: 'gestor' })).toMatchObject({ username: 'joao.silva', escopo: { restrito: false } });
  });

  it('escopo: vê o grupo marcado, a operação marcada e — com "sem grupo/operação" — o veículo solto; nunca o resto', async () => {
    const u = await service.criarMembro(clientA, adminA, {
      username: nome(), senha, role: 'operador', perfilId: null,
      escopo: { restrito: true, semGrupo: false, grupoIds: [grupoA], operacaoIds: [] },
    });
    expect((await activeUsers.ativosVisiveis(clientA, u.id)).sort()).toEqual([ativo.noGrupo].sort());

    await service.definirEscopo(clientA, adminA, u.id, { restrito: true, semGrupo: true, grupoIds: [grupoA], operacaoIds: [operacaoA] });
    expect((await activeUsers.ativosVisiveis(clientA, u.id)).sort()).toEqual([ativo.noGrupo, ativo.naOperacao, ativo.solto].sort());
    expect(await activeUsers.situacao(u.id, Math.floor(Date.now() / 1000) + 5)).toEqual({ escopoRestrito: true });

    // volta a ver tudo: o guard nem consulta a lista
    await service.definirEscopo(clientA, adminA, u.id, tudo);
    expect(await activeUsers.situacao(u.id, Math.floor(Date.now() / 1000) + 5)).toEqual({ escopoRestrito: false });
  });

  it('escopo: grupo de outro cliente não entra (sem IDOR por id); admin de outro cliente não alcança o usuário', async () => {
    const u = await service.criarMembro(clientA, adminA, {
      username: nome(), senha, role: 'operador', perfilId: null,
      escopo: { restrito: true, semGrupo: false, grupoIds: [grupoA, grupoB], operacaoIds: [] },
    });
    expect((await repo.escopo(clientA, u.id))?.grupoIds).toEqual([grupoA]);
    await expect(service.definirEscopo(clientB, adminB, u.id, tudo)).rejects.toThrow(NotFoundException);
    await expect(service.definirSenha(clientB, adminB, u.id, 'outra-senha-1')).rejects.toThrow(NotFoundException);
    await expect(service.excluir(clientB, adminB, u.id)).rejects.toThrow(NotFoundException);
    // o dono continua alterando
    expect((await service.definirEscopo(clientA, adminA, u.id, tudo)).restrito).toBe(false);
  });

  it('admin redefine a senha: a antiga para de valer e as sessões abertas caem; não mexe em si nem em outro admin', async () => {
    const username = nome();
    const u = await service.criarMembro(clientA, adminA, { username, senha, role: 'gestor', perfilId: null, escopo: tudo });
    const iatAntes = Math.floor(Date.now() / 1000) - 2;
    await service.definirSenha(clientA, adminA, u.id, 'senha-nova-456');
    await expect(auth.login(username, senha)).rejects.toThrow(UnauthorizedException);
    await expect(auth.login(username, 'senha-nova-456')).resolves.toHaveProperty('accessToken');
    expect(await activeUsers.isActive(u.id, iatAntes)).toBe(false);
    await expect(service.definirSenha(clientA, adminA, adminA, 'x-senha-123')).rejects.toThrow(/próprio/);
    const outroAdmin = await repo.create({ clientId: clientA, email: `adm-${randomUUID()}@teste.local`, passwordHash: 'x', role: 'admin' });
    await expect(service.excluir(clientA, adminA, outroAdmin.id)).rejects.toThrow(ForbiddenException);
  });

  it('exclusão: some da equipe, perde o acesso na hora, o usuário fica livre e a linha fica para o histórico', async () => {
    const username = nome();
    const u = await service.criarMembro(clientA, adminA, { username, senha, role: 'operador', perfilId: null, escopo: tudo });
    await service.excluir(clientA, adminA, u.id);

    expect((await service.findTeam(clientA)).map((m) => m.id)).not.toContain(u.id);
    expect(await activeUsers.isActive(u.id, Math.floor(Date.now() / 1000) + 5)).toBe(false);
    await expect(auth.login(username, senha)).rejects.toThrow(UnauthorizedException);
    await expect(service.setAtivo(clientA, adminA, u.id, true)).rejects.toThrow(NotFoundException);
    const { rows } = await pool.query('select excluido_em is not null as excluido from users where id = $1', [u.id]);
    expect(rows).toEqual([{ excluido: true }]);

    const novo = await service.criarMembro(clientA, adminA, { username, senha, role: 'operador', perfilId: null, escopo: tudo });
    expect(novo.id).not.toBe(u.id);
  });

  it('desativar e reativar continuam funcionando para quem nasceu por usuário', async () => {
    const username = nome();
    const u = await service.criarMembro(clientA, adminA, { username, senha, role: 'operador', perfilId: null, escopo: tudo });
    await service.setAtivo(clientA, adminA, u.id, false);
    await expect(auth.login(username, senha)).rejects.toThrow(UnauthorizedException);
    await service.setAtivo(clientA, adminA, u.id, true);
    await expect(auth.login(username, senha)).resolves.toHaveProperty('accessToken');
  });

  describe('e-mail no primeiro acesso', () => {
    it('sem e-mail, acessos pede; o código enviado confirma e o e-mail passa a valer para login e "esqueci a senha"', async () => {
      const username = nome();
      const u = await service.criarMembro(clientA, adminA, { username, senha, role: 'operador', perfilId: null, escopo: tudo });
      expect(await activeUsers.conta(u.id)).toEqual({ email: null, usuario: username });
      const email = `${username}@teste.local`;
      const { enviado, codigo } = await emailConta.pedir(clientA, u.id, ` ${email.toUpperCase()} `);
      expect(enviado).toBe(true);
      expect(enviados.at(-1)).toMatchObject({ to: email });
      expect(enviados.at(-1)?.text).toContain(codigo);

      await expect(emailConta.confirmar(clientA, u.id, codigo === '000000' ? '111111' : '000000')).rejects.toThrow(/inválido/);
      await expect(emailConta.confirmar(clientA, u.id, codigo)).resolves.toEqual({ email });
      expect(await activeUsers.conta(u.id)).toEqual({ email, usuario: username });
      await expect(auth.login(email, senha)).resolves.toHaveProperty('accessToken');
      await expect(auth.login(username, senha)).resolves.toHaveProperty('accessToken');
      // o código é de uso único, e a conta já tem e-mail
      await expect(emailConta.confirmar(clientA, u.id, codigo)).rejects.toThrow(/inválido/);
      await expect(emailConta.pedir(clientA, u.id, 'outro@teste.local')).rejects.toThrow(/já tem e-mail/);
    });

    it('e-mail de outra conta é recusado; o código é de quem pediu (outro usuário não confirma com ele)', async () => {
      const u = await service.criarMembro(clientA, adminA, { username: nome(), senha, role: 'operador', perfilId: null, escopo: tudo });
      const outro = await service.criarMembro(clientA, adminA, { username: nome(), senha, role: 'operador', perfilId: null, escopo: tudo });
      const { rows } = await pool.query<{ email: string }>('select email from users where id = $1', [adminA]);
      await expect(emailConta.pedir(clientA, u.id, rows[0].email)).rejects.toThrow(ConflictException);
      const { codigo } = await emailConta.pedir(clientA, u.id, `${randomUUID()}@teste.local`);
      await expect(emailConta.confirmar(clientA, outro.id, codigo)).rejects.toThrow(/inválido/);
      await expect(emailConta.confirmar(clientB, u.id, codigo)).rejects.toThrow(/inválido/);
    });

    it('limite de códigos por hora', async () => {
      const u = await service.criarMembro(clientA, adminA, { username: nome(), senha, role: 'operador', perfilId: null, escopo: tudo });
      for (let i = 0; i < 3; i++) await emailConta.pedir(clientA, u.id, `${randomUUID()}@teste.local`);
      await expect(emailConta.pedir(clientA, u.id, `${randomUUID()}@teste.local`)).rejects.toThrow(/Muitos códigos/);
    });
  });
});
