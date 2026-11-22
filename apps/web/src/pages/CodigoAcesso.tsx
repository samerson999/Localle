// Criar senha com o código de 6 dígitos do e-mail (rotas públicas): primeiro acesso de usuário de cliente
// (/primeiro-acesso, o convite) e "esqueci minha senha" (/redefinir-senha, também para a equipe da Localle). Passo 1 confere o código, passo 2
// define a senha e já entra. O e-mail vem preenchido pelo endereço do e-mail (?email=). Código errado conta
// tentativa na API; no limite, ele deixa de valer e é preciso pedir outro.
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { BrandMark } from '../components/Layout';
import { InputOTP } from '../components/InputOTP';
import { homeOf } from '../lib/support';
import { aceitarConvite, esqueciSenha, limparDadosDoCliente, redefinirSenha, verificarConvite, verificarRedefinicao } from '../lib/localleApi';
import { Button, Input, Field, TextButton, toast } from '../components/ui';

type Tipo = 'convite' | 'redefinir';
const TIPOS = {
  convite: {
    titulo: 'Primeiro acesso', texto: 'Digite o código de 6 dígitos que enviamos para o seu e-mail.',
    verificar: verificarConvite, salvar: aceitarConvite, tituloSenha: 'Criar sua senha', botao: 'Criar senha e entrar',
  },
  redefinir: {
    titulo: 'Confira seu e-mail', texto: 'Se o e-mail estiver cadastrado, enviamos um código de 6 dígitos. Ele vale 30 minutos.',
    verificar: verificarRedefinicao, salvar: redefinirSenha, tituloSenha: 'Nova senha', botao: 'Salvar senha e entrar',
  },
} satisfies Record<Tipo, unknown>;

export default function CodigoAcesso({ tipo }: { tipo: Tipo }) {
  const t = TIPOS[tipo];
  const nav = useNavigate();
  const [params] = useSearchParams();
  const b = useStore((s) => s.revenda.branding);
  const emailFixo = params.get('email')?.trim().toLowerCase() ?? '';
  const [email, setEmail] = useState(emailFixo);
  const [codigo, setCodigo] = useState('');
  const [conta, setConta] = useState<{ email: string; clientName?: string } | null>(null);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const alvo = email.trim().toLowerCase();

  const verificar = async (c = codigo) => {
    if (!alvo) { setErr('Informe o e-mail da sua conta.'); return; }
    if (c.length !== 6) { setErr('Digite os 6 dígitos do código.'); return; }
    setBusy(true); setErr('');
    try { setConta(await t.verificar(alvo, c)); }
    catch (e: any) { setErr(e.message || String(e)); setCodigo(''); }
    finally { setBusy(false); }
  };

  const invalida = pass.length < 8 ? 'A senha precisa ter pelo menos 8 caracteres.' : pass !== pass2 ? 'As duas senhas não conferem.' : '';
  const salvar = async () => {
    if (!conta || invalida) { setErr(invalida); return; }
    setBusy(true); setErr('');
    try {
      const role = await t.salvar(conta.email, codigo, pass);
      limparDadosDoCliente({ email: conta.email, role, name: conta.email });
      nav(homeOf({ role }), { replace: true });
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally { setBusy(false); }
  };

  const reenviar = async () => {
    if (!alvo) { setErr('Informe o e-mail da sua conta.'); return; }
    try { await esqueciSenha(alvo); toast('Se o e-mail estiver cadastrado, um código novo foi enviado.'); setErr(''); setCodigo(''); }
    catch (e: any) { setErr(e.message || String(e)); }
  };

  const erro = err && <p role="alert" className="text-small font-medium text-crit-ink">{err}</p>;
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <form onSubmit={(e) => { e.preventDefault(); void (conta ? salvar() : verificar()); }} className="w-full max-w-[420px] bg-card rounded-card p-6 sm:p-8 md:p-10 flex flex-col gap-5">
        <div className="flex items-center gap-3"><BrandMark size={48} /><div className="flex flex-col"><span className="text-h3 font-semibold">{b.name}</span><span className="text-small text-ink-2">Gestão de frotas e rastreamento</span></div></div>
        {!conta ? <>
          <div>
            <h1 className="text-h2 font-semibold">{t.titulo}</h1>
            <p className="text-body text-ink-2 mt-1">{t.texto}</p>
          </div>
          {emailFixo
            ? <p className="text-body">E-mail: <span className="font-medium">{emailFixo}</span></p>
            : <Field label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-ctl-lg" autoComplete="username" placeholder="voce@empresa.com.br" /></Field>}
          <InputOTP value={codigo} onChange={(v) => { setCodigo(v); if (err) setErr(''); }} onComplete={(v) => void verificar(v)} invalid={!!err} autoFocus={!!emailFixo} disabled={busy} aria-label="Código de 6 dígitos" />
          {erro}
          <Button type="submit" size="lg" loading={busy}>Continuar</Button>
          <div className="flex justify-center gap-4">
            {tipo === 'redefinir' && <TextButton type="button" onClick={() => void reenviar()}>Reenviar código</TextButton>}
            <TextButton type="button" onClick={() => nav('/login')}>Voltar para o login</TextButton>
          </div>
        </> : <>
          <div>
            <h1 className="text-h2 font-semibold">{t.tituloSenha}</h1>
            <p className="text-body text-ink-2 mt-1">
              {conta.clientName ? <>Acesso a <span className="font-medium text-ink">{conta.clientName}</span>. Ao criar a senha, seu e-mail fica confirmado.</> : 'Defina uma nova senha para a sua conta.'}
            </p>
          </div>
          <Field label="E-mail"><Input type="email" value={conta.email} readOnly className="h-ctl-lg" autoComplete="username" /></Field>
          <Field label="Nova senha" hint="Mínimo de 8 caracteres"><Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} className="h-ctl-lg" autoComplete="new-password" autoFocus /></Field>
          <Field label="Repita a senha"><Input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} className="h-ctl-lg" autoComplete="new-password" /></Field>
          {erro}
          <Button type="submit" size="lg" loading={busy}>{t.botao}</Button>
        </>}
      </form>
    </div>
  );
}
