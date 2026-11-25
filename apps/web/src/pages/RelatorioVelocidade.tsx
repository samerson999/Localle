import { useEffect, useMemo, useState } from 'react';
import { isRealAsset, useRelatorioApi, registrarRelatorio } from '../lib/localleApi';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { useStore, useStoreData } from '../lib/store';
import { useFiltrosRelatorio } from '../lib/useFiltrosRelatorio';
import { Button, Card, Field, Input, Select, SearchSelect, Table, EmptyState, Stack, Grid, Panel, PageHeader, toast } from '../components/ui';
import { TILE, ATTR, Address, pinIcon } from '../components/MapBits';
import { AssetName } from '../components/story';
import { Icon } from '../components/icons';
import { StatTile, BuscaChip } from '../components/RelatorioBits';
import { fmtDT, hm, DAY, toInputDT } from '@localle/shared/utils';
import { speedLegs } from '@localle/shared/speedStats';
import { csv, xlsx, pdf, pdfFileName, fmtCoord } from '../lib/reportExport';
import { resolveAddresses } from '../lib/geocode';
import { ExportReportModal, type ExportFormat } from '../components/ExportReportModal';

// Relatório de Velocidade: trechos contínuos acima de uma velocidade mínima configurável, com duração
// mínima para ignorar picos isolados. Filtros e geração (exportar PDF/XLSX/CSV) seguem o mesmo padrão
// das demais telas de relatório (RelatorioCercas).
export default function RelatorioVelocidade() {
  const history = useStoreData(15000).history;
  const revenda = useStore((s) => s.revenda);
  const session = useStore((s) => s.session);

  const F = useFiltrosRelatorio();
  const { from, setFrom, to, setTo, grp, setGrp, aid, setAid, busca, setBusca, f, t, groups, scope } = F;
  const [minSpeed, setMinSpeed] = useState(80);
  const [geradoEm, setGeradoEm] = useState(() => Date.now());
  const [exportOpen, setExportOpen] = useState(false);

  const posOf = (a: any) => ((history[a.id] || []) as any[]).filter((p: any) => p[0] >= f && p[0] <= t);

  // veículos reais: trechos calculados na API (mesma speedLegs, sobre as posições do banco); demais: aqui
  const api = useRelatorioApi<{ assetId: string; legs: any[] }>('velocidade', { from: new Date(f).toISOString(), to: new Date(t).toISOString(), minSpeed }, scope);
  useEffect(() => { if (api.error) toast('Não foi possível carregar o relatório: ' + api.error, { tone: 'crit' }); }, [api.error]);
  const trechosTodos = useMemo(() => [
    ...scope.filter((a: any) => !isRealAsset(a)).flatMap((a: any) => speedLegs(posOf(a), minSpeed).map((leg) => ({ a, leg }))),
    ...api.rows.flatMap((r) => r.legs.map((leg) => ({ a: r.a, leg }))),
  ].sort((x: any, y: any) => y.leg.vmax - x.leg.vmax), [scope.map((a: any) => a.id).join(), history, f, t, minSpeed, api.rows]);

  // a busca vale para o relatório inteiro: números, mapa, tabelas e arquivo exportado
  const trechos = trechosTodos.filter(({ a }: any) => F.casa(a));

  const veiculosNoPeriodo = new Set(trechos.map(({ a }: any) => a.id)).size;
  const vmaxGeral = trechos.reduce((m: number, { leg }: any) => Math.max(m, leg.vmax), 0);

  const porVeiculo = useMemo(() => {
    const m = new Map<string, { a: any; n: number; vmax: number }>();
    for (const { a, leg } of trechos as any[]) {
      const cur = m.get(a.id) || { a, n: 0, vmax: 0 };
      cur.n++; cur.vmax = Math.max(cur.vmax, leg.vmax);
      m.set(a.id, cur);
    }
    return [...m.values()].sort((x, y) => y.vmax - x.vmax);
  }, [trechos]);

  const quick = (ms: number, label: string) => <Button variant="secondary" size="sm" onClick={() => { setFrom(toInputDT(ms)); setTo(toInputDT(Date.now())); }}>{label}</Button>;
  const limparFiltros = () => { F.limpar(); setMinSpeed(80); };

  const periodoLabel = `${fmtDT(f)} → ${fmtDT(t)}`;
  const filtrosTxt = F.filtrosTxt(`Velocidade mínima: ${minSpeed} km/h`);
  const nomeArq = (ext: string) => `velocidade-${from.slice(0, 10)}-a-${to.slice(0, 10)}.${ext}`;
  const head = ['Veículo', 'Início', 'Fim', 'Vel. máxima (km/h)', 'Vel. média (km/h)', 'Endereço', 'Latitude', 'Longitude'];
  const linhas = async () => {
    const enderecos = await resolveAddresses(trechos.map(({ leg }: any) => leg.maxPos as [number, number]));
    return trechos.map(({ a, leg }: any, i: number) => [a.name, fmtDT(leg.start), fmtDT(leg.end), Math.round(leg.vmax), Math.round(leg.vavg), enderecos[i], fmtCoord(leg.maxPos[0]), fmtCoord(leg.maxPos[1])]);
  };

  const resumoHead = ['Veículo', 'Placa', 'Trechos', 'Vel. máxima'];
  const resumoRows = () => [
    ...porVeiculo.map(({ a, n, vmax }) => [a.name, a.plate || '—', n, `${Math.round(vmax)} km/h`]),
    ['Total', '', trechos.length, `${Math.round(vmaxGeral)} km/h`],
  ];

  const exportar = async (formato: ExportFormat) => {
    const rows = await linhas();
    if (!rows.length) return toast('Nada para exportar neste período.', { tone: 'crit' });
    const meta = { empresa: `${revenda.clientName} — Velocidade`, periodo: `Período: ${periodoLabel}`, filtros: filtrosTxt, emitidoEm: fmtDT(Date.now()) };
    if (formato === 'csv') csv(nomeArq('csv'), head, rows);
    else if (formato === 'xlsx') await xlsx(nomeArq('xlsx'), meta, head, rows, [{ title: 'Resumo por veículo', head: resumoHead, rows: resumoRows() }], 'Trechos acima do limite');
    else await pdf({
      file: pdfFileName('Velocidade', f, t, aid ? F.veiculo?.plate : undefined),
      titulo: 'Relatório de Velocidade', cliente: revenda.clientName, usuario: session?.name || '—', role: session?.role || '—',
      meta: [
        { label: 'Período', value: periodoLabel },
        { label: 'Veículo', value: F.veiculo?.name || 'Todos' },
        { label: 'Grupo', value: F.grupoNome || 'Todos' },
        ...(busca.trim() ? [{ label: 'Busca', value: busca.trim() }] : []),
        { label: 'Velocidade mínima', value: `${minSpeed} km/h` },
      ],
      sections: [
        { title: 'Trechos acima do limite', head, rows },
        { title: 'Resumo por veículo', head: resumoHead, rows: resumoRows() },
      ],
      nota: 'Um trecho é um período contínuo acima da velocidade mínima configurada.',
    });
    registrarRelatorio({ tipo: 'velocidade', inicio: f, fim: t, filtros: filtrosTxt, registros: rows.length, formato });
    toast(`Relatório de velocidade gerado com ${rows.length} ${rows.length === 1 ? 'linha' : 'linhas'}.`);
  };

  return (
    <div>
      <PageHeader icon="velocimetro" title="Velocidade" subtitle="Identifique excessos de velocidade e analise os trechos mais críticos da frota"
        crumbs={[{ label: 'Relatórios', to: '/relatorios' }, { label: 'Velocidade' }]} />
      <Stack gap="grid">
        <Card>
          <div className="flex flex-wrap items-end gap-field">
            <Field label="Período"><div className="flex items-center gap-tight max-md:flex-col max-md:items-stretch"><Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /><Icon name="chevron" size={16} className="text-ink-3 shrink-0 max-md:hidden" /><Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></div></Field>
            <Field label="Veículos" className="w-64"><SearchSelect value={aid} onChange={setAid} placeholder="Todos os veículos"
              options={F.opcoesVeiculo.map((a: any) => ({ value: a.id, label: a.name, sub: a.plate }))} /></Field>
            <Field label="Grupo de veículos"><Select value={grp} onChange={(e) => setGrp(e.target.value)} options={[{ value: '', label: 'Todos os grupos' }, ...groups.map((g: any) => ({ value: g.id, label: g.name }))]} /></Field>
            <Field label="Velocidade mínima" className="w-32"><Input type="number" value={minSpeed} onChange={(e) => setMinSpeed(+e.target.value || 0)} /></Field>
            <div className="flex gap-tight">{quick(new Date().setHours(0, 0, 0, 0), 'Hoje')}{quick(Date.now() - DAY, '24 h')}{quick(Date.now() - 7 * DAY, '7 dias')}</div>
            <span className="flex-1" />
            <Button variant="primary" onClick={() => { setGeradoEm(Date.now()); setExportOpen(true); }}><Icon name="play" size={16} />Gerar relatório</Button>
          </div>
        </Card>

        <Panel tone="muted" className="flex flex-wrap items-center gap-stack">
          <span className="text-small font-medium text-ink-2">Filtros aplicados</span>
          <span className="flex items-center gap-tight text-small text-ink"><Icon name="calendario" size={16} className="text-ink-2" />{periodoLabel}</span>
          <span className="flex items-center gap-tight text-small text-ink"><Icon name="ativos" size={16} className="text-ink-2" />{F.veiculo?.name || 'Todos os veículos'}</span>
          <span className="flex items-center gap-tight text-small text-ink"><Icon name="equipe" size={16} className="text-ink-2" />{F.grupoNome || 'Todos os grupos'}</span>
          <span className="flex items-center gap-tight text-small text-ink"><Icon name="velocimetro" size={16} className="text-ink-2" />Acima de {minSpeed} km/h</span>
          <BuscaChip busca={busca} />
          <span className="ml-auto text-caption text-ink-2">Relatório gerado em {fmtDT(geradoEm)}</span>
          <Button variant="quiet" size="sm" onClick={limparFiltros}><Icon name="reiniciar" size={14} />Limpar filtros</Button>
        </Panel>

        <Grid cols={3} equal>
          <StatTile icon="velocimetro" value={trechos.length} label="Trechos" sub="Acima da velocidade mínima" />
          <StatTile icon="ativos" value={veiculosNoPeriodo} label="Veículos" sub="Com excessos no período" />
          <StatTile icon="alerta" value={`${Math.round(vmaxGeral)} km/h`} label="velocidade máxima" sub="Maior pico registrado" />
        </Grid>

        <Card dense className="h-[320px] md:h-[380px] overflow-hidden" variant="inset">
          <MapContainer center={trechos[0]?.leg.maxPos || [-8.1, -34.92]} zoom={12} className="w-full h-full rounded-card overflow-hidden">
            <TileLayer url={TILE} attribution={ATTR} keepBuffer={6} updateWhenZooming={false} />
            {porVeiculo.map(({ a, n, vmax }) => {
              const pico = trechos.find((x: any) => x.a.id === a.id && x.leg.vmax === vmax);
              if (!pico) return null;
              return (
                <Marker key={a.id} position={pico.leg.maxPos} icon={pinIcon()}>
                  <Popup>
                    <strong>{a.name}</strong><br />{Math.round(vmax)} km/h<br />{n} {n === 1 ? 'trecho' : 'trechos'}
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </Card>

        <Card title="Trechos acima do limite" subtitle="Lista dos trechos contínuos acima da velocidade mínima, com pico e média."
          actions={<div className="w-56"><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por veículo, placa ou apelido…" aria-label="Buscar no relatório" /></div>}>
          <Table minWidth={760} pageSize={10} align={['left', 'left', 'left', 'right', 'right', 'left']}
            emptyState={<EmptyState illustration="ilu-tudo-em-dia" layout="row" title="Nenhum excesso de velocidade no período" detail="Troque o período, os veículos ou a velocidade mínima." />}
            head={['Veículo', 'Início', 'Fim', 'Vel. máxima', 'Vel. média', 'Local do pico']}
            rows={trechos.map(({ a, leg }: any) => [
              <AssetName name={a.name} />, <time className="num">{fmtDT(leg.start)}</time>, <time className="num">{fmtDT(leg.end)}</time>,
              <span className="num text-crit font-medium">{Math.round(leg.vmax)} km/h</span>,
              <span className="num">{Math.round(leg.vavg)} km/h</span>,
              <Address pos={leg.maxPos} className="text-small" />,
            ])} />
        </Card>

        <Card title="Resumo por veículo" subtitle="Quantidade de trechos e velocidade máxima de cada veículo no período.">
          <Table minWidth={760} pageSize={10} align={['left', 'left', 'right', 'right']}
            emptyState={<EmptyState title="Nenhum veículo com excessos no período" />}
            head={['Veículo', 'Placa', 'Trechos', 'Vel. máxima']}
            rows={porVeiculo.map(({ a, n, vmax }) => [<AssetName name={a.name} />, a.plate || '—', <span className="num">{n}</span>, <span className="num">{Math.round(vmax)} km/h</span>])} />
        </Card>
      </Stack>

      <ExportReportModal open={exportOpen} onClose={() => setExportOpen(false)} titulo="Velocidade" periodo={periodoLabel}
        resumo={`${trechos.length} ${trechos.length === 1 ? 'trecho' : 'trechos'} · ${veiculosNoPeriodo} ${veiculosNoPeriodo === 1 ? 'veículo' : 'veículos'}`}
        itens={['Filtros aplicados', 'Registros de trechos acima da velocidade mínima', 'Resumo por veículo', 'Cabeçalho com nome da empresa e data de emissão']}
        onExport={exportar} />
    </div>
  );
}
