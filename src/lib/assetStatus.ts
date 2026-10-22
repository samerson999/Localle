// Parte pura do ciclo de vida (sem store), para as libs de cálculo poderem usar sem import circular.
// A explicação completa está em lib/assetLifecycle.ts.
export const LIFECYCLE: Record<string, { label: string; hint: string; out?: boolean }> = {
  ativo: { label: 'Em operação', hint: 'Aparece no mapa e em todos os módulos' },
  inativo: { label: 'Parado temporariamente', hint: 'Fora de operação por um tempo (oficina, sem contrato); continua nas telas e mantém o rastreador' },
  vendido: { label: 'Vendido', hint: 'Sai da frota; o rastreador volta ao estoque', out: true },
  baixa: { label: 'Baixado', hint: 'Sinistro, perda total ou sucata; o rastreador volta ao estoque', out: true },
};
export const lifeOf = (a: any) => a?.lifecycle?.status || 'ativo';
export const isOut = (a: any) => !!LIFECYCLE[lifeOf(a)]?.out;
// Telas operacionais: vendidos e baixados ("inativos") só com "Incluir inativos" (s.includeRetired)
export const opAssets = (s: any, include = !!s.includeRetired) => (include ? s.assets : s.assets.filter((a: any) => !isOut(a)));
// Relatórios e BIs de período: o veículo conta nos períodos em que operou, mesmo que já tenha saído da frota
export const operatedIn = (a: any, from: number) => !isOut(a) || (a.lifecycle?.at ?? 0) > from;
// teve rastreador em algum momento (vendido perde o rastreador, mas o percurso antigo continua valendo)
export const hadTracker = (s: any, a: any) => !!a.tracker || (isOut(a) && s.accessLog.some((l: any) => l.assetId === a.id));
// horas do período em que o veículo operou (até a venda/baixa): base de capacidade da frota nos BIs
export const opHours = (a: any, from: number, to: number) => Math.max(0, (Math.min(to, isOut(a) ? a.lifecycle?.at ?? to : to) - from) / 3600e3);
