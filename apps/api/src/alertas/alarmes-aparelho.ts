import type { Alerta } from '@localle/shared/realtime';
import type { Queryable } from '../db/queryable';

/**
 * Quais alarmes do aparelho (catálogo do Traccar, `attributes.alarm`) viram alerta, com que título, prioridade e se
 * exigem tratamento: catálogo `alerta_tipos`, mantido pela Locale (Console › Tipos de alerta). Alarme fora do catálogo
 * ou com `gera_alerta = false` (frenagem/aceleração/curva bruscas, por padrão) fica só como evento — insumo do ranking.
 */
export async function alertaDoAlarme(
  executor: Queryable,
  alarme: string,
): Promise<{ titulo: string; prioridade: Alerta['prioridade']; exigeTratamento?: boolean } | null> {
  const { rows } = await executor.query<{ nome: string; prioridade: Alerta['prioridade']; exige_tratamento: boolean | null }>(
    'select nome, prioridade, exige_tratamento from alerta_tipos where chave = $1 and gera_alerta and disparo = \'alarme\'',
    [alarme],
  );
  const t = rows[0];
  if (!t) return null;
  return { titulo: t.nome, prioridade: t.prioridade, ...(t.exige_tratamento === null ? {} : { exigeTratamento: t.exige_tratamento }) };
}
