// Console da Locale · Saúde da plataforma: gateway, fila, banco, integrações, geocodificação e backup.
// Dados simulados (sem fonte real de infraestrutura nesta simulação) — ver lib/platformHealth.ts.
import { useMemo } from 'react';
import { Card, PageHeader, PageBody, Section, Grid, Table, Badge, Callout, EmptyState } from '../components/ui';
import { KpiTile, Num } from '../components/story';
import { Ring } from '../components/charts';
import { useStore } from '../lib/store';
import { seedPlatformHealth, daysUntilDiskPct } from '../lib/platformHealth';
import { fmtDT, num } from '../lib/utils';

const INT_BADGE: Record<string, { tone: string; label: string }> = { ok: { tone: 'green', label: 'Operando' }, degradado: { tone: 'orange', label: 'Degradado' }, fora: { tone: 'red', label: 'Fora do ar' } };

export default function Saude() {
  const session = useStore((s) => s.session);
  const h = useMemo(() => seedPlatformHealth(), []);
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com locale@demo.com para ver o Console da Locale." /></Card>;

  const daysTo70 = daysUntilDiskPct(h, 70);
  const offline = h.gateway.total - h.gateway.connected;

  return (
    <div>
      <PageHeader icon="monitoramento" title="Saúde da plataforma" subtitle="Gateway, fila, banco, integrações e backup" />
      <PageBody>
        {daysTo70 != null && daysTo70 <= 60 && (
          <Callout tone={daysTo70 <= 30 ? 'crit' : 'warn'}>
            Disco do banco em {h.database.diskUsedPct}%; no ritmo atual, chega a 70% em {daysTo70} dias.
          </Callout>
        )}
        <Section title="Gateway (Traccar)">
          <Grid split="4/8" wide equal>
            <Card title="Aparelhos conectados" icon="sinal">
              <div className="flex items-center gap-6">
                <Ring value={h.gateway.connected / h.gateway.total} center={<Num value={h.gateway.connected} size="kpi" />} centerLabel={`de ${num(h.gateway.total)}`} label="Conectados" />
                <div className="flex flex-col gap-hair">
                  <span className="text-small text-ink-2">{num(offline)} sem comunicação agora</span>
                  <span className="text-small text-ink-2">{num(h.gateway.messagesPerSecond)} mensagens/s</span>
                </div>
              </div>
            </Card>
            <Card title="Falhas de decodificação por protocolo" icon="atencao">
              <Table minWidth={400} align={['left', 'right']} head={['Protocolo', 'Falhas (24 h)']}
                rows={h.gateway.decodeFailuresByProtocol.map((f) => [f.protocol, <span className="num font-medium">{num(f.failures)}</span>])} />
            </Card>
          </Grid>
        </Section>
        <Section title="Fila e banco de dados">
          <Grid cols={4} equal>
            <KpiTile label="Atraso da fila" display={<Num value={h.queue.delaySec} unit="s" digits={1} size="kpi" />} />
            <KpiTile label="Tamanho do banco" display={<Num value={h.database.sizeGb} unit="GB" digits={0} size="kpi" />} />
            <KpiTile label="Crescimento diário" display={<Num value={h.database.dailyGrowthGb} unit="GB/dia" digits={2} size="kpi" />} />
            <KpiTile label="Disco usado" display={<Num value={h.database.diskUsedPct} unit="%" digits={0} size="kpi" />} status={h.database.diskUsedPct >= 70 ? 'crit' : h.database.diskUsedPct >= 55 ? 'parado' : undefined} />
          </Grid>
        </Section>
        <Section title="Integrações, geocodificação e backup">
          <Grid split="6/6" wide equal>
            <Card title="Integrações" icon="link">
              <Table minWidth={400} align={['left', 'right']} head={['Serviço', 'Situação']}
                rows={[...h.integrations, { name: 'Geocodificação', status: h.geocoding.status }].map((i) => [i.name, <Badge tone={INT_BADGE[i.status].tone}>{INT_BADGE[i.status].label}</Badge>])} />
            </Card>
            <Card title="Backup" icon="banco">
              <div className="flex flex-col gap-stack">
                <div className="flex flex-col gap-hair"><span className="text-small text-ink-2">Último backup</span><span className="text-body font-medium num">{fmtDT(h.lastBackupAt)}</span></div>
                <div className="flex flex-col gap-hair"><span className="text-small text-ink-2">Último teste de restauração</span><span className="text-body font-medium num">{fmtDT(h.lastRestoreTestAt)}</span></div>
              </div>
            </Card>
          </Grid>
        </Section>
      </PageBody>
    </div>
  );
}
