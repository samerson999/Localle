// Console da Locale · Visão geral: panorama da operação, receita e pontos de atenção.
// Receita calculada a partir do contrato de cada cliente (lib/contracts.ts), sem revenda no meio por ora.
import { useMemo } from 'react';
import { Donut, CompareBars, RankBars } from '../components/charts';
import { ChartCard, KpiTile, Num } from '../components/story';
import { Card, PageHeader, PageBody, Section, Grid, EmptyState, List, ListItem } from '../components/ui';
import SupportAccess from '../components/SupportAccess';
import { Icon } from '../components/icons';
import { useStore } from '../lib/store';
import { custoDoMes, seedPlatformOverview } from '@localle/shared/platformOverview';
import { currentVersion, apurar, seedDailyMeasurements, type Contract } from '../lib/contracts';
import type { ClientRecord } from '../lib/clients';
import { brl, fmtD, num, monthLabel } from '@localle/shared/utils';

const rel = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null);
const BILLING_LABEL: Record<Contract['versions'][number]['billingType'], string> = { mensalidade_fixa: 'Mensalidade fixa', por_veiculo_ativo: 'Por veículo ativo' };

export default function Locale() {
  const session = useStore((s) => s.session);
  const clients = useStore((s) => s.platform.clients) as ClientRecord[];
  const contracts = useStore((s) => s.platform.contracts) as Contract[];
  const data = useMemo(() => seedPlatformOverview(), []);
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com locale@demo.com para ver o Console da Locale." /></Card>;

  const ym = new Date().toISOString().slice(0, 7);
  const byClient = clients.map((c) => {
    const contract = contracts.find((k) => k.clientId === c.id);
    const v = contract ? currentVersion(contract) : null;
    const measurements = seedDailyMeasurements(c.id, c.vehicles);
    const result = v ? apurar(v, measurements, ym) : null;
    return { client: c, billingType: v?.billingType ?? 'por_veiculo_ativo', total: result?.total ?? 0 };
  });

  const vehicles = clients.reduce((a, c) => a + c.vehicles, 0);
  const revenue = byClient.reduce((a, r) => a + r.total, 0);
  const costs = custoDoMes(vehicles);
  const margin = revenue - costs;
  const prev = data.history[data.history.length - 2];
  const marginPrev = prev.revenue - custoDoMes(prev.vehicles);
  const money = (v: number) => brl(v).replace(',00', '');

  const PLAN_COLOR = ['var(--real)', 'var(--real-mid)', 'color-mix(in srgb, var(--real) 32%, white)'];
  const byBillingType = (['mensalidade_fixa', 'por_veiculo_ativo'] as const).map((bt, i) => ({ label: BILLING_LABEL[bt], value: byClient.filter((r) => r.billingType === bt).reduce((a, r) => a + r.total, 0), color: PLAN_COLOR[i % PLAN_COLOR.length] }));
  const donutParts = byBillingType.filter((p) => p.value > 0);
  const leader = [...donutParts].sort((a, b) => b.value - a.value)[0];
  const compareGroups = data.history.map((h) => ({ label: monthLabel(h.ym), cur: h.revenue, prev: custoDoMes(h.vehicles) }));
  const fleetRank = [...byClient].sort((a, b) => b.client.vehicles - a.client.vehicles).slice(0, 8).map((r) => ({ label: r.client.name, value: r.client.vehicles }));

  const needs = [
    { icon: 'relogio', title: `${data.overdueClients.length} clientes inadimplentes`, detail: `${brl(data.overdueClients.reduce((a, c) => a + c.amount, 0)).replace(',00', '')} em aberto` },
    { icon: 'calendario', title: `${data.expiringContracts.length} contratos vencendo em 60 dias`, detail: 'Renovar para evitar suspensão' },
    { icon: 'sinal', title: `${data.trackersNoSignal} rastreadores sem sinal há mais de 24 h`, detail: 'Verificar equipamento e chip' },
    { icon: 'manutencao', title: `${data.pendingEquipment.length} equipamentos a recolher`, detail: `${brl(data.pendingEquipment.reduce((a, e) => a + e.value, 0)).replace(',00', '')} em valor de mercado` },
  ];

  return (
    <div>
      <PageHeader icon="locale" title="Visão geral" subtitle="Panorama da operação, receita e pontos de atenção" />
      <PageBody>
        <Section title="Resultado do mês">
          <Grid cols={4} equal>
            <KpiTile label="Receita prevista" display={<Num value={revenue} prefix="R$" digits={2} size="kpi" count />} delta={{ value: rel(revenue, prev.revenue), unit: '%', good: 'up' }} sub={`vs. ${monthLabel(prev.ym)}`} />
            <KpiTile label="Veículos ativos" value={vehicles} delta={{ value: rel(vehicles, prev.vehicles), unit: '%', good: 'up' }} sub={`vs. ${monthLabel(prev.ym)} (${num(prev.vehicles)})`} />
            <KpiTile label="Margem estimada" display={<Num value={margin} prefix="R$" digits={2} size="kpi" count />} delta={{ value: rel(margin, marginPrev), unit: '%', good: 'up' }} sub={`${num((margin / revenue) * 100, 0)}% da receita`} />
            <KpiTile label="Clientes ativos" value={data.clientsActive} delta={{ value: rel(data.clientsActive, data.clientsActivePrev), unit: '%', good: 'up' }} sub={`vs. ${monthLabel(prev.ym)}`} />
          </Grid>
          <Grid split="6/6" wide equal>
            <ChartCard title="Receita por modelo de cobrança" icon="dinheiro" period={monthLabel(data.history[data.history.length - 1].ym)}
              sentence={leader ? `${leader.label} responde por ${num((leader.value / revenue) * 100, 0)}% da receita deste mês.` : undefined}>
              <Donut parts={donutParts} center={<Num value={revenue} prefix="R$" digits={2} size="lg" />} centerLabel="receita total" />
            </ChartCard>
            <ChartCard title="Receita vs. custos" icon="grafico" period="Últimos 6 meses"
              sentence={`Margem média de ${num(data.history.reduce((a, h) => a + (h.revenue - custoDoMes(h.vehicles)) / h.revenue, 0) / data.history.length * 100, 0)}% nos últimos 6 meses.`}>
              <CompareBars groups={compareGroups} format={money} curLabel="Receita" prevLabel="Custos" good="up" />
            </ChartCard>
          </Grid>
          <Grid split="6/6" wide equal>
            <Card title="Precisa de você" icon="atencao">
              <List className="-mx-bleed">
                {needs.map((n, i) => (
                  <ListItem key={i} className="flex items-start gap-stack w-full min-h-row px-[max(var(--bleed),var(--cell-x))] py-stack">
                    <span className="ico-line text-body"><Icon name={n.icon} size={20} className="text-crit" /></span>
                    <span className="flex flex-col gap-hair min-w-0"><span className="text-body font-medium">{n.title}</span><span className="text-small text-ink-2">{n.detail}</span></span>
                  </ListItem>
                ))}
              </List>
            </Card>
            <ChartCard title="Distribuição da frota" icon="ativos" period="Maiores clientes">
              <RankBars items={fleetRank} format={(v) => `${num(v)} veículos`} max={Math.max(...fleetRank.map((f) => f.value), 1)} />
            </ChartCard>
          </Grid>
          <Card title={`Resumo dos custos · ${monthLabel(data.history[data.history.length - 1].ym)}`} icon="dinheiro">
            <Grid cols={3} equal>
              <KpiTile label="Chips" display={<Num value={vehicles * 9} prefix="R$" digits={0} size="lg" />} sub={`${num(vehicles)} veículos × R$ 9`} />
              <KpiTile label="Infraestrutura" display={<Num value={650} prefix="R$" digits={0} size="lg" />} sub={`${num((650 / revenue) * 100, 0)}% da receita`} />
              <KpiTile label="Total de custos" display={<Num value={costs} prefix="R$" digits={0} size="lg" />} sub={`${num((costs / revenue) * 100, 0)}% da receita`} />
            </Grid>
          </Card>
        </Section>
        <Section title="Cliente da simulação e acesso de suporte"><SupportAccess /></Section>
      </PageBody>
    </div>
  );
}
