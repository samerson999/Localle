import { useEffect, useMemo, useState } from 'react';
import { isRealAsset, useRelatorioApi } from '../lib/localleApi';
import { hadTracker, operatedIn } from '@localle/shared/assetStatus';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { useStore, useStoreData } from '../lib/store';
import { Button, Card, Field, Input, Select, SearchSelect, Table, EmptyState, Stack, Grid, Panel, PageHeader, toast } from '../components/ui';
import { FenceShapes, TILE, ATTR, Address } from '../components/MapBits';
import { AssetName, StatusDot } from '../components/story';
import { Icon } from '../components/icons';
import { fmtDT, hm, DAY, toInputDT } from '@localle/shared/utils';
import { fencePassages, stayMs, GAP_MIN } from '@localle/shared/fenceStats';
import { csv, xlsx, pdf, pdfFileName } from '../lib/reportExport';
import { resolveAddresses } from '../lib/geocode';
import { ExportReportModal, type ExportFormat } from '../components/ExportReportModal';

// Relatório de Cercas: passagens da frota pelas cercas definidas, tempo de permanência e resumo por veículo.
// Filtros e geração (exportar PDF/XLSX/CSV) ficam aqui; a geração abre o ExportReportModal, padrão em
// todas as telas de relatório.
export default function RelatorioCercas() {
  const all = useStore((s) => s.assets);
  const accessLog = useStore((s) => s.accessLog);
  const history = useStoreData(15000).history;
  const fences = useStore((s) => s.fences);
  const revenda = useStore((s) => s.revenda);
  const session = useStore((s) => s.session);

  const [from, setFrom] = useState(toInputDT(new Date().setHours(0, 0, 0, 0)));
  const [to, setTo] = useState(toInputDT(Date.now()));
  const [grp, setGrp] = useState('');
  const [aid, setAid] = useState('');
  const [fenceId, setFenceId] = useState('');
  const [busca, setBusca] = useState('');
  const [geradoEm, setGeradoEm] = useState(() => Date.now());
  const [exportOpen, setExportOpen] = useState(false);

  const groups = useStore((s) => s.groups);
  const f = new Date(from).getTime(), t = new Date(to).getTime();
  const assets = all.filter((a: any) => hadTracker({ accessLog }, a) && operatedIn(a, f));
  const scope = assets.filter((a: any) => (!grp || a.groupIds?.includes(grp)) && (!aid || a.id === aid));
  const posOf = (a: any) => ((history[a.id] || []) as any[]).filter((p: any) => p[0] >= f && p[0] <= t);

  const fenceScope = fenceId ? fences.filter((x: any) => x.id === fenceId) : fences;
  // veículos reais: passagens calculadas na API sobre as cercas e posições do banco; simulados: aqui
  const api = useRelatorioApi<{ assetId: string; passagens: any[] }>('cercas', { from: new Date(f).toISOString(), to: new Date(t).toISOString(), cercaId: fenceId || null }, scope);
  useEffect(() => { if (api.error) toast('Não foi possível carregar o relatório: ' + api.error, { tone: 'crit' }); }, [api.error]);
  const passagens = useMemo(() => [
    ...scope.filter((a: any) => !isRealAsset(a)).flatMap((a: any) => fenceScope.flatMap((fe: any) => fencePassages(posOf(a), fe, t).map((p) => ({ a, fe, p })))),
    ...api.rows.flatMap((r) => r.passagens.map((p) => ({ a: r.a, fe: fences.find((x: any) => x.id === p.fenceId) || { id: p.fenceId, name: p.fenceName, type: p.fenceType }, p }))),
  ].sort((x: any, y: any) => y.p.enter - x.p.enter), [scope.map((a: any) => a.id).join(), fenceScope.map((x: any) => x.id).join(), history, f, t, api.rows]);

  const filtradas = busca.trim()
    ? passagens.filter(({ a, fe }: any) => [a.name, a.plate, fe.name].some((s) => (s || '').toLowerCase().includes(busca.trim().toLowerCase())))
    : passagens;

  const veiculosNoPeriodo = new Set(passagens.map(({ a }: any) => a.id)).size;
  const tempoTotalMs = passagens.reduce((s: number, { p }: any) => s + stayMs(p, t), 0);

  const porVeiculo = useMemo(() => {
    const m = new Map<string, { a: any; n: number; ms: number }>();
    for (const { a, p } of passagens as any[]) {
      const cur = m.get(a.id) || { a, n: 0, ms: 0 };
      cur.n++; cur.ms += stayMs(p, t);
      m.set(a.id, cur);
    }
    return [...m.values()].sort((x, y) => y.ms - x.ms);
  }, [passagens, t]);

  const quick = (ms: number, label: string) => <Button variant="secondary" size="sm" onClick={() => { setFrom(toInputDT(ms)); setTo(toInputDT(Date.now())); }}>{label}</Button>;
  const limparFiltros = () => { setGrp(''); setAid(''); setFenceId(''); setFrom(toInputDT(new Date().setHours(0, 0, 0, 0))); setTo(toInputDT(Date.now())); };

  const periodoLabel = `${fmtDT(f)} → ${fmtDT(t)}`;
  const filtrosTxt = `Grupo: ${groups.find((g: any) => g.id === grp)?.name || 'todos'} · Veículo: ${assets.find((a: any) => a.id === aid)?.name || 'todos'} · Cerca: ${fences.find((x: any) => x.id === fenceId)?.name || 'todas'}`;
  const nomeArq = (ext: string) => `cercas-${from.slice(0, 10)}-a-${to.slice(0, 10)}.${ext}`;
  const head = ['Veículo', 'Cerca', 'Entrada', 'Saída', 'Permanência (min)', 'Endereço', 'Latitude entrada', 'Longitude entrada'];
  const linhas = async () => {
    const enderecos = await resolveAddresses(filtradas.map(({ p }: any) => p.enterPos as [number, number]));
    return filtradas.map(({ a, fe, p }: any, i: number) => [a.name, fe.name, fmtDT(p.enter), p.exit ? fmtDT(p.exit) : 'Ainda na cerca', Math.round(stayMs(p, t) / 60000), enderecos[i], p.enterPos[0], p.enterPos[1]]);
  };

  const resumoHead = ['Veículo', 'Placa', 'Passagens', 'Tempo total'];
  const resumoRows = () => [
    ...porVeiculo.map(({ a, n, ms }) => [a.name, a.plate || '—', n, hm(ms)]),
    ['Total', '', passagens.length, hm(tempoTotalMs)],
  ];

  const exportar = async (formato: ExportFormat) => {
    const rows = await linhas();
    if (!rows.length) return toast('Nada para exportar neste período.', { tone: 'crit' });
    const meta = { empresa: `${revenda.clientName} — Cercas`, periodo: `Período: ${periodoLabel}`, filtros: filtrosTxt, emitidoEm: fmtDT(Date.now()) };
    if (formato === 'csv') csv(nomeArq('csv'), head, rows);
    else if (formato === 'xlsx') xlsx(nomeArq('xlsx'), meta, head, rows);
    else pdf({
      file: pdfFileName('Cercas', f, t, aid ? assets.find((a: any) => a.id === aid)?.plate : undefined),
      titulo: 'Relatório de Cercas', cliente: revenda.clientName, usuario: session?.name || '—', role: session?.role || '—',
      meta: [
        { label: 'Período', value: periodoLabel },
        { label: 'Veículo', value: assets.find((a: any) => a.id === aid)?.name || 'Todos' },
        { label: 'Cerca', value: fences.find((x: any) => x.id === fenceId)?.name || 'Todas' },
        { label: 'Grupo', value: groups.find((g: any) => g.id === grp)?.name || 'Todos' },
      ],
      sections: [
        { title: 'Passagens nas cercas', head, rows },
        { title: 'Resumo por veículo', head: resumoHead, rows: resumoRows() },
      ],
      nota: 'Uma passagem vai da entrada à saída da cerca; veículos ainda dentro da cerca contam até o fim do período.',
    });
    toast(`Relatório de cercas gerado com ${rows.length} ${rows.length === 1 ? 'linha' : 'linhas'}.`);
  };

  return (
    <div>
      <PageHeader icon="relatorios" title="Cercas" subtitle="Veja as passagens da frota pelas cercas definidas e o tempo de permanência em cada local"
        crumbs={[{ label: 'Relatórios', to: '/relatorios' }, { label: 'Cercas' }]} />
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
          <StatTile icon="cerca" value={passagens.length} label="Passagens" sub="Entradas nas cercas" />
          <StatTile icon="ativos" value={veiculosNoPeriodo} label="Veículos" sub="Com passagens no período" />
          <StatTile icon="relogio" value={hm(tempoTotalMs)} label="de permanência total" sub="Soma do tempo em cercas" />
        </Grid>

        <Card dense className="h-[320px] md:h-[380px] overflow-hidden" variant="inset">
          <MapContainer center={fenceScope[0]?.center || [-8.1, -34.92]} zoom={13} className="w-full h-full rounded-card overflow-hidden">
            <TileLayer url={TILE} attribution={ATTR} keepBuffer={6} updateWhenZooming={false} />
            <FenceShapes fences={fenceScope} />
            {porVeiculo.map(({ a, n, ms }) => {
              const last = passagens.find((x: any) => x.a.id === a.id);
              if (!last) return null;
              return (
                <Marker key={a.id} position={last.p.enterPos}>
                  <Popup>
                    <strong>{last.fe.name}</strong><br />{n} {n === 1 ? 'passagem' : 'passagens'}<br />{hm(ms)}
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </Card>

        <Card title="Passagens nas cercas" subtitle="Lista de entradas e saídas da frota nas cercas, com o tempo de permanência e endereço."
          actions={<div className="w-56"><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por placa, cerca ou endereço…" /></div>}>
          <Table minWidth={760} pageSize={10} align={['left', 'left', 'left', 'left', 'right', 'left']}
            emptyState={<EmptyState illustration="ilu-cercas" layout="row" title="Nenhuma passagem por cerca no período" detail="Troque o período, a cerca ou os veículos." />}
            head={['Veículo', 'Cerca', 'Entrada', 'Saída', 'Permanência', 'Endereço']}
            rows={filtradas.map(({ a, fe, p }: any) => [
              <AssetName name={a.name} />, fe.name, <time className="num">{fmtDT(p.enter)}</time>,
              p.exit ? <time className="num">{fmtDT(p.exit)}</time> : <StatusDot kind="parado" label="Ainda na cerca" />,
              <span className="num">{hm(stayMs(p, t))}{p.gapFlagged && <span className="text-crit"> · sem sinal {GAP_MIN}+ min</span>}</span>,
              <Address pos={p.enterPos} className="text-small" />,
            ])} />
        </Card>

        <Card title="Resumo por veículo" subtitle="Total de passagens e tempo de permanência de cada veículo no período.">
          <Table minWidth={760} pageSize={10} align={['left', 'left', 'right', 'right']}
            emptyState={<EmptyState title="Nenhum veículo com passagens no período" />}
            head={['Veículo', 'Placa', 'Passagens', 'Tempo total']}
            rows={porVeiculo.map(({ a, n, ms }) => [<AssetName name={a.name} />, a.plate || '—', <span className="num">{n}</span>, <span className="num">{hm(ms)}</span>])} />
        </Card>
      </Stack>

      <ExportReportModal open={exportOpen} onClose={() => setExportOpen(false)} titulo="Cercas" periodo={periodoLabel}
        resumo={`${filtradas.length} ${filtradas.length === 1 ? 'passagem' : 'passagens'} · ${veiculosNoPeriodo} ${veiculosNoPeriodo === 1 ? 'veículo' : 'veículos'}`}
        itens={['Filtros aplicados', 'Registros de passagens por cerca', 'Resumo por veículo', 'Cabeçalho com nome da empresa e data de emissão']}
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
