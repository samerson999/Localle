// Console da Locale · Clientes: cadastro, plano contratado, veículos, usuários, situação e saúde da conta.
// Ver docs/PLANO-SETUP-ADMIN.md, seção 0. Suspensão hoje é um único nível (não gradual) — ver nota no modal.
import { useMemo, useState } from 'react';
import { Card, PageHeader, PageBody, Section, Table, Badge, Button, TextButton, Modal, Field, FormGroup, Input, Select, toast, EmptyState } from '../components/ui';
import { useStore } from '../lib/store';
import { auditEntry } from '../lib/audit';
import { brl, fmtD, num } from '../lib/utils';
import { currentVersion, type Plan } from '../lib/plans';
import type { ClientRecord, ClientStatus } from '../lib/clients';

const STATUS_BADGE: Record<ClientStatus, { tone: string; label: string }> = {
  implantacao: { tone: 'orange', label: 'Em implantação' },
  ativo: { tone: 'green', label: 'Ativo' },
  suspenso: { tone: 'red', label: 'Suspenso' },
};

export default function Clientes() {
  const session = useStore((s) => s.session);
  const clients = useStore((s) => s.platform.clients) as ClientRecord[];
  const plans = useStore((s) => s.platform.plans) as Plan[];
  const [editing, setEditing] = useState<ClientRecord | null>(null);
  const [paying, setPaying] = useState<ClientRecord | null>(null);
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com locale@demo.com para ver o Console da Locale." /></Card>;

  const planName = (id: string) => plans.find((p) => p.id === id)?.name || id;
  const sorted = useMemo(() => [...clients].sort((a, b) => (b.payment.daysLate || 0) - (a.payment.daysLate || 0)), [clients]);

  return (
    <div>
      <PageHeader icon="revenda" title="Clientes" subtitle="Plano contratado, veículos, usuários, situação e saúde da conta" />
      <PageBody>
        <Section title={`${clients.length} clientes`}>
          <Card>
            <Table minWidth={1000} align={['left', 'left', 'right', 'right', 'left', 'left', 'left', 'right']}
              head={['Cliente', 'Plano', 'Veículos', 'Usuários', 'Situação', 'Pagamento', 'Contrato', '']}
              rows={sorted.map((c) => [
                <span className="font-medium">{c.name}</span>,
                planName(c.planId),
                <span className="num">{num(c.vehicles)}</span>,
                <span className="num">{num(c.users)}</span>,
                <Badge tone={STATUS_BADGE[c.status].tone}>{STATUS_BADGE[c.status].label}</Badge>,
                c.payment.status === 'em_dia' ? <Badge tone="green">Em dia</Badge> : <span className="flex flex-col gap-hair"><Badge tone="red">{c.payment.daysLate} dias de atraso</Badge><span className="text-caption text-ink-2 num">{brl(c.payment.overdue)}</span></span>,
                c.contractEndsAt ? fmtD(c.contractEndsAt) : '—',
                <div className="flex gap-3">
                  <TextButton onClick={() => setEditing(c)}>Editar</TextButton>
                  {c.payment.status === 'atraso' && <TextButton onClick={() => setPaying(c)}>Registrar pagamento</TextButton>}
                </div>,
              ])}
            />
          </Card>
        </Section>
      </PageBody>
      {editing && <ClientModal client={editing} plans={plans} onClose={() => setEditing(null)} />}
      {paying && <PaymentModal client={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

function ClientModal({ client, plans, onClose }: { client: ClientRecord; plans: Plan[]; onClose: () => void }) {
  const patch = useStore((s) => s.patch);
  const [planId, setPlanId] = useState(client.planId);
  const [status, setStatus] = useState<ClientStatus>(client.status);
  const [vehicles, setVehicles] = useState(client.vehicles);
  const [users, setUsers] = useState(client.users);
  const plan = plans.find((p) => p.id === planId);
  const v = plan ? currentVersion(plan) : null;
  const limitWarn = v && ((v.maxVehicles != null && vehicles > v.maxVehicles) || vehicles < v.minVehicles);

  const save = () => {
    patch((s: any) => {
      const changes = [
        ...(planId !== client.planId ? [{ f: 'planId', from: client.planId, to: planId }] : []),
        ...(status !== client.status ? [{ f: 'status', from: client.status, to: status }] : []),
        ...(vehicles !== client.vehicles ? [{ f: 'vehicles', from: String(client.vehicles), to: String(vehicles) }] : []),
      ];
      return {
        platform: { ...s.platform, clients: s.platform.clients.map((x: ClientRecord) => (x.id === client.id ? { ...x, planId, status, vehicles, users } : x)) },
        ...(changes.length ? auditEntry(s, { coll: 'planos', refId: client.id, label: client.name, action: 'alterou', changes }) : {}),
      };
    });
    toast('Cliente salvo.');
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Editar · ${client.name}`} width="max-w-xl" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <FormGroup cols={2}>
        <Field label="Plano"><Select value={planId} onChange={(e) => setPlanId(e.target.value)} options={plans.map((p) => ({ value: p.id, label: `${p.name} (${p.status === 'arquivado' ? 'arquivado' : 'ativo'})` }))} /></Field>
        <Field label="Situação"><Select value={status} onChange={(e) => setStatus(e.target.value as ClientStatus)} options={[{ value: 'implantacao', label: 'Em implantação' }, { value: 'ativo', label: 'Ativo' }, { value: 'suspenso', label: 'Suspenso' }]} /></Field>
        <Field label="Veículos"><Input type="number" value={vehicles} onChange={(e) => setVehicles(+e.target.value)} /></Field>
        <Field label="Usuários"><Input type="number" value={users} onChange={(e) => setUsers(+e.target.value)} /></Field>
      </FormGroup>
      {limitWarn && v && <p className="text-small text-crit-ink bg-crit-soft border border-line rounded-ctl p-stack">Fora dos limites do plano {plan!.name}: {v.minVehicles} a {v.maxVehicles ?? '∞'} veículos.</p>}
      <p className="text-caption text-ink-2">Suspensão hoje é um único nível (bloqueia a operação). Suspensão gradual por etapas é item futuro, a definir com a operação.</p>
    </Modal>
  );
}

export function PaymentModal({ client, onClose }: { client: ClientRecord; onClose: () => void }) {
  const patch = useStore((s) => s.patch);
  const [amount, setAmount] = useState(client.payment.overdue);
  const [method, setMethod] = useState('pix');
  const [note, setNote] = useState('');

  const save = () => {
    const full = amount >= client.payment.overdue;
    patch((s: any) => ({
      platform: { ...s.platform, clients: s.platform.clients.map((x: ClientRecord) => (x.id === client.id ? { ...x, payment: full ? { status: 'em_dia', daysLate: 0, overdue: 0 } : { ...x.payment, overdue: x.payment.overdue - amount } } : x)) },
      ...auditEntry(s, { coll: 'planos', refId: client.id, label: client.name, action: 'registrou pagamento', note: `${brl(amount)} via ${method}${note ? ` · ${note}` : ''}` }),
    }));
    toast(full ? 'Pagamento registrado. Cliente em dia.' : 'Pagamento parcial registrado.');
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Registrar pagamento · ${client.name}`} width="max-w-md" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button onClick={save}>Registrar</Button></>}>
      <p className="text-small text-ink-2">Em aberto: <span className="num font-semibold text-ink">{brl(client.payment.overdue)}</span> · {client.payment.daysLate} dias de atraso.</p>
      <FormGroup cols={2}>
        <Field label="Valor pago (R$)"><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(+e.target.value)} /></Field>
        <Field label="Forma de pagamento"><Select value={method} onChange={(e) => setMethod(e.target.value)} options={[{ value: 'pix', label: 'Pix' }, { value: 'boleto', label: 'Boleto' }, { value: 'cartao', label: 'Cartão' }, { value: 'transferencia', label: 'Transferência' }]} /></Field>
      </FormGroup>
      <Field label="Observação" hint="Opcional"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}
