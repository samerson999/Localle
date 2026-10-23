import type { Role } from '../auth/jwt';

export interface UserEntity {
  id: string;
  client_id: string;
  email: string;
  password_hash: string;
  role: Role;
  created_at: Date;
  updated_at: Date;
}
