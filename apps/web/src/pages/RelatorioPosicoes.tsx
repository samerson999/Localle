import { useEffect, useMemo, useState } from 'react';
import { isRealAsset, useRelatorioApi } from '../lib/localleApi';
import { fetchLiveRoute } from '../lib/positionsSource';

// Pontos (mapa e exportação linha a linha) dos veículos reais só até este tanto de veículos por vez;
// acima disso o relatório mostra o resumo calculado na API e pede para filtrar.
const MAX_VEICULOS_COM_PONTOS = 10;
import { hadTracker, operatedIn } from '@localle/shared/assetStatus';
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet';
import { useStore, useStoreData } from '../lib/store';
import { Button, Card, Field, Input, Select, SearchSelect, Table, EmptyState, Stack, Grid, Panel, PageHeader, toast } from '../components/ui';
import { TILE, ATTR, Address } from '../components/MapBits';
import { AssetName } from '../components/story';
import { Icon } from '../components/icons';
import { fmtDT, hm, DAY, toInputDT } from '@localle/shared/utils';
import { routeStats } from '@localle/shared/routeStats';
import { csv, xlsx, pdf, pdfFileName } from '../lib/reportExport';
import { cachedAddress } from '../lib/geocode';
import { ExportReportModal, type ExportFormat } from '../components/ExportReportModal';

// Relatório de Posições: histórico de posições detalhado da frota, com percurso no mapa e resumo
// de distância/velocidade por veículo. Filtros e geração seguem o mesmo padrão das demais telas
// de relatório (RelatorioCercas).
export default function RelatorioPosicoes() {
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

  // veículos reais: resumo (routeStats) calculado na API sobre o banco; simulados: aqui
  const api = useRelatorioApi<{ assetId: string; posicoes: number; stats: any }>('percurso', { from: new Date(f).toISOString(), to: new Date(t).toISOString() }, scope);
  useEffect(() => { if (api.error) toast('Não foi possível carregar o relatório: ' + api.error, { tone: 'crit' }); }, [api.error]);
  const [ptsReais, setPtsReais] = useState<Record<string, any[]>>({});
  const comPontos = api.rows.length > 0 && api.rows.length <= MAX_VEICULOS_COM_PONTOS;
  useEffect(() => {
    if (!comPontos) { setPtsReais({}); return; }
    let vivo = true;
    Promise.all(api.rows.map((r) => fetchLiveRoute(r.a, f, t).then((p) => [r.a.id, p] as const)))
      .then((e) => vivo && setPtsReais(Object.fromEntries(e)))
      .catch((e) => vivo && toast('Não foi possível carregar as posições: ' + (e.message || e), { tone: 'crit' }));
    return () => { vivo = false; };
  }, [api.rows, f, t]);
  const porVeiculo = useMemo(() => [
    ...scope.filter((a: any) => !isRealAsset(a)).map((a: any) => ({ a, pts: posOf(a), n: posOf(a).length, stats: routeStats(posOf(a)) })),
    ...api.rows.map((r) => ({ a: r.a, pts: ptsReais[r.a.id] || [], n: r.posicoes, stats: r.stats })),
  ].filter((x: any) => x.n), [scope.map((a: any) => a.id).join(), history, f, t, api.rows, ptsReais]);

  const filtrados = busca.trim()
    ? porVeiculo.filter(({ a }: any) => [a.name, a.plate].some((s) => (s || '').toLowerCase().includes(busca.trim().toLowerCase())))
    : porVeiculo;

  const totalPosicoes = porVeiculo.reduce((s: number, { n }: any) => s + n, 0);
  const distTotal = porVeiculo.reduce((s: number, { stats }: any) => s + stats.dist, 0);

  const quick = (ms: number, label: string) => <Button variant="secondary" size="sm" onClick={() => { setFrom(toInputDT(ms)); setTo(toInputDT(Date.now())); }}>{label}</Button>;
  const limparFiltros = () => { setGrp(''); setAid(''); setFrom(toInputDT(new Date().setHours(0, 0, 0, 0))); setTo(toInputDT(Date.now())); };

  const periodoLabel = `${fmtDT(f)} → ${fmtDT(t)}`;
  const filtrosTxt = `Grupo: ${groups.find((g: any) => g.id === grp)?.name || 'todos'} · Veículo: ${assets.find((a: any) => a.id === aid)?.name || 'todos'}`;
  const nomeArq = (ext: string) => `posicoes-${from.slice(0, 10)}-a-${to.slice(0, 10)}.${ext}`;
  const head = ['Veículo', 'Data/hora', 'Velocidade (km/h)', 'Ignição', 'Endereço', 'Latitude', 'Longitude'];
  // endereço só o que a tela já resolveu (cache), sem travar a exportação com um histórico grande de posições
  const linhas = () => filtrados.flatMap(({ a, pts }: any) => pts.map((p: any) => [a.name, fmtDT(p[0]), Math.round(p[3]), p[4] ? 'Ligada' : 'Desligada', cachedAddress(p[1], p[2]), p[1], p[2]]));

  const resumoHead = ['Veículo', 'Placa', 'Posições', 'Distância', 'Vel. máxima'];
  const resumoRows = () => [
    ...porVeiculo.map(({ a, n, stats }: any) => [a.name, a.plate || '—', n, `${Math.round(stats.dist)} km`, `${Math.round(stats.vmax)} km/h`]),
    ['Total', '', totalPosicoes, `${Math.round(distTotal)} km`, `${Math.round(porVeiculo.reduce((m: number, { stats }: any) => Math.max(m, stats.vmax), 0))} km/h`],
  ];

  const exportar = (formato: ExportFormat) => {
    const rows = linhas();
    if (!rows.length) return toast('Nada para exportar neste período.', { tone: 'crit' });
    const meta = { empresa: `${revenda.clientName} — Posições`, periodo: `Período: ${periodoLabel}`, filtros: filtrosTxt, emitidoEm: fmtDT(Date.now()) };
    if (formato === 'csv') csv(nomeArq('csv'), head, rows);
    else if (formato === 'xlsx') xlsx(nomeArq('xlsx'), meta, head, rows);
    else pdf({
      file: pdfFileName('Posições', f, t, aid ? assets.find((a: any) => a.id === aid)?.plate : undefined),
      titulo: 'Relatório de Posições', cliente: revenda.clientName, usuario: session?.name || '—', role: session?.role || '—',
      meta: [
        { label: 'Período', value: periodoLabel },
        { label: 'Veículo', value: assets.find((a: any) => a.id === aid)?.name || 'Todos' },
        { label: 'Grupo', value: groups.find((g: any) => g.id === grp)?.name || 'Todos' },
      ],
      sections: [
        { title: 'Posições recebidas', head, rows },
        { title: 'Resumo por veículo', head: resumoHead, rows: resumoRows() },
      ],
      nota: 'Cada linha é uma posição enviada pelo rastreador, em ordem cronológica.',
    });
    toast(`Relatório de posições gerado com ${rows.length} ${rows.length === 1 ? 'linha' : 'linhas'}.`);
  };

  // paleta decorativa de trajeto: sem vermelho (reservado a crítico/erro no sistema de cores do produto)
  const cores = ['#2563eb', '#16a34a', '#d97706', '#4E5B70', '#7c3aed', '#0891b2'];

  return (
    <div>
      <PageHeader icon="rota" title="Posições" subtitle="Consulte o histórico de posições detalhado da sua frota"
        crumbs={[{ label: 'Relatórios', to: '/relatorios' }, { label: 'Posições' }]} />
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

        <Grid cols={3} equal>
          <StatTile icon="rota" value={totalPosicoes} label="Posições" sub="Registradas no período" />
          <StatTile icon="ativos" value={porVeiculo.length} label="Veículos" sub="Com posições no período" />
          <StatTile icon="odometro" value={`${Math.round(distTotal)} km`} label="percorridos" sub="Soma da distância da frota" />
        </Grid>

        <Card dense className="h-[320px] md:h-[380px] overflow-hidden" variant="inset">
          <MapContainer center={porVeiculo[0]?.pts[0] ? [porVeiculo[0].pts[0][1], porVeiculo[0].pts[0][2]] : [-8.1, -34.92]} zoom={12} className="w-full h-full rounded-card overflow-hidden">
            <TileLayer url={TILE} attribution={ATTR} keepBuffer={6} updateWhenZooming={false} />
            {porVeiculo.map(({ a, pts }: any, i: number) => (
              <Polyline key={a.id} positions={pts.map((p: any) => [p[1], p[2]])} pathOptions={{ color: cores[i % cores.length], weight: 3 }} />
            ))}
            {porVeiculo.map(({ a, pts }: any, i: number) => {
              const last = pts[pts.length - 1];
              if (!last) return null; // veículo real sem pontos carregados (escopo acima do limite de veículos com pontos)
              return <CircleMarker key={a.id} center={[last[1], last[2]]} radius={6} pathOptions={{ color: cores[i % cores.length], fillColor: cores[i % cores.length], fillOpacity: 1 }} />;
            })}
          </MapContainer>
        </Card>

        <Card title="Posições registradas" subtitle={api.rows.length > MAX_VEICULOS_COM_PONTOS ? `A lista e o trajeto mostram até ${MAX_VEICULOS_COM_PONTOS} veículos por vez — filtre por grupo ou veículo para ver as posições. O resumo acima cobre a frota toda.` : 'Lista detalhada das posições da frota no período, com velocidade e endereço.'}
          actions={<div className="w-56"><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por veículo ou placa…" /></div>}>
          <Table minWidth={760} pageSize={10} align={['left', 'left', 'right', 'left', 'left']}
            emptyState={<EmptyState icon="rota" layout="row" title="Nenhuma posição no período" detail="Troque o período ou os veículos." />}
            head={['Veículo', 'Data/hora', 'Velocidade', 'Ignição', 'Endereço']}
            rows={filtrados.flatMap(({ a, pts }: any) => pts.slice(-50).reverse().map((p: any) => [
              <AssetName name={a.name} />, <time className="num">{fmtDT(p[0])}</time>,
              <span className="num">{Math.round(p[3])} km/h</span>,
              p[4] ? <span className="text-ok">Ligada</span> : <span className="text-ink-2">Desligada</span>,
              <Address pos={[p[1], p[2]]} className="text-small" />,
            ]))} />
        </Card>

        <Card title="Resumo por veículo" subtitle="Distância percorrida e velocidade máxima de cada veículo no período.">
          <Table minWidth={760} pageSize={10} align={['left', 'left', 'right', 'right', 'right']}
            emptyState={<EmptyState title="Nenhum veículo com posições no período" />}
            head={['Veículo', 'Placa', 'Posições', 'Distância', 'Vel. máxima']}
            rows={porVeiculo.map(({ a, n, stats }: any) => [<AssetName name={a.name} />, a.plate || '—', <span className="num">{n}</span>, <span className="num">{Math.round(stats.dist)} km</span>, <span className="num">{Math.round(stats.vmax)} km/h</span>])} />
        </Card>
      </Stack>

      <ExportReportModal open={exportOpen} onClose={() => setExportOpen(false)} titulo="Posições" periodo={periodoLabel}
        resumo={`${totalPosicoes} ${totalPosicoes === 1 ? 'posição' : 'posições'} · ${porVeiculo.length} ${porVeiculo.length === 1 ? 'veículo' : 'veículos'}`}
        itens={['Filtros aplicados', 'Histórico detalhado de posições', 'Resumo por veículo', 'Cabeçalho com nome da empresa e data de emissão']}
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
