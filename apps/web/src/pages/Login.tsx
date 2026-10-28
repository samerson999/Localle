import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { BrandMark } from '../components/Layout';
import { homeOf } from '../lib/support';
import { esqueciSenha, login } from '../lib/localleApi';
import { Button, Input, Field, TextButton, cx } from '../components/ui';

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
  const photo = (
    <div className={cx('relative overflow-hidden bg-ink p-10 md:p-14 flex items-end', pos === 'fundo' ? 'absolute inset-0' : 'flex-[999_1_520px] min-h-[320px]')}>
      {b.photo ? <img src={b.photo} alt="" className="absolute inset-0 w-full h-full object-cover" /> : (
        <svg aria-hidden="true" viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full opacity-40"><g fill="none" stroke="var(--brand)" strokeWidth="2"><path d="M-20 620 C 160 560, 240 700, 420 610 S 700 520, 860 600" /><path d="M-20 300 C 120 360, 300 240, 460 330 S 720 420, 860 300" /><path d="M200 -20 C 240 200, 160 420, 260 640 S 300 860, 280 940" /><path d="M600 -20 C 560 220, 660 460, 580 700 S 620 860, 640 940" /></g></svg>
      )}
      {b.photo && <div className="absolute inset-0 bg-scrim" />}
      {pos !== 'fundo' && <div className="relative max-w-md"><h2 className="text-on-dark text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.1] tracking-[-0.025em]">{b.tagline}</h2></div>}
    </div>
  );
  const form = (
    <div className={cx('relative flex items-center p-6 md:p-10', pos === 'fundo' ? 'w-full min-h-screen justify-end md:pr-20' : pos === 'centro' ? 'w-full min-h-screen justify-center' : 'flex-[1_1_460px] justify-center')}>
      <form onSubmit={(e) => { e.preventDefault(); void (modo === 'esqueci' ? pedirLink() : enter()); }} className="w-full max-w-[400px] bg-card rounded-card p-6 sm:p-8 md:p-10 flex flex-col gap-5">
        <div className="flex items-center gap-3"><BrandMark size={48} /><div className="flex flex-col"><span className="text-h3 font-semibold">{b.name}</span><span className="text-small text-ink-2">Gestão de frotas e rastreamento</span></div></div>
        {modo === 'entrar' ? <>
          <div><h1 className="text-h2 font-semibold">Entrar</h1><p className="text-body text-ink-2 mt-1">Use o e-mail cadastrado pela sua central.</p></div>
          <Field label="E-mail ou usuário"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-ctl-lg" autoComplete="username" /></Field>
          <Field label="Senha"><Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} className="h-ctl-lg" autoComplete="current-password" /></Field>
          {err && <p role="alert" className="text-small font-medium text-crit-ink">{err}</p>}
          <Button type="submit" size="lg" disabled={busy}>{busy ? 'Entrando…' : 'Acessar plataforma'}</Button>
          <TextButton type="button" className="self-start" onClick={() => { setErr(''); setModo('esqueci'); }}>Esqueci minha senha</TextButton>
        </> : modo === 'esqueci' ? <>
          <div><h1 className="text-h2 font-semibold">Esqueci minha senha</h1><p className="text-body text-ink-2 mt-1">Enviamos um link para você criar uma nova senha.</p></div>
          <Field label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-ctl-lg" autoComplete="username" autoFocus /></Field>
          {err && <p role="alert" className="text-small font-medium text-crit-ink">{err}</p>}
          <Button type="submit" size="lg" loading={busy}>Enviar link</Button>
          <TextButton type="button" className="self-start" onClick={() => { setErr(''); setModo('entrar'); }}>Voltar para o login</TextButton>
        </> : <>
          <div><h1 className="text-h2 font-semibold">Confira seu e-mail</h1><p className="text-body text-ink-2 mt-1">Se <span className="font-medium text-ink">{email.trim()}</span> estiver cadastrado, enviamos um link para criar uma nova senha. Ele vale 30 minutos e só pode ser usado uma vez.</p></div>
          <Button type="button" variant="secondary" onClick={() => setModo('entrar')}>Voltar para o login</Button>
        </>}
        <div className="text-small text-ink-2 border-t border-line pt-4">Suporte: <span className="num">{b.supportPhone}</span></div>
      </form>
    </div>
  );
  if (pos === 'centro') return <div className="min-h-screen relative bg-canvas">{form}</div>;
  return (
    <div className={cx('min-h-screen relative flex flex-wrap bg-canvas', pos === 'direita' && 'flex-row-reverse')}>
      {photo}{form}
    </div>
  );
}
