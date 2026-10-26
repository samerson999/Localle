import type { Role } from '../auth/jwt';

export interface UserEntity {
  id: string;
  client_id: string;
  email: string;
  password_hash: string | null;
  email_confirmado_em: Date | null;
  role: Role;
  desativado_em: Date | null;
  created_at: Date;
  updated_at: Date;
}
