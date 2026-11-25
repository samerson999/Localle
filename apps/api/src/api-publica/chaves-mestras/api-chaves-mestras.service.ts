import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditLogRepository } from '../../audit/audit-log.repository';
import { instante, texto } from '../../common/validar';
import { escapeHtml } from '../../mail/escape-html';
import { MailService } from '../../mail/mail.service';
import { CacheDeChaves } from '../auth/cache-de-chaves';
import { faixaValida } from '../auth/ip';
import { gerarChave } from '../chaves/chave';
import { ApiChavesMestrasRepository, MAX_DIAS_MESTRA } from './api-chaves-mestras.repository';

/**
 * Chaves mestras da equipe da Localle (docs/PLANO-API-PUBLICA.md § 3.6): lista de IPs e validade (até 90 dias)
 * obrigatórias; toda criação/revogação na auditoria e por e-mail a todos os superadmins.
 */
@Injectable()
export class ApiChavesMestrasService {
  private readonly logger = new Logger(ApiChavesMestrasService.name);

  constructor(
    private readonly repo: ApiChavesMestrasRepository,
    private readonly audit: AuditLogRepository,
    private readonly mail: MailService,
    private readonly cache: CacheDeChaves,
  ) {}

  listar() {
    return this.repo.listar();
  }

  acessos(id: string) {
    return this.repo.acessos(id);
  }

  async criar(superadminId: string, body: { nome?: unknown; ips?: unknown; expiraEm?: unknown }) {
    const nome = texto(body?.nome, 'nome', 80);
    if (!Array.isArray(body?.ips) || body.ips.length === 0 || body.ips.length > 20) {
      throw new BadRequestException('"ips" precisa ter de 1 a 20 IPs ou faixas (ex.: 200.141.18.98 ou 10.0.0.0/24)');
    }
    const ips = body.ips.map((v) => {
      const f = faixaValida(v);
      if (!f) throw new BadRequestException(`IP ou faixa inválida: ${String(v).slice(0, 50)}`);
      return f;
    });
    const expiraEm = instante(body?.expiraEm, 'expiraEm');
    const max = Date.now() + MAX_DIAS_MESTRA * 86_400_000;
    if (expiraEm.getTime() <= Date.now() || expiraEm.getTime() > max) {
      throw new BadRequestException(`"expiraEm" precisa estar entre agora e ${MAX_DIAS_MESTRA} dias`);
    }
    const { chave, hash, exibicao } = gerarChave();
    const row = await this.repo.criar({ nome, prefixo: exibicao, hash, ips, criadaPor: superadminId, expiraEm });
    await this.audit.record({ actorType: 'superadmin', actorId: superadminId, clientId: null, action: 'api_chave_mestra.criar', target: row.id, after: { nome, ips, expiraEm } });
    this.logger.log(`chave mestra criada chave_id=${row.id} superadmin_id=${superadminId}`);
    void this.avisar(`A chave mestra "${nome}" da API foi criada (IPs: ${ips.join(', ')}; vence em ${expiraEm.toISOString().slice(0, 10)}).`);
    const { hash: _h, ...dados } = row;
    return { chave, dados };
  }

  /** Valor novo na mesma chave mestra (mesmos IPs e validade); o anterior para de funcionar na hora. */
  async resetar(superadminId: string, id: string) {
    const { chave, hash, exibicao } = gerarChave();
    const row = await this.repo.trocarValor(id, hash, exibicao);
    if (!row) throw new NotFoundException('Chave não encontrada, revogada ou vencida');
    this.cache.esquecer(id);
    await this.audit.record({ actorType: 'superadmin', actorId: superadminId, clientId: null, action: 'api_chave_mestra.resetar', target: id });
    this.logger.log(`chave mestra resetada chave_id=${id} superadmin_id=${superadminId}`);
    void this.avisar(`A chave mestra "${row.nome}" da API foi resetada: o valor anterior deixou de funcionar.`);
    const { hash: _h, ...dados } = row;
    return { chave, dados };
  }

  async revogar(superadminId: string, id: string) {
    const r = await this.repo.revogar(id);
    if (!r) throw new NotFoundException('Chave não encontrada ou já revogada');
    this.cache.esquecer(id);
    await this.audit.record({ actorType: 'superadmin', actorId: superadminId, clientId: null, action: 'api_chave_mestra.revogar', target: id });
    this.logger.log(`chave mestra revogada chave_id=${id} superadmin_id=${superadminId}`);
    void this.avisar(`A chave mestra "${r.nome}" da API foi revogada.`);
  }

  private async avisar(texto: string) {
    try {
      for (const to of await this.repo.emailsDosSuperadmins()) {
        await this.mail.send({ to, subject: 'Chave mestra da API', text: texto, html: `<p>${escapeHtml(texto)}</p>` });
      }
    } catch (e: any) {
      this.logger.error(`falha ao avisar superadmins sobre chave mestra: ${e?.message}`);
    }
  }
}
