import { Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { signAuthToken } from '../auth/jwt';
import { SuperadminRepository } from './superadmin.repository';

@Injectable()
export class SuperadminAuthService {
  constructor(private readonly repo: SuperadminRepository) {}

  async login(email: string, password: string): Promise<{ accessToken: string }> {
    const superadmin = await this.repo.findByEmail(email);
    const valid = superadmin ? await bcrypt.compare(password, superadmin.password_hash) : false;
    if (!superadmin || !valid) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    return { accessToken: signAuthToken({ sub: superadmin.id, role: 'superadmin' }) };
  }
}
