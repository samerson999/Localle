// Console da Locale · Contratos: contrato individual por cliente (mensalidade fixa ou por veículo ativo),
// franquia e excedente, funcionalidades contratadas, vigência e vencimento — no backend (/superadmin/contratos).
// Editar valores comerciais grava uma versão nova (o backend decide, pela mesma regra de @localle/shared/contratos);
// situação e vigência não são versionadas. Suspenso/cancelado corta o acesso dos usuários do cliente na hora.
import { useState } from 'react';
import { Card, PageHeader, PageBody, Section, Table, Badge, Button, TextButton, Modal, Field, FormGroup, Input, Select, Switch, Callout, toast, EmptyState } from '../components/ui';
import { useStore } from '../lib/store';
import { adminApi, useAdminQuery, type AdminClient, type AdminContrato, type ContratoBody } from '../lib/localleApi';
import { brl, fmtD } from '@localle/shared/utils';
import { Icon } from '../components/icons';
import { MODULES, moduleName, changedCommercial, validateTerms, type ContractTerms, type ContractStatus, type BillingType } from '@localle/shared/contratos';

export const CONTRACT_BADGE: Record<ContractStatus, { tone: string; label: string }> = {
  implantacao: { tone: 'orange', label: 'Em implantação' },
  ativo: { tone: 'green', label: 'Ativo' },
  suspenso: { tone: 'red', label: 'Suspenso' },
  cancelado: { tone: 'gray', label: 'Cancelado' },
};
const BILLING_LABEL: Record<BillingType, string> = { mensalidade_fixa: 'Mensalidade fixa', por_veiculo_ativo: 'Por veículo ativo' };
const TERMOS_PADRAO: ContractTerms = { billingType: 'por_veiculo_ativo', fixedPrice: 0, included: 0, basePrice: 0, pricePerVehicle: 0, extraPrice: 0, modules: ['monitoramento', 'ativos'], maxUsers: null, historyMonths: 12, dueDay: 10, toleranceDays: 5 };
const dia = (iso: string) => fmtD(Date.parse(`${iso}T12:00:00`));

const mesAtual = () => new Date().toISOString().slice(0, 7);
const carregar = () => Promise.all([adminApi.contratos(), adminApi.clients(), adminApi.faturamento(mesAtual())]);

type Editando = { contrato: AdminContrato } | { novoPara: AdminClient };

export default function Contratos() {
  const session = useStore((s) => s.session);
  const { data, error, loading, reload } = useAdminQuery(carregar);
  const [editing, setEditing] = useState<Editando | null>(null);
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com o acesso da Locale para ver o Console da Locale." /></Card>;

  const [contratos, clients, linhas] = data || [[], [], []];
  const previsto = new Map(linhas.map((l) => [l.clientId, l.previsto]));
  const semContrato = clients.filter((c) => !contratos.some((k) => k.clientId === c.id));

  return (
    <div>
      <PageHeader icon="dinheiro" title="Contratos" subtitle="Condições comerciais individuais de cada cliente: mensalidade, franquia, funcionalidades e vigência" />
      <PageBody>
        {error && <Callout tone="crit">Não foi possível carregar os contratos: {error}</Callout>}
        {semContrato.length > 0 && (
          <Section title={`${semContrato.length} clientes sem contrato`}>
            <Card>
              <Table minWidth={600} align={['left', 'right']} head={['Cliente', '']}
                rows={semContrato.map((c) => [<span className="font-medium">{c.name}</span>, <TextButton onClick={() => setEditing({ novoPara: c })}>Criar contrato</TextButton>])} />
            </Card>
          </Section>
        )}
        <Section title={`${contratos.length} contratos`}>
          <Card>
            <Table minWidth={1100} loading={loading && !data} align={['left', 'left', 'right', 'left', 'left', 'left', 'right']}
              head={['Cliente', 'Cobrança', 'Estimativa do mês', 'Funcionalidades', 'Vigência', 'Situação', '']}
              empty="Nenhum contrato cadastrado."
              rows={contratos.map((c) => {
                const v = c.versaoAtual;
                return [
                  <span className="font-medium">{c.clientName}</span>,
                  <span className="flex flex-col gap-hair"><span>{BILLING_LABEL[v.billingType]}</span>{v.billingType === 'por_veiculo_ativo' && v.included > 0 && <span className="text-caption text-ink-2">{v.included} inclusos + {brl(v.extraPrice)}/excedente</span>}</span>,
                  <span className="num font-semibold">{brl(previsto.get(c.clientId) ?? 0)}</span>,
                  <span className="text-caption text-ink-2">{v.modules.length} de {MODULES.length}</span>,
                  <span className="text-small">{dia(c.inicioEm)} – {c.fimEm ? dia(c.fimEm) : 'indeterminado'}</span>,
                  <Badge tone={CONTRACT_BADGE[c.status].tone}>{CONTRACT_BADGE[c.status].label}</Badge>,
                  <TextButton onClick={() => setEditing({ contrato: c })}>Editar</TextButton>,
                ];
              })}
            />
          </Card>
        </Section>
      </PageBody>
      {editing && <ContractModal editing={editing} allContracts={contratos} onClose={() => setEditing(null)} onDone={reload} />}
    </div>
  );
}

function ContractModal({ editing, allContracts, onClose, onDone }: { editing: Editando; allContracts: AdminContrato[]; onClose: () => void; onDone: () => void }) {
  const contrato = 'contrato' in editing ? editing.contrato : null;
  const clientName = contrato ? contrato.clientName : (editing as { novoPara: AdminClient }).novoPara.name;
  const base: ContractTerms = contrato ? { ...contrato.versaoAtual } : { ...TERMOS_PADRAO };
  const [status, setStatus] = useState<ContractStatus>(contrato?.status ?? 'implantacao');
  const [inicioEm, setInicioEm] = useState(contrato?.inicioEm ?? new Date().toISOString().slice(0, 10));
  const [fimEm, setFimEm] = useState(contrato?.fimEm ?? '');
  const [v, setV] = useState<ContractTerms>(base);
  const [dupFrom, setDupFrom] = useState('');
  const [busy, setBusy] = useState(false);

  const toggleModule = (k: string) => setV((x) => ({ ...x, modules: x.modules.includes(k) ? x.modules.filter((m) => m !== k) : [...x.modules, k] }));
  const applyDuplicate = (id: string) => {
    setDupFrom(id);
    const src = allContracts.find((c) => c.id === id);
    if (!src) return;
    const { id: _id, createdAt: _c, ...terms } = src.versaoAtual;
    setV(terms);
    toast(`Configuração de ${src.clientName} copiada. Nada foi vinculado entre os contratos.`);
  };

  const errs = validateTerms(v);
  const bump = contrato ? changedCommercial(contrato.versaoAtual, v) : false;
  const cortaAcesso = (status === 'suspenso' || status === 'cancelado') && contrato?.status !== status;

  const save = async () => {
    setBusy(true);
    const body: ContratoBody = { status, inicioEm, fimEm: fimEm || null, terms: v };
    try {
      if (contrato) await adminApi.atualizarContrato(contrato.id, body);
      else await adminApi.criarContrato((editing as { novoPara: AdminClient }).novoPara.id, body);
      toast(bump ? 'Contrato salvo com uma versão nova.' : 'Contrato salvo.');
      onDone();
      onClose();
    } catch (e: any) {
      toast(e.message || String(e), { tone: 'crit' });
    } finally {
      setBusy(false);
    }
  };

  const num = (k: keyof ContractTerms) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value === '' ? 0 : +e.target.value });

  return (
    <Modal open onClose={onClose} title={`${contrato ? 'Contrato' : 'Novo contrato'} · ${clientName}`} width="max-w-2xl" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={errs.length > 0 || !inicioEm} onClick={save}>Salvar</Button></>}>
      <FormGroup cols={2}>
        <Field label="Situação"><Select value={status} onChange={(e) => setStatus(e.target.value as ContractStatus)} options={[{ value: 'implantacao', label: 'Em implantação' }, { value: 'ativo', label: 'Ativo' }, { value: 'suspenso', label: 'Suspenso' }, { value: 'cancelado', label: 'Cancelado' }]} /></Field>
        <Field label="Início de vigência"><Input type="date" value={inicioEm} onChange={(e) => setInicioEm(e.target.value)} /></Field>
        <Field label="Fim de vigência" hint="Vazio = indeterminado"><Input type="date" value={fimEm} onChange={(e) => setFimEm(e.target.value)} /></Field>
        <Field label="Dia de vencimento" hint="1 a 28"><Input type="number" min={1} max={28} value={v.dueDay} onChange={num('dueDay')} /></Field>
        <Field label="Tolerância de atraso (dias)" hint="Antes de marcar como crítico"><Input type="number" value={v.toleranceDays} onChange={num('toleranceDays')} /></Field>
      </FormGroup>
      {cortaAcesso && <Callout tone="warn">Ao salvar, os usuários de {clientName} perdem o acesso na hora, inclusive quem já está logado. A recepção de posições continua.</Callout>}

      {allContracts.length > 0 && (
        <FormGroup title="Duplicar de outro contrato" description="Copia a configuração comercial de outro cliente para acelerar o cadastro. Não vincula os dois contratos.">
          <Select value={dupFrom} onChange={(e) => applyDuplicate(e.target.value)}
            options={[{ value: '', label: 'Escolher contrato de origem…' }, ...allContracts.filter((c) => c.id !== contrato?.id).map((c) => ({ value: c.id, label: c.clientName }))]} />
        </FormGroup>
      )}

      <FormGroup title="Cobrança">
        <Field label="Tipo de cobrança">
          <Select value={v.billingType} onChange={(e) => setV({ ...v, billingType: e.target.value as BillingType })}
            options={[{ value: 'mensalidade_fixa', label: 'Mensalidade fixa' }, { value: 'por_veiculo_ativo', label: 'Por veículo ativo' }]} />
        </Field>
        {v.billingType === 'mensalidade_fixa' ? (
          <FormGroup cols={2}>
            <Field label="Mensalidade (R$)"><Input type="number" step="0.01" value={v.fixedPrice} onChange={num('fixedPrice')} /></Field>
          </FormGroup>
        ) : (
          <FormGroup cols={2}>
            <Field label="Veículos inclusos (franquia)" hint="0 = sem franquia, cobra todos por veículo"><Input type="number" value={v.included} onChange={num('included')} /></Field>
            {v.included > 0 && <Field label="Mensalidade-base (R$)" hint="Cobre a franquia"><Input type="number" step="0.01" value={v.basePrice} onChange={num('basePrice')} /></Field>}
            {v.included === 0 && <Field label="Preço por veículo (R$)"><Input type="number" step="0.01" value={v.pricePerVehicle} onChange={num('pricePerVehicle')} /></Field>}
            {v.included > 0 && <Field label="Preço do veículo excedente (R$)"><Input type="number" step="0.01" value={v.extraPrice} onChange={num('extraPrice')} /></Field>}
          </FormGroup>
        )}
        <p className="text-caption text-ink-2">A cobrança por veículo ativo usa a média de veículos-dia do mês, medida pelas instalações de rastreador (instalações e retiradas contam proporcional ao período).</p>
      </FormGroup>

      <FormGroup cols={2}>
        <Field label="Máximo de usuários" hint="Vazio = sem limite"><Input type="number" value={v.maxUsers ?? ''} onChange={(e) => setV({ ...v, maxUsers: e.target.value ? +e.target.value : null })} /></Field>
        <Field label="Histórico guardado (meses)"><Input type="number" value={v.historyMonths} onChange={num('historyMonths')} /></Field>
      </FormGroup>

      <FormGroup title="Funcionalidades contratadas">
        <div className="flex flex-col gap-1">
          {MODULES.map((m) => (
            <div key={m.key} className="grid grid-cols-[1fr_auto] items-center gap-3 h-10">
              <span className="flex items-center gap-2 text-small"><Icon name={m.key} size={18} />{m.name}</span>
              <Switch checked={v.modules.includes(m.key)} onChange={() => toggleModule(m.key)} aria-label={`Incluir ${moduleName(m.key)} no contrato`} />
            </div>
          ))}
        </div>
      </FormGroup>

      {errs.length > 0 && <Callout tone="crit">{errs.join(' · ')}</Callout>}
      <p className="text-caption text-ink-2 bg-card-2 border border-line rounded-ctl p-stack">
        Mudar valores, franquia ou funcionalidades grava uma versão nova. Competências já fechadas preservam os valores usados no cálculo.
        {contrato && ` Hoje são ${contrato.versoes === 1 ? 'uma versão única' : `${contrato.versoes} versões`}${bump ? '; salvar cria mais uma.' : '.'}`}
      </p>
    </Modal>
  );
}
