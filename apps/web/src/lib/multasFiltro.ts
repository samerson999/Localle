// Filtro da lista de multas (Multas › Multas). Puro, testado em multasFiltro.test.ts.
import { PENDING, indicationState } from '@localle/shared/fines';

/**
 * A pagar e sem recurso pendente: o condutor indicado e o recurso indeferido continuam devendo. Antes "Em aberto" era só
 * a situação `aberta`, e a multa com condutor indicado sumia de todos os filtros menos "Todas".
 */
export const EM_ABERTO = ['aberta', 'condutor_indicado', 'recurso_indeferido'];
/** Valor que ainda pode sair do caixa: o em aberto mais o que está em recurso. */
export const A_PAGAR = [...EM_ABERTO, 'recurso'];

export const FILTROS_MULTA = [
  { key: 'indicar', label: 'Indicar condutor' }, { key: 'perdido', label: 'Prazo perdido' }, { key: 'aberta', label: 'Em aberto' },
  { key: 'recurso', label: 'Em recurso' }, { key: 'paga', label: 'Pagas' }, { key: 'cancelada', label: 'Canceladas' }, { key: 'todas', label: 'Todas' },
];

export function casaFiltroMulta(f: any, flt: string) {
  if (flt === 'indicar') return PENDING.includes(indicationState(f));
  if (flt === 'perdido') return indicationState(f) === 'vencida';
  if (flt === 'aberta') return EM_ABERTO.includes(f.status);
  return flt === 'todas' || f.status === flt;
}
