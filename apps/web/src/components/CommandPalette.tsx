// Busca global (⌘K / Ctrl+K): módulos e ativos por placa, nome, modelo ou motorista
import { opAssets } from '../lib/assetLifecycle';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Icon } from './icons';
import { cx, usePresence, useScrollLock, EmptyState } from './ui';
import { Plate } from './story';

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const norm = (x: string) => (x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function CommandPalette({ open, onClose, modules }: { open: boolean; onClose: () => void; modules: { key: string; label: string; to: string; icon: string }[] }) {
  const nav = useNavigate();
  const assets = useStore((s) => opAssets(s));
  const drivers = useStore((s) => s.drivers);
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(''); setI(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);

  const results = useMemo(() => {
    const t = norm(q.trim());
    const mods = modules.filter((m) => !t || norm(m.label).includes(t)).map((m) => ({ id: 'm' + m.key, icon: m.icon, title: m.label, sub: 'Módulo', mono: false, to: m.to }));
    const drv = (id: string) => drivers.find((d: any) => d.id === id)?.name || '';
    const as = !t ? [] : assets.filter((a: any) => [a.name, a.plate, a.model, a.brand, drv(a.driverId)].some((x) => norm(x).includes(t))).slice(0, 8)
      .map((a: any) => ({ id: 'a' + a.id, icon: 'ativos', title: a.name, sub: [`${a.brand || ''} ${a.model || ''}`.trim(), drv(a.driverId)].filter(Boolean).join(' · '), mono: true, to: a.kind === 'veiculo' || a.tracker ? `/monitoramento?ativo=${a.id}` : '/ativos' }));
    return [...as, ...mods];
  }, [q, assets, drivers, modules]);

  const { mounted, closing } = usePresence(open);
  useScrollLock(open);
  if (!mounted) return null;
  const go = (to: string) => { onClose(); nav(to); };
  return (
    <div className={cx('fixed inset-0 z-[1200] bg-scrim flex items-start justify-center p-4 pt-[12vh] no-print', closing ? 'anim-fade-out' : 'anim-fade')} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Buscar" className={cx('w-full max-w-[560px] bg-card rounded-panel border border-line overflow-hidden shadow-modal', closing ? 'anim-out' : 'anim-page')}>
        <div className="flex items-center gap-3 px-5 border-b border-line">
          <Icon name="busca" className="text-ink-2" />
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} placeholder="Buscar placa, motorista ou módulo…" aria-label="Buscar" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-activedescendant={results[i]?.id}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(results.length - 1, i + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(0, i - 1)); }
              else if (e.key === 'Enter' && results[i]) go(results[i].to);
              else if (e.key === 'Escape') onClose();
            }} className="flex-1 h-14 bg-transparent outline-none text-body placeholder:text-ink-3" />
          <kbd className="text-caption text-ink-2 font-mono [@media(pointer:coarse)]:hidden">Esc</kbd>
        </div>
        <ul id="cmdk-list" role="listbox" className="max-h-[50vh] overflow-y-auto overscroll-contain p-2">
          {results.length === 0 && <li><EmptyState icon="busca" title={`Nada encontrado para “${q}”`} detail="Busque por placa, nome do veículo, motorista ou módulo." /></li>}
          {results.map((r, k) => (
            <li key={r.id} id={r.id} role="option" aria-selected={k === i}>
              <button type="button" onMouseEnter={() => setI(k)} onClick={() => go(r.to)} className={cx('w-full flex items-center gap-3 px-3 py-stack rounded-ctl text-left transition-colors', k === i ? 'bg-brand-soft text-brand-link' : 'hover:bg-card-2')}>
                <Icon name={r.icon} className={cx('shrink-0', k === i ? 'text-brand-link' : 'text-ink-2')} />
                <span className="flex flex-col items-start gap-1 min-w-0">{r.mono ? <Plate name={r.title} size="sm" /> : <span className={cx('text-body truncate', k === i ? 'font-semibold' : 'font-medium')}>{r.title}</span>}<span className={cx('text-caption truncate max-w-full', k === i ? 'text-brand-link' : 'text-ink-2')}>{r.sub}</span></span>
                {k === i && <Icon name="chevron" size={16} className="ml-auto text-brand-link" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
