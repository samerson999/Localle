// Painel lateral "Precisa de você": críticos de qualquer tela + alertas recentes (antigo sino)
import { marcarAlertasLidos } from '../lib/localleApi';
import { toast } from '../components/ui';
import { auditEntry } from '@localle/shared/audit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { useNeedsYou } from '../lib/needs';
import { fmtDT, shortDT } from '@localle/shared/utils';
import { NeedsList, StatusGlyph, priorityKind, AssetName } from './story';
import { resolveAlert } from '../lib/critical';
import { TreatDialog, TreatedLine } from './TreatDialog';
import { Icon } from './icons';
import { cx, usePresence, IconButton, Button, TextButton, List, ListItem, EmptyState, CountBadge } from './ui';
import { Link } from 'react-router-dom';

export default function NeedsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const needs = useNeedsYou();
  const alerts = useStore((s) => s.alerts);
  const assets = useStore((s) => s.assets);
  const patch = useStore((s) => s.patch);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [treat, setTreat] = useState<any>(null);
  const recent = useMemo(() => [...alerts].reverse().slice(0, 30), [alerts]);
  const unread = alerts.filter((a: any) => !a.read).length;
  const name = (id: string) => assets.find((a: any) => a.id === id)?.name || '';
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open]);
  const { mounted, closing } = usePresence(open);
  if (!mounted) return null;
  return (
    <div className={cx('fixed inset-0 z-[1100] no-print', closing && 'pointer-events-none')}>
      <div className={cx('absolute inset-0 bg-scrim', closing ? 'anim-fade-out' : 'anim-fade')} onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label="Precisa de você" className={cx('absolute right-0 top-0 h-full w-[440px] max-w-full bg-card border-l border-line flex flex-col', closing ? 'panel-out' : 'panel-in')}>
        <header className="flex items-center gap-3 px-6 pt-6 pb-4">
          <h2 className="text-h2 font-semibold mr-auto">Precisa de você</h2>
          <IconButton ref={closeRef} aria-label="Fechar painel" onClick={onClose} ><Icon name="fechar" /></IconButton>
        </header>
        <div className="flex-1 overflow-y-auto px-6 pb-8">
          <section>
            <h3 className="flex items-center gap-2 text-small text-ink-2 mb-1">Críticos<span className={cx('min-w-[20px] h-5 px-tight rounded-pill text-caption font-semibold flex items-center justify-center num', needs.length ? 'bg-crit text-on-dark' : 'bg-track text-ink-2')}>{needs.length}</span></h3>
            {needs.length === 0 ? <EmptyState illustration="ilu-tudo-em-dia" title="Nenhum alerta crítico agora" detail="Quando algo precisar de ação, aparece aqui primeiro." /> : <NeedsList onNavigate={onClose} empty="Nenhum alerta crítico agora." items={needs.map((n) => ({ id: n.id, icon: n.kind === 'pneu' ? 'pneus' : n.kind === 'veiculo' ? 'alerta' : n.kind === 'multa' ? 'multas' : n.kind === 'documento' ? 'calendario' : 'manutencao', tone: 'crit', title: n.title, context: [n.detail, n.since ? `desde ${fmtDT(n.since)}` : ''].filter(Boolean).join(' · '), to: n.to }))} />}
          </section>
          <section className="mt-8">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="flex items-center gap-2 text-small text-ink-2 mr-auto">Alertas recentes{unread > 0 && <span className="min-w-[20px] h-5 px-tight rounded-pill text-caption font-semibold flex items-center justify-center bg-[var(--counter-bg)] text-[var(--counter-ink)] num" aria-label={`${unread} não lidos`}>{unread}</span>}</h3>
              {unread > 0 && <TextButton onClick={() => { patch((s: any) => ({ alerts: s.alerts.map((a: any) => ({ ...a, read: true })), ...auditEntry(s, { coll: 'alerts', refId: '', label: 'Alertas recentes', action: `marcou ${unread} alertas como lidos em lote`, count: unread }) })); marcarAlertasLidos().catch((e) => toast('Não foi possível marcar como lidos: ' + (e.message || e), { tone: 'crit' })); }}>Marcar todos como lidos</TextButton>}
            </div>
            {recent.length === 0 && <EmptyState icon="ok" title="Nenhum alerta recente" />}
            <List>
              {recent.map((a: any) => (
                <ListItem key={a.id} className={cx('flex flex-col gap-hair py-stack', !a.read && 'relative')}>
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
          </section>
          <Link to="/precisa-de-voce" onClick={onClose} className="mt-8 flex items-center justify-center gap-tight h-10 rounded-ctl border border-line text-small font-medium text-ink-2 hover:text-ink hover:bg-surface-hover">
            Ver central de alertas completa<Icon name="chevron" size={14} />
          </Link>
        </div>
      </aside>
      <TreatDialog subject={treat?.title || null} detail={treat ? [name(treat.assetId), treat.detail].filter(Boolean).join(' · ') : ''} onClose={() => setTreat(null)} onConfirm={(t) => treat && resolveAlert(treat.id, t)} />
    </div>
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
