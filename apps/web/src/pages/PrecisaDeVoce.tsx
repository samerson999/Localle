// Central de alertas "Precisa de você" (sidebar e botão do topo). Duas abas para não misturar o que pede ação com o
// registro do que já aconteceu: "Para resolver" (críticos, contados por tipo, numa lista só, do que espera há mais
// tempo para o mais recente) e "Histórico" (todos os alertas, com busca, filtro e lido/não lido).
import { marcarAlertasLidos, useCarregando } from '../lib/localleApi';
import { toast, LoadingBlock } from '../components/ui';
import { useEffect, useMemo, useState } from 'react';
import { auditEntry } from '@localle/shared/audit';
import { useStore } from '../lib/store';
import { useNeedsYou, NEED_KINDS, needAge, type NeedItem } from '../lib/needs';
import { fmtDT } from '@localle/shared/utils';
import { StatusDot, priorityKind, AssetName } from '../components/story';
import { resolveAlert } from '../lib/critical';
import { TreatDialog, TreatedLine } from '../components/TreatDialog';
import { Icon } from '../components/icons';
import { PageHeader, PageBody, Card, Table, Select, Check, TextButton, Button, EmptyState, Stack, Cluster, SearchInput, Tabs, cx } from '../components/ui';
import { Link, useSearchParams } from 'react-router-dom';

const PRIO: Record<string, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const Prio = ({ p }: { p: string }) => <StatusDot kind={priorityKind(p)} label={PRIO[p] || p} />;
const PAGE = 50;

export default function PrecisaDeVoce() {
  const needs = useNeedsYou();
  const unread = useStore((s) => s.alerts.filter((a: any) => !a.read).length);
  const [params, setParams] = useSearchParams();
  const tab = params.get('aba') === 'historico' ? 'historico' : 'resolver';
  const carregando = useCarregando('frota', 'manutenção', 'multas', 'motoristas');
  return (
    <div>
      <PageHeader title="Precisa de você" subtitle="O que pede ação agora, por tipo, e o histórico de alertas." />
      <PageBody>
        <Stack gap="grid">
          <Tabs value={tab} onChange={(k) => setParams(k === 'historico' ? { aba: 'historico' } : {}, { replace: true })}
            tabs={[{ key: 'resolver', label: 'Para resolver', count: needs.length }, { key: 'historico', label: 'Histórico', count: unread || undefined }]} />
          {carregando ? <LoadingBlock /> : tab === 'resolver' ? <ParaResolver needs={needs} /> : <AlertHistory />}
        </Stack>
      </PageBody>
    </div>
  );
}

function ParaResolver({ needs }: { needs: NeedItem[] }) {
  const [kind, setKind] = useState<NeedItem['kind'] | ''>('');
  const count = (k: NeedItem['kind']) => needs.filter((n) => n.kind === k).length;
  // mais antigos primeiro: o que espera há mais tempo; sem data vai para o fim
  const list = useMemo(() => needs.filter((n) => !kind || n.kind === kind).sort((a, b) => (a.since ?? Infinity) - (b.since ?? Infinity)), [needs, kind]);
  const label = (k: NeedItem['kind']) => NEED_KINDS.find((x) => x.kind === k)!;
  if (!needs.length) return <Card><EmptyState illustration="ilu-tudo-em-dia" size="page" title="Nada pedindo ação agora" detail="Veículos, manutenção, pneus, multas e documentos estão em dia. Quando algo ficar crítico, aparece aqui primeiro." /></Card>;
  return (
    <>
      {/* um bloco por tipo: a contagem também filtra a lista */}
      <section aria-label="Críticos por tipo" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-field">
        {NEED_KINDS.map((k) => {
          const n = count(k.kind), on = kind === k.kind;
          return (
            <button key={k.kind} type="button" aria-pressed={on} disabled={!n} onClick={() => setKind(on ? '' : k.kind)}
              className={cx('flex flex-col items-start gap-tight p-card-sm rounded-card bg-card shadow-card text-left transition-colors', on ? 'ring-2 ring-inset ring-crit' : n ? 'hover:bg-surface-hover' : 'opacity-70 cursor-default')}>
              <span className="flex items-center gap-icon text-small text-ink-2"><Icon name={k.icon} size={16} className={n ? 'text-crit' : 'text-ink-3'} />{k.label}</span>
              <span className={cx('text-h2 font-medium num', n ? 'text-ink' : 'text-ink-3')}>{n}</span>
              <span className="text-caption text-ink-2">{n ? (n === 1 ? 'crítico' : 'críticos') : 'em dia'}</span>
            </button>
          );
        })}
      </section>
      <Card title={kind ? `${label(kind).label} · ${list.length}` : `Todos os críticos · ${list.length}`} icon="atencao" subtitle="Do que espera há mais tempo para o mais recente"
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
                <Icon name="chevron" size={16} className="text-ink-3 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function AlertHistory() {
  const alerts = useStore((s) => s.alerts);
  const assets = useStore((s) => s.assets);
  const patch = useStore((s) => s.patch);
  const [pr, setPr] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [q, setQ] = useState('');
  const [treat, setTreat] = useState<any>(null);
  const [more, setMore] = useState(PAGE);
  const name = (id: string) => assets.find((a: any) => a.id === id)?.name || '';
  const unread = alerts.filter((a: any) => !a.read).length;
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return [...alerts].reverse().filter((a: any) =>
      (!pr || a.priority === pr) &&
      (!onlyUnread || !a.read) &&
      (!term || a.title.toLowerCase().includes(term) || name(a.assetId).toLowerCase().includes(term) || (a.detail || '').toLowerCase().includes(term)));
  }, [alerts, pr, onlyUnread, q]);
  useEffect(() => setMore(PAGE), [pr, onlyUnread, q]); // filtro novo volta para a primeira página
  return (
    <Card title={`Histórico de alertas (${list.length})`} icon="historico"
      actions={
        <Cluster gap="stack" className="max-md:w-full">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por ativo ou alerta" aria-label="Buscar alertas" className="w-52 max-md:w-full max-w-full" />
          <Select className="w-40 max-md:w-full" value={pr} onChange={(e) => setPr(e.target.value)} options={[{ value: '', label: 'Todas prioridades' }, 'alta', 'media', 'baixa']} />
          <Check label="Só não lidos" checked={onlyUnread} onChange={setOnlyUnread} />
          {unread > 0 && <TextButton onClick={() => { patch((s: any) => ({ alerts: s.alerts.map((a: any) => ({ ...a, read: true })), ...auditEntry(s, { coll: 'alerts', refId: '', label: 'Alertas recentes', action: `marcou ${unread} alertas como lidos em lote`, count: unread }) })); marcarAlertasLidos().catch((e) => toast('Não foi possível marcar como lidos: ' + (e.message || e), { tone: 'crit' })); }}>Marcar todos como lidos</TextButton>}
        </Cluster>
      }>
      <Table
        head={['Quando', 'Prioridade', 'Alerta', 'Ativo', 'Detalhe', '']}
        emptyState={<EmptyState illustration="ilu-tudo-em-dia" title="Nenhum alerta com esses filtros" />}
        rows={list.slice(0, more).map((a: any) => [
          <span className="num whitespace-nowrap">{fmtDT(a.ts)}</span>,
          <Prio p={a.priority} />,
          <span className={a.read ? 'font-normal' : 'font-semibold'}>{a.title}{a.resolvedAt && <TreatedLine className="mt-hair" by={a.resolvedBy} at={a.resolvedAt} reason={a.resolvedReason} note={a.resolvedNote} />}</span>,
          <AssetName name={name(a.assetId)} />,
          <span className="text-small text-ink-2">{a.detail}</span>,
          a.priority === 'alta' && !a.resolvedAt
            ? <Button size="sm" variant="secondary" onClick={() => setTreat(a)}>Tratar</Button>
            : a.read ? <span className="text-caption text-ink-2">Lido</span> : <TextButton onClick={() => { patch((s: any) => ({ alerts: s.alerts.map((x: any) => (x.id === a.id ? { ...x, read: true } : x)) })); marcarAlertasLidos([a.id]).catch((e) => toast('Não foi possível marcar como lido: ' + (e.message || e), { tone: 'crit' })); }}>Marcar como lido</TextButton>,
        ])}
      />
      {list.length > more && <div className="flex justify-center pt-stack"><Button variant="secondary" size="sm" onClick={() => setMore(more + PAGE)}>Mostrar mais {Math.min(PAGE, list.length - more)}</Button></div>}
      <TreatDialog subject={treat?.title || null} detail={treat ? [name(treat.assetId), treat.detail].filter(Boolean).join(' · ') : ''} onClose={() => setTreat(null)} onConfirm={(t) => treat && resolveAlert(treat.id, t)} />
    </Card>
  );
}
