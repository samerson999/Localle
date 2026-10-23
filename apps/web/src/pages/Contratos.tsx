// Console da Locale · Contratos: contrato individual por cliente (mensalidade fixa ou por veículo ativo),
// franquia e excedente, funcionalidades contratadas, vigência e vencimento.
// Editar valores comerciais grava uma versão nova; situação e vigência não são versionadas.
// Ver docs/PLANO-SETUP-ADMIN.md, seção 0, e planejamento/Localle DNA (contratos, faturamento e equipamentos).
import { useState } from 'react';
import { Card, PageHeader, PageBody, Section, Table, Badge, Button, TextButton, Modal, Field, FormGroup, Input, Select, Switch, toast, EmptyState } from '../components/ui';
import { useStore } from '../lib/store';
import { auditEntry } from '@localle/shared/audit';
import { brl, fmtD, num } from '@localle/shared/utils';
import { Icon } from '../components/icons';
import { MODULES, moduleName, currentVersion, newVersionFrom, duplicateFrom, changedCommercial, apurar, seedDailyMeasurements, type Contract, type ContractVersion, type ContractStatus, type BillingType } from '../lib/contracts';
import type { ClientRecord } from '../lib/clients';

const STATUS_BADGE: Record<ContractStatus, { tone: string; label: string }> = {
  implantacao: { tone: 'orange', label: 'Em implantação' },
  ativo: { tone: 'green', label: 'Ativo' },
  suspenso: { tone: 'red', label: 'Suspenso' },
  cancelado: { tone: 'gray', label: 'Cancelado' },
};
const BILLING_LABEL: Record<BillingType, string> = { mensalidade_fixa: 'Mensalidade fixa', por_veiculo_ativo: 'Por veículo ativo' };

export default function Contratos() {
  const session = useStore((s) => s.session);
  const contracts = useStore((s) => s.platform.contracts) as Contract[];
  const clients = useStore((s) => s.platform.clients) as ClientRecord[];
  const [editing, setEditing] = useState<Contract | null>(null);
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com locale@demo.com para ver o Console da Locale." /></Card>;

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || id;
  const ym = new Date().toISOString().slice(0, 7);
  const estimate = (c: Contract) => {
    const client = clients.find((x) => x.id === c.clientId);
    const v = currentVersion(c);
    if (v.billingType === 'mensalidade_fixa') return v.fixedPrice;
    return apurar(v, seedDailyMeasurements(c.clientId, client?.vehicles ?? 0), ym).total;
  };

  return (
    <div>
      <PageHeader icon="dinheiro" title="Contratos" subtitle="Condições comerciais individuais de cada cliente: mensalidade, franquia, funcionalidades e vigência" />
      <PageBody>
        <Section title={`${contracts.length} contratos`}>
          <Card>
            <Table minWidth={1100} align={['left', 'left', 'right', 'left', 'left', 'left', 'right']}
              head={['Cliente', 'Cobrança', 'Estimativa do mês', 'Funcionalidades', 'Vigência', 'Situação', '']}
              rows={contracts.map((c) => {
                const v = currentVersion(c);
                return [
                  <span className="font-medium">{clientName(c.clientId)}</span>,
                  <span className="flex flex-col gap-hair"><span>{BILLING_LABEL[v.billingType]}</span>{v.billingType === 'por_veiculo_ativo' && v.included > 0 && <span className="text-caption text-ink-2">{v.included} inclusos + {brl(v.extraPrice)}/excedente</span>}</span>,
                  <span className="num font-semibold">{brl(estimate(c))}</span>,
                  <span className="text-caption text-ink-2">{v.modules.length} de {MODULES.length}</span>,
                  <span className="text-small">{fmtD(c.startAt)} – {c.endAt ? fmtD(c.endAt) : 'indeterminado'}</span>,
                  <Badge tone={STATUS_BADGE[c.status].tone}>{STATUS_BADGE[c.status].label}</Badge>,
                  <TextButton onClick={() => setEditing(c)}>Editar</TextButton>,
                ];
              })}
            />
          </Card>
        </Section>
      </PageBody>
      {editing && <ContractModal contract={editing} allContracts={contracts} clientName={clientName} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ContractModal({ contract, allContracts, clientName, onClose }: { contract: Contract; allContracts: Contract[]; clientName: (id: string) => string; onClose: () => void }) {
  const patch = useStore((s) => s.patch);
  const base = currentVersion(contract);
  const [status, setStatus] = useState<ContractStatus>(contract.status);
  const [endAt, setEndAt] = useState(contract.endAt ? new Date(contract.endAt).toISOString().slice(0, 10) : '');
  const [v, setV] = useState<ContractVersion>({ ...base });
  const [dupFrom, setDupFrom] = useState('');

  const toggleModule = (k: string) => setV((x) => ({ ...x, modules: x.modules.includes(k) ? x.modules.filter((m) => m !== k) : [...x.modules, k] }));

  const applyDuplicate = (contractId: string) => {
    setDupFrom(contractId);
    const src = allContracts.find((c) => c.id === contractId);
    if (!src) return;
    setV({ ...currentVersion(src), id: v.id, createdAt: v.createdAt });
    toast(`Configuração de ${clientName(src.clientId)} copiada. Nada foi vinculado entre os contratos.`);
  };

  const save = () => {
    patch((s: any) => {
      const cur = currentVersion(contract);
      const bump = changedCommercial(cur, v);
      const versions = bump ? [...contract.versions, newVersionFrom(cur, v)] : contract.versions;
      const next: Contract = { ...contract, status, endAt: endAt ? new Date(endAt).getTime() : null, versions };
      const changes = [
        ...(status !== contract.status ? [{ f: 'status', from: contract.status, to: status }] : []),
        ...(bump ? [{ f: 'cobrança', from: '', to: `${BILLING_LABEL[v.billingType]}` }] : []),
      ];
      return {
        platform: { ...s.platform, contracts: s.platform.contracts.map((x: Contract) => (x.id === contract.id ? next : x)) },
        ...auditEntry(s, { coll: 'contratos', refId: contract.id, label: clientName(contract.clientId), action: bump ? 'criou versão' : 'alterou', changes: changes.length ? changes : undefined }),
      };
    });
    toast('Contrato salvo.');
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Contrato · ${clientName(contract.clientId)}`} width="max-w-2xl" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <FormGroup cols={2}>
        <Field label="Situação"><Select value={status} onChange={(e) => setStatus(e.target.value as ContractStatus)} options={[{ value: 'implantacao', label: 'Em implantação' }, { value: 'ativo', label: 'Ativo' }, { value: 'suspenso', label: 'Suspenso' }, { value: 'cancelado', label: 'Cancelado' }]} /></Field>
        <Field label="Fim de vigência" hint="Vazio = indeterminado"><Input type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} /></Field>
        <Field label="Dia de vencimento"><Input type="number" min={1} max={28} value={v.dueDay} onChange={(e) => setV({ ...v, dueDay: +e.target.value })} /></Field>
        <Field label="Tolerância de atraso (dias)" hint="Antes de marcar como crítico"><Input type="number" value={v.toleranceDays} onChange={(e) => setV({ ...v, toleranceDays: +e.target.value })} /></Field>
      </FormGroup>

      <FormGroup title="Duplicar de outro contrato" description="Copia a configuração comercial de outro cliente para acelerar o cadastro. Não vincula os dois contratos.">
        <Select value={dupFrom} onChange={(e) => applyDuplicate(e.target.value)}
          options={[{ value: '', label: 'Escolher contrato de origem…' }, ...allContracts.filter((c) => c.id !== contract.id).map((c) => ({ value: c.id, label: clientName(c.clientId) }))]} />
      </FormGroup>

      <FormGroup title="Cobrança">
        <Field label="Tipo de cobrança">
          <Select value={v.billingType} onChange={(e) => setV({ ...v, billingType: e.target.value as BillingType })}
            options={[{ value: 'mensalidade_fixa', label: 'Mensalidade fixa' }, { value: 'por_veiculo_ativo', label: 'Por veículo ativo' }]} />
        </Field>
        {v.billingType === 'mensalidade_fixa' ? (
          <FormGroup cols={2}>
            <Field label="Mensalidade (R$)"><Input type="number" step="1" value={v.fixedPrice} onChange={(e) => setV({ ...v, fixedPrice: +e.target.value })} /></Field>
          </FormGroup>
        ) : (
          <FormGroup cols={2}>
            <Field label="Veículos inclusos (franquia)" hint="0 = sem franquia, cobra todos por veículo"><Input type="number" value={v.included} onChange={(e) => setV({ ...v, included: +e.target.value })} /></Field>
            {v.included > 0 && <Field label="Mensalidade-base (R$)" hint="Cobre a franquia"><Input type="number" step="1" value={v.basePrice} onChange={(e) => setV({ ...v, basePrice: +e.target.value })} /></Field>}
            {v.included === 0 && <Field label="Preço por veículo (R$)"><Input type="number" step="1" value={v.pricePerVehicle} onChange={(e) => setV({ ...v, pricePerVehicle: +e.target.value })} /></Field>}
            {v.included > 0 && <Field label="Preço do veículo excedente (R$)"><Input type="number" step="1" value={v.extraPrice} onChange={(e) => setV({ ...v, extraPrice: +e.target.value })} /></Field>}
          </FormGroup>
        )}
        <p className="text-caption text-ink-2">A cobrança por veículo ativo usa a média de veículos-dia do mês (instalações e retiradas contam proporcional ao período).</p>
      </FormGroup>

      <FormGroup cols={2}>
        <Field label="Máximo de usuários" hint="Vazio = sem limite"><Input type="number" value={v.maxUsers ?? ''} onChange={(e) => setV({ ...v, maxUsers: e.target.value ? +e.target.value : null })} /></Field>
        <Field label="Histórico guardado (meses)"><Input type="number" value={v.historyMonths} onChange={(e) => setV({ ...v, historyMonths: +e.target.value })} /></Field>
      </FormGroup>

      <FormGroup title="Funcionalidades contratadas" description="A verificação de acesso acontece no backend, não só pela interface.">
        <div className="flex flex-col gap-1">
          {MODULES.map((m) => {
            const on = v.modules.includes(m.key);
            return (
              <div key={m.key} className="grid grid-cols-[1fr_auto] items-center gap-3 h-10">
                <span className="flex items-center gap-2 text-small"><Icon name={m.key} size={18} />{m.name}</span>
                <Switch checked={on} onChange={() => toggleModule(m.key)} aria-label={`Incluir ${moduleName(m.key)} no contrato`} />
              </div>
            );
          })}
        </div>
      </FormGroup>

      <p className="text-caption text-ink-2 bg-card-2 border border-line rounded-ctl p-stack">Mudar valores, franquia ou funcionalidades grava uma versão nova. Competências já apuradas preservam os valores usados no cálculo, mesmo que o contrato mude depois. Hoje são {contract.versions.length === 1 ? 'uma versão única' : `${contract.versions.length} versões`}.</p>
    </Modal>
  );
}
