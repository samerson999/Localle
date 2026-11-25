import { createHash, randomBytes } from 'node:crypto';

/**
 * Token de 64 caracteres sorteados entre letras, números e símbolos (decisão de 24/11/2026). Os símbolos são só os que
 * passam sem escape num cabeçalho HTTP e numa linha de comando — fora `$`, `&`, aspas, barra, dois-pontos e espaço.
 * 74 caracteres possíveis × 64 posições ≈ 397 bits.
 */
export const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#%*+-.=@^_~';
export const TAMANHO = 64;
const FORMATO = /^[A-Za-z0-9!#%*+\-.=@^_~]{64}$/;
/** Maior múltiplo de 74 que cabe num byte: bytes acima dele são descartados para não enviesar o sorteio. */
const LIMITE_BYTE = 256 - (256 % ALFABETO.length);

function aleatorio(tamanho: number): string {
  let s = '';
  while (s.length < tamanho) {
    for (const b of randomBytes(96)) {
      if (b < LIMITE_BYTE && s.length < tamanho) s += ALFABETO[b % ALFABETO.length];
    }
  }
  return s;
}

/** SHA-256 da chave inteira — o que o banco guarda e a autenticação procura. */
export function hashDaChave(chave: string): Buffer {
  return createHash('sha256').update(chave, 'utf8').digest();
}

/** Chave nova: o valor completo (mostrado uma vez), o hash e os primeiros caracteres para a tela reconhecer qual é. */
export function gerarChave(): { chave: string; hash: Buffer; exibicao: string } {
  const chave = aleatorio(TAMANHO);
  return { chave, hash: hashDaChave(chave), exibicao: chave.slice(0, 6) };
}

/** Tem o formato de uma chave (64 caracteres do alfabeto)? Um JWT ou qualquer outra coisa não tem. */
export const formatoDeChave = (valor: string) => FORMATO.test(valor);

export type TipoChave = 'cliente' | 'mestra';
