import { Injectable } from '@nestjs/common';
import type { TipoChave } from '../chaves/chave';

/** Chave válida já conferida no banco. */
export interface ChaveResolvida {
  tipo: TipoChave;
  id: string;
  /** Chave de cliente: o cliente dela. Mestra: `null` (vem do caminho). */
  clientId: string | null;
  escopos: string[];
  ips: string[];
  nome: string;
}

/** Chave válida fica em memória por até 60 s — revogação feita em outra instância da API vale em até 1 min. */
const VALIDADE_MS = 60_000;
const MAXIMO = 5_000;

/**
 * Cache das chaves conferidas pelo `ApiChaveGuard`, por hash. Provider próprio para a gestão das chaves (revogar,
 * rotacionar) tirar a chave daqui na hora: na mesma instância, a revogação vale na próxima requisição.
 */
@Injectable()
export class CacheDeChaves {
  private readonly porHash = new Map<string, { chave: ChaveResolvida; ate: number }>();

  ler(hash: string): ChaveResolvida | null {
    const c = this.porHash.get(hash);
    if (!c) return null;
    if (c.ate > Date.now()) return c.chave;
    this.porHash.delete(hash);
    return null;
  }

  /** Só chave válida entra: chave inexistente não ocupa memória (senão dava para encher com chaves aleatórias). */
  guardar(hash: string, chave: ChaveResolvida) {
    if (this.porHash.size >= MAXIMO) this.porHash.clear();
    this.porHash.set(hash, { chave, ate: Date.now() + VALIDADE_MS });
  }

  esquecer(chaveId: string) {
    for (const [h, c] of this.porHash) if (c.chave.id === chaveId) this.porHash.delete(h);
  }
}
