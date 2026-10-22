import { useState } from 'react';
import { useStore, useStoreData } from '../lib/store';
import { Button, Card, Field, Input, Table, Badge, Tabs, PageHeader, Pills, cx, TextButton, Switch, TabPanel, EmptyState, toast, Grid, Stack } from '../components/ui';
import { Icon } from '../components/icons';
import { Dropzone } from '../components/Dropzone';
import SupportAccess from '../components/SupportAccess';
import { BrandMark } from '../components/Layout';
import { MODULES } from '../lib/catalog';
import { brl, fmtDT, monthLabel, num } from '../lib/utils';
import { invoice, lastMonths, DEFAULT_BILLING, BillingCfg, Link } from '../lib/billing';
import { KpiTile, ChartCard, Num, IdChip, AssetName, StatusDot } from '../components/story';
import { ColumnChart } from '../components/charts';

export default function Revenda() {
  const session = useStore((s) => s.session);
  const [tab, setTab] = useState('cliente');
  if (session?.role !== 'revenda' && session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito ao administrador da rastreadora" detail="Entre com revenda@demo.com para ver este painel." /></Card>;
  return (
    <div>
      <PageHeader title="Painel da revenda" subtitle="Personalize a plataforma, escolha os módulos que você vende e acompanhe os acessos consumidos" />
      <div className="flex flex-wrap items-center gap-tight mb-card-head"><Tabs value={tab} onChange={setTab} tabs={[{ key: 'cliente', label: 'Cliente e suporte' }, { key: 'marca', label: 'Identidade visual' }, { key: 'modulos', label: 'Módulos' }, { key: 'licencas', label: 'Licenças e faturamento' }]} /></div>
      <TabPanel id={tab}>
        {tab === 'cliente' && <SupportAccess />}
        {tab === 'marca' && <Marca />}
        {tab === 'modulos' && <Modulos />}
        {tab === 'licencas' && <Licencas />}
      </TabPanel>
    </div>
  );
}

function Marca() {
  const s = useStoreData();
  const b = s.revenda.branding;
  const set = (k: string, v: any) => s.patch((st: any) => ({ revenda: { ...st.revenda, branding: { ...st.revenda.branding, [k]: v } } }));
  const setRev = (k: string, v: any) => s.patch((st: any) => ({ revenda: { ...st.revenda, [k]: v } }));
  return (
    <div className="flex flex-wrap gap-4">
      <Card title="Marca da rastreadora" className="flex-[1_1_380px] max-w-[520px]">
        <Stack gap="grid">
          <Field label="Nome exibido"><Input value={b.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Frase da tela de login"><Input value={b.tagline} onChange={(e) => set('tagline', e.target.value)} /></Field>
          <Field label="Telefone de suporte"><Input value={b.supportPhone} onChange={(e) => set('supportPhone', e.target.value)} /></Field>
          <Field label="Nome do cliente (frotista) nesta simulação"><Input value={s.revenda.clientName} onChange={(e) => setRev('clientName', e.target.value)} /></Field>
          <div role="group" aria-label="Cor principal" className="flex flex-col gap-tight">
            <span className="text-small font-medium text-ink-2">Cor principal</span>
            {/* amostras: são o próprio conteúdo escolhido (a cor da revenda), não decoração da interface */}
            <div className="flex gap-2 items-center flex-wrap">
              {['#2251E6', '#0E7C66', '#C2410C', '#7C3AED', '#0F766E', '#B91C1C'].map((c) => <button key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={b.color === c} onClick={() => set('color', c)} className={cx('w-10 h-10 rounded-pill border-4', b.color === c ? 'border-ink' : 'border-card ring-1 ring-line')} style={{ background: c }} />)}
              <input aria-label="Cor personalizada" type="color" value={b.color} onChange={(e) => set('color', e.target.value)} className="w-10 h-10 rounded-ctl cursor-pointer" />
            </div>
            <span className="text-caption text-ink-2">Sem contraste suficiente, ou em vermelho ou laranja, botões e controles passam a usar grafite.</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-field">
            <Dropzone label="Logo" className="h-28" fit="contain" value={b.logo} onChange={(d) => set('logo', d)} />
            <Dropzone label="Foto da tela de login" className="h-28" value={b.photo} onChange={(d) => set('photo', d)} />
          </div>
          <Field label="Posição da foto no login"><Pills value={b.photoPos} onChange={(k) => set('photoPos', k)} options={[{ key: 'esquerda', label: 'Foto à esquerda' }, { key: 'direita', label: 'Foto à direita' }, { key: 'fundo', label: 'Foto de fundo' }, { key: 'centro', label: 'Sem foto (centralizado)' }]} /></Field>
        </Stack>
      </Card>
      <Card title="Prévia do login" className="flex-[999_1_480px] min-w-0">
        {/* a prévia usa os mesmos tokens da tela real: logo pelo BrandMark e botão em --brand-fill (com o fallback grafite) */}
        <div className={cx('relative h-[420px] rounded-ctl overflow-hidden border border-line flex bg-canvas', b.photoPos === 'direita' && 'flex-row-reverse')}>
          {b.photoPos !== 'centro' && <div className={cx('bg-ink relative overflow-hidden', b.photoPos === 'fundo' ? 'absolute inset-0' : 'w-[58%]')}>{b.photo && <img src={b.photo} alt="" className="absolute inset-0 w-full h-full object-cover" />}{b.photoPos !== 'fundo' && <p className="absolute bottom-6 left-6 right-6 text-on-dark font-semibold text-h3">{b.tagline}</p>}</div>}
          <div className={cx('relative flex items-center p-6', b.photoPos === 'fundo' ? 'w-full justify-end' : b.photoPos === 'centro' ? 'w-full justify-center' : 'flex-1 justify-center')}>
            <div aria-hidden="true" className="bg-card rounded-card p-5 w-56 flex flex-col gap-3 border border-line">
              <div className="flex items-center gap-2 min-w-0"><BrandMark size={32} /><span className="text-small font-semibold truncate">{b.name}</span></div>
              <div className="h-8 rounded-ctl border border-line-strong" /><div className="h-8 rounded-ctl border border-line-strong" /><div className="h-9 rounded-btn bg-brand-fill" />
            </div>
          </div>
        </div>
        <p className="text-small text-ink-2 mt-3">Saia (botão "Sair" no menu) para ver a tela de login real com a sua marca.</p>
      </Card>
    </div>
  );
}

function Modulos() {
  const s = useStoreData();
  const mods = s.revenda.modules;
  const set = (k: string, v: boolean) => s.patch((st: any) => ({ revenda: { ...st.revenda, modules: { ...st.revenda.modules, [k]: v } } }));
  return (
    <Card title="Módulos liberados para este cliente">
      <p className="text-small text-ink-2 mb-4">Cada módulo é independente: monte o pacote que você vai vender. Módulos desligados somem do menu do cliente.</p>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-grid">
        {MODULES.map((m) => (
          <label key={m.key} className="flex items-center gap-3 p-4 rounded-ctl cursor-pointer border border-line hover:bg-card-2 transition-colors">
            <Switch checked={!!mods[m.key]} onChange={(v) => set(m.key, v)} />
            <span className="text-body font-medium">{m.label}</span>
            <Badge tone={mods[m.key] ? 'green' : 'gray'} className="ml-auto">{mods[m.key] ? 'Ativo' : 'Desligado'}</Badge>
          </label>
        ))}
      </div>
      {mods.manutencao && (
        <div className="flex flex-wrap items-end gap-3 mt-6 pt-5 border-t border-line">
          <Field label="Meta de disponibilidade da frota (%)" hint="Usada nos indicadores de Manutenção deste cliente."><Input className="w-32" type="number" min={50} max={100} step={0.5} value={Math.round((s.maintGoals?.availability ?? 0.95) * 1000) / 10} onChange={(e) => { const v = +e.target.value; if (v >= 50 && v <= 100) s.patch(() => ({ maintGoals: { ...(s.maintGoals || {}), availability: v / 100 } })); }} /></Field>
        </div>
      )}
    </Card>
  );
}

function Licencas() {
  const s = useStoreData();
  const months = lastMonths(12);
  const cfg: BillingCfg = { ...DEFAULT_BILLING, ...(s.platform?.demoBilling || {}) };
  const links: Link[] = s.accessLog.map((l: any) => ({ imei: l.imei, assetName: l.assetName, client: s.revenda.clientName, linkedAt: l.ts, unlinkedAt: l.unlinkedAt }));
  const cur = months[months.length - 1];
  const inv = invoice(links, cfg, cur);
  const hist = months.map((m) => ({ label: monthLabel(m), value: invoice(links, cfg, m).accesses }));
  const prevAcc = hist.length > 1 ? hist[hist.length - 2].value : null;
  const peak = hist.reduce((m, h) => Math.max(m, h.value), 0);
  const idle = s.assets.filter((a: any) => a.kind === 'veiculo' && !a.tracker);
  const stock: any[] = s.trackerStock || [];
  const [st, setSt] = useState({ imei: '', model: 'GT06' });
  const log = [...s.accessLog].sort((a: any, b: any) => b.ts - a.ts);
  const sentence = prevAcc == null ? undefined
    : inv.accesses === prevAcc ? `Mesmo número de acessos do mês anterior (${num(inv.accesses)}).`
    : `${num(inv.accesses)} acessos neste mês, ${num(Math.abs(inv.accesses - prevAcc))} ${inv.accesses > prevAcc ? 'a mais' : 'a menos'} que no mês anterior.`;
  return (
    <Stack gap="grid">
      <Card title="Seu plano com a Locale" icon="dinheiro">
        <p className="text-body text-ink-2 max-w-[90ch]">{cfg.model === 'por_rastreador' ? `Cobrança por rastreador vinculado: ${brl(cfg.price)} por acesso.` : `Pacote mínimo de ${cfg.min} acessos a ${brl(cfg.price)} (${brl(cfg.min * cfg.price)}/mês); excedente a ${brl(cfg.extraPrice)}.`} Conta como acesso {cfg.basis === 'ativos' ? 'cada rastreador vinculado a um veículo em algum momento do mês' : 'cada nova vinculação feita no mês'}. O plano é definido pela Locale.</p>
      </Card>
      <Grid cols={4} equal>
        <KpiTile label="Acessos neste mês" value={inv.accesses} sub={`${inv.active} vinculados · ${inv.fresh} novas vinculações`} />
        <KpiTile label="Prévia da fatura" display={<Num value={inv.total} prefix="R$" digits={2} size="kpi" count />} sub={inv.unusedPackage ? `${inv.unusedPackage} acessos do pacote sem uso` : undefined} />
        <KpiTile label="Veículos sem rastreador" value={idle.length} status={idle.length ? 'parado' : undefined} />
        <KpiTile label="Rastreadores em estoque" value={stock.length} />
      </Grid>
      <ChartCard title="Acessos por mês" icon="grafico" period="Últimos 12 meses" sentence={sentence}
        state={peak > 0 ? 'ready' : 'empty'} empty={{ title: 'Nenhum acesso nos últimos 12 meses', detail: 'Os acessos aparecem quando um rastreador é vinculado a um veículo.' }}>
        <ColumnChart data={hist} format={(v) => num(v)} height={220} label="Acessos por mês" />
      </ChartCard>
      <Grid cols={2} wide equal>
        <Card title="Rastreadores em estoque (sem uso)">
          <div className="flex flex-wrap gap-2 items-end mb-3">
            <Field label="IMEI"><Input value={st.imei} inputMode="numeric" onChange={(e) => setSt({ ...st, imei: e.target.value.replace(/\D/g, '').slice(0, 15) })} /></Field>
            <Field label="Modelo"><Input value={st.model} onChange={(e) => setSt({ ...st, model: e.target.value })} /></Field>
            <Button disabled={st.imei.length < 10} onClick={() => { if ((s.trackerStock || []).some((y: any) => y.imei === st.imei)) return toast('Este IMEI já está no estoque.', { tone: 'crit' }); s.patch((x: any) => ({ trackerStock: [...(x.trackerStock || []), { ...st }] })); toast(`Rastreador ${st.imei} incluído no estoque.`); setSt({ ...st, imei: '' }); }}><Icon name="mais" size={16} />Adicionar</Button>
          </div>
          <Table minWidth={360} head={['IMEI', 'Modelo', '']} rows={stock.map((t: any) => [<IdChip size="sm">{t.imei}</IdChip>, t.model, <TextButton tone="danger" onClick={() => { s.patch((x: any) => ({ trackerStock: x.trackerStock.filter((y: any) => y.imei !== t.imei) })); toast(`Rastreador ${t.imei} removido do estoque.`, { action: { label: 'Desfazer', onClick: () => s.patch((x: any) => ({ trackerStock: [...(x.trackerStock || []), t] })) } }); }}>Remover</TextButton>])}
            emptyState={<EmptyState illustration="ilu-estoque" layout="row" title="Nenhum rastreador em estoque" detail="Cadastre o IMEI acima para ter o rastreador à mão na hora de vincular a um veículo." />} />
        </Card>
        <Card title="Veículos sem rastreador">
          <Table minWidth={360} head={['Veículo', 'Modelo']} rows={idle.map((a: any) => [<AssetName name={a.name} />, `${a.brand} ${a.model}`])} emptyState={<EmptyState icon="ok" title="Todos os veículos têm rastreador" />} />
        </Card>
      </Grid>
      <Card title="Extrato de vínculos">
        <Table head={['Vinculado em', 'Ativo', 'IMEI', 'Desvinculado em']} rows={log.map((a: any) => [<span className="num">{fmtDT(a.ts)}</span>, <AssetName name={a.assetName} />, <IdChip size="sm">{a.imei}</IdChip>, a.unlinkedAt ? <span className="num">{fmtDT(a.unlinkedAt)}</span> : <StatusDot kind="mov" label="Ativo" />])}
          emptyState={<EmptyState icon="historico" title="Nenhum vínculo registrado" />} />
      </Card>
    </Stack>
  );
}
