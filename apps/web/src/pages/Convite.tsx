// Primeiro acesso por convite (rota pública /convite/:token, link do e-mail). O admin do cliente confirma o
// e-mail e cria a própria senha num passo só; em seguida já entra na plataforma. O token vale 48 h e uma vez.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { BrandMark } from '../components/Layout';
import { homeOf } from '../lib/support';
import { aceitarConvite, consultarConvite } from '../lib/localleApi';
import { Button, Input, Field } from '../components/ui';

export default function Convite() {
  const { token = '' } = useParams();
  const nav = useNavigate();
  const b = useStore((s) => s.revenda.branding);
  const [convite, setConvite] = useState<{ email: string; clientName: string } | null>(null);
  const [erroConvite, setErroConvite] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    consultarConvite(token).then(setConvite).catch((e) => setErroConvite(e.message || String(e)));
  }, [token]);

  const invalida = pass.length < 8 ? 'A senha precisa ter pelo menos 8 caracteres.' : pass !== pass2 ? 'As duas senhas não conferem.' : '';

  const enviar = async () => {
    if (!convite || invalida) { setErr(invalida); return; }
    setBusy(true); setErr('');
    try {
      await aceitarConvite(token, pass);
      useStore.getState().patch(() => ({ session: { email: convite.email, role: 'gestor', name: convite.email } }));
      nav(homeOf({ role: 'gestor' }), { replace: true });
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <form onSubmit={(e) => { e.preventDefault(); void enviar(); }} className="w-full max-w-[420px] bg-card rounded-card p-6 sm:p-8 md:p-10 flex flex-col gap-5">
        <div className="flex items-center gap-3"><BrandMark size={48} /><div className="flex flex-col"><span className="text-h3 font-semibold">{b.name}</span><span className="text-small text-ink-2">Gestão de frotas e rastreamento</span></div></div>
        {erroConvite ? (
          <>
            <h1 className="text-h2 font-semibold">Convite indisponível</h1>
            <p role="alert" className="text-body text-ink-2">{erroConvite}</p>
            <Button variant="secondary" onClick={() => nav('/login')}>Ir para o login</Button>
          </>
        ) : !convite ? (
          <p className="text-body text-ink-2">Verificando o convite…</p>
        ) : (
          <>
            <div>
              <h1 className="text-h2 font-semibold">Criar sua senha</h1>
              <p className="text-body text-ink-2 mt-1">Administrador de <span className="font-medium text-ink">{convite.clientName}</span>. Ao criar a senha, seu e-mail fica confirmado.</p>
            </div>
            <Field label="E-mail"><Input type="email" value={convite.email} readOnly className="h-ctl-lg" autoComplete="username" /></Field>
            <Field label="Nova senha" hint="Mínimo de 8 caracteres"><Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} className="h-ctl-lg" autoComplete="new-password" autoFocus /></Field>
            <Field label="Repita a senha"><Input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} className="h-ctl-lg" autoComplete="new-password" /></Field>
            {err && <p role="alert" className="text-small font-medium text-crit-ink">{err}</p>}
            <Button type="submit" size="lg" loading={busy}>Criar senha e entrar</Button>
          </>
        )}
      </form>
    </div>
  );
}
