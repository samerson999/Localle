export interface ClientEntity {
  id: string;
  revenda_id: string | null;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export interface ClientResumo extends ClientEntity {
  /** Com senha definida e não desativados. */
  usuarios_ativos: number;
  /** Convidados que ainda não aceitaram o convite. */
  convites_pendentes: number;
  admin_pendente_id: string | null;
  contrato_status: 'implantacao' | 'ativo' | 'suspenso' | 'cancelado' | null;
  veiculos: number;
  rastreadores_instalados: number;
}
