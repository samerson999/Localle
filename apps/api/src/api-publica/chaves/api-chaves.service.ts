import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ActiveUserRepository } from '../../auth/active-user.repository';
import { AuditLogRepository } from '../../audit/audit-log.repository';
import { instanteOpcional, texto, uuid } from '../../common/validar';
import { escapeHtml } from '../../mail/escape-html';
import { MailService } from '../../mail/mail.service';
import { CacheDeChaves } from '../auth/cache-de-chaves';
import { ehEscopo, ESCOPOS, type Escopo } from '../auth/escopos';
import { ApiChavesRepository, MAX_CHAVES_ATIVAS, type ApiChaveVisivel } from './api-chaves.repository';
import { gerarChave } from './chave';

export interface ChaveGerada {
  /** Valor completo — devolvido só nesta resposta, nunca mais. */
  chave: string;
  dados: ApiChaveVisivel;
}

/**
 * Chaves de acesso dos clientes, geridas pela equipe da Localle no Console (docs/PLANO-API-PUBLICA.md § 3.5, decisão
 * de 24/11/2026): gerar vinculada a um cliente, resetar (valor novo na mesma chave) e revogar. Tudo auditado.
 */
@Injectable()
export class ApiChavesService {
  private readonly logger = new Logger(ApiChavesService.name);

  constructor(
    private readonly repo: ApiChavesRepository,
    private readonly acessos: ActiveUserRepository,
    private readonly audit: AuditLogRepository,
    private readonly mail: MailService,
    private readonly cache: CacheDeChaves,
  ) {}

  listar(clientId: string | null) {
    return this.repo.listarTodas(clientId);
  }

  /** Escopos que a chave do cliente pode ter: os dos módulos do contrato dele (sem contrato, todos). */
  async escoposDisponiveis(clientId: string): Promise<{ key: Escopo; nome: string }[]> {
    const { modules } = await this.acessos.acessosDoCliente(clientId);
    return (Object.keys(ESCOPOS) as Escopo[])
      .filter((k) => modules === null || modules.includes(ESCOPOS[k].modulo))
      .map((k) => ({ key: k, nome: ESCOPOS[k].nome }));
  }

  async criar(superadminId: string, body: { clientId?: unknown; nome?: unknown; escopos?: unknown; expiraEm?: unknown }): Promise<ChaveGerada> {
    const clientId = uuid(body?.clientId, 'clientId');
    if (!(await this.repo.clienteExiste(clientId))) throw new NotFoundException('Cliente não encontrado');
    const nome = texto(body?.nome, 'nome', 80);
    const escopos = await this.validarEscopos(clientId, body?.escopos);
    const expiraEm = instanteOpcional(body?.expiraEm, 'expiraEm');
    if (expiraEm && expiraEm.getTime() <= Date.now()) throw new BadRequestException('"expiraEm" precisa ser no futuro');
    if ((await this.repo.contarAtivas(clientId)) >= MAX_CHAVES_ATIVAS) {
      throw new ConflictException(`O cliente já tem ${MAX_CHAVES_ATIVAS} chaves ativas — revogue uma antes de gerar outra`);
    }
    const { chave, hash, exibicao } = gerarChave();
    const row = await this.repo.criar(clientId, { nome, escopos, expiraEm, prefixo: exibicao, hash, superadminId });
    await this.audit.record({ actorType: 'superadmin', actorId: superadminId, clientId, action: 'api_chave.criar', target: row.id, after: { nome, escopos, expiraEm } });
    this.logger.log(`chave de API gerada client_id=${clientId} chave_id=${row.id} superadmin_id=${superadminId}`);
    void this.avisarAdmins(clientId, nome);
    return { chave, dados: (await this.repo.buscarPorId(row.id))! };
  }

  /** Valor novo na mesma chave (mesmos escopos, validade e vínculo); o anterior para de funcionar na hora. */
  async resetar(superadminId: string, id: string): Promise<ChaveGerada> {
    const atual = await this.repo.buscarPorId(id);
    if (!atual || atual.revogada_em) throw new NotFoundException('Chave não encontrada ou revogada');
    const { chave, hash, exibicao } = gerarChave();
    if (!(await this.repo.trocarValor(atual.client_id, id, hash, exibicao))) throw new NotFoundException('Chave não encontrada ou revogada');
    this.cache.esquecer(id);
    await this.audit.record({ actorType: 'superadmin', actorId: superadminId, clientId: atual.client_id, action: 'api_chave.resetar', target: id });
    this.logger.log(`chave de API resetada client_id=${atual.client_id} chave_id=${id} superadmin_id=${superadminId}`);
    return { chave, dados: (await this.repo.buscarPorId(id))! };
  }

  async revogar(superadminId: string, id: string): Promise<void> {
    const atual = await this.repo.buscarPorId(id);
    if (!atual || !(await this.repo.revogar(atual.client_id, id))) throw new NotFoundException('Chave não encontrada ou já revogada');
    this.cache.esquecer(id);
    await this.audit.record({ actorType: 'superadmin', actorId: superadminId, clientId: atual.client_id, action: 'api_chave.revogar', target: id });
    this.logger.log(`chave de API revogada client_id=${atual.client_id} chave_id=${id} superadmin_id=${superadminId}`);
  }

  /** Lista sem repetição, só escopos conhecidos e de módulo contratado pelo cliente. */
  private async validarEscopos(clientId: string, v: unknown): Promise<Escopo[]> {
    if (!Array.isArray(v) || v.length === 0) throw new BadRequestException('"escopos" precisa ser uma lista com ao menos um escopo');
    const disponiveis = new Set((await this.escoposDisponiveis(clientId)).map((e) => e.key));
    const lista = [...new Set(v)];
    for (const e of lista) {
      if (!ehEscopo(e)) throw new BadRequestException(`Escopo desconhecido: ${String(e).slice(0, 40)}`);
      if (!disponiveis.has(e)) throw new BadRequestException(`O escopo "${e}" depende de um módulo que o cliente não contratou`);
    }
    return lista as Escopo[];
  }

  private async avisarAdmins(clientId: string, nome: string) {
    try {
      const texto = `Uma chave de acesso da API chamada "${nome}" foi gerada para a sua empresa. Se não reconhece, fale com o suporte.`;
      for (const to of await this.repo.emailsDosAdmins(clientId)) {
        await this.mail.send({ to, subject: 'Nova chave de acesso da API', text: texto, html: `<p>${escapeHtml(texto)}</p>` });
      }
    } catch (e: any) {
      this.logger.error(`falha ao avisar admins da chave gerada client_id=${clientId}: ${e?.message}`);
    }
  }
}
