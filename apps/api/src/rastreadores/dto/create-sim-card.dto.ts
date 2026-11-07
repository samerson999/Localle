import { erro, telefoneOpcional, textoOpcional } from '../../common/validar';

export class CreateSimCardDto {
  iccid!: string;
  operadora?: string;
  numero?: string;
}

/** Sem ValidationPipe global: o corpo é conferido aqui (ICCID tem 18 a 22 dígitos; número com DDD). */
export function parseCreateSimCard(body: unknown): { iccid: string; operadora?: string; numero?: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const iccid = typeof b.iccid === 'string' ? b.iccid.replace(/\s/g, '') : '';
  if (!/^\d{18,22}$/.test(iccid)) erro('"iccid" precisa ter de 18 a 22 dígitos');
  const operadora = textoOpcional(b.operadora, 'operadora', 60);
  const numero = telefoneOpcional(b.numero, 'numero');
  return { iccid, ...(operadora ? { operadora } : {}), ...(numero ? { numero } : {}) };
}
