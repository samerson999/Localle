import { useEffect, useMemo, useState } from 'react';
import { isRealAsset, useRelatorioApi, registrarRelatorio } from '../lib/localleApi';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from 'react-leaflet';
import { useStore, useStoreData } from '../lib/store';
import { useFiltrosRelatorio } from '../lib/useFiltrosRelatorio';
import { Button, Card, Field, Input, Select, SearchSelect, Table, EmptyState, Stack, Grid, Panel, PageHeader, toast } from '../components/ui';
import { TILE, ATTR, Address, pinIcon } from '../components/MapBits';
import { AssetName } from '../components/story';
import { Icon } from '../components/icons';
import { StatTile, BuscaChip } from '../components/RelatorioBits';
import { fmtDT, hm, DAY, toInputDT } from '@localle/shared/utils';
import { nearbyPasses } from '@localle/shared/nearbyStats';
import { csv, xlsx, pdf, pdfFileName } from '../lib/reportExport';
import { resolveAddresses } from '../lib/geocode';
import { ExportReportModal, type ExportFormat } from '../components/ExportReportModal';

// Relatório "Passou por aqui": clique no mapa para escolher um ponto e um raio; a lista mostra quais
// veículos passaram perto dele no período. Filtros e geração seguem o mesmo padrão das demais telas
// de relatório (RelatorioCercas).
function Clicks({ onClick }: { onClick: (pos: [number, number]) => void }) {
  useMapEvents({ click: (e) => onClick([e.latlng.lat, e.latlng.lng]) });
  return null;
}

export default function RelatorioPassouPorAqui() {
  const history = useStoreData(15000).history;
  const revenda = useStore((s) => s.revenda);
  const session = useStore((s) => s.session);

  const F = useFiltrosRelatorio();
  const { from, setFrom, to, setTo, grp, setGrp, aid, setAid, busca, setBusca, f, t, groups, scope } = F;
  const [centro, setCentro] = useState<[number, number] | null>(null);
  const [raio, setRaio] = useState(200);
  const [geradoEm, setGeradoEm] = useState(() => Date.now());
  const [exportOpen, setExportOpen] = useState(false);

  const posOf = (a: any) => ((history[a.id] || []) as any[]).filter((p: any) => p[0] >= f && p[0] <= t);

  // veículos reais: passagens calculadas na API (PostGIS + nearbyPasses); demais: aqui
  const api = useRelatorioApi<{ assetId: string; passagens: any[] }>('passou-por-aqui', { from: new Date(f).toISOString(), to: new Date(t).toISOString(), lat: centro?.[0], lon: centro?.[1], raio }, scope, !!centro);
  useEffect(() => { if (api.error) toast('Não foi possível carregar o relatório: ' + api.error, { tone: 'crit' }); }, [api.error]);
  const passagensTodos = useMemo(() => !centro ? [] : [
    ...scope.filter((a: any) => !isRealAsset(a)).flatMap((a: any) => nearbyPasses(posOf(a), centro, raio).map((p) => ({ a, p }))),
    ...api.rows.flatMap((r) => r.passagens.map((p) => ({ a: r.a, p }))),
  ].sort((x: any, y: any) => y.p.enter - x.p.enter), [scope.map((a: any) => a.id).join(), history, f, t, centro, raio, api.rows]);

  // a busca vale para o relatório inteiro: números, mapa, tabelas e arquivo exportado
  const passagens = passagensTodos.filter(({ a }: any) => F.casa(a));

  const veiculosNoPeriodo = new Set(passagens.map(({ a }: any) => a.id)).size;

  const porVeiculo = useMemo(() => {
    const m = new Map<string, { a: any; n: number; minDist: number }>();
    for (const { a, p } of passagens as any[]) {
      const cur = m.get(a.id) || { a, n: 0, minDist: Infinity };
      cur.n++; cur.minDist = Math.min(cur.minDist, p.minDist);
      m.set(a.id, cur);
    }
    return [...m.values()].sort((x, y) => y.n - x.n);
  }, [passagens]);

  const quick = (ms: number, label: string) => <Button variant="secondary" size="sm" onClick={() => { setFrom(toInputDT(ms)); setTo(toInputDT(Date.now())); }}>{label}</Button>;
  const limparFiltros = () => { F.limpar(); setCentro(null); setRaio(200); };

  const periodoLabel = `${fmtDT(f)} → ${fmtDT(t)}`;
  const filtrosTxt = F.filtrosTxt(`Raio: ${raio} m`);
  const nomeArq = (ext: string) => `passou-por-aqui-${from.slice(0, 10)}-a-${to.slice(0, 10)}.${ext}`;
  const head = ['Veículo', 'Entrada', 'Saída', 'Distância mínima (m)', 'Velocidade no ponto mais próximo (km/h)'];
  const linhas = () => passagens.map(({ a, p }: any) => [a.name, fmtDT(p.enter), fmtDT(p.exit), Math.round(p.minDist), Math.round(p.speedAtClosest)]);

  const resumoHead = ['Veículo', 'Placa', 'Passagens', 'Distância mínima'];
  const resumoRows = () => [
    ...porVeiculo.map(({ a, n, minDist }) => [a.name, a.plate || '—', n, `${Math.round(minDist)} m`]),
    ['Total', '', passagens.length, ''],
  ];

  const exportar = async (formato: ExportFormat) => {
    const rows = linhas();
    if (!rows.length) return toast('Nada para exportar neste período.', { tone: 'crit' });
    const endereco = centro ? (await resolveAddresses([centro]))[0] : '';
    const filtrosComEndereco = `${filtrosTxt} · Endereço: ${endereco || '—'}`;
    const meta = { empresa: `${revenda.clientName} — Passou por aqui`, periodo: `Período: ${periodoLabel}`, filtros: filtrosComEndereco, emitidoEm: fmtDT(Date.now()) };
    if (formato === 'csv') csv(nomeArq('csv'), head, rows);
    else if (formato === 'xlsx') await xlsx(nomeArq('xlsx'), meta, head, rows, [{ title: 'Resumo por veículo', head: resumoHead, rows: resumoRows() }], 'Passagens pelo ponto');
    else await pdf({
      file: pdfFileName('Passou por aqui', f, t, aid ? F.veiculo?.plate : undefined),
      titulo: 'Relatório Passou por Aqui', cliente: revenda.clientName, usuario: session?.name || '—', role: session?.role || '—',
      meta: [
        { label: 'Período', value: periodoLabel },
        { label: 'Ponto', value: centro ? `${centro[0].toFixed(4)}, ${centro[1].toFixed(4)}` : '—' },
        { label: 'Endereço do ponto', value: endereco || '—' },
        { label: 'Raio', value: `${raio} m` },
        { label: 'Veículo', value: F.veiculo?.name || 'Todos' },
        { label: 'Grupo', value: F.grupoNome || 'Todos' },
        ...(busca.trim() ? [{ label: 'Busca', value: busca.trim() }] : []),
      ],
      sections: [
        { title: 'Passagens pelo ponto', head, rows },
        { title: 'Resumo por veículo', head: resumoHead, rows: resumoRows() },
      ],
      nota: 'Uma passagem é uma sequência contínua de posições dentro do raio; passagens do mesmo veículo separadas por mais de 5 minutos contam em separado.',
    });
    registrarRelatorio({ tipo: 'passou_por_aqui', inicio: f, fim: t, filtros: filtrosTxt, registros: rows.length, formato });
    toast(`Relatório gerado com ${rows.length} ${rows.length === 1 ? 'linha' : 'linhas'}.`);
  };

  return (
    <div>
      <PageHeader icon="alvo" title="Passou por aqui" subtitle="Clique no mapa para escolher um ponto e veja quais veículos passaram por perto"
        crumbs={[{ label: 'Relatórios', to: '/relatorios' }, { label: 'Passou por aqui' }]} />
      <Stack gap="grid">
        <Card>
          <div className="flex flex-wrap items-end gap-field">
            <Field label="Período"><div className="flex items-center gap-tight max-md:flex-col max-md:items-stretch"><Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /><Icon name="chevron" size={16} className="text-ink-3 shrink-0 max-md:hidden" /><Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></div></Field>
            <Field label="Veículos" className="w-64"><SearchSelect value={aid} onChange={setAid} placeholder="Todos os veículos"
              options={F.opcoesVeiculo.map((a: any) => ({ value: a.id, label: a.name, sub: a.plate }))} /></Field>
            <Field label="Grupo de veículos"><Select value={grp} onChange={(e) => setGrp(e.target.value)} options={[{ value: '', label: 'Todos os grupos' }, ...groups.map((g: any) => ({ value: g.id, label: g.name }))]} /></Field>
            <Field label="Raio" className="w-32"><Input type="number" value={raio} onChange={(e) => setRaio(+e.target.value || 0)} /></Field>
            <div className="flex gap-tight">{quick(new Date().setHours(0, 0, 0, 0), 'Hoje')}{quick(Date.now() - DAY, '24 h')}{quick(Date.now() - 7 * DAY, '7 dias')}</div>
            <span className="flex-1" />
            <Button variant="primary" disabled={!centro} onClick={() => { setGeradoEm(Date.now()); setExportOpen(true); }}><Icon name="play" size={16} />Gerar relatório</Button>
          </div>
        </Card>

        <Panel tone="muted" className="flex flex-wrap items-center gap-stack">
          <span className="text-small font-medium text-ink-2">Filtros aplicados</span>
          <span className="flex items-center gap-tight text-small text-ink"><Icon name="calendario" size={16} className="text-ink-2" />{periodoLabel}</span>
          <span className="flex items-center gap-tight text-small text-ink"><Icon name="ativos" size={16} className="text-ink-2" />{F.veiculo?.name || 'Todos os veículos'}</span>
          <span className="flex items-center gap-tight text-small text-ink"><Icon name="equipe" size={16} className="text-ink-2" />{F.grupoNome || 'Todos os grupos'}</span>
          <span className="flex items-center gap-tight text-small text-ink"><Icon name="alvo" size={16} className="text-ink-2" />{centro ? `${raio} m do ponto escolhido` : 'Nenhum ponto escolhido'}</span>
          <BuscaChip busca={busca} />
          <span className="ml-auto text-caption text-ink-2">Relatório gerado em {fmtDT(geradoEm)}</span>
          <Button variant="quiet" size="sm" onClick={limparFiltros}><Icon name="reiniciar" size={14} />Limpar filtros</Button>
        </Panel>

        <Grid cols={3} equal>
          <StatTile icon="alvo" value={passagens.length} label="Passagens" sub="Dentro do raio escolhido" />
          <StatTile icon="ativos" value={veiculosNoPeriodo} label="Veículos" sub="Com passagens no período" />
          <StatTile icon="rota" value={`${raio} m`} label="de raio" sub="Área considerada" />
        </Grid>

        <Card dense className="h-[320px] md:h-[380px] overflow-hidden" variant="inset">
          <MapContainer center={centro || [-8.1, -34.92]} zoom={14} className="w-full h-full rounded-card overflow-hidden cursor-crosshair">
            <TileLayer url={TILE} attribution={ATTR} keepBuffer={6} updateWhenZooming={false} />
            <Clicks onClick={setCentro} />
            {centro && <>
              <Marker position={centro} icon={pinIcon()} />
              <Circle center={centro} radius={raio} pathOptions={{ color: 'var(--real)' }} />
            </>}
          </MapContainer>
        </Card>
        {!centro && <Panel tone="muted" className="flex items-center gap-tight text-small text-ink-2"><Icon name="alvo" size={16} />Clique em um ponto do mapa para escolher onde buscar as passagens.</Panel>}

        <Card title="Passagens pelo ponto" subtitle="Lista de veículos que passaram dentro do raio escolhido, com a distância mínima atingida."
          actions={<div className="w-56"><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por veículo, placa ou apelido…" aria-label="Buscar no relatório" /></div>}>
          <Table minWidth={760} pageSize={10} align={['left', 'left', 'left', 'right', 'right']}
            emptyState={<EmptyState icon="alvo" illustration={centro ? 'ilu-periodo-vazio' : undefined} layout="row" title={centro ? 'Nenhuma passagem no período' : 'Escolha um ponto no mapa'} detail={centro ? 'Troque o período, o raio ou os veículos.' : 'Clique no mapa acima para definir onde buscar.'} />}
            head={['Veículo', 'Entrada', 'Saída', 'Distância mínima', 'Velocidade']}
            rows={passagens.map(({ a, p }: any) => [
              <AssetName name={a.name} />, <time className="num">{fmtDT(p.enter)}</time>, <time className="num">{fmtDT(p.exit)}</time>,
              <span className="num">{Math.round(p.minDist)} m</span>,
              <span className="num">{Math.round(p.speedAtClosest)} km/h</span>,
            ])} />
        </Card>

        <Card title="Resumo por veículo" subtitle="Total de passagens e menor distância atingida por cada veículo no período.">
          <Table minWidth={760} pageSize={10} align={['left', 'left', 'right', 'right']}
            emptyState={<EmptyState title="Nenhum veículo com passagens no período" />}
            head={['Veículo', 'Placa', 'Passagens', 'Distância mínima']}
            rows={porVeiculo.map(({ a, n, minDist }) => [<AssetName name={a.name} />, a.plate || '—', <span className="num">{n}</span>, <span className="num">{Math.round(minDist)} m</span>])} />
        </Card>
      </Stack>

      <ExportReportModal open={exportOpen} onClose={() => setExportOpen(false)} titulo="Passou por aqui" periodo={periodoLabel}
        resumo={`${passagens.length} ${passagens.length === 1 ? 'passagem' : 'passagens'} · ${veiculosNoPeriodo} ${veiculosNoPeriodo === 1 ? 'veículo' : 'veículos'}`}
        itens={['Filtros aplicados', 'Registros de passagens pelo ponto escolhido', 'Resumo por veículo', 'Cabeçalho com nome da empresa e data de emissão']}
        onExport={exportar} />
    </div>
  );
}
