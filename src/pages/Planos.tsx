// Console da Locale · Planos: catálogo de planos contratados pelos clientes (módulos, limites, preço por veículo).
// Editar o preço ou o conteúdo comercial grava uma versão nova; nome e situação não são versionados.
// Ver docs/PLANO-SETUP-ADMIN.md, seção 0. Ainda não há tela de Clientes, então nenhum plano está "em uso".
import { useState } from 'react';
import { Card, PageHeader, PageBody, Section, Grid, EmptyState, Button, TextButton, Badge, Modal, Field, FormGroup, Input, Switch, toast, confirmAction } from '../components/ui';
import { useStore } from '../lib/store';
import { auditEntry } from '../lib/audit';
import { uid, brl, fmtD, num } from '../lib/utils';
import { Icon } from '../components/icons';
import { MODULES, moduleName, currentVersion, newVersionFrom, type Plan, type PlanVersion } from '../lib/plans';

const COMMERCIAL_FIELDS: (keyof PlanVersion)[] = ['pricePerVehicle', 'included', 'addons', 'minVehicles', 'maxVehicles', 'maxUsers', 'historyMonths', 'comboDiscountPct'];
const changedCommercial = (a: PlanVersion, b: PlanVersion) => COMMERCIAL_FIELDS.some((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));

export default function Planos() {
  const session = useStore((s) => s.session);
  const plans = useStore((s) => s.platform.plans) as Plan[];
  const patch = useStore((s) => s.patch);
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com locale@demo.com para ver o Console da Locale." /></Card>;

  const toggleStatus = (p: Plan) => {
    const status = p.status === 'ativo' ? 'arquivado' : 'ativo';
    patch((s: any) => ({ platform: { ...s.platform, plans: s.platform.plans.map((x: Plan) => (x.id === p.id ? { ...x, status } : x)) }, ...auditEntry(s, { coll: 'planos', refId: p.id, label: p.name, action: 'alterou', changes: [{ f: 'status', from: p.status, to: status }] }) }));
    toast(status === 'ativo' ? 'Plano reativado.' : 'Plano arquivado. Só continua disponível para quem já está nele.');
  };

  return (
    <div>
      <PageHeader icon="dinheiro" title="Planos" subtitle="Módulos inclusos e avulsos, limites e preço por veículo de cada plano">
        <Button onClick={() => setEditing('new')}><Icon name="mais" size={18} />Novo plano</Button>
      </PageHeader>
      <PageBody>
        <Section title="Catálogo">
          <Grid cols={3} equal>
            {plans.map((p) => {
              const v = currentVersion(p);
              return (
                <Card key={p.id} title={p.name} icon="dinheiro" actions={<Badge tone={p.status === 'ativo' ? 'green' : 'gray'}>{p.status === 'ativo' ? 'Ativo' : 'Arquivado'}</Badge>}>
                  <div className="flex flex-col gap-stack">
                    <div className="flex items-baseline gap-tight"><span className="text-kpi font-semibold num">{brl(v.pricePerVehicle).replace(',00', '')}</span><span className="text-small text-ink-2">/ veículo / mês</span></div>
                    <p className="text-small text-ink-2">{v.minVehicles} a {v.maxVehicles ?? '∞'} veículos · {v.maxUsers ?? 'sem limite de'} usuários · histórico de {v.historyMonths} meses</p>
                    <div className="flex flex-wrap gap-1">
                      {v.included.map((k) => <span key={k} className="inline-flex items-center gap-1 h-6 px-2 rounded-chip bg-card-2 text-caption text-ink-2"><Icon name={k} size={14} />{moduleName(k)}</span>)}
                    </div>
                    {v.addons.length > 0 && <p className="text-caption text-ink-2">Avulsos: {v.addons.map((a) => `${moduleName(a.key)} (${brl(a.price).replace(',00', '')})`).join(' · ')}{v.comboDiscountPct > 0 && ` · ${v.comboDiscountPct}% de desconto a partir do 2º avulso`}</p>}
                    <p className="text-caption text-ink-3">{p.versions.length === 1 ? 'Versão única' : `${p.versions.length} versões`} · vigente desde {fmtD(v.createdAt)}</p>
                    <div className="flex gap-3 mt-tight">
                      <TextButton onClick={() => setEditing(p)}>Editar</TextButton>
                      <TextButton tone="danger" onClick={async () => { if (await confirmAction({ title: p.status === 'ativo' ? 'Arquivar plano?' : 'Reativar plano?', detail: p.status === 'ativo' ? 'Deixa de aparecer para novos clientes. Quem já está no plano continua normalmente.' : 'Volta a ficar disponível para novos clientes.', confirmLabel: p.status === 'ativo' ? 'Arquivar' : 'Reativar', tone: p.status === 'ativo' ? 'danger' : 'primary' })) toggleStatus(p); }}>{p.status === 'ativo' ? 'Arquivar' : 'Reativar'}</TextButton>
                    </div>
                  </div>
                </Card>
              );
            })}
          </Grid>
        </Section>
      </PageBody>
      {editing && <PlanModal plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PlanModal({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const patch = useStore((s) => s.patch);
  const base = plan ? currentVersion(plan) : { pricePerVehicle: 50, included: ['monitoramento', 'ativos'], addons: [], minVehicles: 1, maxVehicles: null, maxUsers: null, historyMonths: 6, comboDiscountPct: 0 } as PlanVersion;
  const [name, setName] = useState(plan?.name || '');
  const [v, setV] = useState<PlanVersion>({ ...base });
  const toggleModule = (k: string) => setV((x) => ({ ...x, included: x.included.includes(k) ? x.included.filter((m) => m !== k) : [...x.included, k], addons: x.addons.filter((a) => a.key !== k) }));
  const toggleAddon = (k: string) => setV((x) => (x.addons.some((a) => a.key === k) ? { ...x, addons: x.addons.filter((a) => a.key !== k) } : { ...x, addons: [...x.addons, { key: k, price: 10 }] }));
  const setAddonPrice = (k: string, price: number) => setV((x) => ({ ...x, addons: x.addons.map((a) => (a.key === k ? { ...a, price } : a)) }));

  const save = () => {
    if (!name.trim()) { toast('Dê um nome ao plano.'); return; }
    patch((s: any) => {
      if (plan) {
        const cur = currentVersion(plan);
        const bump = changedCommercial(cur, v);
        const versions = bump ? [...plan.versions, newVersionFrom(cur, v)] : plan.versions;
        const next = { ...plan, name, versions };
        return { platform: { ...s.platform, plans: s.platform.plans.map((x: Plan) => (x.id === plan.id ? next : x)) }, ...auditEntry(s, { coll: 'planos', refId: plan.id, label: name, action: bump ? 'criou versão' : 'alterou', note: bump ? `Preço ${brl(v.pricePerVehicle)}/veículo` : undefined }) };
      }
      const id = uid('pl');
      const created: Plan = { id, name, status: 'ativo', versions: [{ ...v, id: uid('pv'), createdAt: Date.now() }] };
      return { platform: { ...s.platform, plans: [...s.platform.plans, created] }, ...auditEntry(s, { coll: 'planos', refId: id, label: name, action: 'criou' }) };
    });
    toast(plan ? 'Plano salvo.' : 'Plano criado.');
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={plan ? `Editar · ${plan.name}` : 'Novo plano'} width="max-w-2xl" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button onClick={save}>Salvar</Button></>}>
      <FormGroup cols={2}>
        <Field label="Nome do plano"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Preço por veículo (R$/mês)"><Input type="number" step="1" value={v.pricePerVehicle} onChange={(e) => setV({ ...v, pricePerVehicle: +e.target.value })} /></Field>
        <Field label="Mínimo de veículos"><Input type="number" value={v.minVehicles} onChange={(e) => setV({ ...v, minVehicles: +e.target.value })} /></Field>
        <Field label="Máximo de veículos" hint="Vazio = sem limite"><Input type="number" value={v.maxVehicles ?? ''} onChange={(e) => setV({ ...v, maxVehicles: e.target.value ? +e.target.value : null })} /></Field>
        <Field label="Máximo de usuários" hint="Vazio = sem limite"><Input type="number" value={v.maxUsers ?? ''} onChange={(e) => setV({ ...v, maxUsers: e.target.value ? +e.target.value : null })} /></Field>
        <Field label="Histórico guardado (meses)"><Input type="number" value={v.historyMonths} onChange={(e) => setV({ ...v, historyMonths: +e.target.value })} /></Field>
        <Field label="Desconto de combo (%)" hint="A partir do 2º módulo avulso"><Input type="number" value={v.comboDiscountPct} onChange={(e) => setV({ ...v, comboDiscountPct: +e.target.value })} /></Field>
      </FormGroup>
      <FormGroup title="Módulos" description="Inclusos entram no preço do plano; os demais ficam disponíveis como avulso, com preço próprio.">
        <div className="flex flex-col gap-1">
          {MODULES.map((m) => {
            const included = v.included.includes(m.key);
            const addon = v.addons.find((a) => a.key === m.key);
            return (
              <div key={m.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 h-10">
                <span className="flex items-center gap-2 text-small"><Icon name={m.key} size={18} />{m.name}</span>
                {!included && addon && <Input type="number" className="w-24 h-8" value={addon.price} onChange={(e) => setAddonPrice(m.key, +e.target.value)} />}
                {!included && !addon && <TextButton onClick={() => toggleAddon(m.key)}>Oferecer como avulso</TextButton>}
                {included && <span />}
                <span className="flex items-center gap-2 justify-end"><span className="text-caption text-ink-2">{included ? 'Incluso' : addon ? 'Avulso' : 'Fora do plano'}</span><Switch checked={included} onChange={() => toggleModule(m.key)} aria-label={`Incluir ${m.name} no plano`} /></span>
              </div>
            );
          })}
        </div>
      </FormGroup>
      {plan && <p className="text-caption text-ink-2 bg-card-2 border border-line rounded-ctl p-stack">Mudar preço, módulos ou limites grava uma versão nova; nenhum cliente é afetado sem migração de propósito (ainda não há tela de Clientes para isso).</p>}
    </Modal>
  );
}
