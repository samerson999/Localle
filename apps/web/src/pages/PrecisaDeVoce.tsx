// Central de alertas: tela dedicada para "Precisa de você", acessível pela sidebar.
// Diferente do painel lateral (NeedsPanel, aberto pelo sino): aqui cabe mais contexto —
// críticos agrupados por natureza do problema e o histórico completo de alertas com filtro e busca.
import { useMemo, useState } from 'react';
import { auditEntry } from '@localle/shared/audit';
import { useStore } from '../lib/store';
import { useNeedsYou, type NeedItem } from '../lib/needs';
import { fmtDT } from '@localle/shared/utils';
import { StatusDot, priorityKind, AssetName } from '../components/story';
import { resolveAlert } from '../lib/critical';
import { TreatDialog, TreatedLine } from '../components/TreatDialog';
import { Icon } from '../components/icons';
import { PageHeader, PageBody, Card, Table, Select, Check, TextButton, Button, EmptyState, Stack, Cluster, SearchInput } from '../components/ui';
import { Link } from 'react-router-dom';

const PRIO: Record<string, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const Prio = ({ p }: { p: string }) => <StatusDot kind={priorityKind(p)} label={PRIO[p] || p} />;

const GROUPS: { kind: NeedItem['kind']; title: string; icon: string }[] = [
  { kind: 'veiculo', title: 'Veículos', icon: 'alerta' },
  { kind: 'os', title: 'Manutenção', icon: 'manutencao' },
  { kind: 'pneu', title: 'Pneus', icon: 'pneus' },
  { kind: 'multa', title: 'Multas', icon: 'multas' },
  { kind: 'documento', title: 'Documentos', icon: 'calendario' },
];

export default function PrecisaDeVoce() {
  const needs = useNeedsYou();
  const byKind = useMemo(() => {
    const m = new Map<NeedItem['kind'], NeedItem[]>();
    for (const n of needs) m.set(n.kind, [...(m.get(n.kind) || []), n]);
    return m;
  }, [needs]);
  return (
    <div>
      <PageHeader title="Precisa de você" subtitle="Tudo que é crítico na frota agora, agrupado por tipo, e o histórico de alertas." />
      <PageBody>
      <Card title={`Críticos (${needs.length})`} icon="atencao">
        {needs.length === 0 ? (
          <EmptyState illustration="ilu-tudo-em-dia" title="Nenhum alerta crítico agora" detail="Quando algo precisar de ação, aparece aqui primeiro." />
        ) : (
          <Stack gap="card-head">
            {GROUPS.map((g) => {
              const items = byKind.get(g.kind) || [];
              if (!items.length) return null;
              return (
                <Stack key={g.kind} gap="tight">
                  <h3 className="flex items-center gap-icon text-small font-medium text-ink-2">
                    <Icon name={g.icon} size={16} className="text-crit shrink-0" />{g.title}
                    <span className="min-w-[20px] h-5 px-tight rounded-pill bg-crit text-on-dark text-caption font-medium flex items-center justify-center num">{items.length}</span>
                  </h3>
                  <div className="flex flex-col divide-y divide-line -mx-bleed">
                    {items.map((n) => (
                      <Link key={n.id} to={n.to} className="flex items-start gap-stack min-h-row py-tight px-bleed row-hover hover:bg-card-2">
                        <span className="flex flex-col gap-hair min-w-0 mr-auto">
                          <span className="text-body font-medium">{n.title}</span>
                          {(n.detail || n.since) && <span className="text-small text-ink-2">{[n.detail, n.since ? `desde ${fmtDT(n.since)}` : ''].filter(Boolean).join(' · ')}</span>}
                        </span>
                        <span className="ico-line text-body"><Icon name="chevron" size={16} className="text-ink-3" /></span>
                      </Link>
                    ))}
                  </div>
                </Stack>
              );
            })}
          </Stack>
        )}
      </Card>
      <AlertHistory />
      </PageBody>
    </div>
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
  const name = (id: string) => assets.find((a: any) => a.id === id)?.name || '';
  const unread = alerts.filter((a: any) => !a.read).length;
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return [...alerts].reverse().filter((a: any) =>
      (!pr || a.priority === pr) &&
      (!onlyUnread || !a.read) &&
      (!term || a.title.toLowerCase().includes(term) || name(a.assetId).toLowerCase().includes(term) || (a.detail || '').toLowerCase().includes(term)));
  }, [alerts, pr, onlyUnread, q]);
  return (
    <Card title={`Histórico de alertas (${list.length})`} icon="historico"
      actions={
        <Cluster gap="stack">
          <SearchInput value={q} onChange={setQ} placeholder="Buscar por ativo ou alerta" aria-label="Buscar alertas" className="w-52 max-w-full" />
          <Select className="w-40" value={pr} onChange={(e) => setPr(e.target.value)} options={[{ value: '', label: 'Todas prioridades' }, 'alta', 'media', 'baixa']} />
          <Check label="Só não lidos" checked={onlyUnread} onChange={setOnlyUnread} />
          {unread > 0 && <TextButton onClick={() => patch((s: any) => ({ alerts: s.alerts.map((a: any) => ({ ...a, read: true })), ...auditEntry(s, { coll: 'alerts', refId: '', label: 'Alertas recentes', action: `marcou ${unread} alertas como lidos em lote`, count: unread }) }))}>Marcar todos como lidos</TextButton>}
        </Cluster>
      }>
      <Table
        head={['Quando', 'Prioridade', 'Alerta', 'Ativo', 'Detalhe', '']}
        emptyState={<EmptyState illustration="ilu-tudo-em-dia" title="Nenhum alerta com esses filtros" />}
        rows={list.map((a: any) => [
          <span className="num whitespace-nowrap">{fmtDT(a.ts)}</span>,
          <Prio p={a.priority} />,
          <span className={a.read ? 'font-normal' : 'font-semibold'}>{a.title}{a.resolvedAt && <TreatedLine className="mt-hair" by={a.resolvedBy} at={a.resolvedAt} reason={a.resolvedReason} note={a.resolvedNote} />}</span>,
          <AssetName name={name(a.assetId)} />,
          <span className="text-small text-ink-2">{a.detail}</span>,
          a.priority === 'alta' && !a.resolvedAt
            ? <Button size="sm" variant="secondary" onClick={() => setTreat(a)}>Tratar</Button>
            : a.read ? <span className="text-caption text-ink-2">Lido</span> : <TextButton onClick={() => patch((s: any) => ({ alerts: s.alerts.map((x: any) => (x.id === a.id ? { ...x, read: true } : x)) }))}>Marcar como lido</TextButton>,
        ])}
      />
      <TreatDialog subject={treat?.title || null} detail={treat ? [name(treat.assetId), treat.detail].filter(Boolean).join(' · ') : ''} onClose={() => setTreat(null)} onConfirm={(t) => treat && resolveAlert(treat.id, t)} />
    </Card>
  );
}
