import { useEffect, useState } from 'react';
import { fmtD, fmtDT, fmtT, hm, DAY, toInputDT } from '@localle/shared/utils';
import { hmOuTraco } from '../lib/relatorioPosicoes';
import { useStore } from '../lib/store';
import { useFiltrosRelatorio } from '../lib/useFiltrosRelatorio';
import { useRelatorioApi, registrarRelatorio } from '../lib/localleApi';
import { Button, Card, Field, Input, Select, SearchSelect, Table, EmptyState, Stack, Grid, Panel, PageHeader, toast } from '../components/ui';
import { AssetName } from '../components/story';
import { Icon } from '../components/icons';
import { StatTile, BuscaChip } from '../components/RelatorioBits';
import { csv, xlsx, pdf, pdfFileName } from '../lib/reportExport';
import { ExportReportModal, type ExportFormat } from '../components/ExportReportModal';

/** Linha de GET /reports/motoristas: um motorista num veículo num dia (apps/api/src/reports/jornada-motorista.ts). */
interface LinhaMotorista {
  motoristaId: string | null; motorista: string | null; codigo: string | null; assetId: string; plate: string; dia: string;
  primeiraIgnicao: number; ultimoDesligamento: number | null; jornadaMs: number; motorLigadoMs: number | null; emMovimentoMs: number;
  ociosoMs: number | null; km: number; paradas: number; tempoParadoMs: number; ignicoes: number; vmax: number;
}

const nomeDe = (r: LinhaMotorista) => r.motorista || `Cartão ${r.codigo || '?'} (sem cadastro)`;
const km1 = (v: number) => Math.round(v * 10) / 10;
const somaOuNull = (vs: (number | null)[]) => { const ns = vs.filter((v): v is number => v !== null); return ns.length ? ns.reduce((s, v) => s + v, 0) : null; };

// Motoristas: quem dirigiu vem do cartão lido pelo rastreador (motorista_vinculos). Uma linha por motorista × veículo ×
// dia — primeira ignição, último desligamento, jornada entre os dois, motor ligado, km e paradas — e o total do período
// por motorista. Só veículos reais: sem cartão lido não há motorista para atribuir.
export default function RelatorioMotoristas() {
  const revenda = useStore((s) => s.revenda);
  const session = useStore((s) => s.session);
  const drivers = useStore((s) => s.drivers);
  const inativos = useStore((s) => (s as any).driversInativos) as any[] | undefined;

  const F = useFiltrosRelatorio();
  const { from, setFrom, to, setTo, grp, setGrp, aid, setAid, busca, setBusca, f, t, groups, scope } = F;
  const [mot, setMot] = useState('');
  const [geradoEm, setGeradoEm] = useState(() => Date.now());
  const [exportOpen, setExportOpen] = useState(false);
  const motoristas = [...(drivers || []), ...(inativos || [])];
  const motorista = motoristas.find((d: any) => d.id === mot);

  const api = useRelatorioApi<LinhaMotorista>('motoristas', { from: new Date(f).toISOString(), to: new Date(t).toISOString(), motoristaIds: mot || null }, scope);
  useEffect(() => { if (api.error) toast('Não foi possível carregar o relatório: ' + api.error, { tone: 'crit' }); }, [api.error]);

  // a busca vale para o relatório inteiro: números, tabelas e arquivo exportado
  const linhas = api.rows.filter((r) => F.casa(r.a, nomeDe(r), r.codigo));

  const porMotorista = [...linhas.reduce((m, r) => {
    const k = r.motoristaId || `codigo:${r.codigo}`;
    const x = m.get(k) || { nome: nomeDe(r), dias: new Set<string>(), veiculos: new Set<string>(), km: 0, jornada: 0, motor: [] as (number | null)[], paradas: 0, ignicoes: 0 };
    x.dias.add(r.dia); x.veiculos.add(r.assetId); x.km += r.km; x.jornada += r.jornadaMs; x.motor.push(r.motorLigadoMs); x.paradas += r.paradas; x.ignicoes += r.ignicoes;
    return m.set(k, x);
  }, new Map<string, any>()).values()].sort((a, b) => b.km - a.km);

  const totalKm = linhas.reduce((s, r) => s + r.km, 0);
  const totalMotor = somaOuNull(linhas.map((r) => r.motorLigadoMs));
  const totalJornada = linhas.reduce((s, r) => s + r.jornadaMs, 0);
  const totalParadas = linhas.reduce((s, r) => s + r.paradas, 0);

  const quick = (ms: number, label: string) => <Button variant="secondary" size="sm" onClick={() => { setFrom(toInputDT(ms)); setTo(toInputDT(Date.now())); }}>{label}</Button>;
  const limparFiltros = () => { F.limpar(); setMot(''); };

  const periodoLabel = `${fmtDT(f)} → ${fmtDT(t)}`;
  const filtrosTxt = F.filtrosTxt(`Motorista: ${motorista?.name || 'todos'}`);
  const nomeArq = (ext: string) => `motoristas-${from.slice(0, 10)}-a-${to.slice(0, 10)}.${ext}`;
  const dia = (d: string) => fmtD(`${d}T12:00:00`);
  const desligou = (r: LinhaMotorista) => (r.ultimoDesligamento === null ? 'ligado' : fmtT(r.ultimoDesligamento));

  const head = ['Dia', 'Motorista', 'Veículo', 'Placa', '1ª ignição', 'Último desligamento', 'Jornada', 'Motor ligado', 'Ocioso', 'Km', 'Paradas', 'Ignições', 'Vel. máxima'];
  const linha = (r: LinhaMotorista & { a: any }) => [dia(r.dia), nomeDe(r), r.a.name, r.plate || '—', fmtT(r.primeiraIgnicao), desligou(r), hm(r.jornadaMs), hmOuTraco(r.motorLigadoMs), hmOuTraco(r.ociosoMs), km1(r.km), r.paradas, r.ignicoes, `${Math.round(r.vmax)} km/h`];
  const headResumo = ['Motorista', 'Dias', 'Veículos', 'Km', 'Jornada', 'Motor ligado', 'Paradas', 'Ignições'];
  const linhaResumo = (x: any) => [x.nome, x.dias.size, x.veiculos.size, km1(x.km), hm(x.jornada), hmOuTraco(somaOuNull(x.motor)), x.paradas, x.ignicoes];

  const exportar = async (formato: ExportFormat) => {
    if (!linhas.length) return toast('Nada para exportar neste período.', { tone: 'crit' });
    const rows = linhas.map(linha);
    const resumo = porMotorista.map(linhaResumo);
    const meta = { empresa: `${revenda.clientName} — Motoristas`, periodo: `Período: ${periodoLabel}`, filtros: filtrosTxt, emitidoEm: fmtDT(Date.now()) };
    if (formato === 'csv') csv(nomeArq('csv'), head, rows);
    else if (formato === 'xlsx') await xlsx(nomeArq('xlsx'), meta, head, rows, [], 'Jornada por dia');
    else await pdf({
      file: pdfFileName('Motoristas', f, t, aid ? F.veiculo?.plate : undefined),
      titulo: 'Relatório de Motoristas', cliente: revenda.clientName, usuario: session?.name || '—', role: session?.role || '—',
      meta: [
        { label: 'Período', value: periodoLabel },
        { label: 'Motorista', value: motorista?.name || 'Todos' },
        { label: 'Veículo', value: F.veiculo?.name || 'Todos' },
        { label: 'Grupo', value: F.grupoNome || 'Todos' },
        ...(busca.trim() ? [{ label: 'Busca', value: busca.trim() }] : []),
      ],
      sections: [{ title: 'Resumo por motorista', head: headResumo, rows: resumo }, { title: 'Jornada por dia e veículo', head, rows }],
      nota: 'Motorista identificado pelo cartão lido no rastreador. Jornada = da 1ª ignição ao último desligamento do dia. Parada = mais de 5 min parado ou pausa com a ignição desligada.',
    });
    registrarRelatorio({ tipo: 'motoristas', inicio: f, fim: t, filtros: filtrosTxt, registros: linhas.length, formato });
    toast(`Relatório de motoristas gerado com ${linhas.length} ${linhas.length === 1 ? 'linha' : 'linhas'}.`);
  };

  return (
    <div>
      <PageHeader icon="usuario" title="Motoristas" subtitle="Jornada, motor ligado, km e paradas de cada motorista, por veículo e por dia"
        crumbs={[{ label: 'Relatórios', to: '/relatorios' }, { label: 'Motoristas' }]} />
      <Stack gap="grid">
        <Card>
          <div className="flex flex-wrap items-end gap-field">
            <Field label="Período"><div className="flex items-center gap-tight max-md:flex-col max-md:items-stretch"><Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /><Icon name="chevron" size={16} className="text-ink-3 shrink-0 max-md:hidden" /><Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></div></Field>
            <Field label="Motorista" className="w-64"><SearchSelect value={mot} onChange={setMot} placeholder="Todos os motoristas"
              options={motoristas.map((d: any) => ({ value: d.id, label: d.name, sub: d.idCode || undefined }))} /></Field>
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
          <span className="flex items-center gap-tight text-small text-ink"><Icon name="usuario" size={16} className="text-ink-2" />{motorista?.name || 'Todos os motoristas'}</span>
          <span className="flex items-center gap-tight text-small text-ink"><Icon name="ativos" size={16} className="text-ink-2" />{F.veiculo?.name || 'Todos os veículos'}</span>
          <span className="flex items-center gap-tight text-small text-ink"><Icon name="equipe" size={16} className="text-ink-2" />{F.grupoNome || 'Todos os grupos'}</span>
          <BuscaChip busca={busca} />
          <span className="ml-auto text-caption text-ink-2">Relatório gerado em {fmtDT(geradoEm)}</span>
          <Button variant="quiet" size="sm" onClick={limparFiltros}><Icon name="reiniciar" size={14} />Limpar filtros</Button>
        </Panel>

        <Grid cols={4} equal>
          <StatTile icon="odometro" value={`${Math.round(totalKm)} km`} label="rodados" sub={`${porMotorista.length} ${porMotorista.length === 1 ? 'motorista' : 'motoristas'} no período`} />
          <StatTile icon="relogio" value={hm(totalJornada)} label="de jornada" sub="Da 1ª ignição ao último desligamento" />
          <StatTile icon="chave" value={hmOuTraco(totalMotor)} label="motor ligado" sub={totalMotor === null ? 'Rastreador não informa ignição' : `${hm(Math.max(0, totalJornada - totalMotor))} com o motor desligado`} />
          <StatTile icon="pause" value={totalParadas} label="paradas" sub="Mais de 5 min parado ou ignição desligada" />
        </Grid>

        <Card title="Resumo por motorista" subtitle={api.loading ? 'Carregando os dados do período…' : 'Total do período, ordenado pelo km rodado.'}>
          <Table head={headResumo}
            emptyState={<EmptyState illustration="ilu-periodo-vazio" title="Nenhum motorista identificado no período" detail="O motorista aparece quando o rastreador lê o cartão dele. Ajuste o período ou os filtros." />}
            rows={porMotorista.map((x) => linhaResumo(x).map((v, i) => <span key={i} className={i > 0 ? 'num' : 'font-medium'}>{i === 3 ? `${v} km` : v}</span>))} />
        </Card>

        <Card title="Jornada por dia e veículo" subtitle="Cada linha é um motorista num veículo num dia: quem roda em mais de um carro aparece uma vez por carro."
          actions={<div className="w-56"><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por motorista, veículo ou placa…" aria-label="Buscar no relatório" /></div>}>
          <Table head={head} minWidth={1200}
            emptyState={<EmptyState illustration="ilu-periodo-vazio" title="Nenhuma jornada no período" detail="Ajuste o período ou os filtros." />}
            rows={linhas.map((r) => { const l = linha(r); return [...l.slice(0, 2).map((v, i) => <span key={i} className={i === 1 ? 'font-medium' : 'num'}>{v}</span>), <AssetName name={r.a.name} />, ...l.slice(3).map((v, i) => <span key={i} className="num">{i === 6 ? `${v} km` : v}</span>)]; })} />
        </Card>
      </Stack>

      <ExportReportModal open={exportOpen} onClose={() => setExportOpen(false)} titulo="Motoristas" periodo={periodoLabel}
        resumo={`${porMotorista.length} ${porMotorista.length === 1 ? 'motorista' : 'motoristas'} · ${Math.round(totalKm)} km`}
        itens={['Filtros aplicados', 'Resumo do período por motorista', 'Jornada por dia e veículo: 1ª ignição, último desligamento, motor ligado, km e paradas']}
        onExport={exportar} />
    </div>
  );
}
