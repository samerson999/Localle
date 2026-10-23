// Console da Locale · Rastreadores e chips: estoque por modelo e protocolo, chip, vínculo com cliente e veículo,
// situação, último sinal e custo. Ver lib/trackerFleet.ts (dados simulados, nível plataforma).
import { useMemo, useState } from 'react';
import { Card, PageHeader, PageBody, Section, Grid, Table, Badge, Select, EmptyState } from '../components/ui';
import { KpiTile, Num } from '../components/story';
import { useStore } from '../lib/store';
import { seedTrackerFleet, type TrackerStatus } from '../lib/trackerFleet';
import { brl, fmtDT, num } from '../lib/utils';

const STATUS_BADGE: Record<TrackerStatus, { tone: string; label: string }> = {
  instalado: { tone: 'green', label: 'Instalado' },
  estoque: { tone: 'gray', label: 'Em estoque' },
  manutencao: { tone: 'orange', label: 'Em manutenção' },
  avariado: { tone: 'red', label: 'Avariado' },
};

export default function Rastreadores() {
  const session = useStore((s) => s.session);
  const fleet = useMemo(() => seedTrackerFleet(), []);
  const [status, setStatus] = useState('');
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com locale@demo.com para ver o Console da Locale." /></Card>;

  const list = status ? fleet.filter((t) => t.status === status) : fleet;
  const installed = fleet.filter((t) => t.status === 'instalado').length;
  const stock = fleet.filter((t) => t.status === 'estoque').length;
  const broken = fleet.filter((t) => t.status === 'avariado').length;
  const totalCost = fleet.reduce((a, t) => a + t.cost, 0);

  return (
    <div>
      <PageHeader icon="sinal" title="Rastreadores e chips" subtitle="Estoque, custos, vínculos e instalações" />
      <PageBody>
        <Section title="Resumo">
          <Grid cols={4} equal>
            <KpiTile label="Instalados" value={installed} />
            <KpiTile label="Em estoque" value={stock} status={stock ? 'parado' : undefined} />
            <KpiTile label="Avariados" value={broken} status={broken ? 'crit' : undefined} />
            <KpiTile label="Custo total do parque" display={<Num value={totalCost} prefix="R$" digits={0} size="kpi" />} />
          </Grid>
        </Section>
        <Section title={`${list.length} rastreadores`}>
          <Card>
            <div className="mb-card-head">
              <Select aria-label="Filtrar por situação" className="w-full sm:w-64" value={status} onChange={(e) => setStatus(e.target.value)}
                options={[{ value: '', label: 'Todas as situações' }, { value: 'instalado', label: 'Instalado' }, { value: 'estoque', label: 'Em estoque' }, { value: 'manutencao', label: 'Em manutenção' }, { value: 'avariado', label: 'Avariado' }]} />
            </div>
            <Table minWidth={1100} align={['left', 'left', 'left', 'left', 'left', 'left', 'left', 'right']}
              head={['IMEI', 'Modelo', 'Protocolo', 'Chip', 'Cliente', 'Veículo', 'Situação', 'Último sinal']}
              rows={list.map((t) => [
                <span className="font-mono text-small">{t.imei}</span>,
                t.model, t.protocol,
                t.chip ? <span className="text-small">{t.chip.operator}<span className="block text-caption text-ink-2 font-mono">{t.chip.iccid}</span></span> : <span className="text-ink-3">—</span>,
                t.client || <span className="text-ink-3">—</span>,
                t.vehicle || <span className="text-ink-3">—</span>,
                <Badge tone={STATUS_BADGE[t.status].tone}>{STATUS_BADGE[t.status].label}</Badge>,
                <span className="num text-small">{t.lastSignal ? fmtDT(t.lastSignal) : '—'}</span>,
              ])}
            />
          </Card>
        </Section>
      </PageBody>
    </div>
  );
}
