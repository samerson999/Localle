// Barra flutuante do simulador (demo): rodar/pausar, velocidade, reiniciar e origem dos dados.
// Começa recolhida e sai de cena enquanto a página rola para baixo (volta ao subir ou no fim da página),
// para não cobrir o rodapé dos cards durante a leitura.
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { useRastreio, syncObjects, RASTREIO_ON } from '../lib/rastreioApi';
import { fmtDT } from '@localle/shared/utils';
import { Icon } from './icons';
import { cx, confirmAction, toast } from './ui';

const KEY = 'ui.simdock.open';
// recolhida por padrão; aberta só se a pessoa abriu da última vez
const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

// some ao rolar para baixo; volta ao rolar para cima, parar perto do topo ou chegar ao fim da página
function useHideOnScroll() {
  const [hidden, setHidden] = useState(false);
  const last = useRef(0);
  useEffect(() => {
    const on = () => {
      const y = window.scrollY, end = y + window.innerHeight >= document.documentElement.scrollHeight - 24;
      setHidden(y > last.current + 4 && y > 80 && !end ? true : y < last.current - 4 || y <= 80 || end ? false : hidden);
      last.current = y;
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [hidden]);
  return hidden;
}

function ApiChip() {
  const r = useRastreio();
  if (!RASTREIO_ON) return null;
  const dot = r.status === 'ok' ? 'bg-ink' : r.status === 'erro' ? 'bg-crit' : 'bg-warn';
  const label = r.status === 'ok' ? `Rastreador real · ${r.count} veículos` : r.status === 'erro' ? 'Rastreador real: sem conexão' : 'Rastreador real: conectando…';
  return <button type="button" onClick={syncObjects} title={r.status === 'erro' ? r.error : r.ts ? `Atualizado ${fmtDT(r.ts)}. Clique para atualizar agora.` : ''} className="h-8 px-stack rounded-btn text-small text-ink-2 hover:text-ink hover:bg-card-2 flex items-center gap-2"><span aria-hidden="true" className={cx('w-2 h-2 rounded-pill', dot)} />{label}</button>;
}

export default function SimDock() {
  const running = useStore((s) => s.simRunning);
  const speed = useStore((s) => s.simSpeed);
  const patch = useStore((s) => s.patch);
  const [open, setOpenRaw] = useState(read);
  const hidden = useHideOnScroll();
  const setOpen = (v: boolean) => { setOpenRaw(v); try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* sem armazenamento */ } };

  return (
    <div className={cx('no-print fixed z-[900] bottom-4 left-4 md:left-[calc(var(--sb-w)+16px)] max-w-[calc(100vw-32px)] transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-opacity', hidden && 'translate-y-[calc(100%+24px)] opacity-0 pointer-events-none')} aria-hidden={hidden || undefined}>
      <div role="region" aria-label="Simulador" className="flex items-center gap-1 p-1 bg-card border border-line rounded-dock shadow-dock overflow-x-auto">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="h-8 pl-stack pr-2 rounded-btn flex items-center gap-2 text-small whitespace-nowrap hover:bg-card-2">
          <span aria-hidden="true" className={cx('w-2 h-2 rounded-pill', running ? 'bg-ink' : 'border-[1.5px] border-ink-3')} />
          <span className="font-medium">Simulador</span><span className="text-ink-2">· demo</span>
          <Icon name={open ? 'voltar' : 'chevron'} size={14} className="text-ink-3" />
        </button>
        {open && (
          <>
            <span className="w-px h-5 bg-line mx-1" aria-hidden="true" />
            <button type="button" onClick={() => patch((s: any) => ({ simRunning: !s.simRunning }))} aria-label={running ? 'Pausar simulação' : 'Rodar simulação'} title={running ? 'Pausar' : 'Rodar'} className="w-8 h-8 rounded-btn flex items-center justify-center hover:bg-card-2"><Icon name={running ? 'pause' : 'play'} size={16} /></button>
            <div role="group" aria-label="Velocidade" className="flex items-center gap-1 p-1 bg-surface-hover rounded-btn">
              {[1, 8, 30, 120].map((x) => <button key={x} type="button" aria-pressed={speed === x} onClick={() => patch(() => ({ simSpeed: x }))} className={cx('h-7 min-w-[38px] px-tight rounded-tight text-caption font-medium num', speed === x ? 'bg-card text-ink shadow-seg' : 'text-ink-2 hover:text-ink')}>{x}x</button>)}
            </div>
            <button type="button" className="h-8 px-stack rounded-btn flex items-center gap-tight text-small text-ink-2 hover:text-ink hover:bg-card-2 whitespace-nowrap" onClick={async () => { if (await confirmAction({ title: 'Reiniciar a simulação?', detail: 'Todos os dados lançados são apagados e a simulação recomeça do zero. Não dá para desfazer.', confirmLabel: 'Reiniciar' })) { useStore.getState().reset(); toast('Simulação reiniciada.'); } }}><Icon name="reiniciar" size={16} />Reiniciar</button>
            <ApiChip />
          </>
        )}
      </div>
    </div>
  );
}
