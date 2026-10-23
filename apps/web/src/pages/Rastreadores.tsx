// Console da Locale · Rastreadores e chips: estoque por modelo e protocolo, chip, vínculo com cliente e veículo,
// situação, último sinal, custo e recolhimento. Ver lib/trackerFleet.ts (dados simulados, nível plataforma).
// O cancelamento de contrato não apaga o histórico nem encerra a instalação sozinho: o equipamento fica
// "pendente de recolhimento" até alguém confirmar a retirada física.
import { useMemo, useState } from 'react';
import { Card, PageHeader, PageBody, Section, Grid, Table, Badge, Select, TextButton, EmptyState, toast, confirmAction } from '../components/ui';
import { KpiTile, Num } from '../components/story';
import { useStore } from '../lib/store';
import { seedTrackerFleet, type TrackerRecord, type TrackerStatus } from '../lib/trackerFleet';
import { brl, fmtD, fmtDT, num } from '@localle/shared/utils';

const STATUS_BADGE: Record<TrackerStatus, { tone: string; label: string }> = {
  instalado: { tone: 'green', label: 'Instalado' },
  estoque: { tone: 'gray', label: 'Em estoque' },
  manutencao: { tone: 'orange', label: 'Em manutenção' },
  avariado: { tone: 'red', label: 'Avariado' },
  pendente_recolhimento: { tone: 'orange', label: 'Pendente de recolhimento' },
};

export default function Rastreadores() {
  const session = useStore((s) => s.session);
  const [fleet, setFleet] = useState<TrackerRecord[]>(() => seedTrackerFleet());
  const [status, setStatus] = useState('');
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com locale@demo.com para ver o Console da Locale." /></Card>;

  const list = status ? fleet.filter((t) => t.status === status) : fleet;
  const installed = fleet.filter((t) => t.status === 'instalado').length;
  const stock = fleet.filter((t) => t.status === 'estoque').length;
  const broken = fleet.filter((t) => t.status === 'avariado').length;
  const pending = fleet.filter((t) => t.status === 'pendente_recolhimento');
  const totalCost = fleet.reduce((a, t) => a + t.cost, 0);

  const confirmRecolhimento = async (t: TrackerRecord) => {
    if (!(await confirmAction({ title: 'Confirmar recolhimento?', detail: `${t.model} (${t.imei}) volta para o estoque, libera o cliente ${t.client} e encerra o vínculo com ${t.vehicle}.`, confirmLabel: 'Confirmar recolhimento', tone: 'primary' }))) return;
    setFleet((f) => f.map((x) => (x.imei === t.imei ? { ...x, status: 'estoque', client: null, vehicle: null, chip: null, pendingSince: null, pendingReason: null } : x)));
    toast('Recolhimento confirmado. Equipamento voltou para o estoque.');
  };

  return (
    <div>
      <PageHeader icon="sinal" title="Rastreadores e chips" subtitle="Estoque, custos, vínculos, instalações e recolhimento" />
      <PageBody>
        <Section title="Resumo">
          <Grid cols={5} equal>
            <KpiTile label="Instalados" value={installed} />
            <KpiTile label="Em estoque" value={stock} status={stock ? 'parado' : undefined} />
            <KpiTile label="Avariados" value={broken} status={broken ? 'crit' : undefined} />
            <KpiTile label="Pendentes de recolhimento" value={pending.length} status={pending.length ? 'crit' : undefined} />
            <KpiTile label="Custo total do parque" display={<Num value={totalCost} prefix="R$" digits={0} size="kpi" />} />
          </Grid>
        </Section>
        {pending.length > 0 && (
          <Section title={`${pending.length} equipamentos a recolher`}>
            <Card>
              <Table minWidth={1000} align={['left', 'left', 'left', 'left', 'left', 'left', 'right']}
                head={['IMEI', 'Modelo', 'Cliente', 'Última instalação', 'Pendente desde', 'Motivo', '']}
                rows={pending.map((t) => [
                  <span className="font-mono text-small">{t.imei}</span>,
                  t.model,
                  <span>{t.client}<span className="block text-caption text-ink-2">{t.vehicle}</span></span>,
                  <span className="num text-small">{t.installedAt ? fmtD(t.installedAt) : '—'}</span>,
                  <span className="num text-small">{t.pendingSince ? fmtD(t.pendingSince) : '—'}</span>,
                  <span className="text-small text-ink-2">{t.pendingReason}</span>,
                  <TextButton onClick={() => confirmRecolhimento(t)}>Confirmar recolhimento</TextButton>,
                ])}
              />
            </Card>
          </Section>
        )}
        <Section title={`${list.length} rastreadores`}>
          <Card>
            <div className="mb-card-head">
              <Select aria-label="Filtrar por situação" className="w-full sm:w-64" value={status} onChange={(e) => setStatus(e.target.value)}
                options={[{ value: '', label: 'Todas as situações' }, { value: 'instalado', label: 'Instalado' }, { value: 'estoque', label: 'Em estoque' }, { value: 'manutencao', label: 'Em manutenção' }, { value: 'avariado', label: 'Avariado' }, { value: 'pendente_recolhimento', label: 'Pendente de recolhimento' }]} />
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
