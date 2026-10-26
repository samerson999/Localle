import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { UsersRepository } from '../users/users.repository';
import { ActiveUserRepository } from './active-user.repository';
import { signAuthToken } from './jwt';

// hash bcrypt (custo 10) de um valor aleatório descartado — nunca casa com senha nenhuma
const HASH_FICTICIO = '$2a$10$V8BsmOkMs74NTPj4q9Lfc.8IePYbJKrO.ClNojmnA8Q4VDlKhjH9a';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly activeUsers: ActiveUserRepository,
  ) {}

  async login(email: unknown, password: unknown): Promise<{ accessToken: string }> {
    // sem ValidationPipe global: corpo sem string aqui fazia o bcrypt lançar (500) — mesma resposta genérica
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    const user = await this.users.findByEmail(email);
    // e-mail inexistente também paga o custo do bcrypt: o tempo de resposta não revela quem existe
    const valid = await bcrypt.compare(password, user?.password_hash ?? HASH_FICTICIO);
    if (!user || !valid || user.desativado_em) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    // só depois da senha certa: dizer "suspenso" aqui não revela a quem não tem a credencial que o e-mail existe
    if (await this.activeUsers.isClientBlocked(user.client_id)) {
      throw new ForbiddenException('Acesso do cliente suspenso. Fale com a Locale.');
    }
    return { accessToken: signAuthToken({ sub: user.id, clientId: user.client_id, role: user.role }) };
  }
}
