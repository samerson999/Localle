// "Precisa de você" no topo: prévia rápida em duas abas (ref. central de notificações do Visor, 02/11/2026).
// Ação necessária = críticos de toda a plataforma (lib/needs); Atualizações = alertas recentes, com lido/não lido.
// No computador abre como popover preso ao botão do topo; no celular, como folha inferior (Sheet), o padrão do celular.
// O detalhe completo (filtros por tipo, histórico com busca) fica na página /precisa-de-voce.
import { marcarAlertasLidos, useCarregando } from '../lib/localleApi';
import { toast, Skeleton } from '../components/ui';
import { auditEntry } from '@localle/shared/audit';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { useNeedsYou, needIcon, needAge, type NeedItem } from '../lib/needs';
import { shortDT } from '@localle/shared/utils';
import { NeedsList, StatusGlyph, priorityKind, AssetName } from './story';
import { resolveAlert } from '../lib/critical';
import { TreatDialog, TreatedLine } from './TreatDialog';
import { Icon } from './icons';
import { cx, usePresence, Sheet, IconButton, Button, TextButton, List, ListItem, EmptyState, Tabs } from './ui';
import { rectUi, viewportUi } from '../lib/uiZoom';
import { Link } from 'react-router-dom';

const MAX_NEEDS = 8, MAX_ALERTS = 15;

export default function NeedsPanel({ open, onClose, anchor }: { open: boolean; onClose: () => void; anchor?: HTMLElement | null }) {
  const { mounted, closing } = usePresence(open);
  // popover só no computador e quando aberto pelo botão do topo; o ícone da barra do celular abre o painel
  const desk = !!anchor && typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !desk || !anchor) return;
    const place = () => { const r = rectUi(anchor); setPos({ top: r.bottom + 8, right: Math.max(8, viewportUi().w - r.right) }); };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, desk, anchor]);
  useEffect(() => {
    if (!open) return;
    if (!desk) return; // no celular a folha cuida do foco, do Esc e do toque fora
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    // popover: clique fora fecha (o botão do topo alterna sozinho, por isso fica de fora)
    const down = (e: PointerEvent) => { const t = e.target as Node; if (desk && !box.current?.contains(t) && !anchor?.contains(t) && !(t as Element).closest?.('[role="dialog"]')) onClose(); };
    document.addEventListener('keydown', k);
    document.addEventListener('pointerdown', down);
    return () => { document.removeEventListener('keydown', k); document.removeEventListener('pointerdown', down); };
  }, [open, desk, anchor]);
  if (!mounted) return null;
  if (desk) return (
    <div ref={box} role="dialog" aria-label="Precisa de você" style={pos ? { top: pos.top, right: pos.right, maxHeight: `calc(100vh - ${pos.top + 16}px)` } : { visibility: 'hidden' }}
      className={cx('fixed z-[1100] no-print w-[420px] max-w-[calc(100vw-16px)] flex flex-col bg-card border border-line rounded-panel shadow-panel', closing ? 'anim-out pointer-events-none' : 'anim-page')}>
      <Body onClose={onClose} />
    </div>
  );
  return (
    <Sheet bare tall label="Precisa de você" onClose={onClose} closing={closing}>
      <Body onClose={onClose} closeRef={closeRef} sheet />
    </Sheet>
  );
}

function Body({ onClose, closeRef, sheet }: { onClose: () => void; closeRef?: React.Ref<HTMLButtonElement>; sheet?: boolean }) {
  const needs = useNeedsYou();
  const alerts = useStore((s) => s.alerts);
  const assets = useStore((s) => s.assets);
  const patch = useStore((s) => s.patch);
  const [treat, setTreat] = useState<any>(null);
  const unread = alerts.filter((a: any) => !a.read).length;
  const carregando = useCarregando('frota', 'manutenção', 'multas', 'motoristas');
  const [tab, setTab] = useState(() => (needs.length || !unread ? 'acao' : 'atual'));
  const recent = useMemo(() => [...alerts].reverse().slice(0, MAX_ALERTS), [alerts]);
  // mais antigos primeiro: é o que está esperando há mais tempo
  const sorted = useMemo(() => [...needs].sort((a, b) => (a.since ?? Infinity) - (b.since ?? Infinity)), [needs]);
  const name = (id: string) => assets.find((a: any) => a.id === id)?.name || '';
  const readAll = () => { patch((s: any) => ({ alerts: s.alerts.map((a: any) => ({ ...a, read: true })), ...auditEntry(s, { coll: 'alerts', refId: '', label: 'Alertas recentes', action: `marcou ${unread} alertas como lidos em lote`, count: unread }) })); marcarAlertasLidos().catch((e) => toast('Não foi possível marcar como lidos: ' + (e.message || e), { tone: 'crit' })); };
  return (
    <>
      <header className={cx('flex flex-col gap-stack px-5 pb-3 border-b border-line', sheet ? 'pt-1' : 'pt-5')}>
        <div className="flex items-center gap-3">
          <h2 className="text-h3 font-semibold mr-auto">Precisa de você</h2>
          {tab === 'atual' && unread > 0 && <TextButton onClick={readAll}>Marcar todos como lidos</TextButton>}
          {closeRef && <IconButton ref={closeRef} aria-label="Fechar painel" onClick={onClose}><Icon name="fechar" /></IconButton>}
        </div>
        <Tabs size="sm" value={tab} onChange={setTab} tabs={[{ key: 'acao', label: 'Ação necessária', count: needs.length }, { key: 'atual', label: 'Atualizações', count: unread || undefined }]} />
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-2">
        {tab === 'acao' ? (
          carregando ? <div aria-busy="true" className="flex flex-col gap-stack py-2"><span className="sr-only" role="status">Carregando…</span>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          : needs.length === 0 ? <EmptyState illustration="ilu-tudo-em-dia" title="Nada pedindo ação agora" detail="Quando algo crítico acontecer na frota, aparece aqui primeiro." />
            : <>
              <NeedsList onNavigate={onClose} items={sorted.slice(0, MAX_NEEDS).map((n: NeedItem) => ({ id: n.id, icon: needIcon(n.kind), tone: 'crit', title: n.title, context: [n.detail, needAge(n.since)].filter(Boolean).join(' · '), to: n.to }))} />
              {needs.length > MAX_NEEDS && <p className="text-small text-ink-2 py-2">E mais {needs.length - MAX_NEEDS} na central.</p>}
            </>
        ) : (
          recent.length === 0 ? <EmptyState icon="ok" title="Nenhum alerta recente" /> : (
            <List>
              {recent.map((a: any) => (
                <ListItem key={a.id} className="flex flex-col gap-hair py-stack">
                  <div className="flex items-start gap-tight">
                    <span className="ico-line text-body"><StatusGlyph kind={priorityKind(a.priority)} /></span>
                    <span className={cx('text-body leading-snug', a.read ? 'font-normal' : 'font-semibold')}>{a.title}<span className="sr-only"> · prioridade {a.priority}</span></span>
                    {a.priority === 'alta' && !a.resolvedAt ? <Button size="sm" variant="secondary" onClick={() => setTreat(a)} className="ml-auto shrink-0">Tratar</Button> : !a.read && <span className="ml-auto pl-2 text-caption text-ink-2">novo</span>}
                  </div>
                  <AlertLine name={name(a.assetId)} ts={a.ts} detail={a.detail} />
                  {a.resolvedAt && <TreatedLine className="pl-[18px]" by={a.resolvedBy} at={a.resolvedAt} reason={a.resolvedReason} note={a.resolvedNote} />}
                </ListItem>
              ))}
            </List>
          )
        )}
      </div>
      <footer className="px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] border-t border-line">
        <Link to={tab === 'acao' ? '/precisa-de-voce' : '/precisa-de-voce?aba=historico'} onClick={onClose} className="flex items-center justify-center gap-tight h-9 rounded-ctl text-small font-medium text-ink-2 hover:text-ink hover:bg-surface-hover">
          Abrir a central de alertas<Icon name="chevron" size={14} />
        </Link>
      </footer>
      <TreatDialog subject={treat?.title || null} detail={treat ? [name(treat.assetId), treat.detail].filter(Boolean).join(' · ') : ''} onClose={() => setTreat(null)} onConfirm={(t) => treat && resolveAlert(treat.id, t)} />
    </>
  );
}

// Linha de contexto do alerta: ativo · horário · detalhe, sem repetir o nome do ativo; placa em chip mono.
function AlertLine({ name, ts, detail }: { name: string; ts: number; detail?: string }) {
  const rest = (detail || '').split(' · ').filter((p) => p.trim() && p.trim() !== name).map((p) => (name && p.startsWith(name + ' ') ? p.slice(name.length + 1) : p)).join(' · ');
  const clean = rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : '';
  return (
    <div className="text-small text-ink-2 pl-[18px]">
      {name && <><AssetName name={name} /> · </>}
      <time className="num">{shortDT(ts)}</time>{clean && ` · ${clean}`}
    </div>
  );
}
