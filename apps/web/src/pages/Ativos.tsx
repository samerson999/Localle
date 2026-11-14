import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useStore, assetKm, useStoreData } from '../lib/store';
import { atualizarIconeAtivo, atualizarIdentificacaoAtivo, criarMarca, criarModelo, renomearNoCatalogo, salvarTipoAtivo, atualizarSituacaoAtivo, criarAtivo, definirAtivosDoGrupo, definirGruposDoAtivo, definirMotoristaDoAtivo, desativarMotorista, removerOperacao, salvarFichaAtivo, salvarOperacao, desinstalarRastreador, reativarMotorista, instalarRastreador, isRealAsset, meusRastreadores, removerGrupo, salvarGrupo, salvarMotorista, syncFrota, type MeuRastreador, useCarregando } from '../lib/localleApi';
import { backendIdOf, nomeDoAtivo } from '../lib/localleMap';
import { Button, Card, Field, Input, Select, SearchSelect, Table, Check, Tabs, Modal, PageHeader, AssetThumb, cx, TextButton, InlineInput, TabPanel, toast, FilePick, confirmAction, SearchInput, EmptyState, buttonClass, ChoiceCard, useUrlTab, useUrlItem, FilterSheet, Avatar } from '../components/ui';
import { useMobilePageAction } from '../components/Layout';
import { couplingsOf, currentCoupling, compositionOf, compositionName, compositionError, setComposition, tractorHistory, TRAILER_TYPE, MAX_ITEMS, type TrailerType } from '@localle/shared/couplings';
import { Num, StatusDot, AssetName, IdChip, KpiTile, type StatusKind } from '../components/story';
import { Icon } from '../components/icons';
import { Dropzone } from '../components/Dropzone';
import { CATEGORIES, categoryOf } from '../components/assetArt';
import { CATALOGO_VAZIO, aplicarTipo, chaveCatalogo, marcaModeloDoAtivo, mesmoNome, nomeDoTipo, parecidos, tipoDoAtivo, tiposDoCliente, type CatalogoAtivos, type OpcaoTipo } from '../lib/catalogoAtivos';
import { PNG_ICON_IDS, PNG_ICON_SUGGESTION, pngIconUrl, pngIconLabel } from '../lib/pngIcons';
import { SPECS_DB, MODEL_BRAND } from '@localle/shared/catalog';
import { num, fmtD, fmtDT, isPlate } from '@localle/shared/utils';
import { linkTrackerWithInstall } from '../lib/odometer';
import { downloadAssets, downloadErros, readSheet, planImport, applyImport, escolherNaLinha, type ImportLine, type ImportPlan } from '../lib/assetSheet';
import { AUDIT_LABEL, fieldLabel, auditEntry } from '@localle/shared/audit';
import { setDriver, linksOf, LINK_SOURCE, DRIVER_PARAMS, effectiveLink, driverConflicts, ackConflict } from '../lib/driverLinks';
import { LIFECYCLE, lifeOf, setLifecycle, unlinkTracker, opAssets } from '../lib/assetLifecycle';
import { RetiredToggle } from '../components/RetiredToggle';
import { mascaraValida, MENSAGEM_INVALIDA } from '../lib/mascaras';
import { DOC_TYPES, docTypesFor, docLabel, docState, docWhen, worstDoc, DOC_PARAMS, DRIVER_DOC_PARAMS, type DocState } from '@localle/shared/assetDocs';

const blank = (kind = 'veiculo') => ({ id: '', kind, category: '', name: '', plate: '', chassi: '', renavam: '', brand: '', model: '', year: '', specs: {} as any, photo: '', icon: '', groupIds: [] as string[], operationId: '', driverId: '', kmSource: kind === 'veiculo' ? 'mescla' : kind === 'implemento' ? 'engate' : 'rastreador', kmOffset: 0, initialKm: '', fuelGoal: '', fuelBudget: '', meter: kind === 'veiculo' || kind === 'implemento' ? 'km' : kind === 'linha_amarela' || kind === 'maquina' ? 'horimetro' : 'nenhum', customFields: [] as any[], journeySource: 'teclado', serial: '', tracker: null as any, active: true, documents: [] as any[] });

export default function Ativos() {
  const [tab, setTab] = useUrlTab('ativos');
  const carregando = useCarregando('frota', 'motoristas', 'grupos');
  const [edit, setEdit] = useState<any>(null);
  // ?ativo=<id> (vindo do "Precisa de você") abre a ficha direto, também quando a frota chega depois da tela
  const assets = useStore((s) => s.assets);
  useUrlItem('ativo', (id) => assets.find((x: any) => x.id === id), (a: any) => { setTab('ativos'); setEdit(JSON.parse(JSON.stringify({ ...blank(a.kind), ...a, category: categoryOf(a) }))); }, [assets]);
  const tabs = <Tabs value={tab} onChange={setTab} tabs={[{ key: 'ativos', label: 'Ativos' }, { key: 'grupos', label: 'Grupos' }, { key: 'motoristas', label: 'Motoristas' }, { key: 'operacoes', label: 'Operações' }, { key: 'tipos', label: 'Tipos e modelos' }, { key: 'alteracoes', label: 'Alterações' }]} />;
  useMobilePageAction(tab === 'ativos' ? { label: 'Novo ativo', icon: 'mais', onClick: () => setEdit(blank()) } : null);
  return (
    <div>
      <PageHeader icon="ativos" title="Gestão de ativos" subtitle="Veículos, linha amarela, máquinas e equipamentos rastreados" />
      <div className="flex flex-wrap items-center gap-tight mb-card-head max-md:mb-page-head">
        {tabs}
        {tab === 'ativos' && <Button onClick={() => setEdit(blank())} className="max-md:hidden"><Icon name="mais" size={18} />Novo ativo</Button>}
      </div>
      <TabPanel id={tab} loading={carregando}>
        {tab === 'ativos' && <AssetList onOpen={(a: any) => setEdit(JSON.parse(JSON.stringify({ ...blank(a.kind), ...a, category: categoryOf(a) })))} />}
        {tab === 'grupos' && <Grupos />}
        {tab === 'operacoes' && <Operacoes />}
        {tab === 'tipos' && <TiposEModelos />}
        {tab === 'motoristas' && <Drivers />}
        {tab === 'alteracoes' && <AuditLog />}
      </TabPanel>
      {edit && <AssetForm a={edit} setA={setEdit} />}
    </div>
  );
}

const KM_SOURCE: Record<string, string> = { rastreador: 'Rastreador', manual: 'Lançamentos', mescla: 'Mescla', engate: 'Engates' };

function AssetList({ onOpen }: { onOpen: (a: any) => void }) {
  const s = useStoreData();
  const [cat, setCat] = useState('');
  const [noTracker, setNoTracker] = useState(false);
  const [docDue, setDocDue] = useState(false); // só ativos com documento vencido ou a vencer no mês
  const [q, setQ] = useState('');
  const [importar, setImportar] = useState(false);
  // vendidos e baixados saem da lista e dos totais; ficam acessíveis pelo filtro
  const all = opAssets(s);
  const linked = all.filter((a: any) => a.tracker).length;
  const docAlert = (a: any) => { const d = worstDoc(a); return !!d && ['vencido', 'critico', 'atencao'].includes(docState(d)); };
  const docN = all.filter(docAlert).length;
  const t = q.trim().toLowerCase();
  const driver = (id: string) => s.drivers.find((d: any) => d.id === id)?.name || '';
  const tipos = tiposDoCliente((s.catalogoAtivos || CATALOGO_VAZIO).tipos);
  const list = all.filter((a: any) => (!cat || categoryOf(a) === cat) && (!noTracker || !a.tracker) && (!docDue || docAlert(a)) && (!t || [a.name, a.plate, a.apelido, a.brand, a.model, driver(a.driverId), a.tracker?.imei].some((x) => (x || '').toLowerCase().includes(t))));
  const group = (a: any) => (a.groupIds || []).map((g: string) => s.groups.find((x: any) => x.id === g)?.name).filter(Boolean).join(' · ');
  return (
    <>
      {/* faixa de resumo: os totais também filtram a tabela */}
      <section aria-label="Resumo dos ativos" className="grid grid-cols-2 sm:grid-cols-4 gap-field mb-grid">
        <KpiTile label="Ativos" value={all.length} />
        <KpiTile label="Vinculados a rastreador" value={linked} />
        <button type="button" aria-pressed={noTracker} onClick={() => setNoTracker(!noTracker)} className={cx('text-left rounded-card transition-colors', noTracker ? 'ring-1 ring-inset ring-line-hover bg-surface-selected' : 'hover:bg-surface-hover')}>
          <KpiTile label="Sem rastreador" value={all.length - linked} />
        </button>
        <button type="button" aria-pressed={docDue} onClick={() => setDocDue(!docDue)} className={cx('text-left rounded-card transition-colors', docDue ? 'ring-1 ring-inset ring-line-hover bg-surface-selected' : 'hover:bg-surface-hover')}>
          <KpiTile label="Documentos a vencer" value={docN} status={docN > 0 ? 'parado' : undefined} />
        </button>
      </section>

      <Card>
        <div className="flex flex-wrap items-center gap-stack mb-card-head">
          <SearchInput className="w-full sm:w-80" placeholder="Buscar placa, modelo, motorista ou IMEI" aria-label="Buscar ativo" value={q} onChange={setQ} />
          <FilterSheet count={cat ? 1 : 0}>
            <div className="w-48 max-md:w-full"><Select aria-label="Categoria" value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: '', label: 'Todas as categorias' }, ...CATEGORIES.map((c) => ({ value: c.key, label: c.label }))]} /></div>
          </FilterSheet>
          <p className="text-small text-ink-2 num" aria-live="polite">{list.length === all.length ? `${all.length} ativos` : `${list.length} de ${all.length} ativos`}</p>
          <RetiredToggle />
          {(cat || noTracker || docDue || q) && <Button variant="link" size="sm" onClick={() => { setCat(''); setNoTracker(false); setDocDue(false); setQ(''); }}>Limpar filtros</Button>}
          <span className="flex-1" />
          <Button variant="secondary" size="sm" onClick={() => setImportar(true)}><Icon name="importar" size={16} />Importar planilha</Button>
          <Button variant="ghost" size="sm" onClick={() => downloadAssets(s)}><Icon name="exportar" size={16} />Exportar</Button>
        </div>
        <Table minWidth={1160} onRow={(i) => onOpen(list[i])}
          sort={{ 1: (i) => list[i].name, 2: (i) => nomeDoTipo(list[i], tipos), 3: (i) => `${list[i].brand || ''} ${list[i].model || ''}`.trim(), 5: (i) => (list[i].meter === 'km' ? assetKm(s, list[i].id) : null) }}
          emptyState={all.length ? <EmptyState illustration="ilu-busca-veiculo" layout="row" title="Nenhum ativo com esses filtros" detail="Tente outra busca ou limpe os filtros." action={<Button variant="dark" size="sm" onClick={() => { setCat(''); setNoTracker(false); setDocDue(false); setQ(''); }}>Limpar filtros</Button>} />
            : <EmptyState illustration="ilu-onboarding-frota" title="Nenhum ativo cadastrado" detail="Cadastre o primeiro ativo ou importe a sua frota por planilha." />}
          card={(i) => { const a = list[i]; const d = worstDoc(a); return (
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="flex items-center justify-between gap-3"><AssetName name={a.name} className="truncate" /><span className="text-caption text-ink-2 whitespace-nowrap">{nomeDoTipo(a, tipos)}</span></span>
                <span className="text-small text-ink-2 truncate">{[`${a.brand || ''} ${a.model || ''}`.trim(), group(a)].filter(Boolean).join(' · ') || '—'}</span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-2">{d && <DocStatus d={d} />}{a.tracker ? <IdChip size="sm">{a.tracker.imei}</IdChip> : <span>Sem rastreador</span>}</span>
              </div>
            </div>
          ); }}
          align={['left', 'left', 'left', 'left', 'left', 'right', 'left', 'left', 'left', 'left', 'left']}
          head={['', 'Placa / nome', 'Tipo', 'Marca / modelo', 'Grupos', 'Uso atual', 'Origem do km', 'Documento', 'Vencimento', 'Rastreador', 'IMEI']}
          rows={list.map((a: any) => {
            const km = a.meter === 'km' ? assetKm(s, a.id) : null;
            const d = worstDoc(a);
            return [
              <AssetThumb asset={a} className="w-12 h-8" />,
              <span className="flex flex-col items-start gap-hair"><button type="button" onClick={(e) => { e.stopPropagation(); onOpen(a); }} className="text-left rounded-chip hover:ring-1 hover:ring-line-hover"><AssetName name={a.name} /></button>{a.plate && a.apelido && <span className="block text-caption text-ink-2">{a.apelido}</span>}{lifeOf(a) !== 'ativo' && <span className="block text-caption text-ink-2">{LIFECYCLE[lifeOf(a)].label}</span>}</span>,
              <span className="text-ink-2 whitespace-nowrap">{nomeDoTipo(a, tipos)}</span>,
              <span>{a.brand} {a.model}{a.year && <span className="text-ink-2 num"> · {a.year}</span>}</span>,
              <span className="text-ink-2">{group(a) || '—'}</span>,
              a.meter === 'horimetro' ? <Num value={s.vehicles[a.id]?.hourmeter} digits={1} unit="h" size="body" /> : km != null ? <span><Num value={km} unit="km" size="body" />{a.kmCalculated && <span className="block text-caption text-ink-2">calculado</span>}</span> : <span className="text-ink-3">—</span>,
              <span className="text-small text-ink-2">{a.meter === 'nenhum' ? '—' : KM_SOURCE[a.kmSource] || '—'}</span>,
              d ? <DocStatus d={d} /> : <span className="text-ink-3">—</span>,
              d ? <span className="text-small text-ink-2">{docLabel(d)}</span> : <span className="text-ink-3">—</span>,
              a.tracker ? <span className="text-small">{a.tracker.model}</span> : <span className="text-small text-ink-2">Sem rastreador</span>,
              a.tracker ? <IdChip size="sm">{a.tracker.imei}</IdChip> : <span className="text-ink-3">—</span>,
            ];
          })} />
      </Card>
      {importar && <ImportPreview onClose={() => setImportar(false)} />}
    </>
  );
}

// prévia da importação: mostra o que será criado, atualizado ou recusado; só grava ao confirmar
// Importação em duas etapas (backlog FD Locação, Sprint 3): primeiro o modelo e as regras, antes de escolher arquivo (I1);
// depois a prévia linha a linha — o que entra, o que tem erro e por quê, e a escolha de marca/modelo parecido (I3, I4).
function ImportPreview({ onClose }: { onClose: () => void }) {
  const s = useStoreData();
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [arquivo, setArquivo] = useState('');
  const [only, setOnly] = useState<'todas' | 'erro'>('todas');
  const [busy, setBusy] = useState(false);
  const lines = plan?.lines || [];
  const n = (k: string) => lines.filter((l) => l.action === k).length;
  const ok = n('criar') + n('atualizar');
  const shown = only === 'erro' ? lines.filter((l) => l.action === 'erro' || l.warnings.length) : lines;
  const ler = async (f: File) => {
    try { setPlan(planImport(await readSheet(f), useStore.getState())); setArquivo(f.name); setOnly('todas'); }
    catch { toast('Não foi possível ler a planilha. Envie CSV ou XLSX.', { tone: 'crit' }); }
  };
  const confirm = async () => {
    setBusy(true);
    try {
      const [c, u] = await applyImport(plan!, blank);
      const e = n('erro');
      toast(`${c} ${c === 1 ? 'ativo criado' : 'ativos criados'} e ${u} ${u === 1 ? 'atualizado' : 'atualizados'}.${e ? ` ${e} ${e === 1 ? 'linha com erro ficou' : 'linhas com erro ficaram'} de fora.` : ''}`);
      onClose();
    } catch (e: any) {
      toast('Importação incompleta: ' + (e.message || e), { tone: 'crit' });
    } finally {
      setBusy(false);
    }
  };
  const escolher = <FilePick accept=".csv,.xlsx,.xls" maxMB={20} raw onFile={(_, f) => ler(f)} className={buttonClass(plan ? 'ghost' : 'primary', 'md')}><Icon name="importar" size={16} />{plan ? 'Escolher outro arquivo' : 'Escolher arquivo'}</FilePick>;
  if (!plan) return (
    <Modal open onClose={onClose} title="Importar ativos" width="max-w-2xl"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button>{escolher}</>}>
      <div className="flex flex-col gap-group">
        <div className="flex flex-col gap-stack">
          <p className="text-body">Comece pelo modelo: ele tem todas as colunas do cadastro, linhas de exemplo, as instruções e as listas de tipos, marcas e modelos que a sua empresa já usa.</p>
          <Button variant="secondary" className="self-start" onClick={() => downloadAssets(s, true)}><Icon name="exportar" size={16} />Baixar modelo da planilha</Button>
        </div>
        <ul className="flex flex-col gap-tight text-small text-ink-2 list-disc pl-5">
          <li>Tipo, marca e modelo são obrigatórios. Use os nomes das listas do modelo; nome novo é cadastrado.</li>
          <li>Veículo e carreta precisam de placa. Máquina e equipamento sem placa entram pelo código interno ou nº de série.</li>
          <li>Ativo já cadastrado (mesma placa ou mesmo código) é atualizado; campo em branco não apaga o que existe.</li>
          <li>Antes de gravar, a prévia mostra cada linha. Linha com erro não entra e não impede as outras.</li>
        </ul>
        <p className="text-caption text-ink-2">CSV ou XLSX, até 20 MB. O rastreador é vinculado na ficha do ativo, com os dados da instalação.</p>
      </div>
    </Modal>
  );
  return (
    <Modal open onClose={onClose} title={`Importar ativos · ${arquivo}`} width="max-w-5xl"
      footer={<>{escolher}{n('erro') > 0 && <Button variant="link" onClick={() => downloadErros(plan)}>Baixar linhas com erro</Button>}<span className="flex-1" /><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!ok} onClick={confirm}>Importar {ok} {ok === 1 ? 'linha' : 'linhas'}</Button></>}>
      <div className="flex flex-wrap gap-x-section gap-y-stack">
        <div><p className="text-small text-ink-2">Novos</p><Num value={n('criar')} size="lg" className="block" /></div>
        <div><p className="text-small text-ink-2">Atualizados</p><Num value={n('atualizar')} size="lg" className="block" /></div>
        <div><p className="text-small text-ink-2 flex items-center gap-tight">{n('erro') > 0 && <StatusDot kind="crit" label="" />}Com erro (não entram)</p><Num value={n('erro')} size="lg" className="block" /></div>
      </div>
      {(plan.newGroups.length || plan.newOperations.length) ? <p className="text-small text-ink-2">Serão criados {[plan.newGroups.length && `os grupos ${plan.newGroups.join(', ')}`, plan.newOperations.length && `as operações ${plan.newOperations.join(', ')}`].filter(Boolean).join(' e ')}.</p> : null}
      {n('erro') > 0 && <p className="text-small text-ink-2">As linhas com erro ficam de fora. Baixe só elas, corrija na planilha e importe de novo: as que entraram agora não são duplicadas.</p>}
      <Tabs value={only} onChange={(v: any) => setOnly(v)} tabs={[{ key: 'todas', label: 'Todas as linhas' }, { key: 'erro', label: 'Erros e avisos', count: lines.filter((l) => l.action === 'erro' || l.warnings.length).length || undefined }]} />
      <div className="max-h-[50vh] overflow-y-auto">
        <Table minWidth={760} empty="Nenhuma linha." head={['Linha', 'Placa / código', 'Ação', 'Marca e modelo', 'Observações']}
          rows={shown.map((l) => [
            <span className="num text-ink-2">{l.row}</span>,
            <AssetName name={l.label} />,
            <StatusDot kind={l.action === 'erro' ? 'crit' : l.action === 'criar' ? 'mov' : 'parado'} label={l.action === 'erro' ? 'Erro' : l.action === 'criar' ? 'Criar' : 'Atualizar'} />,
            <MarcaModeloDaLinha l={l} onEscolha={(campo, id) => setPlan(escolherNaLinha(plan, l.row, campo, id))} />,
            <span className="text-small">{[...l.errors, ...l.warnings].map((m, i) => <span key={i} className={cx('block', i >= l.errors.length && 'text-ink-2')}>{m}</span>)}{!l.errors.length && !l.warnings.length && <span className="text-ink-3">—</span>}</span>,
          ])} />
      </div>
      <p className="text-caption text-ink-2">Campos em branco não apagam o que já está cadastrado. O vínculo com rastreador continua na ficha do ativo, com os dados da instalação.</p>
    </Modal>
  );
}

// marca/modelo da linha: o que vai ser usado ou cadastrado; parecido com um existente pede a decisão ("Você quis dizer…")
function MarcaModeloDaLinha({ l, onEscolha }: { l: ImportLine; onEscolha: (campo: '_marca' | '_modelo', id: string | null) => void }) {
  const itens = (['_marca', '_modelo'] as const).map((campo) => ({ campo, it: l.data?.[campo] })).filter((x) => x.it);
  if (!itens.length || l.action === 'erro') return <span className="text-ink-3">—</span>;
  return (
    <span className="flex flex-col gap-tight min-w-[200px]">
      {itens.map(({ campo, it }) => it.sugestoes?.length
        ? <Select key={campo} aria-label={`${campo === '_marca' ? 'Marca' : 'Modelo'} da linha ${l.row}`} value={it.id || ''} onChange={(e) => onEscolha(campo, e.target.value || null)}
            options={[{ value: '', label: `Cadastrar “${it.nome}”` }, ...it.sugestoes.map((x: any) => ({ value: x.id, label: `Usar “${x.nome}”` }))]} />
        : <span key={campo} className="text-small">{it.nome}{!it.id && <span className="text-ink-2"> · novo</span>}</span>)}
    </span>
  );
}

function AssetForm({ a, setA }: any) {
  const s = useStoreData();
  const [msg, setMsg] = useState('');
  // rastreadores que a Localle vinculou a esta conta (API); o cliente só escolhe em qual ativo cada um está
  const [meus, setMeus] = useState<MeuRastreador[] | null>(null);
  const [erroLista, setErroLista] = useState('');
  useEffect(() => { meusRastreadores().then(setMeus).catch((e: any) => setErroLista(e.message || String(e))); }, []);
  const instalado = meus?.find((r) => isRealAsset(a) && r.asset_id === backendIdOf(a.id)) || null;
  const livres = (meus || []).filter((r) => !r.instalacao_id);
  const [rid, setRid] = useState('');
  const [busy, setBusy] = useState(false);
  const [inst, setInst] = useState({ km: '', photo: '', tech: '', calc: false, date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) });
  const newLink = !!rid && !instalado;
  const instErr = !newLink ? '' : !inst.tech.trim() ? 'Informe o técnico responsável pela instalação.' : inst.calc ? '' : !inst.km ? 'Informe o odômetro inicial do painel.' : !inst.photo ? 'Envie a foto do painel com o odômetro.' : '';
  const isV = a.kind === 'veiculo';
  const set = (k: string, v: any) => setA({ ...a, [k]: v });
  const tipos = tiposDoCliente((useStore((st) => st.catalogoAtivos) || CATALOGO_VAZIO).tipos);
  const lookup = () => {
    const p = a.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // sem consulta de placa ligada a uma base real: a ficha técnica vem do modelo escolhido na lista
    if (SPECS_DB[a.model]) { setA({ ...a, plate: p, specs: SPECS_DB[a.model], brand: a.brand || MODEL_BRAND[a.model] }); setMsg('Ficha técnica preenchida pelo modelo.'); }
    else setMsg('Escolha o modelo na lista para preencher a ficha técnica, ou preencha manualmente.');
  };
  const save = async () => {
    setBusy(true);
    try {
      const orig = s.assets.find((x: any) => x.id === a.id);
      const plate = (a.plate || '').trim().toUpperCase();
      const serial = (a.serial || '').trim();
      // o ativo existe na API (é nele que o rastreador é instalado); o que só existia no navegador migra agora
      let id = a.id;
      if (!isRealAsset(a)) { id = await criarAtivo(plate, serial); if (a.id) s.remove('assets', a.id); }
      else if (orig && ((orig.plate || '') !== plate || (orig.serial || '') !== serial)) await atualizarIdentificacaoAtivo(id, plate, serial);
      if ((a.icon || '') !== (orig?.icon || '') || (a.icon && id !== a.id)) await atualizarIconeAtivo(id, a.icon || '');
      const saved = s.upsert('assets', { ...a, driverId: orig ? orig.driverId : '', id, plate, serial, apelido: (a.apelido || '').trim(), name: nomeDoAtivo(plate, a.apelido, serial), fuelGoal: +a.fuelGoal || 0, fuelBudget: +a.fuelBudget || 0, kmOffset: +a.kmOffset || 0 });
      if (isRealAsset(saved)) await definirGruposDoAtivo(saved.id, a.groupIds || []);
      if ((a.driverId || '') !== (orig?.driverId || '')) { if (isRealAsset(saved)) definirMotoristaDoAtivo(saved.id, a.driverId).catch((e: any) => toast('Motorista não gravado: ' + (e.message || e), { tone: 'crit' })); else setDriver(saved.id, a.driverId, 'escala'); }
      if (newLink) {
        const r = livres.find((x) => x.id === rid)!;
        await instalarRastreador(rid, saved.id, { tecnico: inst.tech.trim(), kmInicial: inst.calc ? null : +inst.km, instaladoEm: new Date(inst.date).getTime() });
        // foto do painel e km calculado continuam no navegador (a API guarda técnico, data e km inicial)
        linkTrackerWithInstall(saved.id, { id: r.id, imei: r.imei, model: r.modelo || '', live: true, source: 'localle' }, { initialKm: inst.calc ? null : +inst.km, photo: inst.photo, technician: inst.tech.trim(), kmCalculated: inst.calc, installedAt: new Date(inst.date).getTime() });
      }
      // ficha por último: a instalação acima ajusta o km (kmOffset) e grava os dados dela no ativo
      if (isRealAsset(saved)) await salvarFichaAtivo(saved.id);
      await syncFrota();
      setA(null);
    } catch (e: any) {
      toast('Não foi possível salvar o ativo: ' + (e.message || e), { tone: 'crit' });
    } finally {
      setBusy(false);
    }
  };
  const specs = Object.entries<string>(a.specs || {});
  // abas do cadastro: identificação, ficha, uso/operação, documentos, rastreador e (ativo já salvo) histórico
  const [aba, setAba] = useState('dados');
  const abas = [
    { key: 'dados', label: 'Dados' },
    { key: 'ficha', label: isV ? 'Ficha técnica' : 'Campos' },
    { key: 'operacao', label: 'Operação' },
    { key: 'documentos', label: 'Documentos', count: (a.documents || []).length || undefined },
    { key: 'rastreador', label: 'Rastreador' },
    ...(a.id ? [{ key: 'historico', label: 'Histórico' }] : []),
  ];
  // o que impede salvar fica visível no rodapé, com atalho para a aba onde se resolve
  // placa só é exigida de quem roda em via pública; o resto se identifica pelo código interno ou nº de série
  const comPlaca = isV || a.kind === 'implemento';
  const placaGravada = !!s.assets.find((x: any) => x.id === a.id)?.plate;
  const pend = !a.category ? { aba: 'dados', txt: 'Escolha o tipo do ativo' }
    : comPlaca && !a.plate?.trim() ? { aba: 'dados', txt: 'Informe a placa na aba Dados' }
    : !comPlaca && !a.plate?.trim() && !a.serial?.trim() ? { aba: 'dados', txt: 'Informe o código interno ou nº de série na aba Dados' }
    // marca e modelo só pela lista: é o que mantém "13190" e "13.190" como um modelo só
    : a.category !== 'pessoal' && !a.modeloId ? { aba: 'dados', txt: `Escolha ${isV ? 'marca' : 'fabricante'} e modelo da lista na aba Dados` }
    : a.kind === 'linha_amarela' && a.meter !== 'horimetro' ? { aba: 'dados', txt: 'Linha amarela usa horímetro: ajuste o medidor de uso na aba Dados' }
    : !a.photo && !a.icon ? { aba: 'dados', txt: 'Escolha uma foto ou um ícone na aba Dados' }
    : instErr ? { aba: 'rastreador', txt: `Rastreador: ${instErr}` } : null;
  return (
    <Modal open onClose={() => setA(null)} title={a.id ? a.name : 'Novo ativo'} width="max-w-5xl" footer={<>{pend && <TextButton className="mr-auto text-left" onClick={() => setAba(pend.aba)}>{pend.txt}</TextButton>}<Button variant="ghost" onClick={() => setA(null)}>Cancelar</Button><Button loading={busy} disabled={!!pend} onClick={save}>Salvar ativo</Button></>}>
      <Field label="Tipo do ativo" className="max-w-xs">
        <Select aria-label="Tipo do ativo" value={a.category ? tipoDoAtivo(a) : ''} onChange={(e) => {
          const op = tipos.find((o) => o.value === e.target.value)!;
          const k = op.kind;
          const iconeAntes = a.category ? tipos.find((o) => o.value === tipoDoAtivo(a))?.icone : undefined;
          setA({ ...blank(k), ...a, ...aplicarTipo(op), meter: k === a.kind ? a.meter : k === 'veiculo' || k === 'implemento' ? 'km' : k === 'linha_amarela' ? 'horimetro' : 'nenhum', kmSource: k === a.kind ? a.kmSource : blank(k).kmSource,
            icon: !a.icon || a.icon === iconeAntes ? op.icone || '' : a.icon });
        }} options={tipos.map((o) => ({ value: o.value, label: o.label }))} />
      </Field>
      {/* tipo primeiro: ele decide os campos (placa, medidor, ícones) */}
      {!a.category ? <p className="mt-group text-small text-ink-2">Escolha o tipo do ativo para preencher o cadastro.</p> : <>
      <Tabs className="mt-group" value={aba} onChange={setAba} tabs={abas} />
      {/* altura mínima: trocar de aba não faz o modal pular de tamanho */}
      <div className="pt-group min-h-[460px]">
        {aba === 'dados' && (
          <div className="flex flex-wrap gap-group">
            <div className="flex-[999_1_480px] min-w-0 flex flex-col gap-group">
              {isV ? (
                <>
                  <div className="flex flex-wrap gap-field items-end">
                    <Field label="Placa" className="w-36"><Input mask="placa" className="font-mono font-semibold uppercase" value={a.plate} onChange={(e) => set('plate', e.target.value)} /></Field>
                    <MarcaModelo a={a} setA={setA} rotulo="Marca" classes={['w-48', 'flex-1 min-w-[180px]']} />
                    <Field label="Ano" className="w-28"><Input mask="ano" value={a.year} onChange={(e) => set('year', e.target.value)} /></Field>
                    <div className="flex flex-col gap-field-label"><span className="invisible text-small" aria-hidden="true">·</span><Button variant="ghost" onClick={lookup}>Consultar dados do veículo</Button></div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-field">
                    <Field label="Chassi"><Input className="font-mono uppercase" maxLength={17} value={a.chassi || ''} onChange={(e) => set('chassi', e.target.value.toUpperCase())} /></Field>
                    <Field label="Renavam"><Input className="font-mono" inputMode="numeric" maxLength={11} value={a.renavam || ''} onChange={(e) => set('renavam', e.target.value.replace(/\D/g, ''))} /></Field>
                    <Field label="Código interno / frota"><Input maxLength={60} value={a.serial || ''} onChange={(e) => set('serial', e.target.value)} /></Field>
                    <CampoUf a={a} set={set} />
                  </div>
                  {msg && <p role="status" className="text-small text-ink-2 bg-card-2 border border-line rounded-ctl p-stack">{msg}</p>}
                </>
              ) : (
                <>
                  <p className="text-small text-ink-2">{a.kind === 'implemento' ? 'Carreta ou implemento: engata em cavalos diferentes, tem pneus próprios e pode ter rastreador próprio.' : 'Ativos que não são veículos são cadastrados manualmente.'}</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-field">
                    {/* objeto pessoal não tem placa: o campo só aparece se já houver uma gravada, para poder limpar */}
                    {(a.category !== 'pessoal' || placaGravada) && <Field label={a.kind === 'implemento' ? 'Placa' : 'Placa (se tiver)'}><Input mask="placa" className="font-mono uppercase" value={a.plate} onChange={(e) => set('plate', e.target.value)} /></Field>}
                    {a.kind === 'implemento' && <><Field label="Chassi"><Input className="font-mono uppercase" maxLength={17} value={a.chassi || ''} onChange={(e) => set('chassi', e.target.value.toUpperCase())} /></Field>
                      <Field label="Renavam"><Input className="font-mono" inputMode="numeric" maxLength={11} value={a.renavam || ''} onChange={(e) => set('renavam', e.target.value.replace(/\D/g, ''))} /></Field>
                      <CampoUf a={a} set={set} /></>}
                    <MarcaModelo a={a} setA={setA} rotulo="Fabricante" />
                    <Field label="Ano"><Input mask="ano" value={a.year} onChange={(e) => set('year', e.target.value)} /></Field>
                    <Field label={a.kind === 'implemento' ? 'Código interno / frota' : 'Código interno ou nº de série'}><Input maxLength={60} value={a.serial || ''} onChange={(e) => set('serial', e.target.value)} /></Field>
                    {a.kind !== 'implemento' && <Field label="Medidor de uso"><Select value={a.meter} onChange={(e) => set('meter', e.target.value)} options={[{ value: 'horimetro', label: 'Horímetro' }, { value: 'km', label: 'Quilometragem' }, { value: 'nenhum', label: 'Sem medidor' }]} /></Field>}
                  </div>
                </>
              )}
              <Field label="Apelido (opcional)" hint={a.plate?.trim() ? 'A placa continua sendo a identificação do ativo; o apelido aparece junto dela.' : 'Sem placa, o apelido identifica o ativo no mapa e nas listas.'}>
                <Input value={a.apelido ?? ''} onChange={(e) => set('apelido', e.target.value)} placeholder={isV ? 'Ex.: Caminhão do Zé' : 'Ex.: Caixa fria CF-08'} /></Field>
              <div className="flex flex-col gap-2"><span className="text-small font-semibold">Grupos</span><div className="flex flex-wrap gap-4">{s.groups.map((g: any) => <Check key={g.id} label={g.name} checked={a.groupIds.includes(g.id)} onChange={(v) => set('groupIds', v ? [...a.groupIds, g.id] : a.groupIds.filter((x: string) => x !== g.id))} />)}</div></div>
            </div>
            <div className="flex-[1_1_280px] md:max-w-[340px] flex flex-col gap-grid">
              <Dropzone label="Foto do ativo" hint="Aparece no mapa e no detalhe. JPG, PNG ou WebP até 4 MB." value={a.photo} onChange={(d) => set('photo', d)} previewAlt={`Foto de ${a.name || 'ativo'}`} />
              <IconPicker category={a.category || categoryOf(a)} value={a.icon} onChange={(v) => set('icon', v)} />
            </div>
          </div>
        )}
        {aba === 'ficha' && <div className="flex flex-col gap-group">
            <div className="flex flex-col gap-2">
              <div className="flex items-center"><span className="text-small font-semibold mr-auto">{isV ? 'Ficha técnica e referência de peças' : 'Campos personalizados'}</span>
                <Button size="sm" variant="soft" onClick={() => isV ? set('specs', { ...a.specs, 'Novo item': '' }) : set('customFields', [...a.customFields, { k: '', v: '' }])}>Adicionar campo</Button></div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {isV ? specs.map(([k, v], i) => (
                  <div key={i} className="flex flex-col gap-hair border border-line rounded-ctl p-tight">
                    <InlineInput aria-label="Item" className="text-caption font-medium text-ink-3" value={k} onChange={(e) => { const n = Object.fromEntries(specs.map(([kk, vv], j) => (j === i ? [e.target.value, vv] : [kk, vv]))); set('specs', n); }} />
                    <InlineInput aria-label={k} className="text-body font-medium" value={v} onChange={(e) => set('specs', { ...a.specs, [k]: e.target.value })} />
                  </div>
                )) : a.customFields.map((c: any, i: number) => (
                  <div key={i} className="flex flex-col gap-hair border border-line rounded-ctl p-tight">
                    <InlineInput aria-label="Campo" placeholder="Campo" className="text-caption font-medium text-ink-3" value={c.k} onChange={(e) => set('customFields', a.customFields.map((x: any, j: number) => (j === i ? { ...x, k: e.target.value } : x)))} />
                    <InlineInput aria-label="Valor" placeholder="Valor" className="text-body font-medium" value={c.v} onChange={(e) => set('customFields', a.customFields.map((x: any, j: number) => (j === i ? { ...x, v: e.target.value } : x)))} />
                  </div>
                ))}
              </div>
            </div>
        </div>}
        {aba === 'operacao' && <div className="flex flex-col gap-group">
            {a.meter !== 'nenhum' && (
              <div className="flex flex-col gap-2">
                <span className="text-small font-semibold">Origem da {a.meter === 'horimetro' ? 'leitura do horímetro' : 'quilometragem'}</span>
                <span className="text-small text-ink-2">Alimenta os gatilhos de manutenção, metas de combustível e relatórios.</span>
                <div className="grid md:grid-cols-3 gap-2">
                  {(a.kind === 'implemento' ? [['engate', 'Engates', 'Soma o km dos cavalos enquanto ela esteve engatada'], ['rastreador', 'Rastreador próprio', 'Quando a carreta tem rastreador']] : [['rastreador', 'Rastreador', a.meter === 'horimetro' ? 'Horímetro do rastreador (ignição/CAN) em tempo real' : 'Odômetro GPS/CAN em tempo real'], ['manual', 'Lançamentos', 'Abastecimentos, checklists e OS'], ['mescla', 'Mescla', 'Rastreador corrigido pelos lançamentos']]).map(([k, l, d]) => (
                    <ChoiceCard key={k} checked={a.kmSource === k} onSelect={() => set('kmSource', k)} title={l} description={d} />
                  ))}
                </div>
                {/* o mesmo kmOffset serve aos dois medidores: em assetKm (shared/km.ts) ele soma à leitura do rastreador, que é o horímetro quando meter = horimetro */}
                {a.kmSource === 'mescla' && <Field label={a.meter === 'horimetro' ? 'Ajuste do horímetro do rastreador (h)' : 'Ajuste do odômetro do rastreador (km)'} className="max-w-xs"
                  hint={a.meter === 'horimetro' ? 'Diferença entre o horímetro do painel da máquina e o do rastreador. Na mescla, vale o maior entre rastreador ajustado e último lançamento.' : 'Diferença entre o painel do veículo e o rastreador. Na mescla, vale o maior entre rastreador ajustado e último lançamento.'}><Input type="number" min={-9999999} value={a.kmOffset} onChange={(e) => set('kmOffset', e.target.value)} /></Field>}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-field">
              {isV && <Field label="Meta de consumo (km/L)"><Input type="number" step="0.1" value={a.fuelGoal} onChange={(e) => set('fuelGoal', e.target.value)} /></Field>}
              {isV && <Field label="Teto mensal combustível (R$)"><Input type="number" value={a.fuelBudget} onChange={(e) => set('fuelBudget', e.target.value)} /></Field>}
              {a.kind === 'implemento' && <Field label="Tipo de implemento"><Select value={a.trailerType || 'semirreboque'} onChange={(e) => set('trailerType', e.target.value)} options={Object.entries(TRAILER_TYPE).map(([value, label]) => ({ value, label }))} /></Field>}
              <Field label="Operação"><Select value={a.operationId} onChange={(e) => set('operationId', e.target.value)} options={[{ value: '', label: '—' }, ...s.operations.map((o: any) => ({ value: o.id, label: o.name }))]} /></Field>
              <Field label="Motorista / operador" hint="Registra pela escala. App e rastreador têm prioridade quando informam outro motorista."><SearchSelect value={a.driverId} onChange={(v) => set('driverId', v)} placeholder="—" options={s.drivers.map((d: any) => ({ value: d.id, label: d.name }))} /></Field>
              {isV && <Field label="Jornada vem de"><Select value={a.journeySource} onChange={(e) => set('journeySource', e.target.value)} options={[{ value: 'teclado', label: 'Teclado embarcado' }, { value: 'app', label: 'App do motorista' }]} /></Field>}
            </div>
            {a.kind === 'implemento' && a.id && <Engates trailerId={a.id} />}
            {a.kind === 'veiculo' && a.id && (/cavalo/.test(categoryOf(a)) || compositionOf(s, a.id)) && <Composicao tractorId={a.id} />}
        </div>}
        {aba === 'documentos' && <Documentos a={a} set={set} />}
        {aba === 'rastreador' && <div className="flex flex-col gap-grid max-w-2xl">
            <div className="flex flex-col gap-stack border border-line rounded-ctl p-card-sm">
              <span className="text-small font-semibold">Rastreador</span>
              {instalado ? (
                <div className="flex flex-col gap-hair">
                  <IdChip size="sm">{instalado.imei}</IdChip>
                  <span className="text-small">{instalado.modelo || 'Modelo não informado'}{instalado.protocolo ? ` · ${instalado.protocolo}` : ''}</span>
                  <span className="text-caption text-ink-2">Instalado em {fmtD(Date.parse(instalado.instalado_em!))} · último sinal {instalado.ultimo_pacote_em ? fmtDT(Date.parse(instalado.ultimo_pacote_em)) : 'ainda não recebido'}</span>
                </div>
              ) : meus === null ? (
                erroLista ? <p role="alert" className="text-small text-crit-ink">Não foi possível carregar os rastreadores: {erroLista}</p> : <p className="text-small text-ink-2">Carregando rastreadores…</p>
              ) : livres.length ? (
                // busca por qualquer trecho do IMEI (ex.: só os últimos dígitos, que é o que fica legível na etiqueta) ou do modelo; o X limpa = sem rastreador
                <Field label="Rastreador disponível" hint="Digite qualquer parte do IMEI, como os últimos dígitos, ou o modelo."><SearchSelect aria-label="Rastreador disponível" value={rid} onChange={setRid} placeholder="Sem rastreador · buscar IMEI ou modelo"
                  emptyLabel="Nenhum rastreador disponível com esse número" options={livres.map((r) => ({ value: r.id, label: r.imei, sub: r.modelo || 'Modelo não informado' }))} /></Field>
              ) : (
                <p className="text-small text-ink-2">Nenhum rastreador disponível. Os rastreadores são vinculados à sua conta pela Localle; fale com ela para incluir um.</p>
              )}
              <Check label="Rastreador lê dados CAN (telemetria: RPM, banguela, consumo)" checked={!!a.can} onChange={(v) => set('can', v)} />
              {newLink && (
                <div className="flex flex-col gap-stack border-t border-line pt-stack">
                  <span className="text-small font-semibold">Dados da instalação</span>
                  <Field label="Técnico responsável"><Input value={inst.tech} onChange={(e) => setInst({ ...inst, tech: e.target.value })} placeholder="Nome do instalador" /></Field>
                  <Field label="Data e hora da instalação"><Input type="datetime-local" value={inst.date} onChange={(e) => setInst({ ...inst, date: e.target.value })} /></Field>
                  <Check label="Veículo não permite ler o odômetro (km será calculado pelo rastreador)" checked={inst.calc} onChange={(v) => setInst({ ...inst, calc: v })} />
                  {!inst.calc && <>
                    <Field label="Odômetro inicial do painel (km)"><Input type="number" value={inst.km} onChange={(e) => setInst({ ...inst, km: e.target.value })} /></Field>
                    <Dropzone label="Foto do painel com o odômetro" required className="h-32" value={inst.photo} onChange={(d) => setInst({ ...inst, photo: d })} previewAlt="Foto do painel com o odômetro" />
                  </>}
                  {instErr && <p role="alert" className="text-small font-medium text-crit-ink">{instErr}</p>}
                  <p className="text-caption text-ink-2 bg-card-2 border border-line rounded-btn p-stack">Ao salvar, este vínculo consome 1 acesso da licença da sua central.</p>
                </div>
              )}
              {instalado && <TextButton tone="danger" className="self-start" onClick={async () => { if (!(await confirmAction({ title: 'Retirar o rastreador?', detail: `O rastreador ${instalado.imei} sai de ${a.name} e fica disponível para outro ativo da sua conta.`, confirmLabel: 'Retirar' }))) return; try { await desinstalarRastreador(instalado.instalacao_id!); unlinkTracker(a.id, 'retirado'); toast('Rastreador retirado; está disponível para outro ativo.'); setA(null); } catch (e: any) { toast('Não foi possível retirar: ' + (e.message || e), { tone: 'crit' }); } }}>Retirar rastreador</TextButton>}
              {a.tracker && <p className="text-caption text-ink-2">Vinculado desde {fmtD(a.tracker.linkedAt)}{a.installation ? ` · instalado por ${a.installation.technician}` : ''}{a.kmCalculated ? ' · km calculado' : a.installation?.initialKm != null ? ` · odômetro inicial ${num(a.installation.initialKm)} km` : ''}</p>}
            </div>
            {a.id && <TrackerHistory assetId={a.id} />}
        </div>}
        {aba === 'historico' && <div className="flex flex-col gap-grid max-w-2xl">
            {a.id && a.kind !== 'implemento' && <DriverHistory assetId={a.id} />}
            {a.id && <Situacao a={a} onDone={() => setA(null)} />}
            {a.id && <AuditLog refId={a.id} />}
        </div>}
      </div>
      </>}
    </Modal>
  );
}

// Ícone ilustrado 3D do ativo (sem foto): catálogo png-tight, filtrável por nome. Sem escolha, cai na silhueta
// da categoria (AssetThumb). Usado em cards, listas e popup do mapa — não no glifo do marcador.
function IconPicker({ category, value, onChange }: { category: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const ids = PNG_ICON_IDS.filter((id) => !t || pngIconLabel(id).includes(t));
  const suggestion = PNG_ICON_SUGGESTION[category];
  return (
    <div className="flex flex-col gap-stack border border-line rounded-ctl p-card-sm">
      <div className="flex items-center gap-tight">
        <span className="text-small font-semibold mr-auto">Ícone ilustrado</span>
        {value && <TextButton tone="danger" onClick={() => onChange('')}>Remover</TextButton>}
        <Button size="sm" variant="soft" onClick={() => setOpen(!open)}>{open ? 'Fechar' : value ? 'Trocar' : 'Escolher'}</Button>
      </div>
      {value && !open && <div className="flex items-center gap-2"><img src={pngIconUrl(value)} alt="" className="w-16 h-10 object-contain" /><span className="text-small text-ink-2">{pngIconLabel(value)}</span></div>}
      {!value && !open && suggestion && <p className="text-caption text-ink-2">Sem ícone escolhido; a lista mostra a silhueta da categoria. Sugestão: {pngIconLabel(suggestion)}.</p>}
      {open && (
        <div className="flex flex-col gap-2">
          <SearchInput className="w-full" placeholder="Buscar ícone" aria-label="Buscar ícone" value={q} onChange={setQ} />
          <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
            {ids.map((id) => (
              <button key={id} type="button" aria-pressed={value === id} onClick={() => { onChange(id); setOpen(false); }}
                className={cx('min-w-0 flex flex-col items-center gap-1 p-tight rounded-ctl text-caption', value === id ? 'bg-card-2 ring-[1.5px] ring-inset ring-ink text-ink font-medium' : 'border border-line text-ink-2 hover:bg-card-2')}>
                <img src={pngIconUrl(id)} alt="" loading="lazy" decoding="async" className="w-14 h-9 object-contain" /><span className="w-full text-center leading-tight break-words hyphens-auto" lang="pt-BR">{pngIconLabel(id)}</span>
              </button>
            ))}
            {!ids.length && <p className="col-span-full text-small text-ink-2">Nenhum ícone com esse nome.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// Engates do implemento: cada linha é a composição inteira em que ele esteve (cavalo + implementos, em ordem).
// O km do implemento é a soma do que os cavalos rodaram com ele. A composição se edita na ficha do cavalo.
// registro de alterações dos cadastros (lib/audit); com refId mostra só as do item, em versão compacta
export function AuditLog({ refId }: { refId?: string }) {
  const log = useStore((s) => s.auditLog || []);
  const [coll, setColl] = useState('');
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const list = log.filter((e: any) => (refId ? e.refId === refId : (!coll || e.coll === coll) && (!t || [e.label, e.by, e.action, e.note].some((x) => (x || '').toLowerCase().includes(t)))));
  const what = (e: any) => <>{e.action}{e.changes?.length ? <span className="block text-caption text-ink-2">{e.changes.map((c: any) => c.f === 'documents' ? 'Documentos atualizados' : `${fieldLabel(c.f)}: ${c.from} → ${c.to}`).join(' · ')}</span> : null}{e.note && <span className="block text-caption text-ink-2">{e.note}</span>}</>;
  if (refId) return list.length ? (
    <div className="flex flex-col gap-tight border border-line rounded-ctl p-card-sm">
      <span className="text-small font-semibold">Últimas alterações</span>
      <ul className="flex flex-col gap-2">{list.slice(0, 5).map((e: any) => <li key={e.id} className="text-small"><span className="text-caption text-ink-2 num">{fmtDT(e.ts)} · {e.by}</span><span className="block">{what(e)}</span></li>)}</ul>
    </div>
  ) : null;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-stack mb-card-head">
        <SearchInput className="w-full sm:w-72" placeholder="Buscar por item, pessoa ou ação" aria-label="Buscar no registro" value={q} onChange={setQ} />
        <Select aria-label="Tipo de cadastro" className="w-full sm:w-64" value={coll} onChange={(e) => setColl(e.target.value)} options={[{ value: '', label: 'Todos os cadastros' }, ...Object.entries(AUDIT_LABEL).map(([value, label]) => ({ value, label }))]} />
        <p className="text-small text-ink-2 num">{list.length} {list.length === 1 ? 'registro' : 'registros'}</p>
      </div>
      <Table minWidth={760} empty="Nenhuma alteração registrada ainda. Cadastros, edições e exclusões aparecem aqui com quem fez e quando." head={['Quando', 'Quem', 'Cadastro', 'Item', 'O que mudou']}
        rows={list.map((e: any) => [<time className="num text-caption">{fmtDT(e.ts)}</time>, e.by, <span className="text-ink-2">{AUDIT_LABEL[e.coll] || e.coll}</span>, <AssetName name={e.label} />, <span className="text-small">{what(e)}</span>])} />
    </Card>
  );
}

// conflitos entre origens (lib/driverLinks): duas origens com motoristas diferentes no mesmo veículo e período.
// Vale a de maior prioridade; o gestor confere e marca como conferido (fica no registro de alterações).
function DriverConflicts() {
  const s = useStoreData();
  const [showAll, setShowAll] = useState(false);
  const all = driverConflicts(s);
  const list = showAll ? all : all.filter((c) => !c.acked);
  if (!all.length) return null;
  const name = (id: string) => s.drivers.find((d: any) => d.id === id)?.name || 'Motorista excluído';
  const asset = (id: string) => s.assets.find((a: any) => a.id === id)?.name || id;
  return (
    <Card title="Conflitos de motorista para conferência" icon="atencao" className="mb-grid" actions={<Button variant="link" size="sm" onClick={() => setShowAll(!showAll)}>{showAll ? 'Só os pendentes' : `Ver conferidos (${all.length - all.filter((c) => !c.acked).length})`}</Button>}>
      <p className="text-small text-ink-2 mb-card-head">Quando duas origens apontam motoristas diferentes no mesmo período, vale a de maior prioridade ({DRIVER_PARAMS.sourcePriority.map((x) => LINK_SOURCE[x]).join(' > ')}). Confira e marque como conferido.</p>
      <Table minWidth={820} empty="Nenhum conflito pendente." head={['Veículo', 'Período', 'Vale', 'Diverge', '']}
        rows={list.map((c) => [
          <AssetName name={asset(c.assetId)} />,
          <span className="text-small num">{fmtDT(c.from)} → {c.to ? fmtDT(c.to) : 'agora'}</span>,
          <span className="flex flex-col"><span className="font-medium">{name(c.win.driverId)}</span><span className="text-caption text-ink-2">{LINK_SOURCE[c.win.source]}</span></span>,
          <span className="flex flex-col"><span>{name(c.lose.driverId)}</span><span className="text-caption text-ink-2">{LINK_SOURCE[c.lose.source]}</span></span>,
          c.acked ? <span className="text-caption text-ink-2">Conferido por {c.acked.by} em {fmtD(c.acked.at)}</span>
            : <Button size="sm" variant="soft" onClick={() => { ackConflict(c); toast('Conflito marcado como conferido.'); }}>Marcar como conferido</Button>,
        ])} />
    </Card>
  );
}

// motoristas que já passaram pelo ativo, com a origem do vínculo (lib/driverLinks)
function DriverHistory({ assetId }: { assetId: string }) {
  const s = useStoreData();
  const links = linksOf(s, assetId);
  if (!links.length) return null;
  const name = (id: string) => s.drivers.find((d: any) => d.id === id)?.name || 'Motorista excluído';
  const eff = effectiveLink(links, Date.now());
  const open = driverConflicts(s, assetId).filter((c) => !c.acked);
  return (
    <div className="flex flex-col gap-tight border border-line rounded-ctl p-card-sm">
      <span className="text-small font-semibold">Histórico de motoristas</span>
      {open.length > 0 && <p className="text-caption"><StatusDot kind="parado" label={`${open.length} ${open.length === 1 ? 'conflito' : 'conflitos'} de origem para conferir`} /><span className="block text-ink-2 mt-hair">Confira na aba Motoristas.</span></p>}
      <ul className="flex flex-col gap-2">{links.slice(0, 8).map((l: any) => (
        <li key={l.id} className="text-caption"><span className="font-medium text-small">{name(l.driverId)}</span>{eff?.id === l.id && <span className="text-caption text-ink-2"> · vale agora</span>}<span className="block text-ink-2">{fmtD(l.start)} → {l.end ? fmtD(l.end) : 'atual'} · {LINK_SOURCE[l.source] || l.source}</span></li>
      ))}</ul>
      <p className="text-caption text-ink-2">Prioridade entre origens: {DRIVER_PARAMS.sourcePriority.map((x) => LINK_SOURCE[x]).join(' > ')}.</p>
      <p className="text-caption text-ink-2">Trocar o motorista não muda eventos, viagens e abastecimentos já gravados.</p>
    </div>
  );
}

// rastreadores que já passaram pelo ativo (vínculos em accessLog, os mesmos usados na cobrança)
function TrackerHistory({ assetId }: { assetId: string }) {
  const log = useStore(useShallow((s) => s.accessLog.filter((l: any) => l.assetId === assetId).sort((x: any, y: any) => y.ts - x.ts)));
  if (!log.length) return null;
  return (
    <div className="flex flex-col gap-tight border border-line rounded-ctl p-card-sm">
      <span className="text-small font-semibold">Histórico de rastreadores</span>
      <ul className="flex flex-col gap-2">{log.map((l: any) => (
        <li key={l.id} className="text-caption flex flex-col items-start gap-hair"><IdChip size="sm">{l.imei}</IdChip><span className="block text-ink-2 num">{fmtD(l.ts)} → {l.unlinkedAt ? `${fmtD(l.unlinkedAt)}${l.unlinkReason ? ` (${l.unlinkReason})` : ''}` : 'atual'}</span></li>
      ))}</ul>
    </div>
  );
}

// situação do ativo (lib/assetLifecycle); aplicar fecha a ficha porque pode retirar o rastreador
function Situacao({ a, onDone }: { a: any; onDone: () => void }) {
  const cur = lifeOf(a);
  const [to, setTo] = useState(cur);
  const [note, setNote] = useState('');
  const out = LIFECYCLE[to].out;
  const [busy, setBusy] = useState(false);
  // ativo real: o rastreador sai da instalação na API antes (com o status ainda ativo a frota recarrega sem ele) e o status vai junto
  const aplicar = async () => {
    setBusy(true);
    try {
      if (isRealAsset(a)) {
        if (out && a.tracker?.instalacaoId) await desinstalarRastreador(a.tracker.instalacaoId);
        await atualizarSituacaoAtivo(a.id, to);
      }
      setLifecycle(a.id, to, note.trim());
      // anotação e histórico da mudança ficam na ficha (o status já foi acima)
      if (isRealAsset(a)) await salvarFichaAtivo(a.id);
      toast(`${a.name}: ${LIFECYCLE[to].label.toLowerCase()}.`);
      onDone();
    } catch (e: any) {
      toast('Não foi possível mudar a situação: ' + (e.message || e), { tone: 'crit' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-stack border border-line rounded-ctl p-card-sm">
      <span className="text-small font-semibold">Situação</span>
      <StatusDot kind={cur === 'ativo' ? 'mov' : cur === 'inativo' ? 'parado' : 'off'} label={`${LIFECYCLE[cur].label}${a.lifecycle?.at && cur !== 'ativo' ? ` desde ${fmtD(a.lifecycle.at)}` : ''}`} />
      <Field label="Mudar para"><Select value={to} onChange={(e) => setTo(e.target.value)} options={Object.entries(LIFECYCLE).map(([value, x]) => ({ value, label: x.label }))} /></Field>
      {to !== cur && <>
        <p className="text-caption text-ink-2">{LIFECYCLE[to].hint}.</p>
        <Field label={out ? 'Motivo, comprador ou nº do boletim' : 'Observação'}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Button size="sm" variant={out ? 'danger' : 'soft'} loading={busy} disabled={out && !note.trim()} onClick={aplicar}>Confirmar: {LIFECYCLE[to].label}</Button>
      </>}
    </div>
  );
}

// situação do documento na linguagem de status: vencido/na semana = crítico, no mês = atenção (mesma regra de priorityKind)
const DOC_KIND: Record<DocState, StatusKind> = { vencido: 'crit', critico: 'crit', atencao: 'parado', ok: 'mov', sem_data: 'off' };
export const DocStatus = ({ d, p }: { d: any; p?: typeof DOC_PARAMS }) => <StatusDot kind={DOC_KIND[docState(d, Date.now(), p)]} label={docWhen(d)} className="min-w-0 truncate" />;

function Documentos({ a, set }: { a: any; set: (k: string, v: any) => void }) {
  const docs: any[] = a.documents || [];
  const types = docTypesFor(a.kind);
  const upd = (i: number, k: string, v: any) => set('documents', docs.map((d, j) => (j === i ? { ...d, [k]: v } : d)));
  const add = () => { const used = new Set(docs.map((d) => d.type)); set('documents', [...docs, { id: 'doc_' + Math.random().toString(36).slice(2, 9), type: (types.find((t) => !used.has(t.key)) || types[types.length - 1]).key, number: '', due: '' }]); };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center"><span className="text-small font-semibold mr-auto">Documentos e vencimentos</span><Button size="sm" variant="soft" onClick={add}>Adicionar documento</Button></div>
      <span className="text-small text-ink-2">Vencido ou a {DOC_PARAMS.criticalDays} dias do fim entra no “Precisa de você”; a {DOC_PARAMS.attentionDays} dias aparece como atenção na lista.</span>
      {docs.length === 0 && <div className="border border-dashed border-line-strong rounded-ctl"><EmptyState illustration="ilu-documentos" layout="row" title="Nenhum documento" detail="Cadastre CRLV, IPVA, seguro e outros para ser avisado antes do vencimento." action={<Button size="sm" variant="secondary" onClick={add}><Icon name="mais" size={16} />Adicionar documento</Button>} /></div>}
      {docs.map((d, i) => (
        <div key={d.id} className="grid grid-cols-1 md:grid-cols-[1.2fr_0.9fr_150px_minmax(140px,1fr)_auto] gap-tight items-end border border-line rounded-ctl p-tight">
          <Field label="Documento"><Select value={d.type} onChange={(e) => upd(i, 'type', e.target.value)} options={(types.some((t) => t.key === d.type) ? types : [...types, DOC_TYPES.find((t) => t.key === d.type)!]).map((t) => ({ value: t.key, label: t.label }))} /></Field>
          {d.type === 'outro' ? <Field label="Nome"><Input value={d.name || ''} onChange={(e) => upd(i, 'name', e.target.value)} placeholder="Ex.: Laudo de opacidade" /></Field>
            : <Field label="Número / apólice"><Input value={d.number || ''} onChange={(e) => upd(i, 'number', e.target.value)} /></Field>}
          <Field label="Vencimento"><Input type="date" value={d.due || ''} onChange={(e) => upd(i, 'due', e.target.value)} /></Field>
          <div className="flex flex-col gap-field-label min-w-0"><span className="invisible text-small" aria-hidden="true">·</span><div className="h-ctl flex items-center min-w-0">{d.due ? <DocStatus d={d} /> : <span className="text-small text-ink-2">Informe o vencimento</span>}</div></div>
          <div className="flex flex-col gap-field-label"><span className="invisible text-small" aria-hidden="true">·</span><div className="h-ctl flex items-center gap-1">
            <FilePick accept="image/*,application/pdf" maxMB={4} onFile={(data, f) => set('documents', docs.map((x, j) => (j === i ? { ...x, file: data, fileName: f.name } : x)))} className="h-9 px-2 rounded-btn text-small link-brand hover:bg-card-2 max-w-[140px] min-w-0 inline-flex items-center gap-1"><Icon name="anexo" size={16} className="shrink-0" /><span className="truncate min-w-0">{d.fileName ? d.fileName : 'Anexar'}</span></FilePick>
            <TextButton tone="danger" onClick={async () => { if ((d.number || d.due || d.file || d.name) && !(await confirmAction({ title: `Remover ${docLabel(d)}?`, detail: d.file ? 'O número, o vencimento e o arquivo anexado saem do cadastro ao salvar.' : 'O número e o vencimento saem do cadastro ao salvar, e o aviso de vencimento deixa de existir.', confirmLabel: 'Remover' }))) return; set('documents', docs.filter((x) => x.id !== d.id)); }} aria-label={`Remover ${docLabel(d)}`}>Remover</TextButton>
          </div></div>
        </div>
      ))}
    </div>
  );
}

function Engates({ trailerId }: { trailerId: string }) {
  const s = useStoreData();
  const cur = currentCoupling(s, trailerId);
  const hist = couplingsOf(s, trailerId);
  const nm = (id: string) => s.assets.find((x: any) => x.id === id)?.name || '—';
  return (
    <div className="flex flex-col gap-stack border border-line rounded-ctl p-card-sm">
      <div className="flex flex-wrap items-baseline gap-2"><span className="text-small font-semibold mr-auto">Engates</span><span className="text-small text-ink-2">{cur ? <>{compositionName(s, cur.items)} com <AssetName name={nm(cur.tractorId)} /> desde <span className="num">{fmtD(cur.from)}</span> · posição {cur.items.indexOf(trailerId) + 1} de {cur.items.length}</> : 'Desengatado'}</span></div>
      <Table minWidth={620} dense empty="Nenhum engate registrado." align={['left', 'left', 'left', 'left', 'right']} head={['Composição', 'Cavalo', 'Início', 'Fim', 'Km rodados']} rows={hist.map((c) => [<CompositionLine items={c.items} mark={trailerId} />, <AssetName name={nm(c.tractorId)} />, fmtD(c.from), c.to ? fmtD(c.to) : 'vigente', <Num value={Math.max(0, (c.kmTo ?? assetKm(s, c.tractorId)) - c.kmFrom)} unit="km" size="body" />])} />
      <p className="text-caption text-ink-2">O km do implemento é a soma do que cada cavalo rodou com ele engatado, a partir de {num(s.assets.find((x: any) => x.id === trailerId)?.kmBase || 0)} km no cadastro. Para engatar ou desengatar, abra a ficha do cavalo.</p>
    </div>
  );
}

// implementos em ordem, do cavalo para trás
function CompositionLine({ items, mark }: { items: string[]; mark?: string }) {
  const s = useStoreData();
  return (
    <span className="inline-flex flex-col">
      <span className="text-small font-medium">{compositionName(s, items)}</span>
      <span className="text-caption text-ink-2">{items.map((id, i) => { const x = s.assets.find((a: any) => a.id === id); return <span key={id}>{i > 0 && ' → '}<span className={cx(id === mark && 'text-ink font-medium')}>{x?.name || '—'}</span></span>; })}</span>
    </span>
  );
}

// Composição do cavalo: 1 a 3 implementos em ordem. Salvar fecha a composição vigente e abre outra no histórico.
function Composicao({ tractorId }: { tractorId: string }) {
  const s = useStoreData();
  const cur = compositionOf(s, tractorId);
  const [items, setItems] = useState<string[]>(cur?.items || []);
  const hist = tractorHistory(s, tractorId);
  const impl = opAssets(s).filter((x: any) => x.kind === 'implemento');
  const label = (x: any) => { const o = currentCoupling(s, x.id); return `${x.name} · ${TRAILER_TYPE[(x.trailerType || 'semirreboque') as TrailerType]}${o && o.tractorId !== tractorId ? ` · em ${s.assets.find((a: any) => a.id === o.tractorId)?.name}` : ''}`; };
  const err = items.length ? compositionError(s, tractorId, items) : '';
  const changed = (cur?.items || []).join() !== items.join();
  const save = (next: string[]) => {
    const r = setComposition(s, tractorId, next, Math.round(assetKm(s, tractorId)));
    if ('error' in r) return toast(r.error, { tone: 'crit' });
    s.patch(() => ({ couplings: r.list })); setItems(next);
    toast(next.length ? `${compositionName(s, next)} registrado no histórico.` : 'Cavalo desengatado.');
  };
  return (
    <div className="flex flex-col gap-stack border border-line rounded-ctl p-card-sm">
      <div className="flex flex-wrap items-baseline gap-2"><span className="text-small font-semibold mr-auto">Composição</span><span className="text-small text-ink-2">{cur ? <>{compositionName(s, cur.items)} desde {fmtD(cur.from)}</> : 'Sem implemento'}</span></div>
      <ol className="flex flex-col gap-2">
        {items.map((id, i) => (
          <li key={i} className="flex items-end gap-2">
            <span className="num text-ink-2 w-5 pb-stack">{i + 1}</span>
            <div className="flex-1"><SearchSelect aria-label={`Implemento ${i + 1}`} value={id} onChange={(v) => setItems(items.map((x, j) => (j === i ? v : x)))} placeholder="Buscar placa ou nome do implemento" options={impl.map((x: any) => ({ value: x.id, label: label(x) }))} /></div>
            <TextButton tone="danger" className="pb-stack" onClick={() => setItems(items.filter((_, j) => j !== i))}>Remover</TextButton>
          </li>
        ))}
      </ol>
      {items.length < MAX_ITEMS && <Button size="sm" variant="ghost" className="self-start" onClick={() => setItems([...items, ''])}>{items.length ? 'Adicionar implemento atrás' : 'Engatar implemento'}</Button>}
      {items.length > 0 && items.every(Boolean) && <p className={cx('text-caption', err ? 'text-crit-ink' : 'text-ink-2')} role={err ? 'alert' : undefined}>{err || <>Vai registrar: <b>{compositionName(s, items)}</b>, do cavalo para trás.</>}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!changed || !items.length || items.some((x) => !x) || !!err} onClick={() => save(items)}>Salvar composição</Button>
        {cur && <Button size="sm" variant="ghost" onClick={() => save([])}>Desengatar tudo</Button>}
      </div>
      <Table minWidth={620} dense empty="Nenhum engate registrado." align={['left', 'left', 'left', 'right']} head={['Composição', 'Início', 'Fim', 'Km rodados']} rows={hist.map((c) => [<CompositionLine items={c.items} />, fmtD(c.from), c.to ? fmtD(c.to) : 'vigente', <Num value={Math.max(0, (c.kmTo ?? assetKm(s, tractorId)) - c.kmFrom)} unit="km" size="body" />])} />
      <p className="text-caption text-ink-2">Ordem do cavalo para trás. Bitrem: dois semirreboques. Rodotrem: semirreboque, dolly e semirreboque. Cada troca fecha a composição vigente com o km do cavalo e abre outra.</p>
    </div>
  );
}

// grupos da API (uuid); o "Frota real (rastreador)" é só da tela e não se edita aqui
const ehGrupoApi = (g: any) => /^[0-9a-f-]{36}$/i.test(g.id);

function Grupos() {
  const groups = useStore(useShallow((s) => s.groups.filter(ehGrupoApi)));
  const assets = useStore((s) => opAssets(s)); // contagem só da frota atual
  const [edit, setEdit] = useState<{ id?: string; name: string; assetIds: string[] } | null>(null);
  const excluir = async (g: any) => {
    if (!(await confirmAction({ title: `Excluir ${g.name}?`, detail: 'Os ativos deixam de fazer parte dele, mas não são apagados.' }))) return;
    try { await removerGrupo(g.id); toast(`${g.name} excluído.`); } catch (e: any) { toast('Não foi possível excluir: ' + (e.message || e), { tone: 'crit' }); }
  };
  useMobilePageAction({ label: 'Novo grupo', icon: 'mais', onClick: () => setEdit({ name: '', assetIds: [] }) });
  return (
    <Card title="Grupos de veículos" icon="equipe" actions={<Button size="sm" onClick={() => setEdit({ name: '', assetIds: [] })} className="max-md:hidden"><Icon name="mais" size={16} />Novo grupo</Button>}>
      <Table head={['Grupo', 'Ativos', '']} align={['left', 'left', 'right']}
        emptyState={<EmptyState icon="equipe" title="Nenhum grupo criado" detail="Agrupe ativos por filial, contrato ou tipo de operação para filtrar mapa, relatórios e parâmetros do Setup." action={<Button size="sm" onClick={() => setEdit({ name: '', assetIds: [] })}>Criar grupo</Button>} />}
        rows={groups.map((g: any) => {
          const membros = assets.filter((a: any) => g.assetIds.includes(a.id));
          return [
            <span className="font-medium">{g.name}</span>,
            membros.length ? <span><span className="num">{membros.length}</span> · <span className="text-ink-2">{membros.slice(0, 4).map((a: any) => a.name).join(', ')}{membros.length > 4 ? '…' : ''}</span></span> : <span className="text-ink-2">Nenhum ativo</span>,
            <span className="inline-flex gap-tight"><TextButton onClick={() => setEdit({ id: g.id, name: g.name, assetIds: [...g.assetIds] })}>Editar</TextButton><TextButton tone="danger" onClick={() => excluir(g)}>Excluir</TextButton></span>,
          ];
        })} />
      {edit && <GrupoForm g={edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function GrupoForm({ g, onClose }: { g: { id?: string; name: string; assetIds: string[] }; onClose: () => void }) {
  // só ativos que existem na API entram em grupo (o vínculo é gravado lá)
  const assets = useStore(useShallow((s) => opAssets(s).filter(isRealAsset)));
  const [name, setName] = useState(g.name);
  const [sel, setSel] = useState<string[]>(g.assetIds);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const termo = q.trim().toLowerCase();
  const visiveis = assets.filter((a: any) => !termo || `${a.name} ${a.plate || ''} ${a.apelido || ''}`.toLowerCase().includes(termo));
  const todos = visiveis.length > 0 && visiveis.every((a: any) => sel.includes(a.id));
  const salvar = async () => {
    setBusy(true);
    try {
      const id = name.trim() !== g.name || !g.id ? await salvarGrupo({ id: g.id, name: name.trim() }) : g.id;
      const antes = [...g.assetIds].sort().join();
      if ([...sel].sort().join() !== antes) await definirAtivosDoGrupo(id, sel);
      toast(g.id ? `${name.trim()} atualizado.` : `${name.trim()} criado.`);
      onClose();
    } catch (e: any) {
      toast('Não foi possível salvar o grupo: ' + (e.message || e), { tone: 'crit' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={g.id ? `Editar ${g.name}` : 'Novo grupo'} footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!name.trim()} onClick={salvar}>Salvar grupo</Button></>}>
      <div className="flex flex-col gap-group">
        <Field label="Nome do grupo"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ex.: Frota Caruaru" /></Field>
        <div className="flex flex-col gap-stack">
          <div className="flex flex-wrap items-center gap-tight">
            <span className="text-small font-semibold mr-auto">Ativos do grupo <span className="text-ink-2 font-normal num">({sel.length} de {assets.length})</span></span>
            <SearchInput value={q} onChange={setQ} placeholder="Buscar placa ou nome" aria-label="Buscar ativo" className="w-56" />
          </div>
          {assets.length === 0 ? <p className="text-small text-ink-2">Nenhum ativo cadastrado ainda.</p> : <>
            <Check label={todos ? 'Desmarcar os listados' : 'Marcar os listados'} checked={todos} indeterminate={!todos && visiveis.some((a: any) => sel.includes(a.id))}
              onChange={(v) => setSel(v ? [...new Set([...sel, ...visiveis.map((a: any) => a.id)])] : sel.filter((id) => !visiveis.some((a: any) => a.id === id)))} />
            <div className="grid sm:grid-cols-2 gap-tight max-h-[320px] overflow-y-auto border border-line rounded-ctl p-tight">
              {visiveis.map((a: any) => <Check key={a.id} label={a.name} description={a.plate && a.apelido ? a.apelido : undefined} checked={sel.includes(a.id)} onChange={(v) => setSel(v ? [...sel, a.id] : sel.filter((x) => x !== a.id))} />)}
              {visiveis.length === 0 && <p className="text-small text-ink-2">Nenhum ativo encontrado.</p>}
            </div>
          </>}
        </div>
      </div>
    </Modal>
  );
}

// operações moram na API (operacoes); renomear grava ao sair do campo
// Marca e modelo escolhidos na lista do cliente (apps/api/src/catalogo-ativos); "cadastrar novo" só quando não acha,
// e antes de criar mostra o que já existe parecido ("13190" × "13.190"). O ativo grava o modelo (a marca vem dele).
const NOVO = '__novo__:';

// UF de registro do veículo (CRLV): IPVA, licenciamento e taxas mudam por estado
const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
function CampoUf({ a, set }: { a: any; set: (k: string, v: any) => void }) {
  return <Field label="Estado (UF) de registro"><Select value={a.uf || ''} onChange={(e) => set('uf', e.target.value)} options={[{ value: '', label: '—' }, ...UFS.map((u) => ({ value: u, label: u }))]} /></Field>;
}
function MarcaModelo({ a, setA, rotulo, classes = ['', ''] }: { a: any; setA: (a: any) => void; rotulo: string; classes?: string[] }) {
  const c: CatalogoAtivos = useStore((s) => s.catalogoAtivos) || CATALOGO_VAZIO;
  const marcaId = a.marcaId || marcaModeloDoAtivo(a.modeloId, c)?.marcaId || '';
  const modelos = c.modelos.filter((m) => m.marcaId === marcaId);
  const [novo, setNovo] = useState<{ lista: 'marca' | 'modelo'; nome: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const rot = rotulo.toLowerCase();
  const buscar = (lista: 'marca' | 'modelo', itens: { id: string; nome: string }[]) => async (q: string, digitado: string) => [
    ...itens.filter((x) => !q || x.nome.toLowerCase().includes(q)).map((x) => ({ value: x.id, label: x.nome })),
    ...(digitado && !mesmoNome(digitado, itens) ? [{ value: NOVO + digitado, label: `Cadastrar ${lista === 'marca' ? `${rot === 'marca' ? 'nova marca' : 'novo fabricante'}` : 'novo modelo'} “${digitado}”` }] : []),
  ];
  const usarMarca = (m: { id: string; nome: string } | null) => {
    setNovo(null);
    if (!m) return setA({ ...a, marcaId: '', brand: '', modeloId: '', model: '' });
    setA({ ...a, marcaId: m.id, brand: m.nome, ...(m.id !== marcaId && { modeloId: '', model: '' }) });
  };
  const usarModelo = (m: { id: string; nome: string } | null) => {
    setNovo(null);
    setA({ ...a, marcaId, brand: c.marcas.find((x) => x.id === marcaId)?.nome || a.brand, modeloId: m?.id || '', model: m?.nome || '' });
  };
  const escolher = (lista: 'marca' | 'modelo') => (v: string) => {
    if (v.startsWith(NOVO)) return setNovo({ lista, nome: v.slice(NOVO.length) });
    if (lista === 'marca') usarMarca(c.marcas.find((m) => m.id === v) || null);
    else usarModelo(modelos.find((m) => m.id === v) || null);
  };
  const cadastrar = async () => {
    if (!novo) return;
    setBusy(true);
    try {
      if (novo.lista === 'marca') usarMarca(await criarMarca(novo.nome.trim()));
      else usarModelo(await criarModelo(marcaId, novo.nome.trim()));
    } catch (e: any) {
      toast('Não foi possível cadastrar: ' + (e.message || e), { tone: 'crit' });
    } finally {
      setBusy(false);
    }
  };
  const sim = novo ? parecidos(novo.nome, novo.lista === 'marca' ? c.marcas : modelos) : [];
  const antigo = !a.modeloId && (a.brand || a.model) ? `${a.brand || ''} ${a.model || ''}`.trim() : '';
  return (
    <>
      <Field label={rotulo} className={classes[0]}>
        <SearchSelect aria-label={rotulo} value={marcaId} onChange={escolher('marca')} onQuery={buscar('marca', c.marcas)} options={c.marcas.map((m) => ({ value: m.id, label: m.nome }))} placeholder={`Buscar ${rot}`} emptyLabel={`Digite para cadastrar ${rot === 'marca' ? 'uma marca' : 'um fabricante'}`} />
      </Field>
      <Field label="Modelo" className={classes[1]}>
        {marcaId
          ? <SearchSelect aria-label="Modelo" value={a.modeloId || ''} onChange={escolher('modelo')} onQuery={buscar('modelo', modelos)} options={modelos.map((m) => ({ value: m.id, label: m.nome }))} placeholder="Buscar modelo" emptyLabel="Digite para cadastrar um modelo" />
          : <Input disabled placeholder={`Escolha ${rot === 'marca' ? 'a marca' : 'o fabricante'} primeiro`} />}
      </Field>
      {antigo && !novo && <p className="basis-full col-span-full text-caption text-ink-2">Na ficha estava “{antigo}”, digitado à mão. Escolha na lista ou cadastre.</p>}
      {novo && (
        <div className="basis-full col-span-full flex flex-col gap-stack border border-line rounded-ctl p-card-sm">
          {sim.length > 0 && <div className="flex flex-col gap-tight">
            <p className="text-small font-medium">Você quis dizer:</p>
            <div className="flex flex-wrap gap-tight">{sim.map((x) => <Button key={x.id} size="sm" variant="soft" onClick={() => (novo.lista === 'marca' ? usarMarca(x) : usarModelo(x))}>{x.nome}</Button>)}</div>
          </div>}
          <Field label={novo.lista === 'marca' ? `Nome ${rot === 'marca' ? 'da nova marca' : 'do novo fabricante'}` : 'Nome do novo modelo'}><Input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></Field>
          <div className="flex flex-wrap gap-tight">
            <Button size="sm" loading={busy} disabled={!chaveCatalogo(novo.nome)} onClick={cadastrar}>{sim.length ? 'Cadastrar mesmo assim' : 'Cadastrar'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setNovo(null)}>Cancelar</Button>
          </div>
        </div>
      )}
    </>
  );
}

// Tipos (prontos e da empresa) e a lista de marcas/modelos: renomear corrige a grafia em todos os ativos que apontam para ela.
const BASES = [{ value: 'veiculo', label: 'Veículo' }, { value: 'implemento', label: 'Carreta / implemento' }, { value: 'linha_amarela', label: 'Linha amarela' }, { value: 'equipamento', label: 'Equipamento' }];
function TiposEModelos() {
  const c: CatalogoAtivos = useStore((s) => s.catalogoAtivos) || CATALOGO_VAZIO;
  const assets = useStore((s) => opAssets(s));
  const tipos = tiposDoCliente(c.tipos);
  const [novo, setNovo] = useState({ nome: '', base: 'linha_amarela' });
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [icone, setIcone] = useState<OpcaoTipo | null>(null);
  const erro = (pre: string) => (e: any) => toast(pre + (e.message || e), { tone: 'crit' });
  const usoTipo = (o: OpcaoTipo) => assets.filter((a: any) => a.category && tipoDoAtivo(a) === o.value).length;
  // tipo pronto vira linha "renomeia este pronto" na API; o da empresa é atualizado pelo id
  const gravarTipo = (o: OpcaoTipo, mudanca: { nome?: string; icone?: string }) => salvarTipoAtivo({
    id: o.tipoId, nome: mudanca.nome ?? o.label, base: o.kind, padrao: o.value.startsWith('t:') ? null : o.value, icone: mudanca.icone ?? o.icone ?? null,
  });
  const renomearTipo = (o: OpcaoTipo) => {
    const nome = (nomes['t' + o.value] ?? o.label).trim();
    if (!nome || nome === o.label) return;
    gravarTipo(o, { nome }).then(() => setNomes(({ ['t' + o.value]: _, ...r }) => r)).catch(erro('Nome não gravado: '));
  };
  const criarTipo = async () => {
    const parecido = mesmoNome(novo.nome, tipos.map((t) => ({ nome: t.label })));
    if (parecido) return toast(`Já existe o tipo ${parecido.nome}.`, { tone: 'crit' });
    try { await salvarTipoAtivo({ nome: novo.nome.trim(), base: novo.base }); toast(`${novo.nome.trim()} adicionado.`); setNovo({ ...novo, nome: '' }); } catch (e: any) { erro('Não foi possível salvar: ')(e); }
  };
  const renomear = (lista: 'marcas' | 'modelos', item: { id: string; nome: string }) => {
    const nome = (nomes[item.id] ?? item.nome).trim();
    if (!nome || nome === item.nome) return;
    renomearNoCatalogo(lista, item.id, nome).then(() => setNomes(({ [item.id]: _, ...r }) => r)).catch((e: any) => { setNomes(({ [item.id]: _, ...r }) => r); erro('Nome não gravado: ')(e); });
  };
  const usoModelo = (id: string) => assets.filter((a: any) => a.modeloId === id).length;
  return (
    <div className="flex flex-col gap-grid">
      <Card title="Tipos de ativo" icon="ativos">
        <p className="text-small text-ink-2 mb-card-head">Os tipos prontos podem ser renomeados para o nome que a sua operação usa. O ícone do tipo é o que o cadastro sugere.</p>
        <div className="flex flex-wrap gap-tight mb-card-head max-w-2xl">
          <Input className="flex-1 min-w-[200px]" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Ex.: Guindaste" aria-label="Nome do novo tipo" />
          <Select className="w-48" aria-label="Base do novo tipo" value={novo.base} onChange={(e) => setNovo({ ...novo, base: e.target.value })} options={BASES} />
          <Button disabled={!chaveCatalogo(novo.nome)} onClick={criarTipo}>Adicionar tipo</Button>
        </div>
        <Table minWidth={560} head={['', 'Nome', 'Base', 'Ativos', '']} rows={tipos.map((o) => [
          o.icone ? <img src={pngIconUrl(o.icone)} alt="" className="w-12 h-8 object-contain" /> : <span className="text-caption text-ink-3">—</span>,
          <InlineInput aria-label={`Nome do tipo ${o.label}`} className="font-medium w-full" value={nomes['t' + o.value] ?? o.label} onChange={(e) => setNomes({ ...nomes, ['t' + o.value]: e.target.value })} onBlur={() => renomearTipo(o)} />,
          <span className="text-ink-2 whitespace-nowrap">{BASES.find((b) => b.value === o.kind)?.label}{o.value.startsWith('t:') ? ' · da empresa' : ''}</span>,
          usoTipo(o) || '—',
          <TextButton onClick={() => setIcone(o)}>Trocar ícone</TextButton>])} />
      </Card>
      <Card title="Marcas e modelos" icon="ativos">
        <p className="text-small text-ink-2 mb-card-head">A lista cresce pelo cadastro do ativo. Corrigir o nome aqui corrige em todos os ativos que usam a marca ou o modelo.</p>
        {!c.marcas.length && <EmptyState title="Nenhuma marca ainda" detail="Cadastre a primeira escolhendo a marca no cadastro do ativo." />}
        <div className="flex flex-col gap-group">
          {c.marcas.map((m) => (
            <div key={m.id} className="flex flex-col gap-tight">
              <InlineInput aria-label={`Nome da marca ${m.nome}`} className="font-semibold text-body max-w-sm" value={nomes[m.id] ?? m.nome} onChange={(e) => setNomes({ ...nomes, [m.id]: e.target.value })} onBlur={() => renomear('marcas', m)} />
              <div className="flex flex-wrap gap-tight pl-stack">
                {c.modelos.filter((x) => x.marcaId === m.id).map((x) => (
                  <span key={x.id} className="inline-flex items-center gap-hair border border-line rounded-chip px-tight">
                    <InlineInput aria-label={`Nome do modelo ${x.nome}`} className="w-36" value={nomes[x.id] ?? x.nome} onChange={(e) => setNomes({ ...nomes, [x.id]: e.target.value })} onBlur={() => renomear('modelos', x)} />
                    <span className="text-caption text-ink-2 num">{usoModelo(x.id)}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
      {icone && (
        <Modal open onClose={() => setIcone(null)} title={`Ícone de ${icone.label}`}>
          <IconPicker category={icone.category} value={icone.icone || ''} onChange={(v) => { gravarTipo(icone, { icone: v }).then(() => { toast(`Ícone de ${icone.label} trocado.`); setIcone(null); }).catch(erro('Ícone não gravado: ')); }} />
        </Modal>
      )}
    </div>
  );
}

function Operacoes() {
  const items = useStore((s) => s.operations);
  const assets = useStore((s) => opAssets(s)); // contagem só da frota atual
  const [n, setN] = useState('');
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const erro = (pre: string) => (e: any) => toast(pre + (e.message || e), { tone: 'crit' });
  const criar = async () => { try { await salvarOperacao({ name: n.trim() }); toast(`${n.trim()} adicionada.`); setN(''); } catch (e: any) { erro('Não foi possível salvar: ')(e); } };
  const renomear = (o: any) => { const nome = (nomes[o.id] ?? o.name).trim(); if (!nome || nome === o.name) return; salvarOperacao({ id: o.id, name: nome, metaKml: o.metaKml }).then(() => setNomes(({ [o.id]: _, ...r }) => r)).catch(erro('Nome não gravado: ')); };
  const excluir = async (o: any) => { if (await confirmAction({ title: `Excluir ${o.name}?`, detail: 'Os ativos deixam de fazer parte dela, mas não são apagados.' })) { try { await removerOperacao(o.id); toast(`${o.name} excluída.`); } catch (e: any) { erro('Não foi possível excluir: ')(e); } } };
  return (
    <Card title="Operações" icon="rota">
      <div className="flex gap-tight mb-card-head max-w-lg"><Input value={n} onChange={(e) => setN(e.target.value)} placeholder="Ex.: Contrato Prefeitura" /><Button disabled={!n.trim()} onClick={criar}>Adicionar</Button></div>
      <Table head={['Nome', 'Ativos', '']} rows={items.map((o: any) => [
        <InlineInput aria-label="Nome" className="font-medium w-full" value={nomes[o.id] ?? o.name} onChange={(e) => setNomes({ ...nomes, [o.id]: e.target.value })} onBlur={() => renomear(o)} />,
        assets.filter((a: any) => a.operationId === o.id).map((a: any) => a.name).join(', ') || '—',
        <TextButton tone="danger" onClick={() => excluir(o)}>Excluir</TextButton>])} />
    </Card>
  );
}

function Drivers() {
  const drivers = useStore((s) => s.drivers);
  const inativos = useStore((s) => s.driversInativos || []);
  const assets = useStore((s) => s.assets);
  const { upsert, remove } = useStore.getState();
  const [d, setD] = useState<any>(null);
  useMobilePageAction({ label: 'Novo motorista', icon: 'mais', onClick: () => setD({ name: '', cnh: '', cnhCat: 'B', cnhDue: '', phone: '', regime: 'cargas' }) });
  return (
    <>
      <DriverConflicts />
      <Card title="Motoristas" icon="usuario" actions={<Button onClick={() => setD({ name: '', cnh: '', cnhCat: 'B', cnhDue: '', phone: '', regime: 'cargas' })} className="max-md:hidden"><Icon name="mais" size={16} />Novo motorista</Button>}>
        <Table head={['Nome', 'CNH', 'Categoria', 'Validade da CNH', 'Exame toxicológico', 'Telefone', 'Veículo atual', '']} rows={drivers.map((x: any) => [<span className="flex items-center gap-3"><Avatar name={x.name} size="sm" /><span className="font-medium">{x.name}</span></span>, <span className="num">{x.cnh}</span>, x.cnhCat, x.cnhDue ? <DocStatus d={{ due: x.cnhDue }} p={DRIVER_DOC_PARAMS} /> : <span className="text-ink-3">—</span>, /^[CDE]/.test(x.cnhCat) ? (x.toxDue ? <DocStatus d={{ due: x.toxDue }} p={DRIVER_DOC_PARAMS} /> : <span className="text-ink-3">—</span>) : <span className="text-ink-3">não exigido</span>, <span className="num">{x.phone}</span>, <AssetName name={assets.find((a: any) => a.driverId === x.id)?.name} />, <div className="flex gap-3"><TextButton onClick={() => setD({ ...x })}>Editar</TextButton><TextButton tone="danger" onClick={async () => { if (await confirmAction({ title: `Desativar o motorista ${x.name}?`, detail: 'Ele sai das telas e seletores. Viagens, marcações e eventos antigos continuam com o nome dele, e dá para reativar depois.' })) { try { await desativarMotorista(x.id); toast(`Motorista ${x.name} desativado.`); } catch (e: any) { toast('Não foi possível desativar: ' + (e.message || e), { tone: 'crit' }); } } }}>Desativar</TextButton></div>])} />
      </Card>
      {inativos.length > 0 && <Card title="Motoristas desativados" icon="usuario">
        <Table dense head={['Nome', 'CNH', '']} align={['left', 'left', 'right']} rows={inativos.map((x: any) => [<span className="font-medium">{x.name}</span>, <span className="num">{x.cnh || '—'}</span>,
          <TextButton onClick={async () => { try { await reativarMotorista(x.id); toast(`Motorista ${x.name} reativado.`); } catch (e: any) { toast('Não foi possível reativar: ' + (e.message || e), { tone: 'crit' }); } }}>Reativar</TextButton>])} />
      </Card>}
      <Modal open={!!d} onClose={() => setD(null)} title={d?.id ? 'Editar motorista' : 'Novo motorista'} footer={<><Button variant="ghost" onClick={() => setD(null)}>Cancelar</Button><Button disabled={!d?.name} onClick={async () => { const ruim = (['cpf', 'telefone', 'cnh'] as const).find((m) => !mascaraValida(m, d[{ cpf: 'cpf', telefone: 'phone', cnh: 'cnh' }[m]] || '')); if (ruim) { toast(MENSAGEM_INVALIDA[ruim], { tone: 'crit' }); return; } try { await salvarMotorista(d); toast(d.id ? 'Motorista atualizado.' : 'Motorista cadastrado.'); setD(null); } catch (e: any) { toast('Não foi possível salvar: ' + (e.message || e), { tone: 'crit' }); } }}>Salvar motorista</Button></>}>
        {d && <div className="grid grid-cols-1 sm:grid-cols-2 gap-field">
          <Field label="Nome" className="sm:col-span-2"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
          <Field label="CNH"><Input mask="cnh" value={d.cnh} onChange={(e) => setD({ ...d, cnh: e.target.value })} /></Field>
          <Field label="Categoria"><Select value={d.cnhCat} onChange={(e) => setD({ ...d, cnhCat: e.target.value })} options={['A', 'B', 'C', 'D', 'E', 'AB', 'AE']} /></Field>
          <Field label="Validade da CNH"><Input type="date" value={d.cnhDue || ''} onChange={(e) => setD({ ...d, cnhDue: e.target.value })} /></Field>
          <Field label="Exame toxicológico vence em" hint="Obrigatório para categorias C, D e E (a cada 2 anos e 6 meses)."><Input type="date" value={d.toxDue || ''} disabled={!/^[CDE]/.test(d.cnhCat)} onChange={(e) => setD({ ...d, toxDue: e.target.value })} /></Field>
          <Field label="Telefone"><Input mask="telefone" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} /></Field>
          <Field label="CPF"><Input mask="cpf" value={d.cpf || ''} onChange={(e) => setD({ ...d, cpf: e.target.value })} /></Field>
          <Field label="Matrícula"><Input value={d.registration || ''} onChange={(e) => setD({ ...d, registration: e.target.value })} /></Field>
          <Field label="Atividade (Lei 13.103)"><Select value={d.regime} onChange={(e) => setD({ ...d, regime: e.target.value })} options={[{ value: 'cargas', label: 'Transporte de cargas' }, { value: 'passageiros', label: 'Transporte de passageiros' }]} /></Field>
          <div className="sm:col-span-2"><Check label="CNH com EAR (exerce atividade remunerada): limite de 40 pontos, qualquer que seja a gravidade" checked={!!d.ear} onChange={(v) => setD({ ...d, ear: v })} /></div>
        </div>}
      </Modal>
    </>
  );
}
