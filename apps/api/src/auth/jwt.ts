import jwt from 'jsonwebtoken';

export type Role = 'admin' | 'gestor' | 'operador';

export interface UserTokenPayload {
  sub: string; // user id
  clientId: string;
  role: Role;
}

export interface SuperadminTokenPayload {
  sub: string; // superadmin id
  role: 'superadmin';
}

export type AuthTokenPayload = UserTokenPayload | SuperadminTokenPayload;

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET não configurado');
  return value;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, secret(), { expiresIn: '8h' });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, secret(), { algorithms: ['HS256'] }) as AuthTokenPayload;
}
