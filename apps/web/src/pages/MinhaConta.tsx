// Minha conta: dados de acesso e troca da própria senha (exige a atual). Usuário de cliente usa
// POST /auth/senha; equipe da Localle, POST /superadmin/senha. Foto do avatar: /auth/avatar ou /superadmin/avatar. Aparência (tema claro/escuro) vale para este aparelho.
import { useEffect, useRef, useState } from 'react';
import { Card, PageHeader, PageBody, Section, Field, Input, Button, FormGroup, Tabs, Avatar, TextButton, Switch, toast } from '../components/ui';
import { useStore } from '../lib/store';
import { useTema, type Modo } from '../lib/tema';
import { ativarPush, desativarPush, estadoPush, removerAvatar, salvarAvatar, trocarSenha, type EstadoPush } from '../lib/localleApi';
import { fotoAvatar } from '../lib/fileData';
import type { IconName } from '../components/icons';

function NotificacoesPush() {
  const [estado, setEstado] = useState<EstadoPush | 'carregando'>('carregando');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void estadoPush().then(setEstado); }, []);

  const alternar = async (ligar: boolean) => {
    setBusy(true);
    try {
      if (ligar) {
        if (await ativarPush()) { setEstado('ativo'); toast('Notificações ativadas neste aparelho.'); }
        else { setEstado(await estadoPush()); toast.error('Não foi possível ativar — confira a permissão de notificação do navegador.'); }
      } else {
        await desativarPush();
        const novo = await estadoPush();
        setEstado(novo);
        if (novo === 'ativo') toast.error('Não foi possível desativar as notificações. Tente de novo.');
        else toast('Notificações desativadas neste aparelho.');
      }
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
          <Switch aria-label="Alertas push neste aparelho" checked={estado === 'ativo'} onChange={(v) => void alternar(v)} disabled={busy || estado === 'carregando' || estado === 'bloqueado'} />
        </div>
      </Card>
    </Section>
  );
}

// Foto do avatar: a imagem é recortada em quadrado e reduzida no navegador (fotoAvatar) antes de ir para a conta.
function FotoAvatar({ role }: { role: 'locale' | 'gestor' }) {
  const session = useStore((s) => s.session)!;
  const patch = useStore((s) => s.patch);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'' | 'salvar' | 'remover'>(''); // um de cada vez: os dois botões travam juntos
  const atualizar = (avatar: string | null) => patch((s: any) => (s.session ? { session: { ...s.session, avatar } } : {}));

  const escolher = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Escolha um arquivo de imagem (JPG, PNG ou WebP).'); return; }
    setBusy('salvar');
    try {
      const imagem = await fotoAvatar(file);
      await salvarAvatar(role, imagem);
      atualizar(imagem);
      toast('Foto atualizada.');
    } catch (e: any) {
      toast.error(e.message || 'Não foi possível salvar a foto.');
    } finally { setBusy(''); if (input.current) input.current.value = ''; }
  };
  const remover = async () => {
    setBusy('remover');
    try { await removerAvatar(role); atualizar(null); toast('Foto removida.'); }
    catch (e: any) { toast.error(e.message || 'Não foi possível remover a foto.'); }
    finally { setBusy(''); }
  };

  return (
    <div className="flex flex-wrap items-center gap-field">
      <Avatar name={session.name} src={session.avatar} size="lg" />
      <div className="flex flex-col gap-hair min-w-0 mr-auto">
        <span className="text-body font-semibold truncate">{session.email}</span>
        <span className="text-small text-ink-2">{role === 'locale' ? 'Equipe da Localle (Painel da Localle)' : 'Usuário da plataforma'}</span>
      </div>
      <div className="flex flex-wrap gap-tight">
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Escolher foto" onChange={(e) => void escolher(e.target.files?.[0])} />
        <Button variant="secondary" loading={busy === 'salvar'} disabled={!!busy} onClick={() => input.current?.click()}>{session.avatar ? 'Trocar foto' : 'Adicionar foto'}</Button>
        {session.avatar && <TextButton tone="danger" disabled={!!busy} onClick={remover}>Remover foto</TextButton>}
      </div>
    </div>
  );
}

// Tema: trilho em surface-muted porque o padrão do Tabs (bg-card) sumiria dentro do card. A troca aplica na hora (a própria tela é a prévia) e fica guardada neste aparelho (lib/tema.ts).
const MODOS: { key: Modo; label: string; icon: IconName }[] = [{ key: 'claro', label: 'Claro', icon: 'sol' }, { key: 'escuro', label: 'Escuro', icon: 'lua' }, { key: 'auto', label: 'Automático', icon: 'aparelho' }];
function Aparencia() {
  const { modo, setModo } = useTema();
  return (
    <Section title="Aparência">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-field">
          <div className="flex flex-col gap-hair">
            <span className="text-body font-medium">Tema</span>
            <span className="text-small text-ink-2">{modo === 'auto' ? 'Segue o modo claro ou escuro do aparelho.' : 'Vale para este aparelho.'}</span>
          </div>
          <Tabs tabs={MODOS} value={modo} onChange={(k) => setModo(k as Modo)} className="!bg-surface-muted" />
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
      <PageHeader icon="usuario" title="Minha conta" subtitle="Sua foto, dados de acesso, senha e aparência" />
      <PageBody>
        <Section title="Acesso">
          <Card>
            <FotoAvatar role={locale ? 'locale' : 'gestor'} />
          </Card>
        </Section>
        <Aparencia />
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
