export interface SuperadminEntity {
  id: string;
  email: string;
  /** null: convidado que ainda não definiu a senha. */
  password_hash: string | null;
  desativado_em: Date | null;
  created_at: Date;
  updated_at: Date;
}
