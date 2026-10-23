// Console da Locale · Faturamento: apuração do mês por cliente a partir do contrato vigente, exportação para o
// financeiro e atraso. Três indicadores distintos: receita prevista (estimativa), faturamento apurado (calculado
// para a competência, preservando os parâmetros usados) e valor recebido (pagamentos registrados manualmente).
import { useMemo, useState } from 'react';
import { Card, PageHeader, PageBody, Section, Table, Badge, Button, TextButton, Grid, EmptyState } from '../components/ui';
import { KpiTile, Num } from '../components/story';
import { Icon } from '../components/icons';
import { useStore } from '../lib/store';
import { xlsx } from '../lib/reportExport';
import { brl, fmtD, fmtDT, num } from '@localle/shared/utils';
import { currentVersion, apurar, seedDailyMeasurements, type Contract } from '../lib/contracts';
import type { ClientRecord } from '../lib/clients';
import { PaymentModal } from './Clientes';

const BILLING_LABEL = { mensalidade_fixa: 'Mensalidade fixa', por_veiculo_ativo: 'Por veículo ativo' } as const;

export default function Faturamento() {
  const session = useStore((s) => s.session);
  const clients = useStore((s) => s.platform.clients) as ClientRecord[];
  const contracts = useStore((s) => s.platform.contracts) as Contract[];
  const [paying, setPaying] = useState<ClientRecord | null>(null);
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com locale@demo.com para ver o Console da Locale." /></Card>;

  const now = Date.now(), ym = new Date(now).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }), ymKey = new Date(now).toISOString().slice(0, 7);
  const contractOf = (id: string) => contracts.find((c) => c.clientId === id);

  const rows = useMemo(() => clients.map((c) => {
    const contract = contractOf(c.id);
    const v = contract ? currentVersion(contract) : null;
    const measurements = seedDailyMeasurements(c.id, c.vehicles, now);
    const result = v ? apurar(v, measurements, ymKey) : null;
    return { client: c, billingType: v?.billingType, avgVehicles: result?.avgVehicles ?? 0, apurado: result?.total ?? 0 };
  }), [clients, contracts]);

  // receita prevista: estimativa com a frota cadastrada agora (sem considerar a proporcionalidade do mês)
  const predicted = rows.reduce((a, r) => {
    const contract = contractOf(r.client.id);
    const v = contract ? currentVersion(contract) : null;
    if (!v) return a;
    if (v.billingType === 'mensalidade_fixa') return a + v.fixedPrice;
    const qty = Math.max(0, r.client.vehicles - v.included);
    return a + (v.included > 0 ? v.basePrice + qty * v.extraPrice : r.client.vehicles * v.pricePerVehicle);
  }, 0);
  const apurado = rows.reduce((a, r) => a + r.apurado, 0);
  const received = rows.reduce((a, r) => {
    const paid = (r.client.payment.history || []).reduce((s, p) => s + p.amount, 0);
    return a + paid + (r.client.payment.status === 'em_dia' ? r.apurado - paid : 0);
  }, 0);
  const overdue = rows.reduce((a, r) => a + r.client.payment.overdue, 0);
  const lateCount = rows.filter((r) => r.client.payment.status === 'atraso' || r.client.payment.status === 'parcial').length;

  const exportar = () => xlsx(`Faturamento_${ymKey}.xlsx`,
    { empresa: 'Locale', periodo: ym, filtros: 'Todos os clientes', emitidoEm: fmtDT(now) },
    ['Cliente', 'Cobrança', 'Veículos-dia (média)', 'Apurado no mês', 'Situação de pagamento', 'Dias de atraso', 'Em aberto'],
    rows.map((r) => [r.client.name, r.billingType ? BILLING_LABEL[r.billingType] : '—', num(r.avgVehicles, 1), r.apurado, r.client.payment.status === 'em_dia' ? 'Em dia' : r.client.payment.status === 'parcial' ? 'Parcial' : 'Em atraso', r.client.payment.daysLate, r.client.payment.overdue]));

  return (
    <div>
      <PageHeader icon="dinheiro" title="Faturamento" subtitle={`Apuração de ${ym}, por cliente`}>
        <Button variant="secondary" onClick={exportar}><Icon name="exportar" size={18} />Exportar para o financeiro</Button>
      </PageHeader>
      <PageBody>
        <Section title="Resumo do mês">
          <Grid cols={4} equal>
            <KpiTile label="Receita prevista" display={<Num value={predicted} prefix="R$" digits={2} size="kpi" count />} />
            <KpiTile label="Faturamento apurado" display={<Num value={apurado} prefix="R$" digits={2} size="kpi" count />} sub="Calculado pela medição diária de veículos ativos" />
            <KpiTile label="Recebido" display={<Num value={received} prefix="R$" digits={2} size="kpi" count />} />
            <KpiTile label="Em aberto" display={<Num value={overdue} prefix="R$" digits={2} size="kpi" count />} status={overdue ? 'crit' : undefined} />
          </Grid>
        </Section>
        <Section title="Por cliente">
          <Card>
            <Table minWidth={1100} align={['left', 'left', 'right', 'right', 'left', 'left', 'right']}
              head={['Cliente', 'Cobrança', 'Veículos-dia (média)', 'Apurado', 'Pagamento', 'Contrato', '']}
              rows={rows.map((r) => [
                <span className="font-medium">{r.client.name}</span>,
                r.billingType ? BILLING_LABEL[r.billingType] : '—',
                <span className="num">{r.billingType === 'por_veiculo_ativo' ? num(r.avgVehicles, 1) : '—'}</span>,
                <span className="num font-semibold">{brl(r.apurado)}</span>,
                r.client.payment.status === 'em_dia' ? <Badge tone="green">Em dia</Badge> : <Badge tone={r.client.payment.status === 'parcial' ? 'orange' : 'red'}>{r.client.payment.status === 'parcial' ? 'Parcial' : `${r.client.payment.daysLate} dias`} · {brl(r.client.payment.overdue)}</Badge>,
                r.client.contractEndsAt ? fmtD(r.client.contractEndsAt) : '—',
                r.client.payment.status !== 'em_dia' ? <TextButton onClick={() => setPaying(r.client)}>Registrar pagamento</TextButton> : '',
              ])}
            />
          </Card>
        </Section>
      </PageBody>
      {paying && <PaymentModal client={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}
