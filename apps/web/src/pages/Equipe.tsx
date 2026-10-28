// Console da Locale · Equipe e auditoria: superadmins da Locale (/superadmin/equipe — convidar por e-mail,
// reenviar convite, desativar/reativar) e o registro de auditoria do backend (`audit_log`, GET
// /superadmin/auditoria). Papel interno e dois fatores ainda não existem no schema.
import { useState } from 'react';
import { Card, PageHeader, PageBody, Section, Table, Badge, Button, TextButton, Modal, Field, Input, Callout, EmptyState, toast, confirmAction } from '../components/ui';
import { useStore } from '../lib/store';
import { adminApi, useAdminQuery, type AdminAuditEntry, type MembroLocalle } from '../lib/localleApi';
import { ConviteLink, avisarEntrega } from '../components/ConviteLink';
import { fmtD, fmtDT } from '@localle/shared/utils';

const ACTION_LABEL: Record<string, string> = {
  'client.create': 'Cadastrou cliente',
  'user.create_initial_admin': 'Criou admin inicial',
  'user.create': 'Criou usuário',
  'user.desativar': 'Desativou usuário',
  'user.reativar': 'Reativou usuário',
  'user.reenviar_convite': 'Reenviou convite',
  'user.aceitar_convite': 'Aceitou convite',
  'superadmin.convidar': 'Convidou para a equipe da Localle',
  'superadmin.reenviar_convite': 'Reenviou convite da Localle',
  'superadmin.aceitar_convite': 'Entrou na equipe da Localle',
  'superadmin.desativar': 'Desativou acesso da Localle',
  'superadmin.reativar': 'Reativou acesso da Localle',
  'superadmin.trocar_senha': 'Trocou a senha',
  'rastreador.cadastrar': 'Cadastrou rastreador',
  'rastreador.vincular': 'Vinculou rastreador ao cliente',
  'rastreador.desvincular': 'Desvinculou rastreador do cliente',
  'rastreador.instalar': 'Instalou rastreador',
  'rastreador.desinstalar': 'Desinstalou rastreador',
};
const situacao = (m: MembroLocalle) => (m.desativado_em ? { tone: 'red', label: 'Desativado' } : m.pendente ? { tone: 'orange', label: 'Convite pendente' } : { tone: 'green', label: 'Ativo' });
const actionLabel = (a: string) => ACTION_LABEL[a] || a;

function detalhe(e: AdminAuditEntry): string {
  const after = (e.after || {}) as Record<string, unknown>;
  return ['name', 'email', 'role', 'imei', 'iccid'].filter((k) => after[k] != null).map((k) => String(after[k])).join(' · ');
}

const carregar = () => Promise.all([adminApi.equipe(), adminApi.auditoria()]);

export default function Equipe() {
  const session = useStore((s) => s.session);
  const { data, error, loading, reload } = useAdminQuery(carregar);
  const [convidando, setConvidando] = useState(false);
  const [link, setLink] = useState<{ email: string; link: string } | null>(null);
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com o acesso da Locale para ver o Console da Locale." /></Card>;

  const [equipe, log] = data || [[], []];
  const acao = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast(ok); reload(); } catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
  };
  const desativar = async (m: MembroLocalle) => {
    if (!(await confirmAction({ title: 'Desativar acesso da Localle?', detail: `${m.email} perde o acesso ao Painel da Localle na hora, inclusive em sessões já abertas. Dá para reativar depois.`, confirmLabel: 'Desativar' }))) return;
    acao(() => adminApi.desativarSuperadmin(m.id), 'Acesso desativado.');
  };
  const reenviar = async (m: MembroLocalle) => {
    try { avisarEntrega(await adminApi.reenviarConviteSuperadmin(m.id), m.email, setLink); } catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
  };
  return (
    <div>
      <PageHeader icon="revenda" title="Equipe e auditoria" subtitle="Usuários da Locale e o registro de alterações feitas na plataforma" />
      <PageBody>
        {error && <Callout tone="crit">Não foi possível carregar: {error}</Callout>}
        <Section title="Equipe da Localle" actions={<Button onClick={() => setConvidando(true)}>Convidar para a equipe</Button>}>
          <Card>
            <Table minWidth={720} loading={loading && !data} align={['left', 'left', 'left', 'right']}
              head={['E-mail', 'Situação', 'Desde', '']}
              empty="Ninguém na equipe ainda."
              rows={equipe.map((m) => {
                const st = situacao(m);
                const eu = m.email === session.email;
                return [
                  <span className="text-small">{m.email}{eu && <span className="block text-caption text-ink-2">você</span>}</span>,
                  <Badge tone={st.tone}>{st.label}</Badge>,
                  <span className="num text-small">{fmtD(Date.parse(m.created_at))}</span>,
                  <div className="flex gap-3 justify-end">
                    {!eu && !m.desativado_em && m.pendente && <TextButton onClick={() => reenviar(m)}>Reenviar convite</TextButton>}
                    {!eu && (m.desativado_em
                      ? <TextButton onClick={() => acao(() => adminApi.reativarSuperadmin(m.id), 'Acesso reativado.')}>Reativar</TextButton>
                      : <TextButton tone="danger" onClick={() => desativar(m)}>Desativar</TextButton>)}
                  </div>,
                ];
              })}
            />
          </Card>
        </Section>
        <Section title="Registro de alterações">
          <Card>
            <Table minWidth={900} loading={loading && !data} align={['left', 'left', 'left', 'left', 'left']}
              head={['Quando', 'Quem', 'Ação', 'Cliente', 'Detalhe']}
              empty="Nenhuma alteração registrada ainda."
              rows={log.map((e) => [
                <span className="num text-small">{fmtDT(Date.parse(e.created_at))}</span>,
                <span className="text-small">{e.actor_email || '—'}<Badge tone={e.actor_type === 'superadmin' ? 'gray' : 'green'} className="ml-tight">{e.actor_type === 'superadmin' ? 'Locale' : 'Cliente'}</Badge></span>,
                actionLabel(e.action),
                e.client_name || <span className="text-ink-3">—</span>,
                <span className="text-small text-ink-2">{detalhe(e) || '—'}</span>,
              ])}
            />
          </Card>
        </Section>
      </PageBody>
      {convidando && <ConvidarModal onClose={() => setConvidando(false)} onDone={(r, email) => { reload(); avisarEntrega(r, email, setLink); }} />}
      {link && <ConviteLink email={link.email} link={link.link} onClose={() => setLink(null)} />}
    </div>
  );
}

function ConvidarModal({ onClose, onDone }: { onClose: () => void; onDone: (r: { conviteEnviado: boolean; link: string | null }, email: string) => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const enviar = async () => {
    setBusy(true);
    try { const r = await adminApi.convidarSuperadmin(email.trim().toLowerCase()); onClose(); onDone(r, r.email); }
    catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Convidar para a equipe da Localle" width="max-w-xl" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!email.includes('@')} onClick={enviar}>Enviar convite</Button></>}>
      <Field label="E-mail"><Input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <p className="text-caption text-ink-2">A pessoa recebe um link para criar a própria senha e passa a ter acesso completo ao Painel da Localle (todos os clientes).</p>
    </Modal>
  );
}
