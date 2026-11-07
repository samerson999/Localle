import { texto, uuidOpcional } from '../../common/validar';

export class CreateClientDto {
  name!: string;
  revendaId?: string;
}

/** Mesma regra de nome do renomear (1 a 200 caracteres); revendaId inválido era erro 500 do Postgres. */
export function parseCreateClient(body: unknown): { name: string; revendaId: string | null } {
  const b = (body ?? {}) as Record<string, unknown>;
  return { name: texto(b.name, 'name', 200), revendaId: uuidOpcional(b.revendaId, 'revendaId') };
}
