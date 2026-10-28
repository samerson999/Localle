// Minha conta: dados de acesso e troca da própria senha (exige a atual). Usuário de cliente usa
// POST /auth/senha; equipe da Localle, POST /superadmin/senha.
import { useState } from 'react';
import { Card, PageHeader, PageBody, Section, Field, Input, Button, FormGroup, toast } from '../components/ui';
import { useStore } from '../lib/store';
import { trocarSenha } from '../lib/localleApi';

export default function MinhaConta() {
  const session = useStore((s) => s.session);
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [nova2, setNova2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!session) return null;
  const locale = session.role === 'locale';

  const invalida = !atual ? 'Informe a senha atual.' : nova.length < 8 ? 'A nova senha precisa ter pelo menos 8 caracteres.' : nova !== nova2 ? 'As duas senhas novas não conferem.' : nova === atual ? 'A nova senha precisa ser diferente da atual.' : '';
  const salvar = async () => {
    if (invalida) { setErr(invalida); return; }
    setBusy(true); setErr('');
    try {
      await trocarSenha(locale ? 'locale' : 'gestor', atual, nova);
      setAtual(''); setNova(''); setNova2('');
      toast('Senha alterada.');
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader icon="usuario" title="Minha conta" subtitle="Seus dados de acesso e senha" />
      <PageBody>
        <Section title="Acesso">
          <Card>
            <div className="flex flex-col gap-hair">
              <span className="text-body font-semibold">{session.email}</span>
              <span className="text-small text-ink-2">{locale ? 'Equipe da Localle (Painel da Localle)' : 'Usuário da plataforma'}</span>
            </div>
          </Card>
        </Section>
        <Section title="Trocar senha">
          <Card>
            <form onSubmit={(e) => { e.preventDefault(); void salvar(); }} className="flex flex-col gap-field max-w-lg">
              <Field label="Senha atual"><Input type="password" value={atual} onChange={(e) => setAtual(e.target.value)} autoComplete="current-password" /></Field>
              <FormGroup cols={2}>
                <Field label="Nova senha" hint="Mínimo de 8 caracteres"><Input type="password" value={nova} onChange={(e) => setNova(e.target.value)} autoComplete="new-password" /></Field>
                <Field label="Repita a nova senha"><Input type="password" value={nova2} onChange={(e) => setNova2(e.target.value)} autoComplete="new-password" /></Field>
              </FormGroup>
              {err && <p role="alert" className="text-small font-medium text-crit-ink">{err}</p>}
              <Button type="submit" className="self-start" loading={busy}>Salvar nova senha</Button>
            </form>
          </Card>
        </Section>
      </PageBody>
    </div>
  );
}
