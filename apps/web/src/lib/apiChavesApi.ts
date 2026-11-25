// Chaves de acesso da API pública de consulta (docs/PLANO-API-PUBLICA.md), todas geridas no Console › API: as dos
// clientes (vinculadas a um cliente) e as mestras da Localle. O valor completo (64 caracteres) só vem na resposta da
// geração e do reset.
import { apiGet, apiSend } from './localleApi';

export interface ChaveApi {
  id: string;
  client_id: string;
  client_name: string;
  nome: string;
  prefixo: string;
  escopos: string[];
  criada_em: string;
  expira_em: string | null;
  revogada_em: string | null;
  resetada_em: string | null;
  ultimo_uso_em: string | null;
  criada_por_email: string | null;
}
export interface EscopoApi { key: string; nome: string }
export interface ChaveMestra extends Omit<ChaveApi, 'escopos' | 'expira_em' | 'client_id' | 'client_name'> { ips_permitidos: string[]; expira_em: string }
export interface AcessoChaveMestra { client_id: string | null; client_name: string | null; rota: string; ip: string | null; status: number; criado_em: string }
export interface ChaveCriada<T> { chave: string; dados: T }

export const chavesApi = {
  listar: (clientId?: string) => apiGet<ChaveApi[]>(`/superadmin/api-chaves${clientId ? `?clientId=${clientId}` : ''}`),
  escopos: (clientId: string) => apiGet<EscopoApi[]>(`/superadmin/api-chaves/escopos?clientId=${clientId}`),
  criar: (body: { clientId: string; nome: string; escopos: string[]; expiraEm: string | null }) => apiSend<ChaveCriada<ChaveApi>>('POST', '/superadmin/api-chaves', body),
  resetar: (id: string) => apiSend<ChaveCriada<ChaveApi>>('POST', `/superadmin/api-chaves/${id}/resetar`),
  revogar: (id: string) => apiSend<void>('DELETE', `/superadmin/api-chaves/${id}`),
};

export const chavesMestrasApi = {
  listar: () => apiGet<ChaveMestra[]>('/superadmin/api-chaves-mestras'),
  acessos: (id: string) => apiGet<AcessoChaveMestra[]>(`/superadmin/api-chaves-mestras/${id}/acessos`),
  criar: (body: { nome: string; ips: string[]; expiraEm: string }) => apiSend<ChaveCriada<ChaveMestra>>('POST', '/superadmin/api-chaves-mestras', body),
  resetar: (id: string) => apiSend<ChaveCriada<ChaveMestra>>('POST', `/superadmin/api-chaves-mestras/${id}/resetar`),
  revogar: (id: string) => apiSend<void>('DELETE', `/superadmin/api-chaves-mestras/${id}`),
};

/** Situação para o selo da lista. */
export function situacaoDaChave(c: { revogada_em: string | null; expira_em: string | null }): { tone: 'green' | 'orange' | 'red' | 'gray'; label: string } {
  if (c.revogada_em) return { tone: 'gray', label: 'Revogada' };
  if (c.expira_em && Date.parse(c.expira_em) <= Date.now()) return { tone: 'red', label: 'Vencida' };
  if (c.expira_em && Date.parse(c.expira_em) - Date.now() < 7 * 86_400_000) return { tone: 'orange', label: 'Vence em breve' };
  return { tone: 'green', label: 'Ativa' };
}
