import { Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { signAuthToken } from '../auth/jwt';
import { SuperadminRepository } from './superadmin.repository';

// mesmo motivo de auth.service.ts: não revelar pelo tempo quais e-mails existem
const HASH_FICTICIO = '$2a$10$V8BsmOkMs74NTPj4q9Lfc.8IePYbJKrO.ClNojmnA8Q4VDlKhjH9a';

@Injectable()
export class SuperadminAuthService {
  constructor(private readonly repo: SuperadminRepository) {}

  async login(email: unknown, password: unknown): Promise<{ accessToken: string }> {
    // sem ValidationPipe global: corpo sem string aqui fazia o bcrypt lançar (500) — mesma resposta genérica
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    const superadmin = await this.repo.findByEmail(email);
    const valid = await bcrypt.compare(password, superadmin?.password_hash ?? HASH_FICTICIO);
    if (!superadmin || !valid || superadmin.desativado_em) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    return { accessToken: signAuthToken({ sub: superadmin.id, role: 'superadmin' }) };
  }
}
