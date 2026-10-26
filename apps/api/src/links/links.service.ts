import { GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { LinksRepository } from './links.repository';

/** Prefixo distingue o token do backend dos links da simulação antiga ("lk…") na mesma rota do front. */
const PREFIXO = 'lc.';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class LinksService {
  constructor(private readonly repo: LinksRepository) {}

  /** O token (256 bits aleatórios) sai só aqui, uma vez; o banco guarda o hash. */
  async criar(clientId: string, userId: string, assetId: string, duracaoMs: number, destinatario: string | null) {
    const token = PREFIXO + randomBytes(32).toString('base64url');
    const link = await this.repo.criar(clientId, {
      assetId,
      tokenHash: hashToken(token),
      destinatario,
      criadoPor: userId,
      expiraEm: new Date(Date.now() + duracaoMs),
    });
    if (!link) throw new NotFoundException('Ativo não encontrado');
    return { ...link, token };
  }

  listar(clientId: string, assetId: string) {
    return this.repo.listar(clientId, assetId);
  }

  async revogar(clientId: string, id: string) {
    if (!(await this.repo.revogar(clientId, id))) throw new NotFoundException('Link não encontrado');
  }

  /**
   * Página pública. Token inexistente → 404 (sem dizer mais nada); expirado/revogado → 410 com o motivo,
   * para a página explicar — quem tem o token já sabia que o link existiu. `abertura` conta uma vez por
   * carregamento da página (a atualização periódica da posição não conta).
   */
  async abrir(token: string, abertura: boolean) {
    const link = token.startsWith(PREFIXO) ? await this.repo.buscarPorHash(hashToken(token)) : null;
    if (!link) throw new NotFoundException();
    if (link.revogadoEm) throw new GoneException({ motivo: 'revogado' });
    if (link.expiraEm.getTime() <= Date.now()) throw new GoneException({ motivo: 'expirado' });
    if (abertura) await this.repo.registrarAbertura(link.linkId);
    const p = await this.repo.posicaoAtual(link.clientId, link.assetId);
    return {
      placa: link.plate,
      expiraEm: link.expiraEm.toISOString(),
      posicao: p
        ? { lat: p.lat, lon: p.lon, fixTime: p.fix_time.toISOString(), speedKmh: p.speed_kmh === null ? null : Number(p.speed_kmh), ignition: p.ignition }
        : null,
    };
  }
}
