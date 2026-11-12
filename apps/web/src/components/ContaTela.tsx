// Conta no celular, aberta pelo avatar do cabeçalho (Revolut, perfil em tela cheia: decisão de 11/11/2026). Tela cheia
// empilhada que entra da direita: voltar no topo (o mesmo botão de voltar do sistema, seta à esquerda), foto (ou iniciais) e
// nome em destaque, um cartão com Minha conta e o tema, e Sair num cartão à parte, embaixo. O desktop segue com o rodapé
// da barra lateral.
// É uma entrada no histórico: o voltar do aparelho (gesto do Android/iPhone, botão do navegador) fecha a tela em vez de
// sair da que estava por baixo. "Minha conta" troca essa entrada pela rota (replace), sem empilhar.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useTema, type Modo } from '../lib/tema';
import { logout } from '../lib/localleApi';
import { confirmAction, cx, Tabs, usePresence, useScrollLock } from './ui';
import { Icon } from './icons';

const iniciais = (nome: string) => {
  const p = (nome || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
};

// avatar de vidro: a foto do usuário ou, sem foto, as iniciais
export function AvatarVidro({ nome, foto, tamanho = 44 }: { nome: string; foto?: string | null; tamanho?: number }) {
  return (
    <span aria-hidden="true" style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.36) }}
      className="vidro relative shrink-0 rounded-pill overflow-hidden grid place-items-center font-semibold text-ink select-none">
      {iniciais(nome)}{foto && <img src={foto} alt="" className="absolute inset-0 w-full h-full object-cover" />}
    </span>
  );
}

const MODOS: { key: Modo; label: string }[] = [{ key: 'claro', label: 'Claro' }, { key: 'escuro', label: 'Escuro' }, { key: 'auto', label: 'Automático' }];

export default function ContaTela({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const session = useStore((s) => s.session);
  const patch = useStore((s) => s.patch);
  const { modo, setModo } = useTema();
  const { mounted, closing } = usePresence(open);
  useScrollLock(open);
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  // voltar: desfaz a entrada do histórico (o popstate fecha); sem ela (já trocada pela rota), fecha direto
  const voltar = () => { if (history.state?.contaTela) history.back(); else closeRef.current(); };
  useEffect(() => {
    if (!open) return;
    // o StrictMode monta duas vezes: só empilha se a entrada ainda não existe
    if (!history.state?.contaTela) history.pushState({ ...history.state, contaTela: true }, '');
    const onPop = () => closeRef.current();
    window.addEventListener('popstate', onPop);
    const back = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('button')?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); voltar(); } };
    document.addEventListener('keydown', k);
    return () => { window.removeEventListener('popstate', onPop); document.removeEventListener('keydown', k); back?.focus?.(); };
  }, [open]);
  if (!mounted || !session) return null;
  const papel = session.support ? 'Acesso de suporte' : session.role === 'locale' ? 'Administração Locale' : session.role === 'revenda' ? 'Admin da revenda' : 'Gestor da frota';
  const sair = async () => {
    if (!(await confirmAction({ title: 'Sair do sistema?', detail: 'Você precisará entrar novamente para acessar a plataforma.', confirmLabel: 'Sair', tone: 'primary' }))) return;
    await logout();
    patch(() => ({ session: null }));
    nav('/login');
  };
  const linha = 'w-full min-h-14 flex items-center gap-3 px-4 text-left text-body font-medium transition-colors active:bg-surface-hover';
  return createPortal(
    <div ref={box} role="dialog" aria-modal="true" aria-label="Conta"
      className={cx('md:hidden fixed inset-0 z-[1250] bg-canvas overflow-y-auto overscroll-contain no-print', closing ? 'panel-out' : 'panel-in')}>
      <div className="sticky top-0 z-10 px-page pt-[calc(env(safe-area-inset-top,0px)+10px)] pb-2.5">
        <button type="button" aria-label="Voltar" onClick={voltar} className="vidro size-11 rounded-pill grid place-items-center text-ink transition-transform duration-150 active:scale-[0.96]">
          <Icon name="voltar" size={22} />
        </button>
      </div>
      {/* cascata: foto, nome, cartões chegam um atrás do outro logo depois da tela (base.css › .cascata, --i = ordem) */}
      <div className="cascata flex flex-col items-center gap-1.5 px-page pt-2 pb-8 text-center">
        <AvatarVidro nome={session.name} foto={session.avatar} tamanho={88} />
        <h2 style={{ ['--i' as string]: 1 }} className="mt-3 text-h2 font-semibold">{session.name}</h2>
        <p style={{ ['--i' as string]: 1 }} className="text-small text-ink-2">{papel}</p>
      </div>
      <div className="cascata flex flex-col gap-3 px-page pb-[calc(env(safe-area-inset-bottom,0px)+24px)]">
        <div style={{ ['--i' as string]: 2 }} className="bg-card rounded-panel overflow-hidden">
          <button type="button" className={linha} onClick={() => { nav('/conta', { replace: true }); onClose(); }}>
            <Icon name="usuario" size={22} className="text-ink-2" /><span className="mr-auto">Minha conta</span><Icon name="chevron" size={16} className="text-ink-3" />
          </button>
          <div className="flex flex-col gap-3 px-4 py-3">
            <div className="flex items-center gap-3 text-body font-medium"><Icon name={modo === 'escuro' ? 'lua' : 'sol'} size={22} className="text-ink-2" />Tema</div>
            <Tabs tabs={MODOS} value={modo} onChange={(k) => setModo(k as Modo)} className="!bg-surface-muted w-full [&>*]:flex-1" />
          </div>
        </div>
        <div style={{ ['--i' as string]: 3 }} className="bg-card rounded-panel overflow-hidden">
          <button type="button" className={linha} onClick={sair}><Icon name="sair" size={22} className="text-ink-2" />Sair</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
