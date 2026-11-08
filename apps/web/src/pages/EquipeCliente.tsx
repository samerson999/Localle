// Equipe do cliente: o admin da conta convida Gestores e Operadores por e-mail (link de uso único; a pessoa
// cria a própria senha), reenvia o convite e desativa/reativa o acesso. Rotas /users (permissão
// "permissoes.gerenciar" — na prática, o admin). Novo admin só pela Localle.
import { useState } from 'react';
import { Card, PageHeader, PageBody, Section, Table, Badge, Button, TextButton, Modal, Field, Input, Radio, Check, Callout, EmptyState, toast, confirmAction } from '../components/ui';
import { useStore } from '../lib/store';
import { equipeApi, useAdminQuery, type MembroEquipe, type PermissaoPapel } from '../lib/localleApi';
import { ConviteLink, avisarEntrega } from '../components/ConviteLink';
import { fmtD } from '@localle/shared/utils';

const PAPEL: Record<MembroEquipe['role'], { label: string; desc: string }> = {
  admin: { label: 'Administrador', desc: 'Conta da empresa: equipe, permissões e configurações' },
  gestor: { label: 'Gestor', desc: 'Gerencia a frota: cadastros, manutenção, combustível, relatórios' },
  operador: { label: 'Operador', desc: 'Acompanha a operação: monitoramento, alertas e lançamentos do dia a dia' },
};
const situacao = (m: MembroEquipe) => (!m.ativo ? { tone: 'red', label: 'Desativado' } : m.pendente ? { tone: 'orange', label: 'Convite pendente' } : { tone: 'green', label: 'Ativo' });

export default function EquipeCliente() {
  const meuEmail = useStore((s) => s.session?.email);
  const { data, error, loading, reload } = useAdminQuery(equipeApi.listar);
  const [convidando, setConvidando] = useState(false);
  const [link, setLink] = useState<{ email: string; link: string } | null>(null);

  const acao = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast(ok); reload(); } catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
  };
  const desativar = async (m: MembroEquipe) => {
    if (!(await confirmAction({ title: 'Desativar acesso?', detail: `${m.email} perde o acesso na hora, inclusive em sessões já abertas. Dá para reativar depois.`, confirmLabel: 'Desativar' }))) return;
    acao(() => equipeApi.desativar(m.id), 'Acesso desativado.');
  };
  const reenviar = async (m: MembroEquipe) => {
    try { avisarEntrega(await equipeApi.reenviarConvite(m.id), m.email, setLink); } catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
  };

  const semPermissao = /403|permiss/i.test(error);
  return (
    <div>
      <PageHeader icon="equipe" title="Equipe" subtitle="Quem acessa a plataforma pela sua empresa">
        {!semPermissao && <Button onClick={() => setConvidando(true)}>Convidar pessoa</Button>}
      </PageHeader>
      <PageBody>
        {semPermissao ? <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Só o administrador da conta gerencia a equipe" detail="Peça ao administrador da sua empresa para convidar ou desativar pessoas." /></Card> : <>
          {error && <Callout tone="crit">Não foi possível carregar a equipe: {error}</Callout>}
          <Section title="Pessoas com acesso">
            <Card>
              <Table minWidth={760} loading={loading && !data} align={['left', 'left', 'left', 'left', 'right']}
                head={['E-mail', 'Perfil', 'Situação', 'Desde', '']}
                emptyState={<EmptyState illustration="ilu-equipe" title="Ninguém além de você ainda" action={<Button onClick={() => setConvidando(true)}>Convidar pessoa</Button>} />}
                rows={(data || []).map((m) => {
                  const st = situacao(m);
                  const eu = m.email === meuEmail;
                  return [
                    <span className="text-small">{m.email}{eu && <span className="block text-caption text-ink-2">você</span>}</span>,
                    PAPEL[m.role]?.label || m.role,
                    <Badge tone={st.tone}>{st.label}</Badge>,
                    <span className="num text-small">{fmtD(Date.parse(m.createdAt))}</span>,
                    <div className="flex gap-3 justify-end">
                      {m.role !== 'admin' && !eu && m.ativo && m.pendente && <TextButton onClick={() => reenviar(m)}>Reenviar convite</TextButton>}
                      {m.role !== 'admin' && !eu && (m.ativo
                        ? <TextButton tone="danger" onClick={() => desativar(m)}>Desativar</TextButton>
                        : <TextButton onClick={() => acao(() => equipeApi.reativar(m.id), 'Acesso reativado.')}>Reativar</TextButton>)}
                    </div>,
                  ];
                })}
              />
            </Card>
          </Section>
          <Permissoes />
        </>}
      </PageBody>
      {convidando && <ConvidarModal onClose={() => setConvidando(false)} onDone={(r, email) => { reload(); avisarEntrega(r, email, setLink); }} />}
      {link && <ConviteLink email={link.email} link={link.link} onClose={() => setLink(null)} />}
    </div>
  );
}

// O papel admin não é editável pelo cliente (a API recusa) e permissão travada pela Localle aparece sem caixa
function Permissoes() {
  const { data, error, loading } = useAdminQuery(equipeApi.permissoes);
  const [salvando, setSalvando] = useState('');
  // o que a API devolveu em cada alteração vale por cima da carga inicial (sem recarregar a tabela inteira)
  const [alterado, setAlterado] = useState<Record<string, PermissaoPapel>>({});
  const linhas = [...new Map((data || []).map((p) => [p.key, p.label])).entries()];
  const de = (key: string, role: PermissaoPapel['role']) => alterado[`${role}:${key}`] || data?.find((p) => p.key === key && p.role === role);
  const mudar = async (fn: () => Promise<PermissaoPapel>, id: string) => {
    setSalvando(id);
    try { const p = await fn(); setAlterado((a) => ({ ...a, [id]: p })); } catch (e: any) { toast('Permissão não alterada: ' + (e.message || e), { tone: 'crit' }); } finally { setSalvando(''); }
  };
  const celula = (key: string, role: PermissaoPapel['role']) => {
    const p = de(key, role);
    if (!p) return '—';
    if (role === 'admin' || !p.editableByClient) return <span className="text-small text-ink-2">{p.allowed ? 'Sim' : 'Não'}{!p.editableByClient && role !== 'admin' ? ' · fixo' : ''}</span>;
    const id = `${role}:${key}`;
    return (
      <span className="inline-flex items-center gap-tight">
        <Check aria-label={`${p.label} para ${PAPEL[role].label}`} checked={p.allowed} disabled={salvando === id} onChange={(v) => mudar(() => equipeApi.definirPermissao(role, key, v), id)} />
        {p.origin === 'cliente' && <TextButton disabled={salvando === id} onClick={() => mudar(() => equipeApi.restaurarPermissao(role, key), id)}>Padrão</TextButton>}
      </span>
    );
  };
  return (
    <Section title="Permissões por perfil">
      <Card>
        {error && <Callout tone="crit" className="mb-card-head">Não foi possível carregar as permissões: {error}</Callout>}
        <p className="text-small text-ink-2 mb-card-head">Vale na hora para todas as pessoas do perfil. "Padrão" volta ao que a plataforma define; o Administrador tem acesso fixo.</p>
        <Table minWidth={640} loading={loading && !data} align={['left', 'left', 'left', 'left']}
          head={['Permissão', PAPEL.admin.label, PAPEL.gestor.label, PAPEL.operador.label]}
          rows={linhas.map(([key, label]) => [<span className="font-medium">{label}</span>, celula(key, 'admin'), celula(key, 'gestor'), celula(key, 'operador')])} />
      </Card>
    </Section>
  );
}

function ConvidarModal({ onClose, onDone }: { onClose: () => void; onDone: (r: { conviteEnviado: boolean; link: string | null }, email: string) => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'gestor' | 'operador'>('gestor');
  const [busy, setBusy] = useState(false);
  const enviar = async () => {
    setBusy(true);
    try { const r = await equipeApi.convidar(email.trim().toLowerCase(), role); onClose(); onDone(r, r.email); }
    catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Convidar pessoa" width="max-w-xl" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!email.includes('@')} onClick={enviar}>Enviar convite</Button></>}>
      <Field label="E-mail"><Input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <div role="radiogroup" aria-label="Perfil" className="flex flex-col gap-2">
        {(['gestor', 'operador'] as const).map((r) => <Radio key={r} name="perfil" label={PAPEL[r].label} description={PAPEL[r].desc} checked={role === r} onChange={() => setRole(r)} />)}
      </div>
      <p className="text-caption text-ink-2">A pessoa recebe um link para criar a própria senha; ninguém mais conhece a senha dela. O que cada perfil pode fazer é ajustado nesta tela, em Permissões por perfil.</p>
    </Modal>
  );
}
