import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { ActiveUserRepository } from '../../auth/active-user.repository';
import { escapeHtml } from '../../mail/escape-html';
import { MailService } from '../../mail/mail.service';
import { formatoDeChave, hashDaChave } from '../chaves/chave';
import { ApiChavesRepository } from '../chaves/api-chaves.repository';
import { ApiChavesMestrasRepository } from '../chaves-mestras/api-chaves-mestras.repository';
import { ESCOPOS, type Escopo } from './escopos';
import { ipPermitido, normalizarIp } from './ip';
import { LimitadorDeTaxa } from './limitador';
import { CacheDeChaves, type ChaveResolvida } from './cache-de-chaves';
import { API_PUBLICA_KEY, SO_MESTRA, type ApiAuth } from './metadata';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `ultimo_uso_em` gravado no máximo 1x por minuto por chave. */
const USO_MS = 60_000;

type Req = Request & { apiAuth?: ApiAuth };

const erro = (status: number, codigo: string, message: string) => new HttpException({ statusCode: status, codigo, message }, status);
const naoAutorizado = () => new UnauthorizedException({ statusCode: 401, codigo: 'chave_invalida', message: 'Chave de acesso ausente, inválida ou revogada' });

/**
 * Autenticação da API pública (docs/PLANO-API-PUBLICA.md § 3.3 e § 3.6). Só roda em rota `@ApiPublica()`; o `AuthGuard`
 * global pula essas rotas, e este guard recusa JWT — chave nunca abre rota interna, JWT nunca abre `/v1`.
 *
 * Ordem: método → chave (formato, hash, validade) → IP (mestra) → cliente (da chave ou do caminho) → contrato
 * bloqueado → módulo do contrato → escopo → limite de requisições.
 */
@Injectable()
export class ApiChaveGuard implements CanActivate, OnModuleDestroy {
  private readonly logger = new Logger(ApiChaveGuard.name);
  private readonly usoGravado = new Map<string, number>();
  /** Registros de acesso da chave mestra ainda gravando — o desligamento da API espera por eles. */
  private readonly pendentes = new Set<Promise<void>>();

  constructor(
    private readonly reflector: Reflector,
    private readonly chaves: ApiChavesRepository,
    private readonly mestras: ApiChavesMestrasRepository,
    private readonly acessos: ActiveUserRepository,
    private readonly limitador: LimitadorDeTaxa,
    private readonly mail: MailService,
    private readonly cache: CacheDeChaves,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const escopo = this.reflector.getAllAndOverride<Escopo | typeof SO_MESTRA | undefined>(API_PUBLICA_KEY, [context.getHandler(), context.getClass()]);
    const req = context.switchToHttp().getRequest<Req>();
    const res = context.switchToHttp().getResponse<Response>();
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);

    // defesa extra da regra "só consulta": as controllers só têm @Get, mas nenhum outro método passa daqui
    if (req.method !== 'GET' && req.method !== 'HEAD') throw erro(HttpStatus.METHOD_NOT_ALLOWED, 'metodo_nao_permitido', 'A API pública é somente leitura');
    if (!escopo) throw new Error('ApiChaveGuard numa rota sem @ApiPublica()');

    const header = req.headers['authorization'];
    const valor = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const ip = normalizarIp(req.ip);
    if (!formatoDeChave(valor)) throw naoAutorizado(); // inclui JWT: nunca aceito aqui

    const chave = await this.resolver(valor);
    if (!chave) {
      this.logger.warn(`chave inválida ou revogada inicio=${valor.slice(0, 6)} ip=${ip} request_id=${requestId}`);
      throw naoAutorizado();
    }

    // rota só da chave mestra, sem cliente (lista de clientes)
    if (escopo === SO_MESTRA) {
      if (chave.tipo !== 'mestra') throw naoAutorizado();
      this.conferirIp(chave, ip, requestId);
      this.registrarAcessoMestra(res, req, chave, null, ip);
      await this.limitar(res, chave, null);
      this.marcarUso(chave);
      req.apiAuth = { tipo: 'mestra', chaveId: chave.id, clientId: null };
      return true;
    }

    const clientIdDoCaminho = req.params?.clientId;
    let clientId: string;
    if (chave.tipo === 'mestra') {
      this.conferirIp(chave, ip, requestId);
      // a chave mestra só consulta pelo caminho com o cliente; nas rotas da chave de cliente ela não tem cliente
      if (!clientIdDoCaminho) throw naoAutorizado();
      if (!UUID.test(clientIdDoCaminho)) throw erro(400, 'cliente_invalido', 'Parâmetro "clientId" precisa ser um UUID');
      this.registrarAcessoMestra(res, req, chave, clientIdDoCaminho, ip);
      if (!(await this.mestras.clienteExiste(clientIdDoCaminho))) throw new NotFoundException({ statusCode: 404, codigo: 'cliente_nao_encontrado', message: 'Cliente não encontrado' });
      clientId = clientIdDoCaminho;
    } else {
      if (clientIdDoCaminho !== undefined) throw naoAutorizado(); // chave de cliente não usa o caminho da mestra
      clientId = chave.clientId!;
    }

    // contrato suspenso/cancelado corta a chave do cliente como corta o login; a mestra continua consultando
    if (chave.tipo === 'cliente' && (await this.acessos.isClientBlocked(clientId))) throw naoAutorizado();

    const { modules } = await this.acessos.acessosDoCliente(clientId);
    const modulo = ESCOPOS[escopo].modulo;
    if (modules !== null && !modules.includes(modulo)) {
      throw new ForbiddenException({ statusCode: 403, codigo: 'modulo_nao_contratado', message: 'Este módulo não está contratado' });
    }
    if (chave.tipo === 'cliente' && !chave.escopos.includes(escopo)) {
      throw new ForbiddenException({ statusCode: 403, codigo: 'escopo_ausente', message: `A chave não tem o escopo "${escopo}"` });
    }

    await this.limitar(res, chave, clientId);

    this.marcarUso(chave);
    req.apiAuth = { tipo: chave.tipo, chaveId: chave.id, clientId };
    return true;
  }

  private conferirIp(chave: ChaveResolvida, ip: string | null, requestId: string) {
    if (ipPermitido(ip, chave.ips)) return;
    this.logger.warn(`chave mestra fora da lista de IPs chave_id=${chave.id} ip=${ip} request_id=${requestId}`);
    throw naoAutorizado();
  }

  private async limitar(res: Response, chave: ChaveResolvida, clientId: string | null) {
    const lim = await this.limitador.consumir(chave.tipo, chave.id);
    res.setHeader('X-RateLimit-Limite', String(lim.limite));
    res.setHeader('X-RateLimit-Restante', String(lim.restante));
    res.setHeader('X-RateLimit-Reinicio', String(lim.reinicioEm));
    if (lim.permitido) return;
    res.setHeader('Retry-After', String(lim.reinicioEm));
    this.logger.warn(`limite de requisições chave_id=${chave.id} tipo=${chave.tipo} client_id=${clientId}`);
    throw erro(HttpStatus.TOO_MANY_REQUESTS, 'limite_excedido', 'Limite de requisições excedido');
  }

  /** O token não diz o tipo (64 caracteres, sem prefixo): o hash é procurado nas chaves de cliente e depois nas mestras. */
  private async resolver(valor: string): Promise<ChaveResolvida | null> {
    const hash = hashDaChave(valor);
    const k = hash.toString('hex');
    const emCache = this.cache.ler(k);
    if (emCache) return emCache;
    let chave: ChaveResolvida | null = null;
    const c = await this.chaves.buscarValidaPorHash(hash);
    if (c) chave = { tipo: 'cliente', id: c.id, clientId: c.client_id, escopos: c.escopos, ips: [], nome: c.nome };
    else {
      const m = await this.mestras.buscarValidaPorHash(hash);
      if (m) chave = { tipo: 'mestra', id: m.id, clientId: null, escopos: [], ips: m.ips_permitidos, nome: m.nome };
    }
    if (chave) this.cache.guardar(k, chave);
    return chave;
  }

  private marcarUso(chave: ChaveResolvida) {
    const agora = Date.now();
    if ((this.usoGravado.get(chave.id) ?? 0) > agora - USO_MS) return;
    this.usoGravado.set(chave.id, agora);
    const repo = chave.tipo === 'cliente' ? this.chaves : this.mestras;
    repo.marcarUso(chave.id).catch((e) => this.logger.error(`falha ao gravar último uso chave_id=${chave.id}: ${e?.message}`));
  }

  /** Toda consulta com chave mestra vira linha de auditoria (inclusive as recusadas depois daqui), no fim da resposta. */
  private registrarAcessoMestra(res: Response, req: Req, chave: ChaveResolvida, clientId: string | null, ip: string | null) {
    const rota = (req.originalUrl ?? req.url).split('?')[0].slice(0, 300);
    const cliente = clientId && UUID.test(clientId) ? clientId : null;
    const novoIp = ip ? this.mestras.ipJaUsado(chave.id, ip).then((usado) => !usado) : Promise.resolve(false);
    res.on('finish', () => {
      const p = novoIp
        .then(async (novo) => {
          await this.mestras.registrarAcesso({ chaveId: chave.id, clientId: cliente, rota, ip, status: res.statusCode });
          if (novo) await this.avisarIpNovo(chave, ip!);
        })
        .catch((e) => this.logger.error(`falha ao registrar acesso de chave mestra chave_id=${chave.id} client_id=${clientId}: ${e?.message}`))
        .finally(() => this.pendentes.delete(p));
      this.pendentes.add(p);
    });
  }

  /** Espera os registros de acesso em andamento (desligamento da API e testes). */
  async aguardarRegistros(): Promise<void> {
    await Promise.all([...this.pendentes]);
  }

  onModuleDestroy() {
    return this.aguardarRegistros();
  }

  private async avisarIpNovo(chave: ChaveResolvida, ip: string) {
    this.logger.log(`chave mestra usada de IP novo chave_id=${chave.id} ip=${ip}`);
    const texto = `A chave mestra "${chave.nome}" da API foi usada pela primeira vez a partir do IP ${ip}. Se não reconhece este acesso, revogue a chave no Console.`;
    for (const to of await this.mestras.emailsDosSuperadmins()) {
      void this.mail.send({ to, subject: 'Chave mestra da API usada de um IP novo', text: texto, html: `<p>${escapeHtml(texto)}</p>` });
    }
  }
}
