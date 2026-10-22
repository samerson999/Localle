// Multas: lançamento manual (padrão), sugestão do condutor, prazo de indicação, validação e risco de suspensão da CNH.
// NO PRODUTO REAL estas regras rodam no backend. Integração por API (SERPRO/SENATRAN): recurso futuro, escondido.
import { CTB } from './catalog';
import { DAY, HOUR } from './utils';

// Recursos futuros, escondidos da interface (custo da integração em avaliação).
export const FUTURE_FINE_FEATURES = ['integracao_api'];

// Parâmetros do Setup (docs/PLANO-SETUP-ADMIN.md 3.10). Regras conferidas em 18/10/2026:
//  - CTB art. 261, I (Lei 14.071/2020): suspensão ao somar, em 12 meses, 20 pontos com 2+ gravíssimas, 30 com 1, 40 sem nenhuma;
//  - CTB art. 261, § 5º: quem exerce atividade remunerada (EAR na CNH) tem limite de 40 pontos, qualquer que seja a natureza;
//  - CTB art. 257, § 7º: 30 dias, contados da notificação da autuação, para indicar o condutor.
// Piso legal: a empresa só pode deixar mais rigoroso (limites e prazo menores que os da lei, nunca maiores).
export const FINE_LEGAL = { limit2Grav: 20, limit1Grav: 30, limit0Grav: 40, limitEar: 40, indicationDays: 30, windowDays: 365 };
export const FINE_PARAMS = {
  ...FINE_LEGAL,
  indicationAlertDays: 7, // aviso na tela de Multas quando faltar isto para o fim do prazo de indicação
  indicationCriticalDays: 3, // nos últimos dias, a indicação vira crítica e entra no "Precisa de você"
  riskWarnPct: 0.75, // uso do limite a partir do qual o motorista aparece em risco
  dueDays: 30, // vencimento padrão sugerido no lançamento (multas.vencimento_padrao_dias)
};
// aplica o piso legal: valor acima do da lei volta ao da lei
export const clampLegal = <K extends keyof typeof FINE_LEGAL>(k: K, v: number) => Math.min(v, FINE_LEGAL[k]);

// CTB art. 258 e 259: pontos e valor base fixos por gravidade (o fator multiplicador vem do código da infração)
export const SEVERITY: Record<string, { points: number; base: number }> = { Leve: { points: 3, base: 88.38 }, Média: { points: 4, base: 130.16 }, Grave: { points: 5, base: 195.23 }, Gravíssima: { points: 7, base: 293.47 } };
export const SEVERITIES = Object.keys(SEVERITY);

// notificação da autuação: dado novo; lançamentos antigos sem ela usam a infração + 15 dias
export const notifiedOf = (f: any) => f.notifiedAt ?? f.ts + 15 * DAY;
// sem a data real, o prazo é estimado: a tela marca "estimado" e pede a data da notificação
export const notifiedEstimated = (f: any) => f.notifiedAt == null;
export const indicationDue = (f: any) => notifiedOf(f) + clampLegal('indicationDays', FINE_PARAMS.indicationDays) * DAY;
export const needsIndication = (f: any) => f.status === 'aberta' && !f.indicatedAt;
export type IndicationState = 'feita' | 'vencida' | 'critica' | 'aviso' | 'no_prazo' | 'nao_se_aplica';
// ainda dá para indicar; depois do prazo a indicação administrativa não é mais aceita (prazo perdido)
export const PENDING: IndicationState[] = ['critica', 'aviso', 'no_prazo'];
export function indicationState(f: any, now = Date.now()): IndicationState {
  if (f.indicatedAt || f.status === 'condutor_indicado') return 'feita';
  if (!needsIndication(f)) return 'nao_se_aplica';
  const left = indicationDue(f) - now;
  return left < 0 ? 'vencida' : left <= FINE_PARAMS.indicationCriticalDays * DAY ? 'critica' : left <= FINE_PARAMS.indicationAlertDays * DAY ? 'aviso' : 'no_prazo';
}

// Condutor no horário da infração. O vínculo motorista × veículo é um histórico; enquanto o protótipo não o tem,
// procura nos registros que gravam o motorista do momento (portaria, viagem, checklist, abastecimento) e só
// então cai no vínculo do cadastro. Devolve de onde veio a sugestão, para o gestor conferir.
export interface DriverHint { driverId: string; source: string; confidence: 'alta' | 'media' | 'baixa' }
export function driverAt(s: any, assetId: string, ts: number): DriverHint | null {
  if (!assetId || !ts) return null;
  const gates = (s.gateLog || []).filter((g: any) => g.assetId === assetId && g.driverId).sort((a: any, b: any) => a.ts - b.ts);
  const out = [...gates].reverse().find((g: any) => g.kind === 'saida' && g.ts <= ts);
  if (out) { const back = gates.find((g: any) => g.kind === 'entrada' && g.ts > out.ts); if (!back || back.ts >= ts) return { driverId: out.driverId, source: 'Saída registrada pela portaria', confidence: 'alta' }; }
  const trip = (s.trips || []).find((t: any) => t.assetId === assetId && t.driverId && t.startedAt && t.startedAt <= ts && (t.endedAt || Infinity) >= ts);
  if (trip) return { driverId: trip.driverId, source: `Viagem "${trip.name || 'de pátio'}"`, confidence: 'alta' };
  const near = (arr: any[], at: (x: any) => number) => arr.filter((x: any) => x.assetId === assetId && x.driverId && Math.abs(at(x) - ts) < 12 * HOUR).sort((a: any, b: any) => Math.abs(at(a) - ts) - Math.abs(at(b) - ts))[0];
  const ck = near(s.checklistResponses || [], (x) => x.startedAt);
  if (ck) return { driverId: ck.driverId, source: 'Checklist do mesmo dia', confidence: 'media' };
  const fu = near(s.fuelings || [], (x) => x.ts);
  if (fu) return { driverId: fu.driverId, source: 'Abastecimento do mesmo dia', confidence: 'media' };
  const a = s.assets.find((x: any) => x.id === assetId);
  return a?.driverId ? { driverId: a.driverId, source: 'Motorista do cadastro do veículo', confidence: 'baixa' } : null;
}

// Validação do lançamento manual. Erros bloqueiam; avisos só pedem conferência.
export function validateFine(s: any, f: any, now = Date.now()) {
  const errors: Record<string, string> = {}; const warns: Record<string, string> = {};
  const auto = (f.auto || '').trim().toUpperCase();
  if (!auto) errors.auto = 'Informe o número do auto de infração.';
  else if (!/^[A-Z0-9]{6,15}$/.test(auto)) errors.auto = 'Use só letras e números, de 6 a 15 caracteres, como está na notificação.';
  else if (!/^[A-Z]{1,3}\d{5,12}$/.test(auto)) warns.auto = 'Formato incomum: o auto costuma ter 1 a 3 letras seguidas de números. Confira.';
  if (auto && s.fines.some((x: any) => x.id !== f.id && (x.auto || '').toUpperCase() === auto && (x.org || '') === (f.org || ''))) errors.auto = 'Já existe uma multa com este auto e este órgão.';
  if (!f.assetId) errors.assetId = 'Escolha o veículo.';
  const ts = f.ts ? new Date(f.ts).getTime() : NaN;
  if (!isFinite(ts)) errors.ts = 'Informe a data e a hora da infração.';
  else if (ts > now) errors.ts = 'A infração não pode estar no futuro.';
  else if (now - ts > 5 * 365 * DAY) errors.ts = 'Data com mais de 5 anos: confira o ano.';
  else if (now - ts > 365 * DAY) warns.ts = 'Infração com mais de 1 ano. Confira a data.';
  if (!(f.place || '').trim()) errors.place = 'Informe o local da infração.';
  if (!f.code) errors.code = 'Escolha a infração.';
  const nt = f.notifiedAt ? new Date(f.notifiedAt + 'T12:00').getTime() : NaN;
  if (!isFinite(nt) && f.estimatedNotice) { /* multa antiga: prazo segue estimado até informarem a data real */ }
  else if (!isFinite(nt)) errors.notifiedAt = 'Informe quando a notificação da autuação chegou: o prazo de indicação conta a partir dela.';
  else if (isFinite(ts) && nt < ts - 12 * HOUR) errors.notifiedAt = 'A notificação não pode ser anterior à infração.';
  else if (nt > now + 12 * HOUR) errors.notifiedAt = 'A notificação não pode estar no futuro.';
  else if (isFinite(ts) && nt - ts > 30 * DAY) warns.notifiedAt = 'Notificação recebida mais de 30 dias depois da infração. Se foi expedida após 30 dias, o auto pode ser arquivado (CTB art. 281, II): avalie recurso.';
  const value = +f.value;
  const ref = CTB.find((c) => c.code === f.code);
  if (!(value > 0)) errors.value = 'Informe o valor da multa.';
  else if (ref && Math.abs(value - ref.value) > 0.01 && Math.abs(value - ref.value * 0.8) > 0.01 && Math.abs(value - ref.value * 0.6) > 0.01) warns.value = `Valor diferente da tabela (${ref.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, ou com desconto de 20% ou 40%). Confira a notificação.`;
  const due = f.dueDate ? new Date(f.dueDate + 'T12:00').getTime() : NaN;
  if (!isFinite(due)) errors.dueDate = 'Informe o vencimento.';
  else if (isFinite(nt) && due < nt) errors.dueDate = 'O vencimento não pode ser anterior à notificação.';
  if (f.driverId && isFinite(ts)) { const h = driverAt(s, f.assetId, ts); if (h && h.confidence !== 'baixa' && h.driverId !== f.driverId) warns.driverId = `Os registros indicam ${s.drivers.find((d: any) => d.id === h.driverId)?.name} no veículo nesse horário (${h.source.toLowerCase()}).`; }
  const d = s.drivers.find((x: any) => x.id === f.driverId);
  if (d?.cnhDue && isFinite(ts) && new Date(d.cnhDue).getTime() < ts) warns.driverId = `A CNH de ${d.name} estava vencida na data da infração.`;
  return { errors, warns, ok: Object.keys(errors).length === 0 };
}

// Risco de suspensão: pontos dos últimos 12 meses (pela data da infração), sem as canceladas.
// EAR é anotação na CNH (exerce atividade remunerada): vem do cadastro do motorista, não da categoria
export const isEar = (d: any) => !!d.ear;
export function cnhRisk(s: any, now = Date.now()) {
  const from = now - FINE_PARAMS.windowDays * DAY;
  return s.drivers.map((d: any) => {
    const mine = s.fines.filter((x: any) => x.driverId === d.id && x.ts >= from && x.status !== 'cancelada');
    const pts = mine.reduce((a: number, x: any) => a + (+x.points || 0), 0);
    const grav = mine.filter((x: any) => x.severity === 'Gravíssima').length;
    const ear = isEar(d);
    const limit = ear ? clampLegal('limitEar', FINE_PARAMS.limitEar) : grav >= 2 ? clampLegal('limit2Grav', FINE_PARAMS.limit2Grav) : grav === 1 ? clampLegal('limit1Grav', FINE_PARAMS.limit1Grav) : clampLegal('limit0Grav', FINE_PARAMS.limit0Grav);
    // próxima pontuação a sair da janela de 12 meses
    const next = mine.map((x: any) => x.ts + FINE_PARAMS.windowDays * DAY).sort((a: number, b: number) => a - b)[0];
    return { id: d.id, name: d.name, pts, grav, ear, limit, pct: pts / limit, left: Math.max(0, limit - pts), n: mine.length, next };
  }).sort((a: any, b: any) => b.pct - a.pct);
}
