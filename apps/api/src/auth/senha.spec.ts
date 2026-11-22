import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { MailService, type MailMessage } from '../mail/mail.service';
import { UsersRepository } from '../users/users.repository';
import { ActiveUserRepository } from './active-user.repository';
import { AuthService } from './auth.service';
import { verifyAuthToken } from './jwt';
import { SenhaRepository } from './senha.repository';
import { hashCodigo, MAX_TENTATIVAS } from './codigo';
import { MAX_PEDIDOS_HORA, SenhaService } from './senha.service';

class MailFake extends MailService {
  enviados: MailMessage[] = [];
  override async send(msg: MailMessage): Promise<boolean> {
    this.enviados.push(msg);
    return true;
  }
}

/**
 * Senha contra o Postgres real: "esqueci" (código só por e-mail, HMAC no banco, resposta igual para e-mail
 * desconhecido, limite por conta), redefinir com o código (uso único, expira, revogado pelo pedido seguinte e
 * pelo teto de tentativas),
 * trocar logado (exige a atual), e o login passa a valer com a senha nova.
 */
describe('senha: esqueci, redefinir e trocar', () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'teste-secret';
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const mail = new MailFake();
  const users = new UsersRepository(pool);
  const activeUsers = new ActiveUserRepository(pool);
  const service = new SenhaService(new SenhaRepository(pool), users, activeUsers, mail, new AuditLogRepository(pool), pool);
  const auth = new AuthService(users, activeUsers);

  let clientId: string;
  let userId: string;
  const email = `senha-${randomUUID()}@teste.local`;

  beforeAll(async () => {
    clientId = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-senha-${randomUUID()}`])).rows[0].id;
    userId = (
      await pool.query<{ id: string }>("insert into users (client_id, email, password_hash, role) values ($1, $2, $3, 'gestor') returning id", [
        clientId,
        email,
        await bcrypt.hash('senha-antiga-1', 10),
      ])
    ).rows[0].id;
  });

  afterAll(async () => {
    await pool.query('delete from audit_log where client_id = $1', [clientId]);
    await pool.query('delete from clients where id = $1', [clientId]);
    await pool.end();
  });

  it('e-mail desconhecido: nada enviado, nada gravado, sem erro', async () => {
    expect(await service.esqueci('ninguem@teste.local')).toBeNull();
    expect(mail.enviados).toEqual([]);
  });

  it('e-mail conhecido: código só no e-mail (banco guarda o HMAC)', async () => {
    const codigo = (await service.esqueci(email))!;
    expect(codigo).toMatch(/^\d{6}$/);
    expect(mail.enviados).toHaveLength(1);
    expect(mail.enviados[0].to).toBe(email);
    expect(mail.enviados[0].text).toContain(codigo);
    const { rows } = await pool.query('select token_hash, usado_em from senha_redefinicoes where user_id = $1', [userId]);
    expect(rows).toEqual([{ token_hash: hashCodigo(userId, codigo), usado_em: null }]);
    expect(await service.verificar(email, codigo)).toEqual({ email });
  });

  it('pedir de novo revoga o anterior; redefinir é uso único e já abre sessão; login passa a valer com a nova', async () => {
    const anterior = (await pool.query<{ id: string }>('select id from senha_redefinicoes where user_id = $1', [userId])).rows[0].id;
    const codigo = (await service.esqueci(email))!;
    const r = await pool.query('select revogado_em from senha_redefinicoes where id = $1', [anterior]);
    expect(r.rows[0].revogado_em).not.toBeNull();

    const { accessToken } = await service.redefinir(email, codigo, 'senha-nova-123');
    expect(verifyAuthToken(accessToken)).toMatchObject({ sub: userId, clientId, role: 'gestor' });
    await expect(service.redefinir(email, codigo, 'outra-senha-9')).rejects.toMatchObject({ status: 400 });
    await expect(service.verificar(email, codigo)).rejects.toMatchObject({ status: 400 });

    await expect(auth.login(email, 'senha-antiga-1')).rejects.toMatchObject({ status: 401 });
    expect((await auth.login(email, 'senha-nova-123')).accessToken).toBeTruthy();
    const audit = await pool.query("select action from audit_log where client_id = $1 and action = 'user.redefinir_senha'", [clientId]);
    expect(audit.rowCount).toBe(1);
  });

  it('código expirado → 400', async () => {
    const codigo = (await service.esqueci(email))!;
    await pool.query("update senha_redefinicoes set expira_em = now() - interval '1 minute' where user_id = $1 and revogado_em is null and usado_em is null", [userId]);
    await expect(service.redefinir(email, codigo, 'senha-nova-456')).rejects.toMatchObject({ status: 400 });
  });

  it(`${MAX_TENTATIVAS} códigos errados revogam o pedido; depois nem o certo vale`, async () => {
    await pool.query('delete from senha_redefinicoes where user_id = $1', [userId]);
    const codigo = (await service.esqueci(email))!;
    const errado = codigo === '000000' ? '111111' : '000000';
    for (let i = 0; i < MAX_TENTATIVAS; i++) await expect(service.verificar(email, errado)).rejects.toMatchObject({ status: 400 });
    await expect(service.redefinir(email, codigo, 'senha-nova-456')).rejects.toMatchObject({ status: 400 });
    await expect(auth.login(email, 'senha-nova-456')).rejects.toMatchObject({ status: 401 });
  });

  it(`limite de ${MAX_PEDIDOS_HORA} pedidos por hora por conta: acima disso não envia (resposta igual)`, async () => {
    await pool.query('delete from senha_redefinicoes where user_id = $1', [userId]);
    mail.enviados = [];
    for (let i = 0; i < MAX_PEDIDOS_HORA; i++) expect(await service.esqueci(email)).not.toBeNull();
    expect(await service.esqueci(email)).toBeNull();
    expect(mail.enviados).toHaveLength(MAX_PEDIDOS_HORA);
  });

  it('trocar logado exige a senha atual; outro cliente não troca a senha deste usuário', async () => {
    await expect(service.trocar(clientId, userId, 'errada', 'senha-nova-789')).rejects.toMatchObject({ status: 401 });
    const outroClient = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-senha-b-${randomUUID()}`])).rows[0].id;
    await expect(service.trocar(outroClient, userId, 'senha-nova-123', 'senha-nova-789')).rejects.toMatchObject({ status: 401 });
    await pool.query('delete from clients where id = $1', [outroClient]);

    await service.trocar(clientId, userId, 'senha-nova-123', 'senha-nova-789');
    expect((await auth.login(email, 'senha-nova-789')).accessToken).toBeTruthy();
    const audit = await pool.query("select action from audit_log where client_id = $1 and action = 'user.trocar_senha'", [clientId]);
    expect(audit.rowCount).toBe(1);
  });

  it('sessão persistente: token emitido antes da troca de senha deixa de ser aceito depois dela (AuthGuard via isActive)', async () => {
    const { accessToken: tokenAntigo } = await auth.login(email, 'senha-nova-789');
    const iatAntigo = verifyAuthToken(tokenAntigo).iat!;
    expect(await activeUsers.isActive(userId, iatAntigo)).toBe(true);

    await service.trocar(clientId, userId, 'senha-nova-789', 'senha-mais-nova-000');
    // granularidade de segundo do `iat` (JWT não carrega fração) × microssegundos de `now()`: empurra
    // `senha_alterada_em` 3s à frente do que o SQL real gravou, só para tornar a asserção abaixo
    // determinística — sem isso, rodar o teste no mesmo segundo do `login` acima vira flake, não um bug
    // de produto (comparação por segundo truncado e com 1s de tolerância de relógio, ver active-user.repository.ts;
    // 3s cobre a tolerância e o relógio do banco atrás da API).
    await pool.query('update users set senha_alterada_em = senha_alterada_em + interval \'3 seconds\' where id = $1', [userId]);

    // o MESMO token (iat anterior à troca) não vale mais, mesmo sem ter expirado
    expect(await activeUsers.isActive(userId, iatAntigo)).toBe(false);
    // um login novo (bem depois da troca) continua funcionando normalmente
    const { accessToken: tokenNovo } = await auth.login(email, 'senha-mais-nova-000');
    const iatNovo = verifyAuthToken(tokenNovo).iat! + 3; // os 3s empurrados acima (a tolerância de 1s cobre a fração de segundo)
    expect(await activeUsers.isActive(userId, iatNovo)).toBe(true);
  });

  it('usuário desativado não recebe código de redefinição', async () => {
    await pool.query('update users set desativado_em = now() where id = $1', [userId]);
    mail.enviados = [];
    await pool.query('delete from senha_redefinicoes where user_id = $1', [userId]);
    expect(await service.esqueci(email)).toBeNull();
    expect(mail.enviados).toEqual([]);
  });
});
