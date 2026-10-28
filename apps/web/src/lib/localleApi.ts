import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { Alerta, RealtimeMessage, RealtimePosicao } from '@localle/shared/realtime';
import type { BillingType, ContractStatus, ContractTerms, ContractVersion } from '@localle/shared/contratos';
import { inFence } from '@localle/shared/utils';
import { alertaIdOf, alertaToAlert, alertIdFor, applyPosicao, assetIdFor, backendIdOf, cercaToFence, createSseParser, fenceToCercaBody, regraToRule, ruleToRegraBody, eventoToReplay, type EventoApi, type RegraApi, toAsset, toVehicle, type CercaApi, type CurrentRow } from './localleMap';
import { useStore } from './store';
import * as M from './localleModulos';
import { LIVE_GROUP } from './rastreioApi';
import { erroHttp, fetchOuErro, mensagemDeErro, MSG_SESSAO } from './apiErro';

// Integração com o NOSSO backend (apps/api): login e frota
// ao vivo. As chamadas passam pelo proxy do Vite (/api-localle → LOCALLE_API_URL).
// Carga inicial por GET /monitoring/current; depois o stream SSE /monitoring/stream mantém posições e
// eventos ao vivo (contrato em packages/shared/src/realtime.ts). Veículos daqui têm id "lc_<assetId>".

const BASE = '/api-localle';
const TOKEN_KEY = 'localle.token';
const RECONNECT_MS = [1000, 3000, 10000, 30000];


// ---------- sessão ----------
// O token vive em sessionStorage (some ao fechar a aba) e em memória (fallback quando o storage é bloqueado).
let memToken: string | null = null;
export function getToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY) ?? memToken; } catch { return memToken; }
}
function setToken(t: string | null) {
  memToken = t;
  try { if (t) sessionStorage.setItem(TOKEN_KEY, t); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage bloqueado: fica só em memória */ }
}

/** Token recusado pela API (expirado, usuário desativado): derruba também a sessão do front. */
function encerrarSessao() {
  setToken(null);
  useStore.getState().patch(() => ({ session: null }));
}

async function postLogin(path: string, email: string, password: string): Promise<string | null> {
  const r = await fetchOuErro(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (r.status === 401) return null;
  // 403 só vem depois da senha certa (cliente suspenso): a mensagem da API é a que o usuário precisa ver
  if (r.status === 403) throw new Error((await r.json().catch(() => null))?.message || 'Acesso suspenso');
  if (!r.ok) throw erroHttp(r.status);
  return (await r.json()).accessToken;
}

// ---------- convite de primeiro acesso (rotas públicas: a credencial é o token do e-mail) ----------
export async function consultarConvite(token: string): Promise<{ email: string; clientName: string }> {
  const r = await fetchOuErro(`${BASE}/auth/convites/${encodeURIComponent(token)}`);
  if (!r.ok) throw r.status === 404 || r.status === 400 ? new Error('Convite inválido ou expirado. Peça um novo à Locale.') : erroHttp(r.status);
  return r.json();
}

/** Define a senha; em caso de sucesso já deixa a sessão aberta (token salvo). */
export async function aceitarConvite(token: string, password: string): Promise<void> {
  const r = await fetchOuErro(`${BASE}/auth/convites/${encodeURIComponent(token)}/aceitar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw r.status === 404 ? new Error('Convite inválido ou expirado. Peça um novo à Locale.') : erroHttp(r.status, data);
  setToken(data.accessToken);
}

/**
 * Usuário de cliente (admin/gestor/operador) entra como gestor da frota; superadmin da Locale entra no
 * Painel da Locale. O que cada um pode fazer é decidido pela API — o papel aqui só escolhe as telas.
 */
export async function login(email: string, password: string): Promise<'gestor' | 'locale'> {
  const user = await postLogin('/auth/login', email, password);
  if (user) { setToken(user); return 'gestor'; }
  const superadmin = await postLogin('/superadmin/login', email, password);
  if (superadmin) { setToken(superadmin); return 'locale'; }
  throw new Error('E-mail ou senha inválidos');
}

export function logout() { setToken(null); }

/** Confere a senha do usuário logado (confirmação de comando ao rastreador), sem trocar a sessão. */
export async function confirmarSenha(email: string, password: string): Promise<boolean> {
  if (!email || !password) return false;
  return !!(await postLogin('/auth/login', email, password));
}

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetchOuErro(BASE + path, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (r.status === 401) { encerrarSessao(); throw new Error(MSG_SESSAO); }
  if (!r.ok) throw erroHttp(r.status, await r.json().catch(() => null));
  return r.json();
}

// ---------- regras de alerta (avaliadas no backend a cada posição) ----------
export async function syncRegras() {
  const regras = await apiGet<RegraApi[]>('/regras');
  useStore.getState().patch(() => ({ rules: regras.map(regraToRule) }));
}

export async function salvarRegra(r: any) {
  await apiSend(r.id ? 'PUT' : 'POST', r.id ? `/regras/${r.id}` : '/regras', ruleToRegraBody(r));
  await syncRegras();
}

export async function removerRegra(id: string) {
  await apiSend('DELETE', `/regras/${id}`);
  await syncRegras();
}

// ---------- cercas (cadastro no backend; entrada/saída calculada lá, sobre cada posição) ----------
export async function syncCercas() {
  const cercas = await apiGet<CercaApi[]>('/cercas');
  useStore.getState().patch(() => ({ fences: cercas.map(cercaToFence) }));
}

export async function salvarCerca(f: any) {
  const body = fenceToCercaBody(f);
  await apiSend(f.id ? 'PUT' : 'POST', f.id ? `/cercas/${f.id}` : '/cercas', body);
  await syncCercas();
}

export async function removerCerca(id: string) {
  await apiSend('DELETE', `/cercas/${id}`);
  await syncCercas();
}

/** Escrita: devolve o corpo JSON; erro da API (400/409…) vira Error com a mensagem dela, para o toast. */
async function apiSend<T>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const r = await fetchOuErro(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 401) { encerrarSessao(); throw new Error(MSG_SESSAO); }
  if (r.status === 403) throw new Error('Seu acesso não permite esta alteração');
  if (r.status === 204) return null as T;
  const data = await r.json().catch(() => null);
  if (!r.ok) throw erroHttp(r.status, data);
  return data as T;
}

// ---------- Painel da Locale (rotas de superadmin) ----------
export interface AdminClient {
  id: string; name: string; revenda_id: string | null; created_at: string; usuarios_ativos: number; veiculos: number; rastreadores_instalados: number;
  convites_pendentes: number; admin_pendente_id: string | null; contrato_status: ContractStatus | null;
}
export interface AdminContrato { id: string; clientId: string; clientName: string; status: ContractStatus; inicioEm: string; fimEm: string | null; versaoAtual: ContractVersion; versoes: number }
export interface ContratoBody { status: ContractStatus; inicioEm: string; fimEm: string | null; terms: ContractTerms }
export interface LinhaFaturamento {
  clientId: string; clientName: string; contratoStatus: ContractStatus; billingType: BillingType;
  veiculosMedia: number; veiculosAgora: number; previsto: number; apurado: number;
  fatura: { id: string; vencimento: string; pago: number; emAberto: number; diasAtraso: number; critico: boolean } | null;
}
export interface Pagamento { id: string; valor: number; pagoEm: string; forma: 'pix' | 'boleto' | 'cartao' | 'transferencia'; observacao: string | null; registradoEm: number }
export interface VisaoGeral {
  competencia: string; contratosPorSituacao: Partial<Record<ContractStatus, number>>; veiculosAgora: number;
  receitaPrevista: number; apuradoAteHoje: number; porTipoCobranca: Partial<Record<BillingType, number>>;
  frotaPorCliente: { clientName: string; veiculos: number }[];
  historico: { competencia: string; faturado: number; veiculos: number; fechado: boolean }[];
  inadimplentes: { clientId: string; clientName: string; competencia: string; emAberto: number; diasAtraso: number; critico: boolean }[];
  contratosVencendo: { clientId: string; clientName: string; fimEm: string }[];
  rastreadoresSemSinal24h: number;
  aRecolher: { instalacaoId: string; imei: string; modelo: string | null; clientName: string; placa: string }[];
}
type Situacao = 'ok' | 'degradado' | 'fora' | 'desligado';
export interface Saude {
  banco: { tamanhoBytes: number; posicoesBytes: number | null; posicoes24h: number };
  inbox: { pendentes: number; maisAntigaSeg: number | null; comErro24h: number };
  comunicacao: { instalados: number; agora: number; ate24h: number };
  gateway: { status: Situacao; devices: number; online: number };
  fila: { status: Situacao; aguardando: number; ativos: number; falhos: number; atrasados: number };
  smtp: 'ok' | 'fora' | 'desligado';
  verificadoEm: number;
}
export interface AdminRastreador {
  id: string; imei: string; modelo: string | null; protocolo: string | null; status: 'cadastrado' | 'ativo' | 'desativado';
  traccar_device_id: string | null; criado_em: string;
  vinculo_id: string | null; client_id: string | null; client_name: string | null; vinculado_em: string | null;
  instalacao_id: string | null; asset_plate: string | null; instalado_em: string | null;
  sim_card_id: string | null; iccid: string | null; operadora: string | null; ultimo_pacote_em: string | null;
}
export interface AdminSimCard { id: string; iccid: string; operadora: string | null; numero: string | null; status: string; rastreador_id: string | null }
export interface AdminAuditEntry { id: string; actor_type: 'user' | 'superadmin'; actor_email: string | null; client_name: string | null; action: string; target: string | null; before: unknown; after: unknown; created_at: string }

export const adminApi = {
  clients: () => apiGet<AdminClient[]>('/clients'),
  createClient: (body: { name: string; admin?: { email: string } }) => apiSend<{ client: AdminClient; conviteEnviado: boolean }>('POST', '/superadmin/clients', body),
  createInitialAdmin: (clientId: string, body: { email: string }) => apiSend<{ conviteEnviado: boolean }>('POST', `/superadmin/clients/${clientId}/admin-users`, body),
  reenviarConvite: (clientId: string, userId: string) => apiSend<{ conviteEnviado: boolean }>('POST', `/superadmin/clients/${clientId}/admin-users/${userId}/convite`),
  contratos: () => apiGet<AdminContrato[]>('/superadmin/contratos'),
  versoes: (contratoId: string) => apiGet<ContractVersion[]>(`/superadmin/contratos/${contratoId}/versoes`),
  criarContrato: (clientId: string, body: ContratoBody) => apiSend<AdminContrato>('POST', `/superadmin/clients/${clientId}/contrato`, body),
  atualizarContrato: (contratoId: string, body: ContratoBody) => apiSend<AdminContrato>('PUT', `/superadmin/contratos/${contratoId}`, body),
  faturamento: (competencia: string) => apiGet<LinhaFaturamento[]>(`/superadmin/faturamento?competencia=${competencia}`),
  fecharCompetencia: (competencia: string) => apiSend<{ fechadas: number; jaFechadas: number }>('POST', `/superadmin/faturamento/${competencia}/fechar`),
  pagamentos: (faturaId: string) => apiGet<Pagamento[]>(`/superadmin/faturas/${faturaId}/pagamentos`),
  registrarPagamento: (faturaId: string, body: { valor: number; pagoEm: string; forma: string; observacao?: string }) => apiSend<{ saldo: number }>('POST', `/superadmin/faturas/${faturaId}/pagamentos`, body),
  visaoGeral: () => apiGet<VisaoGeral>('/superadmin/visao-geral'),
  saude: () => apiGet<Saude>('/superadmin/saude'),
  renameClient: (id: string, name: string) => apiSend('PATCH', `/clients/${id}`, { name }),
  rastreadores: () => apiGet<AdminRastreador[]>('/superadmin/rastreadores'),
  createRastreador: (body: { imei: string; modelo?: string }) => apiSend('POST', '/superadmin/rastreadores', body),
  desativarRastreador: (id: string) => apiSend('POST', `/superadmin/rastreadores/${id}/desativar`),
  desinstalar: (instalacaoId: string) => apiSend('POST', `/superadmin/rastreadores/instalacoes/${instalacaoId}/desinstalar`),
  vincularCliente: (id: string, clientId: string) => apiSend('POST', `/superadmin/rastreadores/${id}/vincular/${clientId}`),
  desvincularCliente: (id: string) => apiSend('POST', `/superadmin/rastreadores/${id}/desvincular`),
  simCards: () => apiGet<AdminSimCard[]>('/superadmin/rastreadores/sim-cards/all'),
  createSimCard: (body: { iccid: string; operadora?: string; numero?: string }) => apiSend('POST', '/superadmin/rastreadores/sim-cards', body),
  vincularSimCard: (simCardId: string, rastreadorId: string) => apiSend('POST', `/superadmin/rastreadores/sim-cards/${simCardId}/vincular/${rastreadorId}`),
  desvincularSimCard: (simCardId: string) => apiSend('POST', `/superadmin/rastreadores/sim-cards/${simCardId}/desvincular`),
  equipe: () => apiGet<{ id: string; email: string; created_at: string }[]>('/superadmin/equipe'),
  auditoria: () => apiGet<AdminAuditEntry[]>('/superadmin/auditoria'),
};

// ---------- rastreadores do cliente (apps/api/src/rastreadores/rastreadores-cliente.controller.ts) ----------
// A Locale vincula o rastreador ao cliente; o cliente só escolhe em qual ativo ele está.
export interface MeuRastreador {
  id: string; imei: string; modelo: string | null; protocolo: string | null; vinculado_em: string;
  instalacao_id: string | null; asset_id: string | null; asset_plate: string | null; instalado_em: string | null; ultimo_pacote_em: string | null;
}
export const meusRastreadores = () => apiGet<MeuRastreador[]>('/rastreadores');
export async function instalarRastreador(rastreadorId: string, assetId: string, inst: { tecnico: string; kmInicial?: number | null; instaladoEm?: number }) {
  await apiSend('POST', `/rastreadores/${rastreadorId}/instalar`, {
    assetId: backendIdOf(assetId), tecnico: inst.tecnico, kmInicial: inst.kmInicial ?? undefined,
    instaladoEm: inst.instaladoEm ? new Date(inst.instaladoEm).toISOString() : undefined,
  });
  await syncFrota();
}
export async function desinstalarRastreador(instalacaoId: string) {
  await apiSend('POST', `/rastreadores/instalacoes/${instalacaoId}/desinstalar`);
  await syncFrota();
}
export async function atualizarPlacaAtivo(assetId: string, plate: string) {
  await apiSend('PATCH', `/assets/${backendIdOf(assetId)}`, { plate });
}
/** Ativo novo nasce na API (é nele que o rastreador é instalado); devolve o id do store (lc_…). */
export async function criarAtivo(plate: string): Promise<string> {
  const a = await apiSend<{ id: string }>('POST', '/assets', { plate });
  return assetIdFor(a.id);
}

/** Carga simples para as telas do painel: dado, erro e recarregar. */
export function useAdminQuery<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>({ data: null, error: '', loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let vivo = true;
    setState((s) => ({ ...s, loading: true }));
    load()
      .then((data) => vivo && setState({ data, error: '', loading: false }))
      .catch((e) => vivo && setState((s) => ({ ...s, error: mensagemDeErro(e), loading: false })));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

// ---------- sincronização ----------
interface SyncState { status: 'off' | 'ok' | 'erro'; ts: number; count: number; error: string; modulosFalhos: string[] }
export const useLocalle = create<SyncState>(() => ({ status: 'off', ts: 0, count: 0, error: '', modulosFalhos: [] }));

const LIVE_HISTORY = 120;

export async function syncFrota() {
  const rows = await apiGet<CurrentRow[]>('/monitoring/current');
  useStore.getState().patch((s: any) => {
    const byId: Record<string, any> = Object.fromEntries(s.assets.map((a: any) => [a.id, a]));
    const assets = [...s.assets];
    const vehicles = { ...s.vehicles };
    for (const row of rows) {
      const id = assetIdFor(row.assetId);
      const a = toAsset(row, byId[id], LIVE_GROUP.id);
      if (byId[id]) assets[assets.findIndex((x: any) => x.id === id)] = a; else assets.push(a);
      const v = toVehicle(row, vehicles[id]);
      if (v) vehicles[id] = v;
    }
    const groups = s.groups.some((g: any) => g.id === LIVE_GROUP.id) ? s.groups : [...s.groups, LIVE_GROUP];
    return { assets, vehicles, groups };
  });
  useLocalle.setState({ status: 'ok', ts: Date.now(), count: rows.length, error: '' });
}

function applyMessage(m: RealtimeMessage) {
  useStore.getState().patch((s: any) => {
    const vehicles = { ...s.vehicles };
    const history = { ...s.history };
    const push = (p: RealtimePosicao) => {
      const id = assetIdFor(p.assetId);
      const v = applyPosicao(vehicles[id], p);
      if (!v) return;
      // "dentro de quais cercas" só para exibir; entrada/saída e alertas vêm do backend como evento
      vehicles[id] = { ...v, inside: s.fences.filter((f: any) => inFence(v.pos, f)).map((f: any) => f.id) };
      history[id] = [...(history[id] || []), [v.lastUpdate, v.pos[0], v.pos[1], v.speed, v.ignition ? 1 : 0]].slice(-LIVE_HISTORY);
    };
    if (m.kind === 'snapshot') { m.posicoes.forEach(push); return { vehicles, history }; }
    if (m.kind === 'posicao') { push(m); return { vehicles, history }; }
    // alerta novo ou atualizado (lido/tratado por outro usuário): quem cria e decide é o backend
    if (m.kind === 'alerta') return { alerts: upsertAlertas(s, [m.alerta]) };
    if (m.kind === 'comando_status') return aplicarComandoStatus(s, m.comando);
    return {}; // evento cru: já está persistido; o que precisava de alerta chega como kind 'alerta'
  });
}

function upsertAlertas(s: any, alertas: Alerta[]) {
  const plate = (assetId: string | null) => s.assets.find((a: any) => a.id === assetIdFor(assetId || ''))?.plate;
  const novos = new Map(alertas.map((a) => [alertIdFor(a.id), alertaToAlert(a, plate(a.assetId))]));
  const mantidos = s.alerts.filter((a: any) => !novos.has(a.id));
  return [...mantidos, ...novos.values()].sort((a: any, b: any) => a.ts - b.ts).slice(-500);
}

// ---------- alertas (criados, lidos e tratados no backend; compartilhados entre os usuários do cliente) ----------
export async function syncAlertas() {
  const alertas = await apiGet<Alerta[]>('/alertas');
  useStore.getState().patch((s: any) => ({
    alerts: upsertAlertas({ ...s, alerts: s.alerts.filter((a: any) => !alertaIdOf(a.id)) }, alertas),
  }));
}

/** `ids` do store; sem ids, marca todos. Alertas sem id da API só mudam localmente. */
export async function marcarAlertasLidos(ids?: string[]) {
  const daApi = ids?.map(alertaIdOf).filter((x): x is string => !!x);
  if (ids && !daApi?.length) return;
  await apiSend('POST', '/alertas/lidos', ids ? { ids: daApi } : { todos: true });
}

export async function tratarAlerta(alertId: string, motivo: string, obs?: string) {
  const id = alertaIdOf(alertId);
  if (!id) return;
  const alerta = await apiSend<Alerta>('POST', `/alertas/${id}/tratar`, { motivo, obs: obs || undefined });
  if (alerta) useStore.getState().patch((s: any) => ({ alerts: upsertAlertas(s, [alerta]) }));
}

/** Mantém o stream aberto, reconectando com `since` = último evento visto (a API reenvia o que faltou). */
function runStream(signal: AbortSignal) {
  let since: string | null = null;
  let attempt = 0;
  const connect = async () => {
    while (!signal.aborted) {
      try {
        if (attempt > 0) await syncAlertas(); // reconexão: o que mudou enquanto caído vem da API, não do pub/sub
        const qs = since ? `?since=${encodeURIComponent(since)}` : '';
        const r = await fetchOuErro(`${BASE}/monitoring/stream${qs}`, { headers: { Authorization: `Bearer ${getToken()}` }, signal });
        if (r.status === 401) { encerrarSessao(); throw new Error(MSG_SESSAO); }
        if (!r.ok || !r.body) throw erroHttp(r.status);
        const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
        const parse = createSseParser();
        attempt = 0;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const data of parse(value)) {
            const m = JSON.parse(data) as RealtimeMessage;
            if (m.kind === 'evento' && (!since || m.ts > since)) since = m.ts;
            applyMessage(m);
            useLocalle.setState({ status: 'ok', ts: Date.now(), error: '' });
          }
        }
        throw new Error('Conexão de tempo real encerrada');
      } catch (e: any) {
        if (signal.aborted) return;
        useLocalle.setState({ status: 'erro', ts: Date.now(), error: mensagemDeErro(e) });
        if (!getToken()) return;
        await new Promise((res) => setTimeout(res, RECONNECT_MS[Math.min(attempt++, RECONNECT_MS.length - 1)]));
      }
    }
  };
  if (!since) since = new Date().toISOString(); // primeira conexão: o painel começa daqui, sem lotar o sino com o passado
  void connect();
}

// Percurso para o replay, no mesmo formato do histórico local: [ts, lat, lng, velocidade, ignição]
export async function fetchRoute(assetId: string, from: number, to: number) {
  const qs = `from=${new Date(from).toISOString()}&to=${new Date(to).toISOString()}`;
  const rows = await apiGet<any[]>(`/monitoring/assets/${backendIdOf(assetId)}/history?${qs}`);
  return rows.filter((p) => p.valid).map((p) => [Date.parse(p.fixTime), +p.latitude, +p.longitude, Math.round(+p.speedKmh || 0), p.ignition ? 1 : 0]);
}

// Remove do navegador tudo que veio do backend (veículos lc_, alertas al:lc:), sem tocar no que é local.
export function purgeLocalleData() {
  const fromApi = (id: any) => String(id || '').startsWith('lc_');
  useStore.getState().patch((s: any) => {
    if (!s.assets.some((a: any) => fromApi(a.id))) return {};
    const drop = (rec: Record<string, any>) => Object.fromEntries(Object.entries(rec || {}).filter(([k]) => !fromApi(k)));
    return {
      assets: s.assets.filter((a: any) => !fromApi(a.id)),
      vehicles: drop(s.vehicles),
      history: drop(s.history),
      alerts: s.alerts.filter((a: any) => !String(a.id).startsWith('al:lc:')),
    };
  });
}

export function useLocalleSync() {
  const email = useStore((s) => s.session?.email);
  const role = useStore((s) => s.session?.role);
  useEffect(() => {
    // sessão persistida no navegador sem token (aba nova, token expirado): volta para o login
    if (email && !getToken()) { useStore.getState().patch(() => ({ session: null })); return; }
    // só usuário de cliente tem frota; superadmin não tem client_id
    if (!email || role !== 'gestor') { purgeLocalleData(); return; }
    const ctrl = new AbortController();
    Promise.all([syncFrota(), syncCercas(), syncAlertas(), syncRegras()])
      .then(() => syncModulos())
      .then(() => runStream(ctrl.signal))
      .catch((e) => useLocalle.setState({ status: 'erro', ts: Date.now(), error: mensagemDeErro(e) }));
    return () => ctrl.abort();
  }, [email, role]);
}

/** Eventos de um veículo real no período, já no formato dos marcadores do Replay. */
export async function fetchEventos(assetId: string, from: number, to: number) {
  const qs = `from=${new Date(from).toISOString()}&to=${new Date(to).toISOString()}&assetId=${backendIdOf(assetId)}`;
  const rows = await apiGet<EventoApi[]>(`/monitoring/events?${qs}`);
  return rows.map(eventoToReplay).filter((e): e is NonNullable<typeof e> => !!e).sort((a, b) => a.ts - b.ts);
}

// ---------- relatórios (calculados na API sobre as posições do banco, com as funções de packages/shared) ----------
export const isRealAsset = (a: any) => String(a?.id || '').startsWith('lc_');
const MAX_IDS_NA_URL = 200; // acima disso pede a frota toda e filtra aqui (URL longa estoura limite de header)

/**
 * Busca `/reports/<rota>` para os veículos reais do escopo e devolve cada linha com o ativo do store em `a`.
 * Veículos fora do backend ficam de fora — a tela continua calculando esses localmente.
 */
export function useRelatorioApi<T extends { assetId: string }>(rota: string, params: Record<string, string | number | null | undefined>, scope: any[], enabled = true) {
  const reais = scope.filter(isRealAsset);
  const ids = reais.map((a) => backendIdOf(a.id));
  const chave = rota + JSON.stringify(params) + ids.join();
  const [st, setSt] = useState<{ rows: (T & { a: any })[]; loading: boolean; error: string }>({ rows: [], loading: false, error: '' });
  useEffect(() => {
    if (!enabled || !reais.length) { setSt({ rows: [], loading: false, error: '' }); return; }
    let vivo = true;
    setSt((s) => ({ ...s, loading: true, error: '' }));
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') qs.set(k, String(v));
    if (ids.length <= MAX_IDS_NA_URL) qs.set('assetIds', ids.join(','));
    const porId = new Map(reais.map((a) => [backendIdOf(a.id), a]));
    apiGet<T[]>(`/reports/${rota}?${qs}`)
      .then((rows) => vivo && setSt({ rows: rows.filter((r) => porId.has(r.assetId)).map((r) => ({ ...r, a: porId.get(r.assetId) })), loading: false, error: '' }))
      .catch((e) => vivo && setSt({ rows: [], loading: false, error: mensagemDeErro(e) }));
    return () => { vivo = false; };
  }, [chave, enabled]);
  return st;
}

// ---------- link temporário de localização (token validado no backend; abre em qualquer navegador) ----------
interface LinkApi { id: string; assetId: string; destinatario: string | null; criadoPor: string | null; criadoEm: string; expiraEm: string; revogadoEm: string | null; aberturas: string[]; token?: string }

/** Formato que o modal de compartilhar já usa; `token` só existe logo após criar (o backend guarda o hash). */
const linkToShare = (l: LinkApi) => ({
  id: l.id, token: l.token, assetId: assetIdFor(l.assetId), to: l.destinatario || '', by: l.criadoPor || '',
  createdAt: Date.parse(l.criadoEm), expiresAt: Date.parse(l.expiraEm), revokedAt: l.revogadoEm ? Date.parse(l.revogadoEm) : undefined,
  opens: l.aberturas.map((t) => Date.parse(t)),
});

export async function criarLink(assetId: string, duracaoMs: number, destinatario: string) {
  return linkToShare(await apiSend<LinkApi>('POST', '/links-localizacao', { assetId: backendIdOf(assetId), duracaoMs, destinatario: destinatario.trim() || undefined }));
}
export async function listarLinks(assetId: string) {
  return (await apiGet<LinkApi[]>(`/links-localizacao?assetId=${backendIdOf(assetId)}`)).map(linkToShare);
}
export const revogarLink = (id: string) => apiSend('POST', `/links-localizacao/${id}/revogar`);

export interface LinkPublico { placa: string; expiraEm: string; posicao: { lat: number; lon: number; fixTime: string; speedKmh: number | null; ignition: boolean | null } | null }
/** Página pública: sem login. `abertura` = primeiro carregamento (conta como abertura para quem criou o link). */
export async function abrirLinkPublico(token: string, abertura: boolean): Promise<LinkPublico | { motivo: 'expirado' | 'revogado' | 'invalido' }> {
  const r = await fetchOuErro(`${BASE}/publico/localizacao/${encodeURIComponent(token)}${abertura ? '?abertura=1' : ''}`);
  if (r.status === 410) return { motivo: (await r.json().catch(() => null))?.motivo === 'revogado' ? 'revogado' : 'expirado' };
  if (r.status === 404 || r.status === 400) return { motivo: 'invalido' };
  if (!r.ok) throw erroHttp(r.status);
  return r.json();
}


// ---------- módulos de cadastro/operação que saíram do navegador (apps/api/src/<modulo>) ----------
// Mesmo desenho de cercas/regras: a coleção do store é a leitura (as telas continuam iguais), toda
// escrita vai à API e recarrega a coleção. Mapeamento em localleModulos.ts. Veículos fora do backend (id sem
// "lc_") não existem no backend: a API recusa com 400 e a tela mostra a mensagem.
const DIA = 86_400_000;
const desde = (dias: number) => `de=${new Date(Date.now() - dias * DIA).toISOString()}`;
const patch = (fn: (s: any) => any) => useStore.getState().patch(fn);

export async function syncMotoristas() {
  const [motoristas, assets] = await Promise.all([apiGet<any[]>('/motoristas?incluirInativos=true'), apiGet<any[]>('/assets?incluirInativos=true')]);
  const driverOf = new Map(assets.map((a) => [assetIdFor(a.id), a.motorista_id || '']));
  patch((s) => ({
    drivers: motoristas.map(M.motoristaToDriver).filter((d) => d.active),
    assets: s.assets.map((a: any) => (driverOf.has(a.id) ? { ...a, driverId: driverOf.get(a.id) } : a)),
  }));
}
export async function salvarMotorista(d: any) {
  const salvo = await apiSend<any>(d.id ? 'PATCH' : 'POST', d.id ? `/motoristas/${d.id}` : '/motoristas', M.driverToMotoristaBody(d));
  await syncMotoristas();
  return M.motoristaToDriver(salvo);
}
export async function desativarMotorista(id: string) { await apiSend('POST', `/motoristas/${id}/desativar`); await syncMotoristas(); }
/** Motorista do cadastro do veículo (origem "escala"): grava no ativo real; os vínculos por origem continuam locais. */
export async function definirMotoristaDoAtivo(assetId: string, driverId: string) {
  await apiSend('PATCH', `/assets/${backendIdOf(assetId)}`, { motoristaId: driverId || null });
  await syncMotoristas();
}

export async function syncGrupos() {
  const grupos = (await apiGet<any[]>('/grupos')).map(M.grupoToGroup);
  const porAtivo = M.groupIdsByAsset(grupos);
  patch((s) => ({
    groups: [...grupos, ...s.groups.filter((g: any) => g.id === LIVE_GROUP.id)],
    assets: s.assets.map((a: any) => (isRealAsset(a) ? { ...a, groupIds: [...(porAtivo[a.id] || []), ...(a.groupIds?.includes(LIVE_GROUP.id) ? [LIVE_GROUP.id] : [])] } : a)),
  }));
}
export async function salvarGrupo(g: { id?: string; name: string }) {
  await apiSend(g.id ? 'PUT' : 'POST', g.id ? `/grupos/${g.id}` : '/grupos', { name: g.name });
  await syncGrupos();
}
export async function removerGrupo(id: string) { await apiSend('DELETE', `/grupos/${id}`); await syncGrupos(); }
export async function definirAtivosDoGrupo(id: string, assetIds: string[]) {
  await apiSend('PUT', `/grupos/${id}/ativos`, { assetIds: assetIds.filter((a) => isRealAsset({ id: a })).map(backendIdOf) });
  await syncGrupos();
}

export async function syncJornada() {
  const marcacoes = await apiGet<any[]>(`/jornada/marcacoes?${desde(90)}`);
  patch(() => ({ journey: marcacoes.map(M.marcacaoToMark) }));
}
export async function registrarMarcacao(m: any) { await apiSend('POST', '/jornada/marcacoes', M.markToMarcacaoBody(m)); await syncJornada(); }
export async function removerMarcacao(id: string) { await apiSend('DELETE', `/jornada/marcacoes/${id}`); await syncJornada(); }

export async function syncMultas() {
  const multas = await apiGet<any[]>('/multas');
  patch(() => ({ fines: multas.map(M.multaToFine) }));
}
export async function salvarMulta(f: any) {
  await apiSend(f.id ? 'PUT' : 'POST', f.id ? `/multas/${f.id}` : '/multas', M.fineToMultaBody(f));
  await syncMultas();
}
export async function indicarCondutor(id: string, driverId: string) { await apiSend('POST', `/multas/${id}/indicar`, { motoristaId: driverId }); await syncMultas(); }

export async function syncAbastecimentos() {
  const rows = await apiGet<any[]>(`/abastecimentos?${desde(2 * 366)}`);
  patch(() => ({ fuelings: rows.map(M.abastecimentoToFueling) }));
}
export async function salvarAbastecimento(f: any) {
  await apiSend(f.id ? 'PUT' : 'POST', f.id ? `/abastecimentos/${f.id}` : '/abastecimentos', M.fuelingToAbastecimentoBody(f));
  await syncAbastecimentos();
}
export async function removerAbastecimento(id: string) { await apiSend('DELETE', `/abastecimentos/${id}`); await syncAbastecimentos(); }

export async function syncManutencao() {
  const [planos, os] = await Promise.all([apiGet<any[]>('/manutencao/planos'), apiGet<any[]>('/manutencao/os')]);
  patch(() => ({ plans: planos.map(M.planoToPlan), workOrders: os.map(M.osToWorkOrder) }));
}
export async function salvarPlano(p: any) {
  await apiSend(p.id ? 'PUT' : 'POST', p.id ? `/manutencao/planos/${p.id}` : '/manutencao/planos', M.planToPlanoBody(p));
  await syncManutencao();
}
export async function removerPlano(id: string) { await apiSend('DELETE', `/manutencao/planos/${id}`); await syncManutencao(); }
/** Devolve a OS no formato da tela (com o id/número gerados pelo backend quando é nova). */
export async function salvarOs(w: any) {
  const salvo = await apiSend<any>(w.id ? 'PUT' : 'POST', w.id ? `/manutencao/os/${w.id}` : '/manutencao/os', M.workOrderToOsBody(w));
  await syncManutencao();
  return M.osToWorkOrder(salvo);
}

export async function syncChecklist() {
  const [modelos, respostas] = await Promise.all([apiGet<any[]>('/checklist/modelos'), apiGet<any[]>(`/checklist/respostas?${desde(180)}`)]);
  patch(() => ({ checklistTemplates: modelos.map(M.modeloToTemplate), checklistResponses: respostas.map(M.respostaToResponse) }));
}
export async function salvarModeloChecklist(t: any) {
  await apiSend(t.id ? 'PUT' : 'POST', t.id ? `/checklist/modelos/${t.id}` : '/checklist/modelos', M.templateToModeloBody(t));
  await syncChecklist();
}
export async function removerModeloChecklist(id: string) { await apiSend('DELETE', `/checklist/modelos/${id}`); await syncChecklist(); }
export async function responderChecklist(r: any) {
  const motoristas = new Set<string>(useStore.getState().drivers.map((d: any) => d.id));
  await apiSend('POST', '/checklist/respostas', M.responseToRespostaBody(r, motoristas));
  await syncChecklist();
}

export async function syncRanking() {
  const [tipos, eventos, settings] = await Promise.all([apiGet<any[]>('/ranking/matriz'), apiGet<any[]>(`/ranking/eventos?${desde(366)}`), apiGet<any[]>('/settings')]);
  const v = (k: string) => settings.find((x) => x.key === k)?.value;
  patch(() => ({ events: eventos.map(M.eventoRankingToEvent), rankCfg: M.tiposToRankCfg(tipos, Number(v('ranking.limite_pontos') ?? 100), String(v('ranking.periodo_limite') ?? 'mes')), customEventTypes: [] }));
}
export async function salvarMatrizRanking(tipos: any[], limit: number, limitPeriod: string) {
  for (const t of tipos) await apiSend('PUT', `/ranking/matriz/${t.code}`, M.tipoToMatrizBody(t));
  await apiSend('PUT', '/settings/ranking.limite_pontos', { value: limit });
  await apiSend('PUT', '/settings/ranking.periodo_limite', { value: limitPeriod });
  await syncRanking();
}
export async function lancarEventoRanking(e: any) { await apiSend('POST', '/ranking/eventos', M.eventToEventoRankingBody(e)); await syncRanking(); }

export async function syncViagens() {
  const [matrizes, viagens] = await Promise.all([apiGet<any[]>('/viagens/matrizes'), apiGet<any[]>('/viagens')]);
  patch(() => ({ matrices: matrizes.map(M.matrizToMatrix), trips: viagens.map(M.viagemToTrip) }));
}
export async function salvarMatrizViagem(m: any) {
  await apiSend(m.id ? 'PUT' : 'POST', m.id ? `/viagens/matrizes/${m.id}` : '/viagens/matrizes', M.matrixToMatrizBody(m));
  await syncViagens();
}
export async function removerMatrizViagem(id: string) { await apiSend('DELETE', `/viagens/matrizes/${id}`); await syncViagens(); }
export async function criarViagem(t: any) { await apiSend('POST', '/viagens', M.tripToViagemBody(t)); await syncViagens(); }
/** Portaria: viagem de pátio criada e já iniciada (o backend exige a etapa `iniciada` para ficar em andamento). */
export async function criarViagemPatio(t: any, origem: string) {
  const v = await apiSend<any>('POST', '/viagens', M.tripToViagemBody({ ...t, type: 'patio' }));
  await apiSend('POST', `/viagens/${v.id}/etapa`, { etapa: 'iniciada', origem });
  await syncViagens();
}
export async function etapaViagem(id: string, etapa: 'iniciada' | 'carregada' | 'descarregada' | 'encerrada', origem?: string) {
  await apiSend('POST', `/viagens/${id}/etapa`, { etapa, origem });
  await syncViagens();
}
export async function cancelarViagem(id: string) { await apiSend('POST', `/viagens/${id}/cancelar`); await syncViagens(); }

/** Carga inicial de todos os módulos depois do login (cada um independente: um erro não derruba os outros). */
export async function syncModulos() {
  const partes: [string, () => Promise<unknown>][] = [
    ['motoristas', syncMotoristas], ['grupos', syncGrupos], ['jornada', syncJornada], ['multas', syncMultas], ['combustível', syncAbastecimentos],
    ['manutenção', syncManutencao], ['checklist', syncChecklist], ['ranking', syncRanking], ['viagens', syncViagens],
  ];
  const r = await Promise.allSettled(partes.map(([, f]) => f()));
  const falhas = r.map((x, i) => (x.status === 'rejected' ? { nome: partes[i][0], motivo: mensagemDeErro(x.reason) } : null)).filter((x): x is { nome: string; motivo: string } => !!x);
  // a tela mostra "não carregou: motoristas, multas" com botão de tentar de novo; a lista vazia não pode passar por "sem dados"
  useLocalle.setState({ modulosFalhos: falhas.map((f) => f.nome), error: falhas.length ? falhas[0].motivo : '' });
}


// ---------- comandos ao rastreador (apps/api/src/comandos): bloqueio, desbloqueio e pedido de posição ----------
// O modal de comandos usa o modelo local (`commands` no store, status por veículo). Para o
// veículo real do nosso backend, o envio vai a POST /comandos[/bloqueio]; o estado final chega pelo tempo
// real (`comando_status`) — `expirado`/`cancelado` nunca viram "veículo liberado" (§ 4.6 da integração).
const TIPO_POR_KIND: Record<string, 'engineStop' | 'engineResume' | 'positionSingle'> = { bloqueio: 'engineStop', desbloqueio: 'engineResume', posicao: 'positionSingle' };
// vocabulário do modal: 'enviado' = ainda aguardando o rastreador (o toast segue esperando); 'pendente' = sem comunicação
const STATUS_TELA: Record<string, string> = { solicitado: 'enviado', enviado: 'enviado', aguardando: 'enviado', confirmado: 'confirmado', falhou: 'falhou', expirado: 'expirado', cancelado: 'cancelado' };
/** comandoId (backend) → entrada do modal, para o tempo real atualizar a linha certa. */
const comandoParaCmd = new Map<string, { cmdId: string; assetId: string }>();

function aplicarComandoStatus(s: any, c: { id: string; assetId: string; tipo: string; status: string }) {
  const ref = comandoParaCmd.get(c.id);
  const assetId = ref?.assetId ?? assetIdFor(c.assetId);
  const vehicles = { ...s.vehicles };
  // só a confirmação do aparelho muda o estado mostrado; e mesmo ela é "confirmado segundo o protocolo", não prova física
  if (c.status === 'confirmado' && vehicles[assetId] && (c.tipo === 'engineStop' || c.tipo === 'engineResume')) {
    vehicles[assetId] = { ...vehicles[assetId], blocked: c.tipo === 'engineStop' };
  }
  const commands = ref ? s.commands.map((x: any) => (x.id === ref.cmdId ? { ...x, status: { ...x.status, [assetId]: STATUS_TELA[c.status] || c.status } } : x)) : s.commands;
  return { vehicles, commands };
}

/** Kind do catálogo da tela → tipo do backend; `null` = comando que o Traccar ainda não cobre por aqui. */
export const tipoComandoLocalle = (kind: string, payload?: string) => TIPO_POR_KIND[kind] ?? (payload === 'WHERE#' ? 'positionSingle' : null);

export async function enviarComandoLocalle(cmdId: string, assetId: string, kind: string, payload: string, motivo: string) {
  const setStatus = (status: string) => useStore.getState().patch((s: any) => ({ commands: s.commands.map((c: any) => (c.id === cmdId ? { ...c, status: { ...c.status, [assetId]: status } } : c)) }));
  const tipo = tipoComandoLocalle(kind, payload);
  if (!tipo) { setStatus('nao_suportado'); return; }
  try {
    const fisico = tipo === 'engineStop' || tipo === 'engineResume';
    const c = await apiSend<{ id: string; status: string; tipo: string; assetId: string }>('POST', fisico ? '/comandos/bloqueio' : '/comandos', { assetId: backendIdOf(assetId), tipo, motivo });
    comandoParaCmd.set(c.id, { cmdId, assetId });
    setStatus(STATUS_TELA[c.status] || c.status);
  } catch (e: any) {
    setStatus('falhou');
    throw e;
  }
}


// ---------- Setup (GET/PUT/DELETE /settings): registro central de parâmetros da API ----------
export interface SetupParametro {
  key: string; modulo: string; label: string; type: 'number' | 'boolean' | 'option'; options?: string[]; min: number; max: number;
  porGrupo: boolean; legal?: { limite: number; endurece: 'up' | 'down'; ref: string }; aplicacao: 'agora' | 'recalcula'; somenteLocale: boolean;
  value: number | string; origin: 'grupo' | 'cliente' | 'padrao';
}
export interface SetupHistorico { id: string; key: string; old_value: number | string | null; new_value: number | string | null; changed_by_email: string | null; reason: string | null; changed_at: string }
const grupoQs = (groupId: string | null) => (groupId ? `?groupId=${groupId}` : '');
export const setupApi = {
  listar: (groupId: string | null) => apiGet<SetupParametro[]>(`/settings${grupoQs(groupId)}`),
  set: (key: string, value: number | string, groupId: string | null, reason: string) => apiSend<SetupParametro>('PUT', `/settings/${key}`, { value, groupId: groupId || undefined, reason: reason || undefined }),
  restaurar: (key: string, groupId: string | null) => apiSend<SetupParametro>('DELETE', `/settings/${key}${grupoQs(groupId)}`),
  historico: (key: string, groupId: string | null) => apiGet<SetupHistorico[]>(`/settings/${key}/historico${grupoQs(groupId)}`),
};
