// Primeiro acesso de quem o admin criou por nome de usuário (Setup › Equipe, 25/11/2026): antes de usar o sistema, a
// pessoa informa o próprio e-mail e confirma com o código de 6 dígitos que chega nele — é o e-mail que permite recuperar
// a senha depois. Sem o e-mail sair (SMTP fora), deixa seguir e pede de novo no próximo acesso.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { emailContaApi, logout } from '../lib/localleApi';
import { BrandMark } from './Layout';
import { InputOTP } from './InputOTP';
import { Button, Field, Input, TextButton, toast } from './ui';

export function PrimeiroAcessoEmail() {
  const nav = useNavigate();
  const b = useStore((s) => s.revenda.branding);
  const patch = useStore((s) => s.patch);
  const [email, setEmail] = useState('');
  const [enviadoPara, setEnviadoPara] = useState('');
  const [semEnvio, setSemEnvio] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const alvo = email.trim().toLowerCase();

  const pedir = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alvo)) { setErr('Informe um e-mail válido.'); return; }
    setBusy(true); setErr('');
    try {
      const { enviado } = await emailContaApi.pedir(alvo);
      if (enviado) { setEnviadoPara(alvo); setCodigo(''); } else setSemEnvio(true);
    } catch (e: any) { setErr(e.message || String(e)); }
    finally { setBusy(false); }
  };

  const confirmar = async (c = codigo) => {
    if (c.length !== 6) { setErr('Digite os 6 dígitos do código.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await emailContaApi.confirmar(c);
      patch((s: any) => ({ precisaEmail: false, conta: { ...s.conta, email: r.email } }));
      toast(`E-mail ${r.email} confirmado. Com ele você recupera a senha se esquecer.`);
    } catch (e: any) { setErr(e.message || String(e)); setCodigo(''); }
    finally { setBusy(false); }
  };

  const sair = async () => { await logout(); patch(() => ({ session: null })); nav('/login'); };
  const erro = err && <p role="alert" className="text-small font-medium text-crit-ink">{err}</p>;

  return (
    <div className="min-h-screen w-full bg-canvas flex items-center justify-center p-6">
      <form onSubmit={(e) => { e.preventDefault(); void (enviadoPara ? confirmar() : pedir()); }} className="w-full max-w-[420px] bg-card rounded-card p-6 sm:p-8 md:p-10 flex flex-col gap-5">
        <div className="flex items-center gap-3"><BrandMark size={48} /><div className="flex flex-col"><span className="text-h3 font-semibold">{b.name}</span><span className="text-small text-ink-2">Gestão de frotas e rastreamento</span></div></div>
        {!enviadoPara ? <>
          <div>
            <h1 className="text-h2 font-semibold">Cadastre seu e-mail</h1>
            <p className="text-body text-ink-2 mt-1">É por ele que você recupera a senha se esquecer. Vamos enviar um código para confirmar.</p>
          </div>
          <Field label="Seu e-mail"><Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (err) setErr(''); setSemEnvio(false); }} className="h-ctl-lg" autoComplete="email" placeholder="voce@empresa.com.br" autoFocus /></Field>
          {erro}
          {semEnvio && (
            <p role="status" className="text-small text-ink-2">
              Não conseguimos enviar o e-mail agora. Você pode continuar e cadastrar no próximo acesso.
            </p>
          )}
          <Button type="submit" size="lg" loading={busy}>Enviar código</Button>
          {semEnvio && <Button type="button" variant="quiet" onClick={() => patch(() => ({ precisaEmail: false }))}>Continuar sem e-mail por enquanto</Button>}
        </> : <>
          <div>
            <h1 className="text-h2 font-semibold">Confira seu e-mail</h1>
            <p className="text-body text-ink-2 mt-1">Digite o código de 6 dígitos que enviamos para <span className="font-medium text-ink">{enviadoPara}</span>. Ele vale 30 minutos.</p>
          </div>
          <InputOTP value={codigo} onChange={(v) => { setCodigo(v); if (err) setErr(''); }} onComplete={(v) => void confirmar(v)} invalid={!!err} autoFocus disabled={busy} aria-label="Código de 6 dígitos" />
          {erro}
          <Button type="submit" size="lg" loading={busy}>Confirmar e-mail</Button>
          <div className="flex justify-center gap-4">
            <TextButton type="button" onClick={() => { setEnviadoPara(''); setErr(''); }}>Trocar e-mail</TextButton>
            <TextButton type="button" onClick={() => void pedir()}>Reenviar código</TextButton>
          </div>
        </>}
        <TextButton type="button" className="self-center" onClick={() => void sair()}>Sair</TextButton>
      </form>
    </div>
  );
}
