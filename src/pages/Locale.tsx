// Painel da Locale (administração da plataforma): acessos por rastreadora, histórico, fatura e modelos de cobrança.
// No produto real o cálculo vem do backend: fn_platform_billing e afins em docs/especificacao-sql/20261017230000_painel_locale.sql.
import { useMemo, useState } from 'react';
import { ColumnChart, RankBars } from '../components/charts';
import { ChartCard, KpiTile, Num } from '../components/story';
import { useStoreData } from '../lib/store';
import { Button, Card, Field, FormGroup, Input, Select, Table, Badge, Modal, PageHeader, PageBody, Section, Pills, cx, TextButton, toast, EmptyState, Grid } from '../components/ui';
import SupportAccess from '../components/SupportAccess';
import { usePrint } from '../components/PrintPortal';
import { Icon } from '../components/icons';
import { BillingCfg, DEFAULT_BILLING, invoice, otherModel, lastMonths, monthRange, Link } from '../lib/billing';
import { brl, fmtD, fmtDT, num, monthLabel } from '../lib/utils';

const MODEL: Record<string, string> = { por_rastreador: 'Por rastreador vinculado', pacote_minimo: 'Pacote mínimo de acessos' };
interface TenantRow { id: string; name: string; live?: boolean; billing: BillingCfg; vehiclesIdle: number; stock: number; history: { ym: string; active: number; fresh: number; accesses: number; total: number; totalOther: number }[]; links?: Link[] }
const rel = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null);

// a revenda da simulação + rastreadoras de teste
function useTenants(months: string[]): TenantRow[] {
  const s = useStoreData();
  return useMemo(() => {
    const demoLinks: Link[] = s.accessLog.map((l: any) => ({ imei: l.imei, assetName: l.assetName, client: s.revenda.clientName, linkedAt: l.ts, unlinkedAt: l.unlinkedAt }));
    const all = [
      { id: 't-demo', name: s.revenda.branding.name, live: true, links: demoLinks, vehiclesIdle: s.assets.filter((a: any) => a.kind === 'veiculo' && !a.tracker).length, stock: (s.trackerStock || []).length, billing: { ...DEFAULT_BILLING, ...(s.platform?.demoBilling || {}) } },
      ...(s.platform?.tenants || []),
    ];
    return all.map((t: any) => ({ ...t, history: months.map((ym) => { const a = invoice(t.links, t.billing, ym), b = invoice(t.links, otherModel(t.billing), ym); return { ym, active: a.active, fresh: a.fresh, accesses: a.accesses, total: a.total, totalOther: b.total }; }) }));
  }, [s.accessLog, s.platform, s.assets, s.trackerStock, months.join()]);
}

export default function Locale() {
  const s = useStoreData();
  const months = useMemo(() => lastMonths(12), []);
  const [ym, setYm] = useState(months[months.length - 1]);
  const [cfgT, setCfgT] = useState<TenantRow | null>(null);
  const [invT, setInvT] = useState<TenantRow | null>(null);
  const [scenario, setScenario] = useState<'atual' | 'todos_a' | 'todos_b'>('atual');
  const tenants = useTenants(months);
  if (s.session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com locale@demo.com para ver o Painel da Locale." /></Card>;
  const at = (t: TenantRow, m = ym) => t.history.find((h) => h.ym === m) || { ym: m, active: 0, fresh: 0, accesses: 0, total: 0, totalOther: 0 };
  // cenário: valor de cada rastreadora se todas estivessem no modelo A ou B
  const valueIn = (t: TenantRow, m = ym) => { const h = at(t, m); if (scenario === 'atual') return h.total; const wantA = scenario === 'todos_a'; return (t.billing.model === 'por_rastreador') === wantA ? h.total : h.totalOther; };
  const prevYm = months[months.indexOf(ym) - 1];
  const tot = tenants.reduce((a, t) => a + valueIn(t), 0), totPrev = prevYm ? tenants.reduce((a, t) => a + valueIn(t, prevYm), 0) : 0;
  const totA = tenants.reduce((a, t) => a + (t.billing.model === 'por_rastreador' ? at(t).total : at(t).totalOther), 0);
  const totB = tenants.reduce((a, t) => a + (t.billing.model === 'pacote_minimo' ? at(t).total : at(t).totalOther), 0);
  const acc = tenants.reduce((a, t) => a + at(t).accesses, 0), accPrev = prevYm ? tenants.reduce((a, t) => a + at(t, prevYm).accesses, 0) : 0;
  const monthly = months.map((m) => ({ label: monthLabel(m), value: Math.round(tenants.reduce((a, t) => a + valueIn(t, m), 0)) }));
  const rank = tenants.map((t) => ({ label: t.name, value: Math.round(valueIn(t)) })).sort((a, b) => b.value - a.value);
  const leader = rank[0];
  const vs = prevYm ? `vs ${monthLabel(prevYm)}` : undefined;
  const money = (v: number) => brl(v).replace(',00', '');
  return (
    <div>
      <PageHeader icon="locale" title="Painel da Locale" subtitle="Acessos consumidos por rastreadora, histórico mensal e prévia das faturas">
        <Field label="Competência"><Select className="w-40" value={ym} onChange={(e) => setYm(e.target.value)} options={[...months].reverse().map((m) => ({ value: m, label: monthLabel(m) }))} /></Field>
      </PageHeader>
      <PageBody>
      <Section title="Cliente da simulação e acesso de suporte"><SupportAccess /></Section>
      <Section title="Faturamento">
      <Card title="Cenário de cobrança" icon="dinheiro">
        <div className="flex flex-wrap gap-grid items-center">
          <Pills value={scenario} onChange={(k) => setScenario(k as any)} options={[{ key: 'atual', label: 'Modelo configurado de cada rastreadora' }, { key: 'todos_a', label: 'Simular todas por rastreador vinculado' }, { key: 'todos_b', label: 'Simular todas com pacote mínimo' }]} />
          <span className="text-small text-ink-2">Na competência: modelo A (por rastreador) <span className="font-medium text-ink num">{brl(totA)}</span> · modelo B (pacote mínimo) <span className="font-semibold text-ink num">{brl(totB)}</span> · diferença <span className="font-semibold text-ink num">{brl(totB - totA)}</span></span>
        </div>
      </Card>
      <Grid cols={6} equal>
        <KpiTile label="Faturamento previsto" display={<Num value={tot} prefix="R$" digits={2} size="kpi" count />} delta={{ value: rel(tot, totPrev), unit: '%', good: 'up' }} sub={vs} />
        <KpiTile label="Acessos cobrados" value={acc} delta={{ value: rel(acc, accPrev), unit: '%', good: 'up' }} sub={vs} />
        <KpiTile label="Rastreadoras" value={tenants.length} />
        <KpiTile label="Novas vinculações no mês" value={tenants.reduce((a, t) => a + at(t).fresh, 0)} />
        <KpiTile label="Veículos sem rastreador" value={tenants.reduce((a, t) => a + t.vehiclesIdle, 0)} status={tenants.some((t) => t.vehiclesIdle) ? 'parado' : undefined} sub="Cadastrados e sem vínculo ativo" />
        <KpiTile label="Rastreadores sem uso" value={tenants.reduce((a, t) => a + t.stock, 0)} status={tenants.some((t) => t.stock) ? 'parado' : undefined} sub="Em estoque, sem veículo" />
      </Grid>
      <Grid split="7/5" wide equal>
        <ChartCard title="Faturamento mensal" icon="grafico" period="Soma de todas as rastreadoras"
          sentence={`${monthLabel(ym)}: ${brl(tot)}${totPrev ? `, ${num(Math.abs(rel(tot, totPrev) || 0), 1)}% ${tot >= totPrev ? 'acima' : 'abaixo'} de ${monthLabel(prevYm)}` : ''}.`}>
          <ColumnChart data={monthly} highlight={months.indexOf(ym)} onSelect={(i) => setYm(months[i])} format={money} height={240} label="Faturamento" good="up" />
        </ChartCard>
        <ChartCard title={`Por rastreadora · ${monthLabel(ym)}`} icon="ranking"
          state={rank.some((r) => r.value) ? 'ready' : 'empty'} empty={{ title: 'Sem faturamento neste mês', detail: 'Escolha outro mês no gráfico ao lado.' }}
          sentence={leader && tot ? `${leader.label} responde por ${num((leader.value / tot) * 100, 0)}% do faturamento do mês.` : undefined}>
          <RankBars items={rank} format={money} />
        </ChartCard>
      </Grid>
      <Card title={`Rastreadoras · ${monthLabel(ym)}`} icon="revenda">
        <Table minWidth={1100} align={['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right']} head={['Rastreadora', 'Modelo de cobrança', 'Vinculados no mês', 'Novas vinculações', 'Acessos cobrados', 'Fatura prevista', 'No outro modelo', 'Veículos sem rastreador', 'Rastreadores sem uso', '']} rows={tenants.map((t) => { const h = at(t); return [
          <span className="inline-flex items-center gap-2"><span className="font-medium">{t.name}</span>{t.live && <Badge>simulação</Badge>}</span>,
          <span className="text-small">{MODEL[t.billing.model]}<span className="block text-caption text-ink-2 num">{brl(t.billing.price)}/acesso{t.billing.model === 'pacote_minimo' ? ` · mín. ${t.billing.min} · excedente ${brl(t.billing.extraPrice)}` : ''} · base {t.billing.basis === 'novos' ? 'novas vinculações' : 'vinculados no mês'}</span></span>,
          <Num value={h.active} size="body" />, <Num value={h.fresh} size="body" />, <Num value={h.accesses} size="body" className="font-medium" />, <Num value={h.total} prefix="R$" digits={2} size="body" className="font-semibold" />,
          <span className={cx('num font-medium', h.totalOther > h.total ? 'text-pos' : h.totalOther < h.total ? 'text-loss-ink' : '')}>{brl(h.totalOther)}</span>,
          <Num value={t.vehiclesIdle} size="body" />, <Num value={t.stock} size="body" />,
          <div className="flex gap-3"><TextButton onClick={() => setInvT(t)}>Prévia da fatura</TextButton><TextButton onClick={() => setCfgT(t)}>Cobrança</TextButton></div>]; })} />
        <p className="text-caption text-ink-2 mt-card-head">"No outro modelo" mostra quanto a rastreadora pagaria se mudasse de modelo (verde: a Locale receberia mais; rosa: menos).</p>
      </Card>
      <Card title="Histórico de acessos cobrados" icon="historico">
        <Table minWidth={900} align={['left', ...months.slice(-6).map(() => 'right' as const)]} head={['Rastreadora', ...months.slice(-6).map(monthLabel)]} rows={tenants.map((t) => [<span className="font-medium">{t.name}</span>, ...months.slice(-6).map((m) => <span className="num">{num(at(t, m).accesses)}<span className="block text-caption text-ink-2">{brl(valueIn(t, m))}</span></span>)])} />
      </Card>
      </Section>
      </PageBody>
      {cfgT && <CfgModal t={cfgT} onClose={() => setCfgT(null)} />}
      {invT && <InvoiceModal t={invT} ym={ym} onClose={() => setInvT(null)} />}
    </div>
  );
}

function CfgModal({ t, onClose }: { t: TenantRow; onClose: () => void }) {
  const s = useStoreData();
  const [c, setC] = useState<BillingCfg>(t.billing);
  const save = async () => {
    if (t.live) s.patch((st: any) => ({ platform: { ...st.platform, demoBilling: c } }));
    else s.patch((st: any) => ({ platform: { ...st.platform, tenants: st.platform.tenants.map((x: any) => (x.id === t.id ? { ...x, billing: c } : x)) } }));
    toast('Cobrança salva.');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Cobrança · ${t.name}`} width="max-w-2xl" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button onClick={save}>Salvar cobrança</Button></>}>
      <Pills value={c.model} onChange={(k) => setC({ ...c, model: k as any })} options={[{ key: 'por_rastreador', label: 'A · Por rastreador vinculado' }, { key: 'pacote_minimo', label: 'B · Pacote mínimo de acessos' }]} />
      <FormGroup cols={4}>
        <Field label="Preço por acesso (R$)"><Input type="number" step="0.1" value={c.price} onChange={(e) => setC({ ...c, price: +e.target.value })} /></Field>
        {c.model === 'pacote_minimo' && <><Field label="Pacote mínimo (acessos)"><Input type="number" value={c.min} onChange={(e) => setC({ ...c, min: +e.target.value })} /></Field><Field label="Preço do excedente (R$)"><Input type="number" step="0.1" value={c.extraPrice} onChange={(e) => setC({ ...c, extraPrice: +e.target.value })} /></Field></>}
        <Field label="O que conta como acesso"><Select value={c.basis} onChange={(e) => setC({ ...c, basis: e.target.value as any })} options={[{ value: 'ativos', label: 'Rastreador vinculado no mês' }, { value: 'novos', label: 'Nova vinculação no mês' }]} /></Field>
      </FormGroup>
      <p className="text-small text-ink-2 bg-card-2 border border-line rounded-ctl p-stack">{c.model === 'por_rastreador' ? `A rastreadora paga ${brl(c.price)} por acesso.` : `A rastreadora paga no mínimo ${brl(c.min * c.price)} (${c.min} acessos × ${brl(c.price)}), mesmo usando menos. Cada acesso acima de ${c.min} custa ${brl(c.extraPrice)}.`} {c.basis === 'ativos' ? 'Conta cada rastreador que esteve vinculado a um veículo em algum momento do mês.' : 'Conta só os rastreadores vinculados dentro do mês.'}</p>
    </Modal>
  );
}

function InvoiceModal({ t, ym, onClose }: { t: TenantRow; ym: string; onClose: () => void }) {
  const { print, portal } = usePrint();
  const links = t.links || null;
  const inv = links ? invoice(links, t.billing, ym) : null;
  const due = new Date(monthRange(ym)[1] + 10 * 86400000);
  const doc = inv && (
    <section className="doc-sheet p-1" style={{ fontSize: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid var(--doc-ink)', paddingBottom: 6, marginBottom: 10 }}>
        <div><div style={{ fontSize: 18, fontWeight: 700 }}>Locale Soluções em Rastreamento</div><div className="muted">Prévia de fatura · plataforma de rastreamento white label</div></div>
        <div style={{ textAlign: 'right' }}><b>Competência {monthLabel(ym)}</b><br />Vencimento {fmtD(due.getTime())}<br /><span className="muted">Emitida em {fmtDT(Date.now())}</span></div>
      </header>
      <p><b>Cliente:</b> {t.name} · <b>Modelo:</b> {MODEL[t.billing.model]} · <b>Base:</b> {t.billing.basis === 'novos' ? 'novas vinculações no mês' : 'rastreadores vinculados no mês'}</p>
      <table style={{ margin: '8px 0' }}><thead><tr><th>Item</th><th>Quantidade</th><th>Valor unitário</th><th>Total</th></tr></thead>
        <tbody>{inv.lines.map((l, i) => <tr key={i}><td>{l.label}</td><td>{num(l.qty)}</td><td>{brl(l.unit)}</td><td>{brl(l.total)}</td></tr>)}<tr><th colSpan={3}>Total da fatura</th><th>{brl(inv.total)}</th></tr></tbody></table>
      {inv.unusedPackage > 0 && <p className="muted">{inv.unusedPackage} acessos do pacote mínimo não foram usados no mês.</p>}
      <div style={{ fontWeight: 700, margin: '10px 0 3px' }}>Rastreadores cobrados ({inv.accesses})</div>
      <table style={{ fontSize: 10 }}><thead><tr><th>IMEI</th><th>Veículo</th><th>Cliente</th><th>Vinculado em</th><th>Desvinculado em</th></tr></thead>
        <tbody>{inv.billed.map((l, i) => <tr key={i}><td>{l.imei}</td><td>{l.assetName}</td><td>{l.client}</td><td>{fmtD((links!.find((x) => x.imei === l.imei) || l).linkedAt)}</td><td>{l.unlinkedAt ? fmtD(l.unlinkedAt) : '—'}</td></tr>)}</tbody></table>
      <p className="muted" style={{ marginTop: 8 }}>Documento de conferência, sem valor fiscal.</p>
    </section>
  );
  return (
    <Modal open onClose={onClose} title={`Prévia da fatura · ${t.name}`} width="max-w-4xl" footer={<><Button variant="quiet" onClick={onClose}>Fechar</Button><Button variant="dark" disabled={!doc} onClick={() => print(doc)}><Icon name="imprimir" size={18} />Imprimir / salvar PDF</Button></>}>
      {!inv ? <EmptyState icon="documento" title="Sem vínculos para esta rastreadora" detail="Os rastreadores vinculados aparecem aqui quando houver." /> : <div className="overflow-x-auto max-h-[60vh] border border-line rounded-ctl p-4">{doc}</div>}
      {portal}
    </Modal>
  );
}
