import type { Role } from '../auth/jwt';

export interface UserEntity {
  id: string;
  client_id: string;
  /** `null`: criado por nome de usuário e ainda não informou o e-mail (pede no primeiro acesso). */
  email: string | null;
  username: string | null;
  password_hash: string | null;
  email_confirmado_em: Date | null;
  role: Role;
  perfil_id: string | null;
  desativado_em: Date | null;
  excluido_em: Date | null;
  escopo_restrito: boolean;
  escopo_sem_grupo: boolean;
  created_at: Date;
  updated_at: Date;
}
