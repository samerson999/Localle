import { BadGatewayException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { nomeDoModelo } from '@localle/shared/rastreadorModelos';
import { AuditLogRepository } from '../audit/audit-log.repository';
import { TraccarClient, type TraccarProtocolo } from '../ingest/traccar-client';
import { type AparelhoTraccar, lerListaTraccar, MINIMO_ESPERADO, separarNome, URL_LISTA_TRACCAR } from './lista-traccar';
import type { RastreadorModeloEntity } from './rastreador-modelo.entity';
import { RastreadorModelosRepository } from './rastreador-modelos.repository';
import { RastreadorModelosService } from './rastreador-modelos.service';
import snapshot from './traccar-aparelhos.snapshot.json';
import { termoLike, TraccarAparelhosRepository, type TraccarAparelhoRow } from './traccar-aparelhos.repository';

const LIMITE_BUSCA = 30;
/** /api/protocols muda só quando alguém mexe no Traccar: não precisa consultar a cada tecla digitada na busca. */
const PROTOCOLOS_TTL_MS = 5 * 60_000;

/** Situação do protocolo no Traccar desta plataforma; null = o Traccar não informa (sem config, fora, anterior à 6.17). */
export type SituacaoProtocolo = { ativo: boolean; porta: number | null } | null;

export interface ResultadoBusca {
  /** Modelos em uso (catálogo). */
  modelos: (RastreadorModeloEntity & { situacao: SituacaoProtocolo })[];
  /** Da lista do Traccar, ainda sem modelo no catálogo. */
  aparelhos: (TraccarAparelhoRow & { situacao: SituacaoProtocolo })[];
}

/**
 * Lista de aparelhos do Traccar como fonte dos modelos (migration 1793170000000): busca única para o cadastro, criação
 * do modelo do catálogo a partir da lista e atualização pela página pública. A cópia salva no repositório
 * (`traccar-aparelhos.snapshot.json`, de 03/11/2026) é a carga inicial e o que vale se a página não puder ser lida.
 */
@Injectable()
export class TraccarAparelhosService implements OnModuleInit {
  private readonly logger = new Logger(TraccarAparelhosService.name);
  private protocolos: { em: number; lista: TraccarProtocolo[] | null } | null = null;

  constructor(
    private readonly repo: TraccarAparelhosRepository,
    private readonly modelosRepo: RastreadorModelosRepository,
    private readonly modelos: RastreadorModelosService,
    private readonly traccar: TraccarClient,
    private readonly audit: AuditLogRepository,
  ) {}

  async onModuleInit() {
    try {
      await this.garantirCarga();
    } catch (err) {
      this.logger.error(`Carga inicial da lista do Traccar falhou: ${(err as Error).message}`);
    }
  }

  /** Tabela vazia (banco novo): carrega a cópia salva. Não sobrescreve lista já atualizada pela página. */
  async garantirCarga(): Promise<void> {
    if ((await this.repo.resumo()).total > 0) return;
    const lista = (snapshot as [string, string, number][]).map(([nome, protocolo, porta]) => ({ nome, protocolo, porta }));
    const r = await this.repo.substituir(lista);
    this.logger.log(`Lista do Traccar carregada da cópia salva: ${r.total} aparelhos`);
  }

  resumo() {
    return this.repo.resumo();
  }

  async buscar(q: string): Promise<ResultadoBusca> {
    const termo = q.trim().slice(0, 60);
    const [modelos, aparelhos, protocolos] = await Promise.all([
      this.modelosRepo.buscarAtivos(termoLike(termo), LIMITE_BUSCA),
      termo ? this.repo.buscar(termo, LIMITE_BUSCA) : Promise.resolve([]),
      this.protocolosDoTraccar(),
    ]);
    const situacao = (protocolo: string): SituacaoProtocolo => {
      if (!protocolos) return null;
      const p = protocolos.find((x) => x.protocolo === protocolo);
      return { ativo: !!p && p.transporte !== 'DISABLED', porta: p?.porta ?? null };
    };
    // aparelho que já virou modelo do catálogo aparece só como modelo
    const noCatalogo = new Set(modelos.map((m) => `${nomeDoModelo(m).toLowerCase()}|${m.protocolo}`));
    return {
      modelos: modelos.map((m) => ({ ...m, situacao: situacao(m.protocolo) })),
      aparelhos: aparelhos
        .filter((a) => !noCatalogo.has(`${a.nome.toLowerCase()}|${a.protocolo}`))
        .map((a) => ({ ...a, situacao: situacao(a.protocolo) })),
    };
  }

  /**
   * Modelo do catálogo para um aparelho da lista: o que já existe com o mesmo nome e protocolo, ou um novo com
   * protocolo e porta do Traccar. Identificador: o mais comum entre os modelos do mesmo protocolo; sem nenhum,
   * "outro" (aceita IMEI também) — corrigível no modelo.
   */
  async modeloDoAparelho(superadminId: string, aparelhoId: number): Promise<RastreadorModeloEntity> {
    const a = await this.repo.findById(aparelhoId);
    if (!a) throw new NotFoundException('Aparelho não encontrado na lista do Traccar');
    const { fabricante, nome } = separarNome(a.nome);
    const existente = await this.modelosRepo.findByNome(fabricante, nome);
    if (existente) {
      if (existente.protocolo !== a.protocolo) {
        throw new ConflictException(`Já existe o modelo ${a.nome} no catálogo com o protocolo ${existente.protocolo}; o Traccar lista ${a.protocolo}. Confira o modelo antes de usar.`);
      }
      if (!existente.ativo) throw new ConflictException(`O modelo ${a.nome} está desativado no catálogo: reative-o para usar`);
      return existente;
    }
    const tipo = (await this.modelosRepo.identificadorDoProtocolo(a.protocolo)) ?? 'outro';
    try {
      return await this.modelos.criar(superadminId, { fabricante, nome, protocolo: a.protocolo, porta: a.porta, tipo_identificador: tipo, origem: 'catalogo' });
    } catch (err) {
      // dois cadastros ao mesmo tempo do mesmo modelo: o outro criou primeiro
      if (err instanceof ConflictException) {
        const criado = await this.modelosRepo.findByNome(fabricante, nome);
        if (criado?.protocolo === a.protocolo) return criado;
      }
      throw err;
    }
  }

  /** Baixa a página do Traccar e troca a lista. Falhou ou veio pequena demais: a lista anterior continua valendo. */
  async atualizar(superadminId: string): Promise<{ total: number; removidos: number }> {
    let lista: AparelhoTraccar[];
    try {
      lista = lerListaTraccar(await this.baixarPagina());
    } catch (err) {
      this.logger.error(`Atualização da lista do Traccar falhou ao baixar ${URL_LISTA_TRACCAR}: ${(err as Error).message}`);
      throw new BadGatewayException('Não foi possível baixar a lista do Traccar agora. A lista anterior continua valendo.');
    }
    if (lista.length < MINIMO_ESPERADO) {
      this.logger.error(`Atualização da lista do Traccar recusada: só ${lista.length} aparelhos lidos de ${URL_LISTA_TRACCAR} (mínimo ${MINIMO_ESPERADO}) — a página mudou de formato?`);
      throw new BadGatewayException(`A página do Traccar veio num formato diferente (${lista.length} aparelhos lidos). A lista anterior continua valendo.`);
    }
    const r = await this.repo.substituir(lista);
    await this.audit.record({ actorType: 'superadmin', actorId: superadminId, clientId: null, action: 'traccar_aparelhos.atualizar', target: URL_LISTA_TRACCAR, after: r });
    this.logger.log(`Lista do Traccar atualizada por ${superadminId}: ${r.total} aparelhos, ${r.removidos} removidos`);
    return r;
  }

  /** Fronteira HTTP com o site do Traccar (o teste troca). */
  protected async baixarPagina(): Promise<string> {
    const res = await fetch(URL_LISTA_TRACCAR, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.text();
  }

  private async protocolosDoTraccar(): Promise<TraccarProtocolo[] | null> {
    if (this.protocolos && Date.now() - this.protocolos.em < PROTOCOLOS_TTL_MS) return this.protocolos.lista;
    const config = this.traccar.config();
    let lista: TraccarProtocolo[] | null = null;
    if (config) {
      try {
        lista = await this.traccar.protocols(config);
      } catch (err) {
        this.logger.warn(`Busca de modelos sem a situação dos protocolos: /api/protocols falhou: ${(err as Error).message}`);
      }
    }
    this.protocolos = { em: Date.now(), lista };
    return lista;
  }
}
