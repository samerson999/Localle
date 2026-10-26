// Console da Locale · Clientes: cadastro real no backend (GET /clients, POST /superadmin/clients). Cliente nasce
// com o admin inicial na mesma transação; o admin recebe um convite por e-mail e define a própria senha (a Locale
// nunca a conhece). Situação vem do contrato (editado em Contratos); pagamento fica em Faturamento.
import { useState } from 'react';
import { Card, PageHeader, PageBody, Section, Table, Badge, Button, TextButton, Modal, Field, FormGroup, Input, Callout, toast, EmptyState } from '../components/ui';
import { useStore } from '../lib/store';
import { adminApi, useAdminQuery, type AdminClient } from '../lib/localleApi';
import { fmtD, num } from '@localle/shared/utils';
import { CONTRACT_BADGE } from './Contratos';

const conviteToast = (enviado: boolean, ok: string) =>
  enviado ? toast(ok) : toast('Cadastro feito, mas o e-mail do convite não saiu.', { tone: 'crit', detail: 'Verifique o SMTP em Saúde da plataforma e use "Reenviar convite".' });

export default function Clientes() {
  const session = useStore((s) => s.session);
  const { data, error, loading, reload } = useAdminQuery(adminApi.clients);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<AdminClient | null>(null);
  const [adminFor, setAdminFor] = useState<AdminClient | null>(null);
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com o acesso da Locale para ver o Console da Locale." /></Card>;

  const reenviar = async (c: AdminClient) => {
    try {
      const { conviteEnviado } = await adminApi.reenviarConvite(c.id, c.admin_pendente_id!);
      conviteToast(conviteEnviado, 'Convite reenviado. O link anterior deixou de valer.');
    } catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
  };

  const clients = data || [];
  return (
    <div>
      <PageHeader icon="revenda" title="Clientes" subtitle="Cadastro, acesso inicial, situação, veículos e usuários de cada conta">
        <Button onClick={() => setCreating(true)}>Novo cliente</Button>
      </PageHeader>
      <PageBody>
        {error && <Callout tone="crit">Não foi possível carregar os clientes: {error}</Callout>}
        <Section title={loading && !data ? 'Clientes' : `${clients.length} clientes`}>
          <Card>
            <Table minWidth={980} loading={loading && !data} align={['left', 'left', 'right', 'left', 'right', 'left', 'right']}
              head={['Cliente', 'Situação', 'Veículos', 'Acesso', 'Rastreadores instalados', 'Cadastrado em', '']}
              emptyState={<EmptyState title="Nenhum cliente cadastrado" detail="Cadastre o primeiro cliente com o e-mail do administrador dele." action={<Button onClick={() => setCreating(true)}>Novo cliente</Button>} />}
              rows={clients.map((c) => [
                <span className="font-medium">{c.name}</span>,
                c.contrato_status ? <Badge tone={CONTRACT_BADGE[c.contrato_status].tone}>{CONTRACT_BADGE[c.contrato_status].label}</Badge> : <span className="text-small text-ink-2">Sem contrato</span>,
                <span className="num">{num(c.veiculos)}</span>,
                <span className="flex flex-col gap-hair">
                  {c.usuarios_ativos ? <span className="num text-small">{num(c.usuarios_ativos)} {c.usuarios_ativos === 1 ? 'usuário' : 'usuários'}</span> : !c.convites_pendentes && <Badge tone="orange">Sem acesso</Badge>}
                  {c.convites_pendentes > 0 && <Badge tone="orange">{c.convites_pendentes === 1 ? 'Convite pendente' : `${c.convites_pendentes} convites pendentes`}</Badge>}
                </span>,
                <span className="num">{num(c.rastreadores_instalados)}</span>,
                <span className="num text-small">{fmtD(Date.parse(c.created_at))}</span>,
                <div className="flex gap-3 justify-end">
                  <TextButton onClick={() => setRenaming(c)}>Renomear</TextButton>
                  {c.admin_pendente_id && <TextButton onClick={() => reenviar(c)}>Reenviar convite</TextButton>}
                  {!c.usuarios_ativos && !c.convites_pendentes && <TextButton onClick={() => setAdminFor(c)}>Convidar admin</TextButton>}
                </div>,
              ])}
            />
          </Card>
        </Section>
      </PageBody>
      {creating && <NewClientModal onClose={() => setCreating(false)} onDone={reload} />}
      {renaming && <RenameModal client={renaming} onClose={() => setRenaming(null)} onDone={reload} />}
      {adminFor && <AdminModal client={adminFor} onClose={() => setAdminFor(null)} onDone={reload} />}
    </div>
  );
}

function AdminEmail({ email, setEmail }: { email: string; setEmail: (v: string) => void }) {
  return (
    <FormGroup title="Administrador do cliente" description="Recebe por e-mail um link (válido por 48 h) para confirmar o endereço e criar a própria senha. Depois, cadastra os gestores e operadores da conta.">
      <Field label="E-mail"><Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
    </FormGroup>
  );
}

function useSubmit<T>(run: () => Promise<T>, after: (r: T) => void, onDone: () => void, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { after(await run()); onDone(); onClose(); }
    catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
    finally { setBusy(false); }
  };
  return { busy, submit };
}

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

function NewClientModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const { busy, submit } = useSubmit(
    () => adminApi.createClient({ name: name.trim(), admin: { email: email.trim() } }),
    (r) => conviteToast(r.conviteEnviado, `Cliente cadastrado. Convite enviado para ${email.trim()}.`),
    onDone, onClose,
  );
  return (
    <Modal open onClose={onClose} title="Novo cliente" width="max-w-xl" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!name.trim() || !emailOk(email)} onClick={submit}>Cadastrar e convidar</Button></>}>
      <Field label="Nome do cliente"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <AdminEmail email={email} setEmail={setEmail} />
      <p className="text-caption text-ink-2">Cliente e administrador são criados juntos: se o e-mail já estiver em uso, nada é cadastrado. O contrato é cadastrado em Contratos.</p>
    </Modal>
  );
}

function AdminModal({ client, onClose, onDone }: { client: AdminClient; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const { busy, submit } = useSubmit(
    () => adminApi.createInitialAdmin(client.id, { email: email.trim() }),
    (r) => conviteToast(r.conviteEnviado, `Convite enviado para ${email.trim()}.`),
    onDone, onClose,
  );
  return (
    <Modal open onClose={onClose} title={`Convidar admin · ${client.name}`} width="max-w-xl" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!emailOk(email)} onClick={submit}>Convidar</Button></>}>
      <AdminEmail email={email} setEmail={setEmail} />
    </Modal>
  );
}

function RenameModal({ client, onClose, onDone }: { client: AdminClient; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(client.name);
  const { busy, submit } = useSubmit(() => adminApi.renameClient(client.id, name.trim()), () => toast('Cliente renomeado.'), onDone, onClose);
  return (
    <Modal open onClose={onClose} title={`Renomear · ${client.name}`} width="max-w-md" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!name.trim() || name.trim() === client.name} onClick={submit}>Salvar</Button></>}>
      <Field label="Nome do cliente"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
    </Modal>
  );
}
