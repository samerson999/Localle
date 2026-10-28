import { useEffect, useMemo, useState } from 'react';
import { hadTracker, operatedIn } from '@localle/shared/assetStatus';
import { routeStats } from '@localle/shared/routeStats';
import { fmtDT, hm, DAY, toInputDT } from '@localle/shared/utils';
import { useStore, useStoreData } from '../lib/store';
import { isRealAsset, useRelatorioApi } from '../lib/localleApi';
import { Button, Card, Field, Input, Select, SearchSelect, Table, EmptyState, Stack, Grid, Panel, PageHeader, toast } from '../components/ui';
import { AssetName } from '../components/story';
import { Icon } from '../components/icons';
import { csv, xlsx, pdf, pdfFileName } from '../lib/reportExport';
import { ExportReportModal, type ExportFormat } from '../components/ExportReportModal';

// Uso da frota: km rodado, tempo em movimento, motor ligado, parado com motor ligado (ocioso) e paradas,
// por veículo. Veículos reais: calculado na API (GET /reports/percurso, routeStats sobre as posições do
// banco); demais: routeStats aqui sobre o histórico local — a mesma função nos dois casos.
export default function RelatorioUso() {
  const all = useStore((s) => s.assets);
  const accessLog = useStore((s) => s.accessLog);
  const history = useStoreData(15000).history;
  const revenda = useStore((s) => s.revenda);
  const groups = useStore((s) => s.groups);
  const session = useStore((s) => s.session);

  const [from, setFrom] = useState(toInputDT(new Date().setHours(0, 0, 0, 0)));
  const [to, setTo] = useState(toInputDT(Date.now()));
  const [grp, setGrp] = useState('');
  const [aid, setAid] = useState('');
  const [busca, setBusca] = useState('');
  const [geradoEm, setGeradoEm] = useState(() => Date.now());
  const [exportOpen, setExportOpen] = useState(false);

  const f = new Date(from).getTime(), t = new Date(to).getTime();
  const assets = all.filter((a: any) => hadTracker({ accessLog }, a) && operatedIn(a, f));
  const scope = assets.filter((a: any) => (!grp || a.groupIds?.includes(grp)) && (!aid || a.id === aid));
  const posOf = (a: any) => ((history[a.id] || []) as any[]).filter((p: any) => p[0] >= f && p[0] <= t);

  const api = useRelatorioApi<{ assetId: string; posicoes: number; stats: any }>('percurso', { from: new Date(f).toISOString(), to: new Date(t).toISOString() }, scope);
  useEffect(() => { if (api.error) toast('Não foi possível carregar o relatório: ' + api.error, { tone: 'crit' }); }, [api.error]);

  const porVeiculo = useMemo(() => [
    ...scope.filter((a: any) => !isRealAsset(a)).map((a: any) => ({ a, stats: routeStats(posOf(a)), n: posOf(a).length })),
    ...api.rows.map((r) => ({ a: r.a, stats: r.stats, n: r.posicoes })),
  ].filter((x) => x.n).sort((x, y) => y.stats.dist - x.stats.dist), [scope.map((a: any) => a.id).join(), history, f, t, api.rows]);

  const filtrados = busca.trim()
    ? porVeiculo.filter(({ a }: any) => [a.name, a.plate].some((s) => (s || '').toLowerCase().includes(busca.trim().toLowerCase())))
    : porVeiculo;

  const soma = (k: 'dist' | 'moving' | 'engineOn' | 'idle') => porVeiculo.reduce((s, x) => s + x.stats[k], 0);
  const paradasTotal = porVeiculo.reduce((s, x) => s + x.stats.stops.length, 0);
  const tempoParado = (st: any) => st.stops.reduce((s: number, p: any) => s + (p.end - p.ts), 0);

  const quick = (ms: number, label: string) => <Button variant="secondary" size="sm" onClick={() => { setFrom(toInputDT(ms)); setTo(toInputDT(Date.now())); }}>{label}</Button>;
  const limparFiltros = () => { setGrp(''); setAid(''); setFrom(toInputDT(new Date().setHours(0, 0, 0, 0))); setTo(toInputDT(Date.now())); };

  const periodoLabel = `${fmtDT(f)} → ${fmtDT(t)}`;
  const filtrosTxt = `Grupo: ${groups.find((g: any) => g.id === grp)?.name || 'todos'} · Veículo: ${assets.find((a: any) => a.id === aid)?.name || 'todos'}`;
  const nomeArq = (ext: string) => `uso-da-frota-${from.slice(0, 10)}-a-${to.slice(0, 10)}.${ext}`;
  const head = ['Veículo', 'Placa', 'Km', 'Em movimento', 'Motor ligado', 'Ocioso (parado ligado)', 'Paradas', 'Tempo parado', 'Vel. máxima'];
  const linha = ({ a, stats }: any) => [a.name, a.plate || '—', Math.round(stats.dist * 10) / 10, hm(stats.moving), hm(stats.engineOn), hm(stats.idle), stats.stops.length, hm(tempoParado(stats)), `${Math.round(stats.vmax)} km/h`];
  const linhas = () => [...filtrados.map(linha), ['Total', '', Math.round(soma('dist') * 10) / 10, hm(soma('moving')), hm(soma('engineOn')), hm(soma('idle')), paradasTotal, '', '']];

  const exportar = (formato: ExportFormat) => {
    if (!filtrados.length) return toast('Nada para exportar neste período.', { tone: 'crit' });
    const rows = linhas();
    const meta = { empresa: `${revenda.clientName} — Uso da frota`, periodo: `Período: ${periodoLabel}`, filtros: filtrosTxt, emitidoEm: fmtDT(Date.now()) };
    if (formato === 'csv') csv(nomeArq('csv'), head, rows);
    else if (formato === 'xlsx') xlsx(nomeArq('xlsx'), meta, head, rows, [], 'Uso por veículo');
    else pdf({
      file: pdfFileName('Uso da frota', f, t, aid ? assets.find((a: any) => a.id === aid)?.plate : undefined),
      titulo: 'Relatório de Uso da Frota', cliente: revenda.clientName, usuario: session?.name || '—', role: session?.role || '—',
      meta: [
        { label: 'Período', value: periodoLabel },
        { label: 'Veículo', value: assets.find((a: any) => a.id === aid)?.name || 'Todos' },
        { label: 'Grupo', value: groups.find((g: any) => g.id === grp)?.name || 'Todos' },
      ],
      sections: [{ title: 'Uso por veículo', head, rows }],
      nota: 'Parada = mais de 5 min a até 3 km/h. Ocioso = parado com a ignição ligada.',
    });
    toast(`Relatório de uso gerado com ${filtrados.length} ${filtrados.length === 1 ? 'veículo' : 'veículos'}.`);
  };

  return (
    <div>
      <PageHeader icon="odometro" title="Uso da frota" subtitle="Km rodado, motor ligado, ociosidade e paradas por veículo"
        crumbs={[{ label: 'Relatórios', to: '/relatorios' }, { label: 'Uso da frota' }]} />
      <Stack gap="grid">
        <Card>
          <div className="flex flex-wrap items-end gap-field">
            <Field label="Período"><div className="flex items-center gap-tight"><Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /><Icon name="chevron" size={16} className="text-ink-3" /><Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></div></Field>
            <Field label="Veículos" className="w-64"><SearchSelect value={aid} onChange={setAid} placeholder="Todos os veículos"
              options={assets.map((a: any) => ({ value: a.id, label: a.name, sub: a.plate }))} /></Field>
            <Field label="Grupo de veículos"><Select value={grp} onChange={(e) => setGrp(e.target.value)} options={[{ value: '', label: 'Todos os grupos' }, ...groups.map((g: any) => ({ value: g.id, label: g.name }))]} /></Field>
            <div className="flex gap-tight">{quick(new Date().setHours(0, 0, 0, 0), 'Hoje')}{quick(Date.now() - DAY, '24 h')}{quick(Date.now() - 7 * DAY, '7 dias')}</div>
            <span className="flex-1" />
            <Button variant="primary" onClick={() => { setGeradoEm(Date.now()); setExportOpen(true); }}><Icon name="play" size={16} />Gerar relatório</Button>
          </div>
        </Card>

        <Panel tone="muted" className="flex flex-wrap items-center gap-stack">
          <span className="text-small font-medium text-ink-2">Filtros aplicados</span>
          <span className="flex items-center gap-tight text-small text-ink"><Icon name="calendario" size={16} className="text-ink-2" />{periodoLabel}</span>
          <span className="flex items-center gap-tight text-small text-ink"><Icon name="ativos" size={16} className="text-ink-2" />{assets.find((a: any) => a.id === aid)?.name || 'Todos os veículos'}</span>
          <span className="flex items-center gap-tight text-small text-ink"><Icon name="equipe" size={16} className="text-ink-2" />{groups.find((g: any) => g.id === grp)?.name || 'Todos os grupos'}</span>
          <span className="ml-auto text-caption text-ink-2">Relatório gerado em {fmtDT(geradoEm)}</span>
          <Button variant="quiet" size="sm" onClick={limparFiltros}><Icon name="reiniciar" size={14} />Limpar filtros</Button>
        </Panel>

        <Grid cols={4} equal>
          <StatTile icon="odometro" value={`${Math.round(soma('dist'))} km`} label="rodados" sub={`${porVeiculo.length} ${porVeiculo.length === 1 ? 'veículo' : 'veículos'} no período`} />
          <StatTile icon="relogio" value={hm(soma('engineOn'))} label="motor ligado" sub={`${hm(soma('moving'))} em movimento`} />
          <StatTile icon="alerta" value={hm(soma('idle'))} label="ocioso" sub="Parado com a ignição ligada" />
          <StatTile icon="pause" value={paradasTotal} label="paradas" sub="Mais de 5 min parado" />
        </Grid>

        <Card title="Uso por veículo" subtitle={api.loading ? 'Carregando os dados do período…' : 'Ordenado pelo km rodado.'}
          actions={<div className="w-56"><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por veículo ou placa…" /></div>}>
          <Table head={head}
            emptyState={<EmptyState icon="odometro" title="Nenhum veículo com posições no período" detail="Ajuste o período ou os filtros." />}
            rows={filtrados.map((x: any) => { const l = linha(x); return [<AssetName name={x.a.name} />, ...l.slice(1).map((v: any, i: number) => <span key={i} className={i > 0 ? 'num' : ''}>{i === 1 ? `${v} km` : v}</span>)]; })} />
        </Card>
      </Stack>

      <ExportReportModal open={exportOpen} onClose={() => setExportOpen(false)} titulo="Uso da frota" periodo={periodoLabel}
        resumo={`${porVeiculo.length} ${porVeiculo.length === 1 ? 'veículo' : 'veículos'} · ${Math.round(soma('dist'))} km`}
        itens={['Filtros aplicados', 'Km, motor ligado, ociosidade e paradas por veículo', 'Cabeçalho com nome da empresa e data de emissão']}
        onExport={exportar} />
    </div>
  );
}

function StatTile({ icon, value, label, sub }: { icon: string; value: React.ReactNode; label: string; sub: string }) {
  return (
    <Card dense>
      <div className="flex items-center gap-stack">
        <span className="w-10 h-10 rounded-ctl bg-brand-soft flex items-center justify-center shrink-0 text-brand-ink"><Icon name={icon} size={20} /></span>
        <div className="min-w-0">
          <p className="text-h3 font-semibold num"><span>{value}</span> <span className="text-small font-normal text-ink-2">{label}</span></p>
          <p className="text-caption text-ink-2 truncate">{sub}</p>
        </div>
      </div>
    </Card>
  );
}
