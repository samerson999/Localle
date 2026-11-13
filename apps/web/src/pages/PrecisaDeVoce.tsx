// Central "Precisa de você" (sidebar e botão do topo). Separa o que pede ação do que só informa, como as centrais de
// monitoramento (Samsara, Geotab): "Ocorrências" (alertas que exigem tratamento e pendências críticas da plataforma,
// do que espera há mais tempo para o mais recente; a ocorrência de veículo abre o detalhe e encerra com desfecho),
// "Avisos" (alertas que só informam: lido/não lido) e "Histórico" (todos, com quem encerrou e o desfecho).
import { marcarAlertasLidos, useCarregando } from '../lib/localleApi';
import { toast, LoadingBlock, FilterSheet } from '../components/ui';
import { useMemo, useState } from 'react';
import { auditEntry } from '@localle/shared/audit';
import { useStore } from '../lib/store';
import { useNeedsYou, NEED_KINDS, needAge, type NeedItem } from '../lib/needs';
import { fmtDT } from '@localle/shared/utils';
import { StatusDot, priorityKind, AssetName } from '../components/story';
import { isOcorrencia, resolveAlert } from '../lib/critical';
import { TreatDialog, TreatedLine } from '../components/TreatDialog';
import { OcorrenciaDialog } from '../components/OcorrenciaDialog';
import { Icon } from '../components/icons';
import { PageHeader, PageBody, Card, Table, Select, Check, TextButton, Button, EmptyState, Stack, Cluster, SearchInput, Tabs, Badge, cx } from '../components/ui';
import { Link, useSearchParams } from 'react-router-dom';

const PRIO: Record<string, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const Prio = ({ p }: { p: string }) => <StatusDot kind={priorityKind(p)} label={PRIO[p] || p} />;
type Aba = 'ocorrencias' | 'avisos' | 'historico';

export default function PrecisaDeVoce() {
  const needs = useNeedsYou();
  const avisosNaoLidos = useStore((s) => s.alerts.filter((a: any) => !a.read && !isOcorrencia(a)).length);
  const [params, setParams] = useSearchParams();
  const aba: Aba = params.get('aba') === 'avisos' ? 'avisos' : params.get('aba') === 'historico' ? 'historico' : 'ocorrencias';
  const carregando = useCarregando('frota', 'manutenção', 'multas', 'motoristas');
  // ?ocorrencia=<id> (painel do topo, link direto): abre o detalhe; some quando a ocorrência é encerrada
  const occId = params.get('ocorrencia');
  const aberta = occId ? needs.find((n) => n.id === occId && n.occ) ?? null : null;
  const fechar = () => setParams((p) => { p.delete('ocorrencia'); return p; }, { replace: true });
  return (
    <div>
      <PageHeader title="Precisa de você" subtitle="Ocorrências para resolver, avisos e o histórico do que já foi tratado." />
      <PageBody>
        <Stack gap="grid">
          <Tabs value={aba} onChange={(k) => setParams(k === 'ocorrencias' ? {} : { aba: k }, { replace: true })}
            tabs={[{ key: 'ocorrencias', label: 'Ocorrências', count: needs.length }, { key: 'avisos', label: 'Avisos', count: avisosNaoLidos || undefined }, { key: 'historico', label: 'Histórico' }]} />
          {carregando ? <LoadingBlock /> : aba === 'ocorrencias' ? <Ocorrencias needs={needs} /> : <ListaAlertas escopo={aba} />}
        </Stack>
      </PageBody>
      <OcorrenciaDialog item={aberta} onClose={fechar} />
    </div>
  );
}

function Ocorrencias({ needs }: { needs: NeedItem[] }) {
  const [kind, setKind] = useState<NeedItem['kind'] | ''>('');
  const count = (k: NeedItem['kind']) => needs.filter((n) => n.kind === k).length;
  // mais antigos primeiro: o que espera há mais tempo; sem data vai para o fim
  const list = useMemo(() => needs.filter((n) => !kind || n.kind === kind).sort((a, b) => (a.since ?? Infinity) - (b.since ?? Infinity)), [needs, kind]);
  const label = (k: NeedItem['kind']) => NEED_KINDS.find((x) => x.kind === k)!;
  if (!needs.length) return <Card><EmptyState illustration="ilu-tudo-em-dia" size="page" title="Nenhuma ocorrência aberta" detail="Veículos, manutenção, pneus, multas e documentos estão em dia. Quando algo pedir ação, aparece aqui primeiro." /></Card>;
  return (
    <>
      {/* um bloco por tipo: a contagem também filtra a lista */}
      <section aria-label="Ocorrências por tipo" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-field">
        {NEED_KINDS.map((k) => {
          const n = count(k.kind), on = kind === k.kind;
          return (
            <button key={k.kind} type="button" aria-pressed={on} disabled={!n} onClick={() => setKind(on ? '' : k.kind)}
              className={cx('flex flex-col items-start gap-tight p-card-sm rounded-card bg-card shadow-card text-left transition-colors', on ? 'ring-2 ring-inset ring-crit' : n ? 'hover:bg-surface-hover' : 'opacity-70 cursor-default')}>
              <span className="flex items-center gap-icon text-small text-ink-2"><Icon name={k.icon} size={16} className={n ? 'text-crit' : 'text-ink-3'} />{k.label}</span>
              <span className={cx('text-h2 font-medium num', n ? 'text-ink' : 'text-ink-3')}>{n}</span>
              <span className="text-caption text-ink-2">{n ? (n === 1 ? 'aberta' : 'abertas') : 'em dia'}</span>
            </button>
          );
        })}
      </section>
      <Card title={kind ? `${label(kind).label} · ${list.length}` : `Todas as ocorrências · ${list.length}`} icon="atencao" subtitle="Do que espera há mais tempo para o mais recente"
        actions={kind ? <TextButton onClick={() => setKind('')}>Ver todos os tipos</TextButton> : undefined}>
        <ul className="flex flex-col divide-y divide-line -mx-bleed">
          {list.map((n) => (
            <li key={n.id}>
              <Link to={n.to} className="flex items-center gap-stack min-h-row py-stack px-bleed row-hover hover:bg-card-2">
                <span aria-hidden="true" className="size-9 shrink-0 rounded-ctl bg-crit-soft text-crit flex items-center justify-center"><Icon name={label(n.kind).icon} size={18} /></span>
                <span className="flex flex-col gap-hair min-w-0 mr-auto">
                  <span className="text-body font-medium">{n.title}</span>
                  <span className="text-small text-ink-2">{[!kind && label(n.kind).label, n.detail].filter(Boolean).join(' · ')}</span>
                </span>
                {n.since != null && <span className="text-small text-ink-2 num whitespace-nowrap" title={`desde ${fmtDT(n.since)}`}>{needAge(n.since)}</span>}
                {/* ocorrência de veículo resolve aqui; as outras são tarefas da tela delas */}
                {n.occ ? <span className="text-small font-medium text-ink whitespace-nowrap max-md:hidden">Tratar</span> : null}
                <Icon name="chevron" size={16} className="text-ink-3 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

// Avisos: só os alertas que não exigem tratamento. Histórico: todos, com o desfecho das ocorrências encerradas.
function ListaAlertas({ escopo }: { escopo: 'avisos' | 'historico' }) {
  const alerts = useStore((s) => s.alerts);
  const assets = useStore((s) => s.assets);
  const patch = useStore((s) => s.patch);
  const [pr, setPr] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [q, setQ] = useState('');
  const [treat, setTreat] = useState<any>(null);
  const name = (id: string) => assets.find((a: any) => a.id === id)?.name || '';
  const doEscopo = useMemo(() => (escopo === 'avisos' ? alerts.filter((a: any) => !isOcorrencia(a)) : alerts), [alerts, escopo]);
  const unread = doEscopo.filter((a: any) => !a.read);
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return [...doEscopo].reverse().filter((a: any) =>
      (!pr || a.priority === pr) &&
      (!onlyUnread || !a.read) &&
      (!term || a.title.toLowerCase().includes(term) || name(a.assetId).toLowerCase().includes(term) || (a.detail || '').toLowerCase().includes(term)));
  }, [doEscopo, pr, onlyUnread, q]);
  const lerTodos = () => {
    const ids = new Set(unread.map((a: any) => a.id));
    patch((s: any) => ({ alerts: s.alerts.map((a: any) => (ids.has(a.id) ? { ...a, read: true } : a)), ...auditEntry(s, { coll: 'alerts', refId: '', label: 'Alertas recentes', action: `marcou ${ids.size} alertas como lidos em lote`, count: ids.size }) }));
    // avisos: só os avisos (a API recebe até 500 ids por vez); histórico: todos os não lidos do cliente
    const lote = [...ids].slice(0, 500) as string[];
    (escopo === 'historico' ? marcarAlertasLidos() : marcarAlertasLidos(lote)).catch((e) => toast('Não foi possível marcar como lidos: ' + (e.message || e), { tone: 'crit' }));
  };
  const lido = (a: any) => { patch((s: any) => ({ alerts: s.alerts.map((x: any) => (x.id === a.id ? { ...x, read: true } : x)) })); marcarAlertasLidos([a.id]).catch((e) => toast('Não foi possível marcar como lido: ' + (e.message || e), { tone: 'crit' })); };
  return (
    <Card title={escopo === 'avisos' ? `Avisos (${list.length})` : `Histórico de alertas (${list.length})`} icon={escopo === 'avisos' ? 'alerta' : 'historico'}
      subtitle={escopo === 'avisos' ? 'Só informam: não exigem tratamento.' : undefined}
      actions={
        <Cluster gap="stack" className="max-md:w-full">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por ativo ou alerta" aria-label="Buscar alertas" className="w-52 max-md:w-full max-w-full" />
          <FilterSheet count={[pr, onlyUnread].filter(Boolean).length}><Select className="w-40 max-md:w-full" value={pr} onChange={(e) => setPr(e.target.value)} options={[{ value: '', label: 'Todas prioridades' }, 'alta', 'media', 'baixa']} />
          <Check label="Só não lidos" checked={onlyUnread} onChange={setOnlyUnread} /></FilterSheet>
          {unread.length > 0 && <TextButton onClick={lerTodos}>Marcar todos como lidos</TextButton>}
        </Cluster>
      }>
      <Table key={escopo}
        head={['Quando', 'Prioridade', 'Alerta', 'Ativo', 'Detalhe', '']}
        emptyState={<EmptyState illustration="ilu-tudo-em-dia" title={escopo === 'avisos' && !doEscopo.length ? 'Nenhum aviso' : 'Nenhum alerta com esses filtros'} />}
        rows={list.map((a: any) => {
          const occ = isOcorrencia(a);
          return [
            <span className="num whitespace-nowrap">{fmtDT(a.ts)}</span>,
            <Prio p={a.priority} />,
            <span className={a.read ? 'font-normal' : 'font-semibold'}>
              {a.title}{escopo === 'historico' && occ && <Badge className="ml-tight align-middle">{a.resolvedAt ? 'Ocorrência encerrada' : 'Ocorrência'}</Badge>}
              {a.resolvedAt && <TreatedLine className="mt-hair" by={a.resolvedBy} at={a.resolvedAt} reason={a.resolvedReason} note={a.resolvedNote} />}
            </span>,
            <AssetName name={name(a.assetId)} />,
            <span className="text-small text-ink-2">{a.detail}</span>,
            occ && !a.resolvedAt
              ? <Button size="sm" variant="secondary" onClick={() => setTreat(a)}>Encerrar</Button>
              : a.read ? <span className="text-caption text-ink-2">Lido</span> : <TextButton onClick={() => lido(a)}>Marcar como lido</TextButton>,
          ];
        })}
      />
      <TreatDialog subject={treat?.title || null} detail={treat ? [name(treat.assetId), treat.detail].filter(Boolean).join(' · ') : ''} onClose={() => setTreat(null)} onConfirm={(t) => treat && resolveAlert(treat.id, t)} />
    </Card>
  );
}
