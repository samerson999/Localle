// Console da Locale · Saúde da plataforma: medido de verdade pelo backend (/superadmin/saude) — Traccar
// (devices conectados), comunicação dos rastreadores instalados, fila de ingestão (Redis/BullMQ), inbox do
// forwarding, banco e SMTP. Cada fonte é isolada: uma fora do ar aparece como "Fora do ar" sem derrubar o resto.
// Disco do servidor, backup e falhas de decodificação por protocolo não têm fonte ainda — a tela não inventa.
import { Card, PageHeader, PageBody, Section, Grid, Table, Badge, Button, Callout, EmptyState } from '../components/ui';
import { KpiTile, Num } from '../components/story';
import { Ring } from '../components/charts';
import { useStore } from '../lib/store';
import { adminApi, useAdminQuery } from '../lib/localleApi';
import { fmtDT, num } from '@localle/shared/utils';

const BADGE: Record<string, { tone: string; label: string }> = {
  ok: { tone: 'green', label: 'Operando' },
  degradado: { tone: 'orange', label: 'Degradado' },
  fora: { tone: 'red', label: 'Fora do ar' },
  desligado: { tone: 'gray', label: 'Não configurado' },
};
const gb = (b: number) => b / 1024 ** 3;
const duracao = (s: number | null) => (s === null ? '—' : s < 120 ? `${s} s` : s < 7200 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`);

export default function Saude() {
  const session = useStore((s) => s.session);
  const { data: h, error, loading, reload } = useAdminQuery(adminApi.saude);
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com o acesso da Locale para ver o Console da Locale." /></Card>;

  const header = (
    <PageHeader icon="monitoramento" title="Saúde da plataforma" subtitle={h ? `Verificado em ${fmtDT(h.verificadoEm)}` : 'Gateway, comunicação, fila, banco e e-mail'}>
      <Button variant="secondary" loading={loading} onClick={reload}>Verificar agora</Button>
    </PageHeader>
  );
  if (!h) return <div>{header}<PageBody>{error && <Callout tone="crit">Não foi possível consultar a saúde da plataforma: {error}</Callout>}</PageBody></div>;

  const semSinal = h.comunicacao.instalados - h.comunicacao.ate24h;
  return (
    <div>
      {header}
      <PageBody>
        {h.gateway.status === 'fora' && <Callout tone="crit">O Traccar não respondeu: nenhuma posição nova chega enquanto ele estiver fora.</Callout>}
        {h.fila.status === 'fora' && <Callout tone="crit">A fila de ingestão (Redis) não respondeu.</Callout>}
        <Section title="Gateway (Traccar) e comunicação">
          <Grid split="4/8" wide equal>
            <Card title="Aparelhos conectados ao Traccar" icon="sinal">
              {h.gateway.status === 'ok' ? (
                <div className="flex items-center gap-6">
                  <Ring value={h.gateway.devices ? h.gateway.online / h.gateway.devices : 0} center={<Num value={h.gateway.online} size="kpi" />} centerLabel={`de ${num(h.gateway.devices)}`} label="Conectados" />
                  <span className="text-small text-ink-2">{num(h.gateway.devices - h.gateway.online)} desconectados agora</span>
                </div>
              ) : <Badge tone={BADGE[h.gateway.status].tone}>{BADGE[h.gateway.status].label}</Badge>}
            </Card>
            <Card title="Rastreadores instalados" icon="atencao">
              <Grid cols={3} equal>
                <KpiTile label="Comunicando agora" value={h.comunicacao.agora} sub="Último pacote há até 10 min" />
                <KpiTile label="Nas últimas 24 h" value={h.comunicacao.ate24h} sub={`de ${num(h.comunicacao.instalados)} instalados`} />
                <KpiTile label="Sem sinal há mais de 24 h" value={semSinal} status={semSinal ? 'crit' : undefined} />
              </Grid>
            </Card>
          </Grid>
        </Section>
        <Section title="Ingestão e banco de dados">
          <Grid cols={4} equal>
            <KpiTile label="Fila aguardando" value={h.fila.aguardando} sub={<>{num(h.fila.ativos)} em processamento · {num(h.fila.falhos)} falhos <Badge tone={BADGE[h.fila.status].tone} className="ml-tight">{BADGE[h.fila.status].label}</Badge></>} status={h.fila.status === 'degradado' ? 'parado' : undefined} />
            <KpiTile label="Inbox do forwarding" value={h.inbox.pendentes} sub={`Mais antiga: ${duracao(h.inbox.maisAntigaSeg)} · ${num(h.inbox.comErro24h)} com erro em 24 h`} status={h.inbox.maisAntigaSeg !== null && h.inbox.maisAntigaSeg > 300 ? 'crit' : undefined} />
            <KpiTile label="Tamanho do banco" display={<Num value={gb(h.banco.tamanhoBytes)} unit="GB" digits={2} size="kpi" />} sub={h.banco.posicoesBytes !== null ? `${num(gb(h.banco.posicoesBytes), 2)} GB em posições` : undefined} />
            <KpiTile label="Posições nas últimas 24 h" value={h.banco.posicoes24h} />
          </Grid>
        </Section>
        <Section title="Integrações">
          <Card title="Serviços" icon="link">
            <Table minWidth={400} align={['left', 'right']} head={['Serviço', 'Situação']}
              rows={[
                ['Traccar (gateway)', <Badge tone={BADGE[h.gateway.status].tone}>{BADGE[h.gateway.status].label}</Badge>],
                ['Fila de ingestão (Redis)', <Badge tone={BADGE[h.fila.status].tone}>{BADGE[h.fila.status].label}</Badge>],
                ['E-mail (SMTP)', <Badge tone={BADGE[h.smtp].tone}>{BADGE[h.smtp].label}</Badge>],
              ]} />
            <p className="text-caption text-ink-2 mt-stack">Disco do servidor, backup e restauração ainda não são monitorados pela plataforma.</p>
          </Card>
        </Section>
      </PageBody>
    </div>
  );
}
