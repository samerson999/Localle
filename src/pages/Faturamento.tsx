// Console da Locale · Faturamento: cálculo do mês por cliente, exportação para o financeiro e atraso.
// O cálculo usa só o preço por veículo do plano (módulos avulsos contratados por cliente ainda não são
// rastreados em lib/clients.ts — ver docs/PLANO-SETUP-ADMIN.md, seção 0).
import { useMemo, useState } from 'react';
import { Card, PageHeader, PageBody, Section, Table, Badge, Button, TextButton, Grid, EmptyState } from '../components/ui';
import { KpiTile, Num } from '../components/story';
import { Icon } from '../components/icons';
import { useStore } from '../lib/store';
import { xlsx } from '../lib/reportExport';
import { brl, fmtD, fmtDT, num } from '../lib/utils';
import { currentVersion, type Plan } from '../lib/plans';
import type { ClientRecord } from '../lib/clients';
import { PaymentModal } from './Clientes';

export default function Faturamento() {
  const session = useStore((s) => s.session);
  const clients = useStore((s) => s.platform.clients) as ClientRecord[];
  const plans = useStore((s) => s.platform.plans) as Plan[];
  const [paying, setPaying] = useState<ClientRecord | null>(null);
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com locale@demo.com para ver o Console da Locale." /></Card>;

  const planOf = (id: string) => plans.find((p) => p.id === id);
  const rows = useMemo(() => clients.map((c) => {
    const plan = planOf(c.planId);
    const price = plan ? currentVersion(plan).pricePerVehicle : 0;
    return { client: c, planName: plan?.name || c.planId, price, total: price * c.vehicles };
  }), [clients, plans]);

  const now = Date.now(), ym = new Date(now).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const predicted = rows.reduce((a, r) => a + r.total, 0);
  const received = rows.filter((r) => r.client.payment.status === 'em_dia').reduce((a, r) => a + r.total, 0);
  const overdue = rows.reduce((a, r) => a + r.client.payment.overdue, 0);
  const lateCount = rows.filter((r) => r.client.payment.status === 'atraso').length;

  const exportar = () => xlsx(`Faturamento_${new Date(now).toISOString().slice(0, 7)}.xlsx`,
    { empresa: 'Locale', periodo: ym, filtros: 'Todos os clientes', emitidoEm: fmtDT(now) },
    ['Cliente', 'Plano', 'Veículos', 'Preço/veículo', 'Total do mês', 'Situação de pagamento', 'Dias de atraso', 'Em aberto'],
    rows.map((r) => [r.client.name, r.planName, r.client.vehicles, r.price, r.total, r.client.payment.status === 'em_dia' ? 'Em dia' : 'Em atraso', r.client.payment.daysLate, r.client.payment.overdue]));

  return (
    <div>
      <PageHeader icon="dinheiro" title="Faturamento" subtitle={`Cálculo de ${ym}, por cliente`}>
        <Button variant="secondary" onClick={exportar}><Icon name="exportar" size={18} />Exportar para o financeiro</Button>
      </PageHeader>
      <PageBody>
        <Section title="Resumo do mês">
          <Grid cols={4} equal>
            <KpiTile label="Faturamento previsto" display={<Num value={predicted} prefix="R$" digits={2} size="kpi" count />} />
            <KpiTile label="Recebido (clientes em dia)" display={<Num value={received} prefix="R$" digits={2} size="kpi" count />} />
            <KpiTile label="Em aberto" display={<Num value={overdue} prefix="R$" digits={2} size="kpi" count />} status={overdue ? 'crit' : undefined} />
            <KpiTile label="Clientes em atraso" value={lateCount} status={lateCount ? 'crit' : undefined} />
          </Grid>
        </Section>
        <Section title="Por cliente">
          <Card>
            <Table minWidth={1000} align={['left', 'left', 'right', 'right', 'right', 'left', 'left', 'right']}
              head={['Cliente', 'Plano', 'Veículos', 'Preço/veículo', 'Total do mês', 'Pagamento', 'Contrato', '']}
              rows={rows.map((r) => [
                <span className="font-medium">{r.client.name}</span>,
                r.planName,
                <span className="num">{num(r.client.vehicles)}</span>,
                <span className="num">{brl(r.price)}</span>,
                <span className="num font-semibold">{brl(r.total)}</span>,
                r.client.payment.status === 'em_dia' ? <Badge tone="green">Em dia</Badge> : <Badge tone="red">{r.client.payment.daysLate} dias · {brl(r.client.payment.overdue)}</Badge>,
                r.client.contractEndsAt ? fmtD(r.client.contractEndsAt) : '—',
                r.client.payment.status === 'atraso' ? <TextButton onClick={() => setPaying(r.client)}>Registrar pagamento</TextButton> : '',
              ])}
            />
          </Card>
        </Section>
      </PageBody>
      {paying && <PaymentModal client={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}
