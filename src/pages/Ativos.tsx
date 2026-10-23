import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore, assetKm, useStoreData } from '../lib/store';
import { Button, Card, Field, Input, Select, SearchSelect, Table, Check, Tabs, Modal, PageHeader, AssetThumb, cx, TextButton, InlineInput, TabPanel, toast, FilePick, confirmAction, SearchInput, EmptyState, buttonClass, ChoiceCard } from '../components/ui';
import { couplingsOf, currentCoupling, compositionOf, compositionName, compositionError, setComposition, tractorHistory, TRAILER_TYPE, MAX_ITEMS, type TrailerType } from '../lib/couplings';
import { Num, StatusDot, AssetName, IdChip, KpiTile, type StatusKind } from '../components/story';
import { Icon } from '../components/icons';
import { Dropzone } from '../components/Dropzone';
import { CATEGORIES, categoryOf, categoryLabel, AssetSilhouette } from '../components/assetArt';
import { PNG_ICON_IDS, PNG_ICON_SUGGESTION, pngIconUrl, pngIconLabel } from '../lib/pngIcons';
import { PLATE_DB, SPECS_DB, MODEL_BRAND } from '../lib/catalog';
import { num, fmtD, fmtDT, isPlate } from '../lib/utils';
import { linkTrackerWithInstall } from '../lib/odometer';
import { downloadAssets, readSheet, planImport, applyImport, type ImportPlan } from '../lib/assetSheet';
import { AUDIT_LABEL, fieldLabel, auditEntry } from '../lib/audit';
import { setDriver, linksOf, LINK_SOURCE, DRIVER_PARAMS, effectiveLink, driverConflicts, ackConflict } from '../lib/driverLinks';
import { LIFECYCLE, lifeOf, setLifecycle, unlinkTracker, opAssets } from '../lib/assetLifecycle';
import { RetiredToggle } from '../components/RetiredToggle';
import { DOC_TYPES, docTypesFor, docLabel, docState, docWhen, worstDoc, DOC_PARAMS, DRIVER_DOC_PARAMS, type DocState } from '../lib/assetDocs';

const blank = (kind = 'veiculo') => ({ id: '', kind, name: '', plate: '', brand: '', model: '', year: '', specs: {} as any, photo: '', icon: '', groupIds: [] as string[], operationId: '', driverId: '', kmSource: kind === 'veiculo' ? 'mescla' : kind === 'implemento' ? 'engate' : 'rastreador', kmOffset: 0, initialKm: '', fuelGoal: '', fuelBudget: '', meter: kind === 'veiculo' || kind === 'implemento' ? 'km' : kind === 'linha_amarela' || kind === 'maquina' ? 'horimetro' : 'nenhum', customFields: [] as any[], journeySource: 'teclado', serial: '', tracker: null as any, active: true, documents: [] as any[] });

export default function Ativos() {
  const [tab, setTab] = useState('ativos');
  const [edit, setEdit] = useState<any>(null);
  // ?ativo=<id> (vindo do "Precisa de você") abre a ficha direto
  const [sp, setSp] = useSearchParams();
  const assets = useStore((s) => s.assets);
  useEffect(() => {
    const aba = sp.get('aba');
    if (aba) { setTab(aba); setEdit(null); setSp({}, { replace: true }); return; }
    const a = assets.find((x: any) => x.id === sp.get('ativo'));
    if (a) { setTab('ativos'); setEdit(JSON.parse(JSON.stringify({ ...blank(a.kind), ...a, category: categoryOf(a) }))); setSp({}, { replace: true }); }
  }, [sp]);
  const tabs = <Tabs value={tab} onChange={setTab} tabs={[{ key: 'ativos', label: 'Ativos' }, { key: 'grupos', label: 'Grupos' }, { key: 'motoristas', label: 'Motoristas' }, { key: 'operacoes', label: 'Operações' }, { key: 'alteracoes', label: 'Alterações' }]} />;
  return (
    <div>
      <PageHeader icon="ativos" title="Gestão de ativos" subtitle="Veículos, linha amarela, máquinas e equipamentos rastreados" />
      <div className="flex flex-wrap items-center gap-tight mb-card-head">
        {tabs}
        {tab === 'ativos' && <Button onClick={() => setEdit(blank())}><Icon name="mais" size={18} />Novo ativo</Button>}
      </div>
      <TabPanel id={tab}>
        {tab === 'ativos' && <AssetList onOpen={(a: any) => setEdit(JSON.parse(JSON.stringify({ ...blank(a.kind), ...a, category: categoryOf(a) })))} />}
        {tab === 'grupos' && <SimpleList coll="groups" title="Grupos de veículos" placeholder="Ex.: Frota Caruaru" />}
        {tab === 'operacoes' && <SimpleList coll="operations" title="Operações" placeholder="Ex.: Contrato Prefeitura" />}
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
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  // vendidos e baixados saem da lista e dos totais; ficam acessíveis pelo filtro
  const all = opAssets(s);
  const linked = all.filter((a: any) => a.tracker).length;
  const docAlert = (a: any) => { const d = worstDoc(a); return !!d && ['vencido', 'critico', 'atencao'].includes(docState(d)); };
  const docN = all.filter(docAlert).length;
  const t = q.trim().toLowerCase();
  const driver = (id: string) => s.drivers.find((d: any) => d.id === id)?.name || '';
  const list = all.filter((a: any) => (!cat || categoryOf(a) === cat) && (!noTracker || !a.tracker) && (!docDue || docAlert(a)) && (!t || [a.name, a.plate, a.brand, a.model, driver(a.driverId), a.tracker?.imei].some((x) => (x || '').toLowerCase().includes(t))));
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
          <p className="text-small text-ink-2 num" aria-live="polite">{list.length === all.length ? `${all.length} ativos` : `${list.length} de ${all.length} ativos`}</p>
          <RetiredToggle />
          {(cat || noTracker || docDue || q) && <Button variant="link" size="sm" onClick={() => { setCat(''); setNoTracker(false); setDocDue(false); setQ(''); }}>Limpar filtros</Button>}
          <span className="flex-1" />
          <FilePick accept=".csv,.xlsx,.xls" maxMB={20} raw onFile={async (_, f) => { try { setPlan(planImport(await readSheet(f), useStore.getState())); } catch { toast('Não foi possível ler a planilha. Envie CSV ou XLSX.'); } }} className={buttonClass('secondary', 'sm')}><Icon name="importar" size={16} />Importar planilha</FilePick>
          <Button variant="ghost" size="sm" onClick={() => downloadAssets(s)}><Icon name="exportar" size={16} />Exportar</Button>
        </div>
        <Table minWidth={1160} onRow={(i) => onOpen(list[i])}
          emptyState={all.length ? <EmptyState illustration="ilu-busca-veiculo" layout="row" title="Nenhum ativo com esses filtros" detail="Tente outra busca ou limpe os filtros." action={<Button variant="dark" size="sm" onClick={() => { setCat(''); setNoTracker(false); setDocDue(false); setQ(''); }}>Limpar filtros</Button>} />
            : <EmptyState icon="ativos" title="Nenhum ativo cadastrado" detail="Cadastre o primeiro ativo ou importe a sua frota por planilha." />}
          card={(i) => { const a = list[i]; const d = worstDoc(a); return (
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <span className="flex items-center justify-between gap-3"><AssetName name={a.name} className="truncate" /><span className="text-caption text-ink-2 whitespace-nowrap">{categoryLabel(categoryOf(a))}</span></span>
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
              <span className="flex flex-col items-start gap-hair"><button type="button" onClick={(e) => { e.stopPropagation(); onOpen(a); }} className="text-left rounded-chip hover:ring-1 hover:ring-line-hover"><AssetName name={a.name} /></button>{lifeOf(a) !== 'ativo' && <span className="block text-caption text-ink-2">{LIFECYCLE[lifeOf(a)].label}</span>}</span>,
              <span className="text-ink-2 whitespace-nowrap">{categoryLabel(categoryOf(a))}</span>,
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
      <ImportPreview plan={plan} onClose={() => setPlan(null)} />
    </>
  );
}

// prévia da importação: mostra o que será criado, atualizado ou recusado; só grava ao confirmar
function ImportPreview({ plan, onClose }: { plan: ImportPlan | null; onClose: () => void }) {
  const [only, setOnly] = useState<'todas' | 'erro'>('todas');
  const lines = plan?.lines || [];
  const n = (k: string) => lines.filter((l) => l.action === k).length;
  const ok = n('criar') + n('atualizar');
  const shown = only === 'erro' ? lines.filter((l) => l.action === 'erro' || l.warnings.length) : lines;
  const confirm = () => {
    const [c, u] = applyImport(plan!, blank);
    toast(`${c} ${c === 1 ? 'ativo criado' : 'ativos criados'} e ${u} ${u === 1 ? 'atualizado' : 'atualizados'}.`);
    onClose();
  };
  return (
    <Modal open={!!plan} onClose={onClose} title="Importar ativos" width="max-w-4xl"
      footer={<><Button variant="link" onClick={() => downloadAssets(null, true)}>Baixar modelo</Button><span className="flex-1" /><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={!ok} onClick={confirm}>Importar {ok} {ok === 1 ? 'linha' : 'linhas'}</Button></>}>
      <div className="flex flex-wrap gap-x-section gap-y-stack">
        <div><p className="text-small text-ink-2">Novos</p><Num value={n('criar')} size="lg" className="block" /></div>
        <div><p className="text-small text-ink-2">Atualizados (mesma placa)</p><Num value={n('atualizar')} size="lg" className="block" /></div>
        <div><p className="text-small text-ink-2 flex items-center gap-tight">{n('erro') > 0 && <StatusDot kind="crit" label="" />}Com erro (não entram)</p><Num value={n('erro')} size="lg" className="block" /></div>
      </div>
      {(plan?.newGroups.length || plan?.newOperations.length) ? <p className="text-small text-ink-2">Serão criados {[plan!.newGroups.length && `os grupos ${plan!.newGroups.join(', ')}`, plan!.newOperations.length && `as operações ${plan!.newOperations.join(', ')}`].filter(Boolean).join(' e ')}.</p> : null}
      <Tabs value={only} onChange={(v: any) => setOnly(v)} tabs={[{ key: 'todas', label: 'Todas as linhas' }, { key: 'erro', label: 'Erros e avisos' }]} />
      <div className="max-h-[50vh] overflow-y-auto">
        <Table minWidth={640} empty="Nenhuma linha." head={['Linha', 'Placa / nome', 'Ação', 'Observações']}
          rows={shown.map((l) => [
            <span className="num text-ink-2">{l.row}</span>,
            <AssetName name={l.label} />,
            <StatusDot kind={l.action === 'erro' ? 'crit' : l.action === 'criar' ? 'mov' : 'parado'} label={l.action === 'erro' ? 'Erro' : l.action === 'criar' ? 'Criar' : 'Atualizar'} />,
            <span className="text-small">{[...l.errors, ...l.warnings].map((m, i) => <span key={i} className={cx('block', i >= l.errors.length && 'text-ink-2')}>{m}</span>)}{!l.errors.length && !l.warnings.length && <span className="text-ink-3">—</span>}</span>,
          ])} />
      </div>
      <p className="text-caption text-ink-2">Campos em branco não apagam o que já está cadastrado. O vínculo com rastreador continua na ficha do ativo, com os dados da instalação.</p>
    </Modal>
  );
}
function AssetForm({ a, setA }: any) {
  const s = useStoreData();
  const [msg, setMsg] = useState('');
  const [imei, setImei] = useState(a.tracker?.imei || '');
  const [tmodel, setTmodel] = useState(a.tracker?.model || 'GT06');
  const [iccid, setIccid] = useState(a.tracker?.iccid || '');
  const [inst, setInst] = useState({ km: '', photo: '', tech: '', calc: false, date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) });
  const newLink = !!imei && imei !== a.tracker?.imei;
  const instErr = !newLink ? '' : !inst.tech.trim() ? 'Informe o técnico responsável pela instalação.' : inst.calc ? '' : !inst.km ? 'Informe o odômetro inicial do painel.' : !inst.photo ? 'Envie a foto do painel com o odômetro.' : '';
  const isV = a.kind === 'veiculo';
  const set = (k: string, v: any) => setA({ ...a, [k]: v });
  const lookup = () => {
    const p = a.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const r = PLATE_DB[p];
    if (r) { setA({ ...a, plate: p, name: a.name || p, ...r, specs: SPECS_DB[r.model] || {} }); setMsg(`Placa ${p} encontrada: ${r.brand} ${r.model} ${r.year}. Ficha técnica preenchida — revise antes de salvar.`); }
    else if (SPECS_DB[a.model]) { setA({ ...a, plate: p, specs: SPECS_DB[a.model], brand: a.brand || MODEL_BRAND[a.model] }); setMsg('Ficha técnica preenchida pelo modelo.'); }
    else setMsg('Placa não encontrada na base simulada. Escolha o modelo na lista para preencher a ficha, ou preencha manualmente. Placas de teste: ' + Object.keys(PLATE_DB).join(', '));
  };
  const save = () => {
    const orig = s.assets.find((x: any) => x.id === a.id);
    const saved = s.upsert('assets', { ...a, driverId: orig ? orig.driverId : '', id: a.id || undefined, plate: a.plate.toUpperCase(), name: a.name || a.plate.toUpperCase(), fuelGoal: +a.fuelGoal || 0, fuelBudget: +a.fuelBudget || 0, kmOffset: +a.kmOffset || 0 });
    if ((a.driverId || '') !== (orig?.driverId || '')) setDriver(saved.id, a.driverId, 'escala');
    if (newLink) linkTrackerWithInstall(saved.id, { imei, model: tmodel, iccid }, { initialKm: inst.calc ? null : +inst.km, photo: inst.photo, technician: inst.tech.trim(), kmCalculated: inst.calc, installedAt: new Date(inst.date).getTime() });
    setA(null);
  };
  const specs = Object.entries<string>(a.specs || {});
  return (
    <Modal open onClose={() => setA(null)} title={a.id ? a.name : 'Novo ativo'} width="max-w-5xl" footer={<><Button variant="ghost" onClick={() => setA(null)}>Cancelar</Button><Button disabled={!(a.name || a.plate) || !!instErr} onClick={save}>Salvar ativo</Button></>}>
      <div role="group" aria-label="Tipo do ativo" className="flex flex-wrap gap-2">{CATEGORIES.map((ct) => { const on = (a.category || categoryOf(a)) === ct.key; return <button key={ct.key} type="button" aria-pressed={on} onClick={() => { const k = ct.kind; setA({ ...blank(k), ...a, category: ct.key, kind: k, meter: k === a.kind ? a.meter : k === 'veiculo' || k === 'implemento' ? 'km' : k === 'linha_amarela' ? 'horimetro' : 'nenhum', kmSource: k === a.kind ? a.kmSource : blank(k).kmSource }); }} className={cx('flex flex-col items-center gap-tight w-[112px] pt-3 pb-3 rounded-ctl text-caption transition-colors', on ? 'bg-card-2 ring-[1.5px] ring-inset ring-ink text-ink font-medium' : 'border border-line text-ink-2 hover:bg-card-2')}><AssetSilhouette category={ct.key} className="w-14 h-6" />{ct.label}</button>; })}</div>

      <div className="flex flex-wrap gap-group">
        <div className="flex-[999_1_480px] min-w-0 flex flex-col gap-group">
          {isV ? (
            <>
              <div className="flex flex-wrap gap-field items-end">
                <Field label="Placa" className="w-36"><Input className="font-mono font-semibold uppercase" value={a.plate} onChange={(e) => set('plate', e.target.value)} placeholder="ABC1D23" /></Field>
                <Field label="Marca" className="w-40"><Input value={a.brand} onChange={(e) => set('brand', e.target.value)} /></Field>
                <Field label="Modelo" className="flex-1 min-w-[180px]"><Input list="models" value={a.model} onChange={(e) => set('model', e.target.value)} /><datalist id="models">{Object.keys(SPECS_DB).map((m) => <option key={m} value={m} />)}</datalist></Field>
                <Field label="Ano" className="w-28"><Input value={a.year} onChange={(e) => set('year', e.target.value)} placeholder="2024/2025" /></Field>
                <div className="flex flex-col gap-field-label"><span className="invisible text-small" aria-hidden="true">·</span><Button variant="ghost" onClick={lookup}>Consultar dados do veículo</Button></div>
              </div>
              {msg && <p role="status" className="text-small text-ink-2 bg-card-2 border border-line rounded-ctl p-stack">{msg}</p>}
            </>
          ) : (
            <>
              <p className="text-small text-ink-2">{a.kind === 'implemento' ? 'Carreta ou implemento: engata em cavalos diferentes, tem pneus próprios e pode ter rastreador próprio.' : 'Ativos que não são veículos são cadastrados manualmente.'}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-field">
                {a.kind === 'implemento' && <Field label="Placa"><Input className="font-mono uppercase" value={a.plate} onChange={(e) => set('plate', e.target.value)} /></Field>}
                <Field label="Fabricante"><Input value={a.brand} onChange={(e) => set('brand', e.target.value)} /></Field>
                <Field label="Modelo"><Input value={a.model} onChange={(e) => set('model', e.target.value)} /></Field>
                <Field label="Ano"><Input value={a.year} onChange={(e) => set('year', e.target.value)} /></Field>
                <Field label="Nº de série / patrimônio"><Input value={a.serial} onChange={(e) => set('serial', e.target.value)} /></Field>
                {a.kind !== 'implemento' && <Field label="Medidor de uso"><Select value={a.meter} onChange={(e) => set('meter', e.target.value)} options={[{ value: 'horimetro', label: 'Horímetro' }, { value: 'km', label: 'Quilometragem' }, { value: 'nenhum', label: 'Sem medidor' }]} /></Field>}
              </div>
            </>
          )}
          <Field label="Apelido / identificação no mapa"><Input value={a.name} onChange={(e) => set('name', e.target.value)} placeholder={isV ? 'Ex.: placa ou nome do veículo' : 'Ex.: Caixa fria CF-08'} /></Field>
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
          {a.meter !== 'nenhum' && (
            <div className="flex flex-col gap-2">
              <span className="text-small font-semibold">Origem da {a.meter === 'horimetro' ? 'leitura do horímetro' : 'quilometragem'}</span>
              <span className="text-small text-ink-2">Alimenta os gatilhos de manutenção, metas de combustível e relatórios.</span>
              <div className="grid md:grid-cols-3 gap-2">
                {(a.kind === 'implemento' ? [['engate', 'Engates', 'Soma o km dos cavalos enquanto ela esteve engatada'], ['rastreador', 'Rastreador próprio', 'Quando a carreta tem rastreador']] : [['rastreador', 'Rastreador', 'Odômetro GPS/CAN em tempo real'], ['manual', 'Lançamentos', 'Abastecimentos, checklists e OS'], ['mescla', 'Mescla', 'Rastreador corrigido pelos lançamentos']]).map(([k, l, d]) => (
                  <ChoiceCard key={k} checked={a.kmSource === k} onSelect={() => set('kmSource', k)} title={l} description={d} />
                ))}
              </div>
              {a.kmSource === 'mescla' && <Field label="Ajuste do odômetro do rastreador (km)" hint="Diferença entre o painel do veículo e o rastreador. Na mescla, vale o maior entre rastreador ajustado e último lançamento." className="max-w-xs"><Input type="number" value={a.kmOffset} onChange={(e) => set('kmOffset', e.target.value)} /></Field>}
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
          <Documentos a={a} set={set} />
          <div className="flex flex-col gap-2"><span className="text-small font-semibold">Grupos</span><div className="flex flex-wrap gap-4">{s.groups.map((g: any) => <Check key={g.id} label={g.name} checked={a.groupIds.includes(g.id)} onChange={(v) => set('groupIds', v ? [...a.groupIds, g.id] : a.groupIds.filter((x: string) => x !== g.id))} />)}</div></div>
        </div>
        <div className="flex-[1_1_280px] max-w-[340px] flex flex-col gap-grid">
          <Dropzone label="Foto do ativo" hint="Aparece no mapa e no detalhe. JPG, PNG ou WebP até 4 MB." value={a.photo} onChange={(d) => set('photo', d)} previewAlt={`Foto de ${a.name || 'ativo'}`} />
          <IconPicker category={a.category || categoryOf(a)} value={a.icon} onChange={(v) => set('icon', v)} />
          <div className="flex flex-col gap-stack border border-line rounded-ctl p-card-sm">
            <span className="text-small font-semibold">Rastreador vinculado</span>
            <Field label="IMEI"><Input className="font-mono" value={imei} onChange={(e) => setImei(e.target.value.replace(/\D/g, '').slice(0, 15))} placeholder="15 dígitos" /></Field>
            <Field label="Modelo / protocolo"><Select value={tmodel} onChange={(e) => setTmodel(e.target.value)} options={['GT06', 'Teltonika FMC130', 'Suntech ST310U', 'Queclink GV300', 'IoT LoRa Tag']} /></Field>
            <Field label="Chip (ICCID)"><Input value={iccid} onChange={(e) => setIccid(e.target.value)} /></Field>
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
            {a.tracker && a.id && <TextButton tone="danger" className="self-start" onClick={async () => { if (await confirmAction({ title: 'Retirar o rastreador?', detail: `O rastreador ${a.tracker.imei} sai de ${a.name}, volta ao estoque e deixa de consumir acesso.`, confirmLabel: 'Retirar' })) { unlinkTracker(a.id, 'retirado'); toast('Rastreador retirado e devolvido ao estoque.'); setA(null); } }}>Retirar rastreador</TextButton>}
            {a.tracker && <p className="text-caption text-ink-2">Vinculado desde {fmtD(a.tracker.linkedAt)}{a.installation ? ` · instalado por ${a.installation.technician}` : ''}{a.kmCalculated ? ' · km calculado' : a.installation?.initialKm != null ? ` · odômetro inicial ${num(a.installation.initialKm)} km` : ''}</p>}
          </div>
          {a.id && <TrackerHistory assetId={a.id} />}
          {a.id && a.kind !== 'implemento' && <DriverHistory assetId={a.id} />}
          {a.id && <Situacao a={a} onDone={() => setA(null)} />}
          {a.id && <AuditLog refId={a.id} />}
        </div>
      </div>
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
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto">
            {ids.map((id) => (
              <button key={id} type="button" aria-pressed={value === id} onClick={() => { onChange(id); setOpen(false); }}
                className={cx('flex flex-col items-center gap-1 p-tight rounded-ctl text-caption', value === id ? 'bg-card-2 ring-[1.5px] ring-inset ring-ink text-ink font-medium' : 'border border-line text-ink-2 hover:bg-card-2')}>
                <img src={pngIconUrl(id)} alt="" loading="lazy" decoding="async" className="w-14 h-9 object-contain" /><span className="text-center leading-tight">{pngIconLabel(id)}</span>
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
  const log = useStore((s) => s.accessLog.filter((l: any) => l.assetId === assetId).sort((x: any, y: any) => y.ts - x.ts));
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
  return (
    <div className="flex flex-col gap-stack border border-line rounded-ctl p-card-sm">
      <span className="text-small font-semibold">Situação</span>
      <StatusDot kind={cur === 'ativo' ? 'mov' : cur === 'inativo' ? 'parado' : 'off'} label={`${LIFECYCLE[cur].label}${a.lifecycle?.at && cur !== 'ativo' ? ` desde ${fmtD(a.lifecycle.at)}` : ''}`} />
      <Field label="Mudar para"><Select value={to} onChange={(e) => setTo(e.target.value)} options={Object.entries(LIFECYCLE).map(([value, x]) => ({ value, label: x.label }))} /></Field>
      {to !== cur && <>
        <p className="text-caption text-ink-2">{LIFECYCLE[to].hint}.</p>
        <Field label={out ? 'Motivo, comprador ou nº do boletim' : 'Observação'}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Button size="sm" variant={out ? 'danger' : 'soft'} disabled={out && !note.trim()} onClick={() => { setLifecycle(a.id, to, note.trim()); toast(`${a.name}: ${LIFECYCLE[to].label.toLowerCase()}.`); onDone(); }}>Confirmar: {LIFECYCLE[to].label}</Button>
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
            <TextButton tone="danger" onClick={() => set('documents', docs.filter((_, j) => j !== i))} aria-label={`Remover ${docLabel(d)}`}>Remover</TextButton>
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
            <div className="flex-1"><Select aria-label={`Implemento ${i + 1}`} value={id} onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))} options={[{ value: '', label: 'Escolha o implemento' }, ...impl.map((x: any) => ({ value: x.id, label: label(x) }))]} /></div>
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

function SimpleList({ coll, title, placeholder }: any) {
  const items = useStore((s) => s[coll]);
  const assets = useStore((s) => opAssets(s)); // contagem só da frota atual
  const { upsert, remove } = useStore.getState();
  const [n, setN] = useState('');
  return (
    <Card title={title} icon={coll === 'groups' ? 'equipe' : 'rota'}>
      <div className="flex gap-tight mb-card-head max-w-lg"><Input value={n} onChange={(e) => setN(e.target.value)} placeholder={placeholder} /><Button disabled={!n} onClick={() => { upsert(coll, { name: n }); toast(`${n} adicionado.`); setN(''); }}>Adicionar</Button></div>
      <Table head={['Nome', 'Ativos', '']} rows={items.map((g: any) => [<InlineInput aria-label="Nome" className="font-medium w-full" value={g.name} onChange={(e) => upsert(coll, { id: g.id, name: e.target.value })} />, assets.filter((a: any) => coll === 'groups' ? a.groupIds?.includes(g.id) : a.operationId === g.id).map((a: any) => a.name).join(', ') || '—', <TextButton tone="danger" onClick={async () => { if (await confirmAction({ title: `Excluir ${g.name}?`, detail: 'Os ativos deixam de fazer parte dele, mas não são apagados.' })) { remove(coll, g.id); toast(`${g.name} excluído.`, { action: { label: 'Desfazer', onClick: () => upsert(coll, g) } }); } }}>Excluir</TextButton>])} />
    </Card>
  );
}

function Drivers() {
  const drivers = useStore((s) => s.drivers);
  const assets = useStore((s) => s.assets);
  const { upsert, remove } = useStore.getState();
  const [d, setD] = useState<any>(null);
  return (
    <>
      <DriverConflicts />
      <Card title="Motoristas" icon="usuario" actions={<Button onClick={() => setD({ name: '', cnh: '', cnhCat: 'B', cnhDue: '', phone: '', regime: 'cargas' })}><Icon name="mais" size={16} />Novo motorista</Button>}>
        <Table head={['Nome', 'CNH', 'Categoria', 'Validade da CNH', 'Exame toxicológico', 'Telefone', 'Veículo atual', '']} rows={drivers.map((x: any) => [<span className="font-medium">{x.name}</span>, <span className="num">{x.cnh}</span>, x.cnhCat, x.cnhDue ? <DocStatus d={{ due: x.cnhDue }} p={DRIVER_DOC_PARAMS} /> : <span className="text-ink-3">—</span>, /^[CDE]/.test(x.cnhCat) ? (x.toxDue ? <DocStatus d={{ due: x.toxDue }} p={DRIVER_DOC_PARAMS} /> : <span className="text-ink-3">—</span>) : <span className="text-ink-3">não exigido</span>, <span className="num">{x.phone}</span>, <AssetName name={assets.find((a: any) => a.driverId === x.id)?.name} />, <div className="flex gap-3"><TextButton onClick={() => setD({ ...x })}>Editar</TextButton><TextButton tone="danger" onClick={async () => { if (await confirmAction({ title: `Excluir o motorista ${x.name}?`, detail: 'Viagens, marcações e eventos antigos continuam com o nome dele.' })) { remove('drivers', x.id); toast(`Motorista ${x.name} excluído.`, { action: { label: 'Desfazer', onClick: () => upsert('drivers', x) } }); } }}>Excluir</TextButton></div>])} />
      </Card>
      <Modal open={!!d} onClose={() => setD(null)} title={d?.id ? 'Editar motorista' : 'Novo motorista'} footer={<><Button variant="ghost" onClick={() => setD(null)}>Cancelar</Button><Button disabled={!d?.name} onClick={() => { upsert('drivers', d); toast(d.id ? 'Motorista atualizado.' : 'Motorista cadastrado.'); setD(null); }}>Salvar motorista</Button></>}>
        {d && <div className="grid grid-cols-1 sm:grid-cols-2 gap-field">
          <Field label="Nome" className="sm:col-span-2"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
          <Field label="CNH"><Input value={d.cnh} onChange={(e) => setD({ ...d, cnh: e.target.value })} /></Field>
          <Field label="Categoria"><Select value={d.cnhCat} onChange={(e) => setD({ ...d, cnhCat: e.target.value })} options={['A', 'B', 'C', 'D', 'E', 'AB', 'AE']} /></Field>
          <Field label="Validade da CNH"><Input type="date" value={d.cnhDue || ''} onChange={(e) => setD({ ...d, cnhDue: e.target.value })} /></Field>
          <Field label="Exame toxicológico vence em" hint="Obrigatório para categorias C, D e E (a cada 2 anos e 6 meses)."><Input type="date" value={d.toxDue || ''} disabled={!/^[CDE]/.test(d.cnhCat)} onChange={(e) => setD({ ...d, toxDue: e.target.value })} /></Field>
          <Field label="Telefone"><Input value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} /></Field>
          <Field label="CPF"><Input value={d.cpf || ''} onChange={(e) => setD({ ...d, cpf: e.target.value })} placeholder="000.000.000-00" /></Field>
          <Field label="Matrícula"><Input value={d.registration || ''} onChange={(e) => setD({ ...d, registration: e.target.value })} /></Field>
          <Field label="Atividade (Lei 13.103)"><Select value={d.regime} onChange={(e) => setD({ ...d, regime: e.target.value })} options={[{ value: 'cargas', label: 'Transporte de cargas' }, { value: 'passageiros', label: 'Transporte de passageiros' }]} /></Field>
          <div className="sm:col-span-2"><Check label="CNH com EAR (exerce atividade remunerada): limite de 40 pontos, qualquer que seja a gravidade" checked={!!d.ear} onChange={(v) => setD({ ...d, ear: v })} /></div>
        </div>}
      </Modal>
    </>
  );
}
