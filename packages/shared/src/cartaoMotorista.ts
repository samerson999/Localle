// Código do cartão do motorista (iButton, RFID, cartão de aproximação), igual na API e no front: a ingestão compara o
// código lido pelo rastreador com o cadastrado (apps/api/src/motoristas/identificacao-motorista.ts) e a tela reconhece um
// cartão lido como já cadastrado sem esperar o próximo pacote. A coluna gerada `motoristas.codigo_identificacao_norm`
// (migration 1794390000000) faz a mesma conta no banco — mudar aqui exige mudar lá.

const TAMANHO_MAX_CODIGO = 32;

/**
 * Sem separadores, maiúsculas, sem zeros à esquerda: aparelhos diferentes mandam o mesmo cartão com e sem zeros à
 * esquerda (iButton em hex de 16 dígitos, RFID em decimal) e o gestor digita com ou sem `:`/`-`. Vazio ou só zeros = sem
 * código.
 */
export function normalizarCodigo(v: unknown): string | null {
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0) return null;
    v = String(v);
  }
  if (typeof v !== 'string') return null;
  const c = v.replace(/[^0-9A-Za-z]/g, '').toUpperCase().replace(/^0+/, '');
  return c && c.length <= TAMANHO_MAX_CODIGO ? c : null;
}
