import type { MotoristaRow } from './motoristas.repository';

export type EstadoVencimento = 'vencido' | 'critico' | 'atencao' | 'ok' | 'sem_data';

/** Estado de um vencimento (CNH, toxicológico) pelos dias de atenção/crítico do Setup (§ 3.15). */
export function estadoVencimento(validade: string | null, atencaoDias: number, criticoDias: number, hoje = new Date()): EstadoVencimento {
  if (!validade) return 'sem_data';
  const dias = Math.floor((Date.parse(validade + 'T12:00:00Z') - hoje.getTime()) / 86_400_000);
  if (dias < 0) return 'vencido';
  if (dias <= criticoDias) return 'critico';
  if (dias <= atencaoDias) return 'atencao';
  return 'ok';
}

/**
 * CNH e toxicológico vencidos ou vencendo, só dos motoristas com algo fora do "ok" (entrada do "Precisa de você" e da
 * API pública). Toxicológico só vale para as categorias C, D e E.
 */
export function vencimentosDosMotoristas(motoristas: MotoristaRow[], atencao: number, critico: number) {
  const exigeTox = (m: MotoristaRow) => !!m.cnh_categoria && /[CDE]/.test(m.cnh_categoria);
  return motoristas
    .map((m) => ({
      id: m.id,
      nome: m.nome,
      cnh: { validade: m.cnh_validade, estado: estadoVencimento(m.cnh_validade, atencao, critico) },
      toxicologico: exigeTox(m) ? { validade: m.toxicologico_validade, estado: estadoVencimento(m.toxicologico_validade, atencao, critico) } : null,
    }))
    .filter((x) => x.cnh.estado !== 'ok' || (x.toxicologico && x.toxicologico.estado !== 'ok'));
}
