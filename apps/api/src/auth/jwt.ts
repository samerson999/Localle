import jwt from 'jsonwebtoken';

export type Role = 'admin' | 'gestor' | 'operador';

/**
 * Sessão persistente (docs/PLANO-APK-TWA.md §§ 2-3): o token em si continua curto (8h, `expiresIn`
 * abaixo) — quem faz a sessão "durar indefinidamente" é o front renovando via `POST /auth/renovar` antes
 * de cada token expirar. Decisão explícita do usuário (sem teto de dias, igual ao padrão de app nativo):
 * a sessão só termina por logout, troca de senha ou desativação — nunca por tempo decorrido. `sessionStart`
 * é o `iat` da PRIMEIRA emissão (login), preservado em toda renovação (auth.controller.ts); hoje serve só
 * para o recheck periódico do SSE (realtime.controller.ts, via `CurrentSessionStart`), não para um teto.
 */
export interface UserTokenPayload {
  sub: string; // user id
  clientId: string;
  role: Role;
  sessionStart?: number; // unix seconds; ausente em token antigo (anterior a esta mudança) = usa o próprio iat
}

export interface SuperadminTokenPayload {
  sub: string; // superadmin id
  role: 'superadmin';
  sessionStart?: number;
}

export type AuthTokenPayload = (UserTokenPayload | SuperadminTokenPayload) & { iat?: number; exp?: number };

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET não configurado');
  return value;
}

export function signAuthToken(payload: UserTokenPayload | SuperadminTokenPayload): string {
  const sessionStart = payload.sessionStart ?? Math.floor(Date.now() / 1000);
  return jwt.sign({ ...payload, sessionStart }, secret(), { expiresIn: '8h' });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, secret(), { algorithms: ['HS256'] }) as AuthTokenPayload;
}
