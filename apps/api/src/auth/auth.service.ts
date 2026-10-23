import { Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { UsersRepository } from '../users/users.repository';
import { signAuthToken } from './jwt';

@Injectable()
export class AuthService {
  constructor(private readonly users: UsersRepository) {}

  async login(email: string, password: string): Promise<{ accessToken: string }> {
    const user = await this.users.findByEmail(email);
    const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || !valid) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    return { accessToken: signAuthToken({ sub: user.id, clientId: user.client_id, role: user.role }) };
  }
}
