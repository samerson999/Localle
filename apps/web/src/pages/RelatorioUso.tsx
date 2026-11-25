import { useEffect, useMemo, useState } from 'react';
import { routeStats } from '@localle/shared/routeStats';
import { fmtDT, hm, DAY, toInputDT } from '@localle/shared/utils';
import { hmOuTraco } from '../lib/relatorioPosicoes';
import { useStore, useStoreData } from '../lib/store';
import { useFiltrosRelatorio } from '../lib/useFiltrosRelatorio';
import { isRealAsset, useRelatorioApi, registrarRelatorio } from '../lib/localleApi';
import { Button, Card, Field, Input, Select, SearchSelect, Table, EmptyState, Stack, Grid, Panel, PageHeader, toast } from '../components/ui';
import { AssetName } from '../components/story';
import { Icon } from '../components/icons';
import { StatTile, BuscaChip } from '../components/RelatorioBits';
import { csv, xlsx, pdf, pdfFileName } from '../lib/reportExport';
import { ExportReportModal, type ExportFormat } from '../components/ExportReportModal';

// Uso da frota: km rodado, tempo em movimento, motor ligado, parado com motor ligado (ocioso) e paradas,
// por veículo. Veículos reais: calculado na API (GET /reports/percurso, routeStats sobre as posições do
// banco); demais: routeStats aqui sobre o histórico local — a mesma função nos dois casos.
export default function RelatorioUso() {
  const history = useStoreData(15000).history;
  const revenda = useStore((s) => s.revenda);
  const session = useStore((s) => s.session);

  const F = useFiltrosRelatorio();
  const { from, setFrom, to, setTo, grp, setGrp, aid, setAid, busca, setBusca, f, t, groups, scope } = F;
  const [geradoEm, setGeradoEm] = useState(() => Date.now());
  const [exportOpen, setExportOpen] = useState(false);

  const posOf = (a: any) => ((history[a.id] || []) as any[]).filter((p: any) => p[0] >= f && p[0] <= t);

  const api = useRelatorioApi<{ assetId: string; posicoes: number; stats: any }>('percurso', { from: new Date(f).toISOString(), to: new Date(t).toISOString() }, scope);
  useEffect(() => { if (api.error) toast('Não foi possível carregar o relatório: ' + api.error, { tone: 'crit' }); }, [api.error]);

  const todos = useMemo(() => [
    ...scope.filter((a: any) => !isRealAsset(a)).map((a: any) => ({ a, stats: routeStats(posOf(a)), n: posOf(a).length })),
    ...api.rows.map((r) => ({ a: r.a, stats: r.stats, n: r.posicoes })),
  ].filter((x) => x.n).sort((x, y) => y.stats.dist - x.stats.dist), [scope.map((a: any) => a.id).join(), history, f, t, api.rows]);

  // a busca vale para o relatório inteiro: números, tabela, total e arquivo exportado
  const porVeiculo = todos.filter(({ a }: any) => F.casa(a));

  const soma = (k: 'dist' | 'moving') => porVeiculo.reduce((s, x) => s + x.stats[k], 0);
  // motor/ocioso: só dos veículos cujo rastreador informa ignição; nenhum informa → desconhecido ("—"), não 0
  const somaIgnicao = (k: 'engineOn' | 'idle') => { const vs = porVeiculo.map((x) => x.stats[k] as number | null).filter((v): v is number => v !== null); return vs.length ? vs.reduce((s, v) => s + v, 0) : null; };
  const paradasTotal = porVeiculo.reduce((s, x) => s + x.stats.stops.length, 0);
  const tempoParado = (st: any) => st.stops.reduce((s: number, p: any) => s + (p.end - p.ts), 0);

  const quick = (ms: number, label: string) => <Button variant="secondary" size="sm" onClick={() => { setFrom(toInputDT(ms)); setTo(toInputDT(Date.now())); }}>{label}</Button>;
  const limparFiltros = F.limpar;

  const periodoLabel = `${fmtDT(f)} → ${fmtDT(t)}`;
  const filtrosTxt = F.filtrosTxt();
  const nomeArq = (ext: string) => `uso-da-frota-${from.slice(0, 10)}-a-${to.slice(0, 10)}.${ext}`;
  const head = ['Veículo', 'Placa', 'Km', 'Em movimento', 'Motor ligado', 'Ocioso (parado ligado)', 'Paradas', 'Tempo parado', 'Vel. máxima'];
  const linha = ({ a, stats }: any) => [a.name, a.plate || '—', Math.round(stats.dist * 10) / 10, hm(stats.moving), hmOuTraco(stats.engineOn), hmOuTraco(stats.idle), stats.stops.length, hm(tempoParado(stats)), `${Math.round(stats.vmax)} km/h`];
  const linhas = () => [...porVeiculo.map(linha), ['Total', '', Math.round(soma('dist') * 10) / 10, hm(soma('moving')), hmOuTraco(somaIgnicao('engineOn')), hmOuTraco(somaIgnicao('idle')), paradasTotal, '', '']];

  const exportar = async (formato: ExportFormat) => {
    if (!porVeiculo.length) return toast('Nada para exportar neste período.', { tone: 'crit' });
    const rows = linhas();
    const meta = { empresa: `${revenda.clientName} — Uso da frota`, periodo: `Período: ${periodoLabel}`, filtros: filtrosTxt, emitidoEm: fmtDT(Date.now()) };
    if (formato === 'csv') csv(nomeArq('csv'), head, rows);
    else if (formato === 'xlsx') await xlsx(nomeArq('xlsx'), meta, head, rows, [], 'Uso por veículo');
    else await pdf({
      file: pdfFileName('Uso da frota', f, t, aid ? F.veiculo?.plate : undefined),
      titulo: 'Relatório de Uso da Frota', cliente: revenda.clientName, usuario: session?.name || '—', role: session?.role || '—',
      meta: [
        { label: 'Período', value: periodoLabel },
        { label: 'Veículo', value: F.veiculo?.name || 'Todos' },
        { label: 'Grupo', value: F.grupoNome || 'Todos' },
        ...(busca.trim() ? [{ label: 'Busca', value: busca.trim() }] : []),
      ],
      sections: [{ title: 'Uso por veículo', head, rows }],
      nota: 'Parada = mais de 5 min a até 3 km/h. Ocioso = parado com a ignição ligada.',
    });
    registrarRelatorio({ tipo: 'uso', inicio: f, fim: t, filtros: filtrosTxt, registros: porVeiculo.length, formato });
    toast(`Relatório de uso gerado com ${porVeiculo.length} ${porVeiculo.length === 1 ? 'veículo' : 'veículos'}.`);
  };

  return (
    <div>
      <PageHeader icon="odometro" title="Uso da frota" subtitle="Km rodado, motor ligado, ociosidade e paradas por veículo"
        crumbs={[{ label: 'Relatórios', to: '/relatorios' }, { label: 'Uso da frota' }]} />
      <Stack gap="grid">
        <Card>
          <div className="flex flex-wrap items-end gap-field">
            <Field label="Período"><div className="flex items-center gap-tight max-md:flex-col max-md:items-stretch"><Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /><Icon name="chevron" size={16} className="text-ink-3 shrink-0 max-md:hidden" /><Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></div></Field>
            <Field label="Veículos" className="w-64"><SearchSelect value={aid} onChange={setAid} placeholder="Todos os veículos"
              options={F.opcoesVeiculo.map((a: any) => ({ value: a.id, label: a.name, sub: a.plate }))} /></Field>
            <Field label="Grupo de veículos"><Select value={grp} onChange={(e) => setGrp(e.target.value)} options={[{ value: '', label: 'Todos os grupos' }, ...groups.map((g: any) => ({ value: g.id, label: g.name }))]} /></Field>
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
          <BuscaChip busca={busca} />
          <span className="ml-auto text-caption text-ink-2">Relatório gerado em {fmtDT(geradoEm)}</span>
          <Button variant="quiet" size="sm" onClick={limparFiltros}><Icon name="reiniciar" size={14} />Limpar filtros</Button>
        </Panel>

        <Grid cols={4} equal>
          <StatTile icon="odometro" value={`${Math.round(soma('dist'))} km`} label="rodados" sub={`${porVeiculo.length} ${porVeiculo.length === 1 ? 'veículo' : 'veículos'} no período`} />
          <StatTile icon="relogio" value={hmOuTraco(somaIgnicao('engineOn'))} label="motor ligado" sub={`${hm(soma('moving'))} em movimento`} />
          <StatTile icon="alerta" value={hmOuTraco(somaIgnicao('idle'))} label="ocioso" sub="Parado com a ignição ligada" />
          <StatTile icon="pause" value={paradasTotal} label="paradas" sub="Mais de 5 min parado" />
        </Grid>

        <Card title="Uso por veículo" subtitle={api.loading ? 'Carregando os dados do período…' : 'Ordenado pelo km rodado.'}
          actions={<div className="w-56"><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por veículo, placa ou apelido…" aria-label="Buscar no relatório" /></div>}>
          <Table head={head}
            emptyState={<EmptyState illustration="ilu-periodo-vazio" title="Nenhum veículo com posições no período" detail="Ajuste o período ou os filtros." />}
            rows={porVeiculo.map((x: any) => { const l = linha(x); return [<AssetName name={x.a.name} />, ...l.slice(1).map((v: any, i: number) => <span key={i} className={i > 0 ? 'num' : ''}>{i === 1 ? `${v} km` : v}</span>)]; })} />
        </Card>
      </Stack>

      <ExportReportModal open={exportOpen} onClose={() => setExportOpen(false)} titulo="Uso da frota" periodo={periodoLabel}
        resumo={`${porVeiculo.length} ${porVeiculo.length === 1 ? 'veículo' : 'veículos'} · ${Math.round(soma('dist'))} km`}
        itens={['Filtros aplicados', 'Km, motor ligado, ociosidade e paradas por veículo', 'Cabeçalho com nome da empresa e data de emissão']}
        onExport={exportar} />
    </div>
  );
}

