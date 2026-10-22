// Documentos do ativo com vencimento (Ativos › ficha). Ficam em asset.documents: { id, type, number, due, file?, fileName? }.
// Vencido ou a DOC_PARAMS.criticalDays do fim entra no "Precisa de você"; até attentionDays aparece como atenção na
// lista de ativos. NO PRODUTO REAL os prazos seguem a herança de parâmetros (Plataforma → Revenda → Cliente → Grupo).
import { DAY } from './utils';

export const DOC_PARAMS = { criticalDays: 7, attentionDays: 30 }; // documentos.critico_dias / documentos.atencao_dias
// CNH e exame toxicológico do motorista: aviso (laranja) a partir de attentionDays; crítico nos últimos criticalDays ou vencido
export const DRIVER_DOC_PARAMS = { criticalDays: 7, attentionDays: 30 }; // motoristas.cnh_critico_dias / motoristas.cnh_atencao_dias
type DocParams = typeof DOC_PARAMS;

export const DOC_TYPES: { key: string; label: string; hint: string; kinds?: string[] }[] = [
  { key: 'crlv', label: 'CRLV / licenciamento', hint: 'Certificado de registro e licenciamento do veículo', kinds: ['veiculo', 'implemento'] },
  { key: 'ipva', label: 'IPVA', hint: 'Vencimento da cota única ou da última parcela', kinds: ['veiculo', 'implemento'] },
  { key: 'seguro', label: 'Seguro', hint: 'Fim da vigência da apólice' },
  { key: 'tacografo', label: 'Aferição do tacógrafo', hint: 'Verificação do Inmetro (a cada 2 anos)', kinds: ['veiculo'] },
  { key: 'rntrc', label: 'RNTRC (ANTT)', hint: 'Registro do transportador de cargas', kinds: ['veiculo', 'implemento'] },
  { key: 'aet', label: 'AET', hint: 'Autorização especial de trânsito (cargas excedentes)', kinds: ['veiculo', 'implemento'] },
  { key: 'civ', label: 'CIV / CIPP', hint: 'Inspeção para produtos perigosos', kinds: ['veiculo', 'implemento'] },
  { key: 'outro', label: 'Outro', hint: 'Laudo, alvará, contrato ou certificado' },
];
export const docLabel = (d: any) => (d.type === 'outro' && d.name) || DOC_TYPES.find((t) => t.key === d.type)?.label || d.type;
export const docTypesFor = (kind: string) => DOC_TYPES.filter((t) => !t.kinds || t.kinds.includes(kind));

export type DocState = 'vencido' | 'critico' | 'atencao' | 'ok' | 'sem_data';
// dias até o vencimento (negativo = vencido); o documento vale até o fim do dia do vencimento
export const daysLeft = (d: any, now = Date.now()) => (d.due ? Math.floor((new Date(d.due + 'T23:59:59').getTime() - now) / DAY) : null);
export function docState(d: any, now = Date.now(), p: DocParams = DOC_PARAMS): DocState {
  const n = daysLeft(d, now);
  if (n == null) return 'sem_data';
  return n < 0 ? 'vencido' : n <= p.criticalDays ? 'critico' : n <= p.attentionDays ? 'atencao' : 'ok';
}
export const docWhen = (d: any, now = Date.now()) => {
  const n = daysLeft(d, now);
  return n == null ? 'sem vencimento' : n < 0 ? `vencido há ${-n} ${n === -1 ? 'dia' : 'dias'}` : n === 0 ? 'vence hoje' : `vence em ${n} ${n === 1 ? 'dia' : 'dias'}`;
};
// pior situação entre os documentos do ativo, para a lista
const RANK: DocState[] = ['vencido', 'critico', 'atencao', 'ok', 'sem_data'];
export const worstDoc = (a: any) => (a.documents || []).filter((d: any) => d.due).sort((x: any, y: any) => RANK.indexOf(docState(x)) - RANK.indexOf(docState(y)) || x.due.localeCompare(y.due))[0];
