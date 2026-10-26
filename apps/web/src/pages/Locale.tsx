// Console da Locale · Visão geral: panorama da operação, receita e pontos de atenção — tudo do backend
// (/superadmin/visao-geral): contratos, faturas fechadas, apuração do mês e instalações reais.
// Custos (chip + infraestrutura) seguem estimados por constante (@localle/shared/platformOverview) até existir
// cadastro de custo: a margem é estimativa, e a tela diz isso.
import { Donut, CompareBars, RankBars } from '../components/charts';
import { ChartCard, KpiTile, Num } from '../components/story';
import { Card, PageHeader, PageBody, Section, Grid, EmptyState, List, ListItem, Callout } from '../components/ui';
import SupportAccess from '../components/SupportAccess';
import { Icon } from '../components/icons';
import { useStore } from '../lib/store';
import { adminApi, useAdminQuery } from '../lib/localleApi';
import { CHIP_COST, INFRA_COST, custoDoMes } from '@localle/shared/platformOverview';
import type { BillingType } from '@localle/shared/contratos';
import { brl, fmtD, num, monthLabel } from '@localle/shared/utils';

const rel = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null);
const BILLING_LABEL: Record<BillingType, string> = { mensalidade_fixa: 'Mensalidade fixa', por_veiculo_ativo: 'Por veículo ativo' };
const COLORS = ['var(--real)', 'var(--real-mid)'];
const money = (v: number) => brl(v).replace(',00', '');

export default function Locale() {
  const session = useStore((s) => s.session);
  const { data, error, loading } = useAdminQuery(adminApi.visaoGeral);
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com o acesso da Locale para ver o Console da Locale." /></Card>;
  if (!data) {
    return (
      <div>
        <PageHeader icon="locale" title="Visão geral" subtitle="Panorama da operação, receita e pontos de atenção" />
        <PageBody>{error ? <Callout tone="crit">Não foi possível carregar a visão geral: {error}</Callout> : loading && <Card><span className="text-small text-ink-2">Carregando…</span></Card>}</PageBody>
      </div>
    );
  }

  const revenue = data.receitaPrevista;
  const vehicles = data.veiculosAgora;
  const costs = custoDoMes(vehicles);
  const margin = revenue - costs;
  const hist = data.historico;
  const prev = hist[hist.length - 2];
  const clientesAtivos = data.contratosPorSituacao.ativo ?? 0;

  const donutParts = (['mensalidade_fixa', 'por_veiculo_ativo'] as const)
    .map((bt, i) => ({ label: BILLING_LABEL[bt], value: data.porTipoCobranca[bt] ?? 0, color: COLORS[i] }))
    .filter((p) => p.value > 0);
  const leader = [...donutParts].sort((a, b) => b.value - a.value)[0];
  const compareGroups = hist.map((h) => ({ label: monthLabel(h.competencia), cur: h.faturado, prev: custoDoMes(Math.round(h.veiculos)) }));
  const fleetRank = data.frotaPorCliente.slice(0, 8).map((f) => ({ label: f.clientName, value: f.veiculos }));
  const atraso = data.inadimplentes.reduce((a, i) => a + i.emAberto, 0);

  const needs = [
    { icon: 'relogio', show: data.inadimplentes.length > 0, title: `${data.inadimplentes.length} faturas em atraso`, detail: `${money(atraso)} em aberto · ${data.inadimplentes.slice(0, 3).map((i) => `${i.clientName} (${i.diasAtraso} d)`).join(', ')}` },
    { icon: 'calendario', show: data.contratosVencendo.length > 0, title: `${data.contratosVencendo.length} contratos vencendo em 60 dias`, detail: data.contratosVencendo.slice(0, 3).map((c) => `${c.clientName} em ${fmtD(Date.parse(`${c.fimEm}T12:00:00`))}`).join(', ') },
    { icon: 'sinal', show: data.rastreadoresSemSinal24h > 0, title: `${data.rastreadoresSemSinal24h} rastreadores instalados sem sinal há mais de 24 h`, detail: 'Verificar equipamento e chip em Rastreadores e chips' },
    { icon: 'manutencao', show: data.aRecolher.length > 0, title: `${data.aRecolher.length} equipamentos a recolher`, detail: `Instalados em clientes com contrato cancelado: ${data.aRecolher.slice(0, 3).map((r) => `${r.placa} (${r.clientName})`).join(', ')}` },
  ].filter((n) => n.show);

  return (
    <div>
      <PageHeader icon="locale" title="Visão geral" subtitle="Panorama da operação, receita e pontos de atenção" />
      <PageBody>
        <Section title="Resultado do mês">
          <Grid cols={4} equal>
            <KpiTile label="Receita prevista" display={<Num value={revenue} prefix="R$" digits={2} size="kpi" count />} delta={prev?.fechado ? { value: rel(revenue, prev.faturado), unit: '%', good: 'up' } : undefined} sub={prev?.fechado ? `vs. faturado em ${monthLabel(prev.competencia)}` : `Apurado até hoje: ${money(data.apuradoAteHoje)}`} />
            <KpiTile label="Veículos ativos" value={vehicles} sub="Com rastreador instalado agora" />
            <KpiTile label="Margem estimada" display={<Num value={margin} prefix="R$" digits={2} size="kpi" count />} sub={revenue ? `${num((margin / revenue) * 100, 0)}% da receita · custos estimados` : 'Custos estimados'} />
            <KpiTile label="Clientes ativos" value={clientesAtivos} sub={`${data.contratosPorSituacao.implantacao ?? 0} em implantação · ${data.contratosPorSituacao.suspenso ?? 0} suspensos`} />
          </Grid>
          <Grid split="6/6" wide equal>
            <ChartCard title="Receita prevista por modelo de cobrança" icon="dinheiro" period={monthLabel(data.competencia)}
              sentence={leader && revenue ? `${leader.label} responde por ${num((leader.value / revenue) * 100, 0)}% da receita deste mês.` : undefined}>
              {donutParts.length ? <Donut parts={donutParts} center={<Num value={revenue} prefix="R$" digits={2} size="lg" />} centerLabel="receita prevista" /> : <EmptyState title="Sem contratos com receita" />}
            </ChartCard>
            <ChartCard title="Faturado vs. custos estimados" icon="grafico" period="Últimos 6 meses"
              sentence="Meses fechados mostram o faturado; o mês corrente, o apurado até hoje.">
              <CompareBars groups={compareGroups} format={money} curLabel="Faturado" prevLabel="Custos" good="up" />
            </ChartCard>
          </Grid>
          <Grid split="6/6" wide equal>
            <Card title="Precisa de você" icon="atencao">
              {needs.length ? (
                <List className="-mx-bleed">
                  {needs.map((n, i) => (
                    <ListItem key={i} className="flex items-start gap-stack w-full min-h-row px-[max(var(--bleed),var(--cell-x))] py-stack">
                      <span className="ico-line text-body"><Icon name={n.icon} size={20} className="text-crit" /></span>
                      <span className="flex flex-col gap-hair min-w-0"><span className="text-body font-medium">{n.title}</span><span className="text-small text-ink-2">{n.detail}</span></span>
                    </ListItem>
                  ))}
                </List>
              ) : <EmptyState title="Nada pendente" detail="Sem atrasos, vencimentos próximos, rastreadores mudos ou equipamentos a recolher." />}
            </Card>
            <ChartCard title="Distribuição da frota" icon="ativos" period="Maiores clientes">
              {fleetRank.length ? <RankBars items={fleetRank} format={(v) => `${num(v)} veículos`} max={Math.max(...fleetRank.map((f) => f.value), 1)} /> : <EmptyState title="Nenhum veículo instalado" />}
            </ChartCard>
          </Grid>
          <Card title={`Custos estimados · ${monthLabel(data.competencia)}`} icon="dinheiro">
            <Grid cols={3} equal>
              <KpiTile label="Chips" display={<Num value={vehicles * CHIP_COST} prefix="R$" digits={0} size="lg" />} sub={`${num(vehicles)} veículos × R$ ${CHIP_COST}`} />
              <KpiTile label="Infraestrutura" display={<Num value={INFRA_COST} prefix="R$" digits={0} size="lg" />} sub={revenue ? `${num((INFRA_COST / revenue) * 100, 0)}% da receita` : undefined} />
              <KpiTile label="Total de custos" display={<Num value={costs} prefix="R$" digits={0} size="lg" />} sub={revenue ? `${num((costs / revenue) * 100, 0)}% da receita` : undefined} />
            </Grid>
            <p className="text-caption text-ink-2 mt-stack">Custo por chip e de infraestrutura são valores fixos de estimativa, ainda sem cadastro próprio.</p>
          </Card>
        </Section>
        <Section title="Cliente da simulação e acesso de suporte"><SupportAccess /></Section>
      </PageBody>
    </div>
  );
}
