/**
 * Escopos da API pública (docs/PLANO-API-PUBLICA.md § 3.4) e o módulo do contrato (`MODULES`,
 * `@localle/shared/contratos`) de que cada um depende. Escopo é o que a chave pode; módulo é o que o contrato
 * permite — as duas checagens valem. Escopo de módulo não contratado não pode ser marcado na chave.
 */
export const ESCOPOS = {
  frota: { nome: 'Frota e cadastros', modulo: 'ativos' },
  cercas: { nome: 'Cercas e regras', modulo: 'monitoramento' },
  posicoes: { nome: 'Posições', modulo: 'monitoramento' },
  eventos: { nome: 'Eventos', modulo: 'monitoramento' },
  alertas: { nome: 'Alertas', modulo: 'monitoramento' },
  comandos: { nome: 'Comandos enviados', modulo: 'monitoramento' },
  relatorios: { nome: 'Relatórios', modulo: 'monitoramento' },
  viagens: { nome: 'Viagens', modulo: 'viagens' },
  jornada: { nome: 'Jornada', modulo: 'jornada' },
  ranking: { nome: 'Ranking', modulo: 'ranking' },
  combustivel: { nome: 'Combustível', modulo: 'combustivel' },
  multas: { nome: 'Multas', modulo: 'multas' },
  manutencao: { nome: 'Manutenção', modulo: 'manutencao' },
  checklist: { nome: 'Checklist', modulo: 'checklist' },
  pneus: { nome: 'Pneus', modulo: 'pneus' },
} as const;

export type Escopo = keyof typeof ESCOPOS;
export const ESCOPO_KEYS = Object.keys(ESCOPOS) as Escopo[];

export function ehEscopo(v: unknown): v is Escopo {
  return typeof v === 'string' && v in ESCOPOS;
}
