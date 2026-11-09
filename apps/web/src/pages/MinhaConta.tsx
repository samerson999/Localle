// Minha conta: dados de acesso e troca da própria senha (exige a atual). Usuário de cliente usa
// POST /auth/senha; equipe da Localle, POST /superadmin/senha.
import { useEffect, useState } from 'react';
import { Card, PageHeader, PageBody, Section, Field, Input, Button, FormGroup, toast } from '../components/ui';
import { useStore } from '../lib/store';
import { ativarPush, estadoPush, trocarSenha, type EstadoPush } from '../lib/localleApi';

function NotificacoesPush() {
  const [estado, setEstado] = useState<EstadoPush | 'carregando'>('carregando');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void estadoPush().then(setEstado); }, []);

  const ativar = async () => {
    setBusy(true);
    try {
      if (await ativarPush()) { setEstado('ativo'); toast('Notificações ativadas neste aparelho.'); }
      else { setEstado(await estadoPush()); toast.error('Não foi possível ativar — confira a permissão de notificação do navegador.'); }
    } finally { setBusy(false); }
  };

  if (estado === 'nao_suportado') return null; // navegador/contexto sem suporte: não mostra a seção
  return (
    <Section title="Notificações">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-field">
          <div className="flex flex-col gap-hair">
            <span className="text-body font-medium">Alertas push neste aparelho</span>
            <span className="text-small text-ink-2">
              {estado === 'carregando' ? 'Verificando…' : estado === 'ativo' ? 'Ativadas — você recebe mesmo com o app em segundo plano.' : estado === 'bloqueado' ? 'Bloqueadas nas configurações do navegador.' : 'Desativadas.'}
            </span>
          </div>
          {estado !== 'ativo' && estado !== 'bloqueado' && <Button onClick={ativar} loading={busy}>Ativar notificações</Button>}
        </div>
      </Card>
    </Section>
  );
}

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
        {!locale && <NotificacoesPush />}
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
