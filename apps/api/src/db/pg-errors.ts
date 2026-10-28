/**
 * Erros do Postgres que o domínio traduz em resposta HTTP. Violação de unique só vira 409 com mensagem
 * específica quando é O constraint esperado: um `catch` genérico de `23505` mapearia qualquer outro unique
 * da mesma tabela (criado numa migration futura) para uma mensagem errada, em silêncio. Os nomes abaixo
 * são os reais do banco; `pg-errors.spec.ts` confere que todos existem, para pegar renomeação em migration.
 */
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_EXCLUSION_VIOLATION = '23P01';
export const PG_CHECK_VIOLATION = '23514';

export const UNIQUE = {
  grupoNome: 'asset_groups_client_id_name_key',
  motoristaCnh: 'motoristas_cnh_uidx',
  marcacaoJornada: 'jornada_marcacoes_motorista_id_ts_tipo_key',
  multaAutoOrgao: 'multas_client_id_auto_orgao_key',
  pneuNumeroFogo: 'pneus_client_id_numero_fogo_key',
  comandoPendente: 'comandos_pendente_uidx',
  contratoPorCliente: 'contratos_client_id_key',
  usuarioEmail: 'users_email_key',
  superadminEmail: 'superadmins_email_key',
  chipPorRastreador: 'sim_cards_rastreador_id_uidx',
  modeloRastreador: 'rastreador_modelos_fabricante_nome_uidx',
} as const;

interface PgError { code?: string; constraint?: string }

export function isPgError(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && (err as PgError).code === code;
}

/** `true` só para violação de unique DESSE constraint (nome como o Postgres reporta em `err.constraint`). */
export function violouUnique(err: unknown, constraint: (typeof UNIQUE)[keyof typeof UNIQUE]): boolean {
  return isPgError(err, PG_UNIQUE_VIOLATION) && (err as PgError).constraint === constraint;
}
