import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { setupApi, type SetupHistorico, type SetupParametro } from '../lib/localleApi';
import { Badge, Button, Callout, Card, Field, Input, Modal, PageHeader, Pills, SearchInput, Select, Switch, Table, Tabs, TabPanel, TextButton, cx, toast, EmptyState, Skeleton } from '../components/ui';
import { Stack } from '../components/primitives';
import { fmtDT } from '@localle/shared/utils';

// Setup de parâmetros de operação (docs/PLANO-SETUP-ADMIN.md § 5): tela gerada do registro central da API
// (`GET /settings`). Camadas: Empresa (cliente) e Grupo de ativos; o valor herdado aparece com a origem.
// Cada linha salva na hora (uma chave = uma chamada), com motivo opcional para o histórico.

const MODULOS: Record<string, string> = {
  monitoramento: 'Monitoramento e alertas', jornada: 'Jornada', combustivel: 'Combustível', ativos: 'Ativos e documentos', motoristas: 'Motoristas',
  manutencao: 'Manutenção', pneus: 'Pneus', ranking: 'Ranking', can: 'Telemetria CAN', checklist: 'Checklist', multas: 'Multas', viagens: 'Viagens',
  suporte: 'Acesso de suporte', integracao: 'Integração e retenção',
};
const ORIGEM: Record<string, string> = { grupo: 'Definido no grupo', cliente: 'Definido pela empresa', padrao: 'Padrão da plataforma' };
const OPCAO: Record<string, string> = {
  semana: 'Semana', mes: 'Mês', trimestre: 'Trimestre', '1a5': '1 a 5', '1a10': '1 a 10', baixa: 'Baixa', media: 'Média',
  'rastreador>app>escala': 'Rastreador › App › Escala', 'app>rastreador>escala': 'App › Rastreador › Escala', 'escala>rastreador>app': 'Escala › Rastreador › App',
};

export default function Setup() {
  // só grupos do backend (uuid): os locais e o grupo "Frota real" não existem na API
  const groups = useStore((s) => s.groups.filter((g: any) => /^[0-9a-f-]{36}$/i.test(g.id)));
  const [camada, setCamada] = useState('empresa'); // 'empresa' | id do grupo
  const [tab, setTab] = useState('monitoramento');
  const [q, setQ] = useState('');
  const [params, setParams] = useState<SetupParametro[] | null>(null);
  const [erro, setErro] = useState('');
  const [hist, setHist] = useState<SetupParametro | null>(null);
  const groupId = camada === 'empresa' ? null : camada;

  const carregar = () => setupApi.listar(groupId).then((p) => { setParams(p); setErro(''); }).catch((e) => setErro(e.message || String(e)));
  useEffect(() => { setParams(null); carregar(); }, [groupId]);

  const modulos = useMemo(() => [...new Set((params || []).map((p) => p.modulo))].filter((m) => !groupId || (params || []).some((p) => p.modulo === m && p.porGrupo)), [params, groupId]);
  useEffect(() => { if (modulos.length && !modulos.includes(tab)) setTab(modulos[0]); }, [modulos.join()]);
  const termo = q.trim().toLowerCase();
  const visiveis = (params || []).filter((p) => (termo ? (p.label + ' ' + p.key).toLowerCase().includes(termo) : p.modulo === tab) && (!groupId || p.porGrupo));

  const aplicar = (atualizado: SetupParametro) => setParams((cur) => (cur || []).map((p) => (p.key === atualizado.key ? atualizado : p)));
  const salvar = async (p: SetupParametro, value: number | string, reason: string) => {
    try { aplicar(await setupApi.set(p.key, value, groupId, reason)); toast(`${p.label}: salvo.`); }
    catch (e: any) { toast('Não foi possível salvar: ' + (e.message || e), { tone: 'crit' }); throw e; }
  };
  const restaurar = async (p: SetupParametro) => {
    try { aplicar(await setupApi.restaurar(p.key, groupId)); toast(`${p.label}: voltou a herdar.`); }
    catch (e: any) { toast('Não foi possível restaurar: ' + (e.message || e), { tone: 'crit' }); }
  };

  return (
    <div>
      <PageHeader title="Setup" subtitle="Padrões e limites de cada parâmetro de operação. A lei é piso: o valor só pode ser mais rigoroso." />
      <div className="flex flex-wrap items-center gap-tight mb-card-head">
        {!termo && <Tabs value={tab} onChange={setTab} tabs={modulos.map((m) => ({ key: m, label: MODULOS[m] || m }))} />}
        <div className="ml-auto flex flex-wrap items-center gap-tight">
          <Pills value={camada} onChange={setCamada} options={[{ key: 'empresa', label: 'Empresa' }, ...groups.map((g: any) => ({ key: g.id, label: g.name }))]} />
          <SearchInput className="w-56" value={q} onChange={setQ} placeholder="Buscar parâmetro" aria-label="Buscar parâmetro" />
        </div>
      </div>
      {groupId && <Callout className="mb-card-head">Camada do grupo: só os parâmetros que aceitam exceção por grupo aparecem. O que não for definido aqui herda da empresa.</Callout>}
      <TabPanel id={termo ? 'busca' : tab}>
        {erro ? <Card><EmptyState illustration="ilu-erro" title="Não foi possível carregar o Setup" detail={erro} action={<Button onClick={carregar}>Tentar de novo</Button>} /></Card>
          : !params ? <Card><Stack gap="tight"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></Stack></Card>
          : visiveis.length === 0 ? <Card><EmptyState title="Nenhum parâmetro" detail={termo ? 'Nada encontrado com esse termo.' : 'Este módulo não tem parâmetro nesta camada.'} /></Card>
          : <Card>
            <Table minWidth={900} head={['Parâmetro', 'Valor', 'Origem', 'Faixa permitida', 'Aplicação', '']} align={['left', 'left', 'left', 'left', 'left', 'right']} rows={visiveis.map((p) => [
              <div className="flex flex-col gap-0.5"><span className="font-medium">{p.label}</span><span className="text-caption text-ink-2 num">{p.key}</span>{p.legal && <span className="text-caption text-ink-2">Piso legal: {p.legal.limite} ({p.legal.ref})</span>}</div>,
              <Valor p={p} onSave={(v, reason) => salvar(p, v, reason)} />,
              <span className={cx('text-small', p.origin === 'padrao' ? 'text-ink-2' : '')}>{p.somenteLocale ? 'Definido pela Locale' : ORIGEM[p.origin]}</span>,
              <span className="text-small num">{p.type === 'number' ? `${p.min} a ${p.max}` : p.type === 'boolean' ? 'liga / desliga' : (p.options || []).map((o) => OPCAO[o] || o).join(' · ')}</span>,
              <Badge tone={p.aplicacao === 'agora' ? 'orange' : 'tag'}>{p.aplicacao === 'agora' ? 'vale a partir de agora' : 'recalcula relatórios'}</Badge>,
              <div className="flex gap-3 justify-end whitespace-nowrap">
                <TextButton onClick={() => setHist(p)}>Histórico</TextButton>
                {!p.somenteLocale && ((groupId && p.origin === 'grupo') || (!groupId && p.origin === 'cliente')) && <TextButton onClick={() => restaurar(p)}>Restaurar padrão</TextButton>}
              </div>,
            ])} />
          </Card>}
      </TabPanel>
      {hist && <Historico p={hist} groupId={groupId} onClose={() => setHist(null)} />}
    </div>
  );
}

/** Controle do valor (número, liga/desliga ou opção). Número e opção abrem a confirmação com motivo; o toggle salva direto. */
function Valor({ p, onSave }: { p: SetupParametro; onSave: (v: number | string, reason: string) => Promise<void> }) {
  const [edit, setEdit] = useState<null | { value: string; reason: string }>(null);
  const [busy, setBusy] = useState(false);
  const bloqueado = !!p.somenteLocale;
  if (p.type === 'boolean') {
    return <div className="flex items-center gap-tight"><Switch aria-label={p.label} checked={Number(p.value) === 1} disabled={bloqueado || busy} onChange={async (v) => { setBusy(true); try { await onSave(v ? 1 : 0, ''); } catch { /* toast já avisou */ } setBusy(false); }} /><span className="text-small text-ink-2">{Number(p.value) === 1 ? 'Ligado' : 'Desligado'}</span></div>;
  }
  const mostrar = p.type === 'option' ? OPCAO[String(p.value)] || String(p.value) : String(p.value);
  const confirmar = async () => {
    if (!edit) return;
    const v = p.type === 'number' ? Number(String(edit.value).replace(',', '.')) : edit.value;
    if (p.type === 'number' && !Number.isFinite(v as number)) return toast('Informe um número.', { tone: 'crit' });
    setBusy(true);
    try { await onSave(v, edit.reason); setEdit(null); } catch { /* toast já avisou */ }
    setBusy(false);
  };
  return (
    <>
      <button type="button" disabled={bloqueado} onClick={() => setEdit({ value: String(p.value), reason: '' })} className={cx('text-left font-medium num rounded-chip px-2 py-1 -mx-2', bloqueado ? 'cursor-default text-ink-2' : 'hover:bg-surface-muted')} aria-label={`Alterar ${p.label}`}>{mostrar}</button>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={p.label} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button loading={busy} onClick={confirmar}>Salvar</Button></>}>
        {edit && <div className="grid gap-field">
          {p.type === 'number'
            ? <Field label={`Novo valor (de ${p.min} a ${p.max})`}><Input type="number" min={p.min} max={p.max} step="any" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} autoFocus /></Field>
            : <Field label="Nova opção"><Select value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} options={(p.options || []).map((o) => ({ value: o, label: OPCAO[o] || o }))} /></Field>}
          {p.legal && <Callout>Piso legal: {p.legal.limite} ({p.legal.ref}). O valor só pode ser mais rigoroso que a lei.</Callout>}
          <Field label="Motivo (opcional, fica no histórico)"><Input value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} placeholder="Ex.: acordo coletivo de 2026" /></Field>
          <p className="text-small text-ink-2">{p.aplicacao === 'agora' ? 'Vale a partir de agora: o que já foi apurado continua como estava.' : 'Relatórios e telas recalculam com o novo valor.'}</p>
        </div>}
      </Modal>
    </>
  );
}

function Historico({ p, groupId, onClose }: { p: SetupParametro; groupId: string | null; onClose: () => void }) {
  const [rows, setRows] = useState<SetupHistorico[] | null>(null);
  useEffect(() => { setupApi.historico(p.key, groupId).then(setRows).catch((e) => { toast('Não foi possível carregar o histórico: ' + (e.message || e), { tone: 'crit' }); setRows([]); }); }, [p.key, groupId]);
  const v = (x: number | string | null) => (x === null ? 'padrão' : p.type === 'option' ? OPCAO[String(x)] || String(x) : p.type === 'boolean' ? (Number(x) === 1 ? 'ligado' : 'desligado') : String(x));
  return (
    <Modal open onClose={onClose} title={`Histórico · ${p.label}`} width="max-w-3xl">
      {!rows ? <Skeleton className="h-24" /> : <Table minWidth={560} emptyState={<EmptyState title="Sem alterações" detail="Este parâmetro nunca foi alterado nesta camada." />} head={['Quando', 'Quem', 'De', 'Para', 'Motivo']} rows={rows.map((h) => [<time className="num">{fmtDT(Date.parse(h.changed_at))}</time>, h.changed_by_email || '—', v(h.old_value), v(h.new_value), h.reason || '—'])} />}
    </Modal>
  );
}
