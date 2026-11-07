import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import IconCadeado from '~icons/solar/lock-keyhole-bold-duotone';
import IconCarta from '~icons/solar/letter-bold-duotone';
import { useStore } from '../lib/store';
import { BrandMark } from '../components/Layout';
import { homeOf } from '../lib/support';
import { esqueciSenha, login } from '../lib/localleApi';
import { Button, Input, Field, TextButton, cx, useIsMobile } from '../components/ui';
import LoginShowcase from '../components/LoginShowcase';
import logoLocalle from '../images/localle-logo.webp';

// Estrutura da oratry.com.br/login (04/11/2026): formulário sem card, centralizado, com a marca centralizada acima; ao lado, o
// carrossel de destaques (components/LoginShowcase.tsx). A posição da foto escolhida em Revenda continua valendo: lado
// do painel, foto de fundo (formulário em card) ou sem painel; com foto, o painel mostra a foto no lugar do carrossel.
export default function Login() {
  const b = useStore((s) => s.revenda.branding);
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // "esqueci minha senha": link de uso único por e-mail (só usuário de cliente; acesso da Localle é
  // redefinido por outro membro da equipe). A resposta é sempre a mesma, exista o e-mail ou não.
  const [modo, setModo] = useState<'entrar' | 'esqueci' | 'enviado'>('entrar');
  const pedirLink = async () => {
    if (!email.trim()) { setErr('Informe o e-mail da sua conta.'); return; }
    setBusy(true); setErr('');
    try { await esqueciSenha(email.trim().toLowerCase()); setModo('enviado'); }
    catch (e: any) { setErr(e.message || String(e)); }
    finally { setBusy(false); }
  };
  // Autenticação sempre na API: usuário de cliente entra como gestor da
  // frota, superadmin da Locale no Painel da Locale. Permissões de cada papel são decididas pela API.
  const enter = async () => {
    setBusy(true); setErr('');
    try {
      const role = await login(email.trim(), pass);
      useStore.getState().patch(() => ({ session: { email: email.trim(), role, name: email.trim() } }));
      nav(homeOf({ role }));
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally { setBusy(false); }
  };
  const pos = b.photoPos;
  const voltar = (rotulo: string) => <button type="button" onClick={() => { setErr(''); setModo('entrar'); }} className="self-start text-small text-ink-2 hover:text-ink mb-3">← {rotulo}</button>;
  const selo = (Icone: typeof IconCadeado) => <span aria-hidden="true" className="mx-auto grid place-items-center size-12 rounded-ctl border border-brand-soft-line bg-brand-soft text-brand-link"><Icone className="size-6" /></span>;
  const erro = err && <p role="alert" className="text-small font-medium text-crit-ink text-left">{err}</p>;

  // celular: o painel visual some (max-md:hidden) e nem é montado — senão as ilustrações do carrossel baixavam escondidas
  const mobile = useIsMobile();
  const visual = mobile ? null : (
    <div aria-hidden={b.photo ? true : undefined} className={cx('relative isolate overflow-hidden flex-1 min-h-screen flex flex-col items-center justify-center px-8 py-16 max-md:hidden', pos === 'direita' ? 'border-l' : 'border-r', 'border-line', !b.photo && 'login-visual')}>
      {b.photo ? <>
        <img src={b.photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-scrim" />
        {b.tagline && <h2 className="absolute left-12 right-12 bottom-12 text-on-dark text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.1] tracking-[-0.025em]">{b.tagline}</h2>}
      </> : <LoginShowcase tagline={b.tagline} />}
    </div>
  );

  // marca: o logo da revenda; revenda sem logo, o símbolo com o nome dela; senão o logo com nome da Localle. Fica
  // centralizada acima do formulário (e no topo do card, com foto de fundo).
  const marca = b.logo ? <BrandMark size={32} /> : b.name && b.name !== 'Localle' ? <span className="flex items-center gap-2"><BrandMark size={28} /><span className="text-h3 font-semibold">{b.name}</span></span> : <img src={logoLocalle} alt="Localle" className="h-8 w-auto" />;

  const form = (
    <main className={cx('relative flex-1 min-h-screen flex items-center', pos === 'fundo' ? 'justify-end p-6 md:pr-20' : 'justify-center')}>
      <form onSubmit={(e) => { e.preventDefault(); void (modo === 'esqueci' ? pedirLink() : enter()); }}
        // o app abre a 90% no desktop (base.css › --ui-zoom); o formulário do login volta a 100%, tudo na mesma proporção
        className={cx('flex flex-col text-center anim-fade [zoom:calc(1/var(--ui-zoom))]', pos === 'fundo' ? 'w-full max-w-[400px] bg-card rounded-card shadow-modal p-8' : 'w-[min(370px,calc(100%-48px))] pt-24 pb-16')}>
        <div className="flex justify-center mb-10">{marca}</div>
        {modo === 'entrar' ? <>
          <h1 className="text-title font-semibold">Bem-vindo de volta</h1>
          <p className="text-body text-ink-2 mt-3 mb-8">Use o e-mail cadastrado pela sua central.</p>
          <div className="flex flex-col gap-4 text-left">
            <Field label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-ctl-lg" autoComplete="username" placeholder="voce@empresa.com.br" /></Field>
            <Field label="Senha"><Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} className="h-ctl-lg" autoComplete="current-password" placeholder="Sua senha" /></Field>
            {erro}
            <Button type="submit" size="lg" disabled={busy} className="w-full mt-1">{busy ? 'Entrando…' : 'Acessar plataforma'}</Button>
          </div>
          <TextButton type="button" className="self-center mt-4" onClick={() => { setErr(''); setModo('esqueci'); }}>Esqueci minha senha</TextButton>
        </> : modo === 'esqueci' ? <>
          {voltar('Voltar para entrar')}
          {selo(IconCadeado)}
          <h1 className="mt-3 text-h2 font-semibold">Recupere seu acesso</h1>
          <p className="text-body text-ink-2 mt-2 mb-6">Digite seu e-mail e enviaremos um link para criar uma nova senha.</p>
          <div className="flex flex-col gap-4 text-left">
            <Field label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-ctl-lg" autoComplete="username" placeholder="voce@empresa.com.br" autoFocus /></Field>
            {erro}
            <Button type="submit" size="lg" loading={busy} className="w-full mt-1">Enviar link</Button>
          </div>
        </> : <>
          {selo(IconCarta)}
          <h1 className="mt-3 text-h2 font-semibold">Confira seu e-mail</h1>
          <p className="text-body text-ink-2 mt-2 mb-6">Se <span className="font-medium text-ink">{email.trim()}</span> estiver cadastrado, enviamos um link para criar uma nova senha. Ele vale 30 minutos e só pode ser usado uma vez.</p>
          <Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => setModo('entrar')}>Voltar para o login</Button>
        </>}
        <footer className="mt-10 flex flex-col items-center gap-1 text-caption text-ink-3">
          <p>Gestão de frotas e rastreamento</p>
          {b.supportPhone && <p className="text-small text-ink-2">Suporte: <span className="num">{b.supportPhone}</span></p>}
        </footer>
      </form>
    </main>
  );

  if (pos === 'centro') return <div className="min-h-screen relative bg-card flex">{form}</div>;
  if (pos === 'fundo') return (
    <div className="min-h-screen relative bg-canvas flex">
      {b.photo ? <><img src={b.photo} alt="" className="absolute inset-0 w-full h-full object-cover" /><div className="absolute inset-0 bg-scrim" /></> : <div className="login-visual absolute inset-0" />}
      {form}
    </div>
  );
  return (
    <div className={cx('min-h-screen relative flex bg-card', pos === 'esquerda' && 'flex-row-reverse')}>
      {form}{visual}
    </div>
  );
}
