import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Código de 6 dígitos por e-mail (convite de primeiro acesso e "esqueci minha senha"). No banco fica só o HMAC
 * de `user_id:código` com o segredo do JWT — com 10^6 combinações, um hash simples sairia por força bruta a
 * partir de um dump. Erro conta tentativa; ao chegar em `MAX_TENTATIVAS`, o código é revogado.
 */
export const MAX_TENTATIVAS = 5;
export const CODIGO = /^\d{6}$/;

export const gerarCodigo = () => randomInt(0, 1_000_000).toString().padStart(6, '0');

export function hashCodigo(userId: string, codigo: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET ausente');
  return createHmac('sha256', secret).update(`${userId}:${codigo}`).digest('hex');
}

export function codigoConfere(hash: string, userId: string, codigo: string): boolean {
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(hashCodigo(userId, codigo), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
