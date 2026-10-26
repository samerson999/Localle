// Console da Locale · Faturamento: apuração por cliente a partir do contrato vigente e da medição diária de
// veículos-dia (backend, /superadmin/faturamento). Três indicadores distintos: receita prevista (estimativa com a
// frota de agora), faturamento apurado (competência — fechada, preserva valores e medição) e valor recebido
// (pagamentos registrados manualmente, aceita parciais). Fechar só vale para mês já encerrado.
import { useState } from 'react';
import { Card, PageHeader, PageBody, Section, Table, Badge, Button, TextButton, Grid, Modal, Field, FormGroup, Input, Select, Callout, EmptyState, toast, confirmAction } from '../components/ui';
import { KpiTile, Num } from '../components/story';
import { Icon } from '../components/icons';
import { useStore } from '../lib/store';
import { xlsx } from '../lib/reportExport';
import { adminApi, useAdminQuery, type LinhaFaturamento } from '../lib/localleApi';
import { brl, fmtD, fmtDT, num } from '@localle/shared/utils';
import type { BillingType } from '@localle/shared/contratos';

const BILLING_LABEL: Record<BillingType, string> = { mensalidade_fixa: 'Mensalidade fixa', por_veiculo_ativo: 'Por veículo ativo' };
const FORMAS = [{ value: 'pix', label: 'Pix' }, { value: 'boleto', label: 'Boleto' }, { value: 'cartao', label: 'Cartão' }, { value: 'transferencia', label: 'Transferência' }];
const dia = (iso: string) => fmtD(Date.parse(`${iso}T12:00:00`));
const mesLabel = (ym: string) => new Date(`${ym}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const mesAtual = () => new Date().toISOString().slice(0, 7);
function mesesRecentes(n: number) {
  const d = new Date(); d.setDate(15);
  return Array.from({ length: n }, (_, i) => { const x = new Date(d); x.setMonth(d.getMonth() - i); return x.toISOString().slice(0, 7); });
}

function situacao(l: LinhaFaturamento) {
  if (!l.fatura) return <Badge tone="gray">Não fechada</Badge>;
  const f = l.fatura;
  if (f.emAberto === 0) return <Badge tone="green">Pago</Badge>;
  if (f.diasAtraso === 0) return <span className="flex flex-col gap-hair"><Badge tone="gray">A vencer</Badge><span className="text-caption text-ink-2">vence {dia(f.vencimento)}</span></span>;
  return <span className="flex flex-col gap-hair"><Badge tone={f.critico ? 'red' : 'orange'}>{f.pago > 0 ? 'Parcial · ' : ''}{f.diasAtraso} dias de atraso</Badge><span className="text-caption text-ink-2 num">{brl(f.emAberto)} em aberto</span></span>;
}

export default function Faturamento() {
  const session = useStore((s) => s.session);
  const [ym, setYm] = useState(mesAtual());
  const { data, error, loading, reload } = useAdminQuery(() => adminApi.faturamento(ym), [ym]);
  const [paying, setPaying] = useState<LinhaFaturamento | null>(null);
  const [closing, setClosing] = useState(false);
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com o acesso da Locale para ver o Console da Locale." /></Card>;

  const rows = data || [];
  const corrente = ym === mesAtual();
  const abertas = rows.filter((r) => !r.fatura && r.contratoStatus !== 'cancelado').length;
  const previsto = rows.reduce((a, r) => a + r.previsto, 0);
  const apurado = rows.reduce((a, r) => a + r.apurado, 0);
  const recebido = rows.reduce((a, r) => a + (r.fatura?.pago ?? 0), 0);
  const emAberto = rows.reduce((a, r) => a + (r.fatura && r.fatura.diasAtraso > 0 ? r.fatura.emAberto : 0), 0);

  const fechar = async () => {
    if (!(await confirmAction({ title: `Fechar ${mesLabel(ym)}?`, detail: `Grava a fatura de ${abertas} clientes com o contrato vigente e a medição de veículos-dia de agora. Depois de fechada, a competência não muda mesmo que o contrato ou as instalações mudem.`, confirmLabel: 'Fechar competência', tone: 'primary' }))) return;
    setClosing(true);
    try {
      const r = await adminApi.fecharCompetencia(ym);
      toast(`${r.fechadas} faturas fechadas${r.jaFechadas ? ` (${r.jaFechadas} já estavam)` : ''}.`);
      reload();
    } catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); } finally { setClosing(false); }
  };

  const exportar = () => xlsx(`Faturamento_${ym}.xlsx`,
    { empresa: 'Locale', periodo: mesLabel(ym), filtros: 'Todos os clientes', emitidoEm: fmtDT(Date.now()) },
    ['Cliente', 'Cobrança', 'Veículos-dia (média)', 'Apurado', 'Fechada', 'Vencimento', 'Pago', 'Em aberto', 'Dias de atraso'],
    rows.map((r) => [r.clientName, BILLING_LABEL[r.billingType], num(r.veiculosMedia, 1), r.apurado, r.fatura ? 'Sim' : 'Não', r.fatura ? dia(r.fatura.vencimento) : '—', r.fatura?.pago ?? 0, r.fatura?.emAberto ?? 0, r.fatura?.diasAtraso ?? 0]));

  return (
    <div>
      <PageHeader icon="dinheiro" title="Faturamento" subtitle={`Apuração de ${mesLabel(ym)}, por cliente`}>
        <Select aria-label="Competência" className="w-48" value={ym} onChange={(e) => setYm(e.target.value)} options={mesesRecentes(12).map((m) => ({ value: m, label: mesLabel(m) }))} />
        {!corrente && abertas > 0 && <Button loading={closing} onClick={fechar}>Fechar competência</Button>}
        <Button variant="secondary" onClick={exportar} disabled={!rows.length}><Icon name="exportar" size={18} />Exportar para o financeiro</Button>
      </PageHeader>
      <PageBody>
        {error && <Callout tone="crit">Não foi possível carregar o faturamento: {error}</Callout>}
        {corrente && <Callout tone="warn">Mês em andamento: o apurado é parcial (veículos-dia medidos até hoje). A competência pode ser fechada a partir do mês que vem.</Callout>}
        <Section title="Resumo da competência">
          <Grid cols={4} equal>
            <KpiTile label="Receita prevista" display={<Num value={previsto} prefix="R$" digits={2} size="kpi" count />} sub="Contrato vigente × frota de agora" />
            <KpiTile label="Faturamento apurado" display={<Num value={apurado} prefix="R$" digits={2} size="kpi" count />} sub="Medição diária de veículos ativos" />
            <KpiTile label="Recebido" display={<Num value={recebido} prefix="R$" digits={2} size="kpi" count />} />
            <KpiTile label="Em atraso" display={<Num value={emAberto} prefix="R$" digits={2} size="kpi" count />} status={emAberto ? 'crit' : undefined} />
          </Grid>
        </Section>
        <Section title="Por cliente">
          <Card>
            <Table minWidth={1000} loading={loading && !data} align={['left', 'left', 'right', 'right', 'left', 'right']}
              head={['Cliente', 'Cobrança', 'Veículos-dia (média)', 'Apurado', 'Pagamento', '']}
              emptyState={<EmptyState title="Nenhum contrato para faturar" detail="Cadastre o contrato do cliente em Contratos." />}
              rows={rows.map((r) => [
                <span className="font-medium">{r.clientName}</span>,
                BILLING_LABEL[r.billingType],
                <span className="num">{r.billingType === 'por_veiculo_ativo' ? num(r.veiculosMedia, 1) : '—'}</span>,
                <span className="num font-semibold">{brl(r.apurado)}</span>,
                situacao(r),
                r.fatura && r.fatura.emAberto > 0 ? <TextButton onClick={() => setPaying(r)}>Registrar pagamento</TextButton> : r.fatura ? <TextButton onClick={() => setPaying(r)}>Pagamentos</TextButton> : '',
              ])}
            />
          </Card>
        </Section>
      </PageBody>
      {paying && <PaymentModal linha={paying} competencia={mesLabel(ym)} onClose={() => setPaying(null)} onDone={reload} />}
    </div>
  );
}

function PaymentModal({ linha, competencia, onClose, onDone }: { linha: LinhaFaturamento; competencia: string; onClose: () => void; onDone: () => void }) {
  const f = linha.fatura!;
  const { data: historico } = useAdminQuery(() => adminApi.pagamentos(f.id), [f.id]);
  const [amount, setAmount] = useState(f.emAberto);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('pix');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const { saldo } = await adminApi.registrarPagamento(f.id, { valor: amount, pagoEm: date, forma: method, observacao: note || undefined });
      toast(saldo === 0 ? 'Pagamento registrado. Fatura quitada.' : `Pagamento parcial registrado. Restam ${brl(saldo)}.`);
      onDone();
      onClose();
    } catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={`${linha.clientName} · ${competencia}`} width="max-w-md"
      footer={f.emAberto > 0 ? <><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!(amount > 0 && amount <= f.emAberto)} onClick={save}>Registrar</Button></> : <Button variant="quiet" onClick={onClose}>Fechar</Button>}>
      <p className="text-small text-ink-2">Fatura de <span className="num font-semibold text-ink">{brl(linha.apurado)}</span>, vence {dia(f.vencimento)}. Em aberto: <span className="num font-semibold text-ink">{brl(f.emAberto)}</span>{f.diasAtraso ? ` · ${f.diasAtraso} dias de atraso` : ''}.</p>
      {f.emAberto > 0 && (
        <>
          <FormGroup cols={2}>
            <Field label="Valor pago (R$)"><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(+e.target.value)} /></Field>
            <Field label="Data do pagamento"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Forma de pagamento"><Select value={method} onChange={(e) => setMethod(e.target.value)} options={FORMAS} /></Field>
          </FormGroup>
          <Field label="Observação" hint="Opcional"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </>
      )}
      {(historico || []).length > 0 && (
        <div className="flex flex-col gap-hair">
          <span className="text-caption text-ink-2 font-medium">Pagamentos registrados</span>
          {historico!.map((p) => (
            <div key={p.id} className="flex justify-between text-small text-ink-2">
              <span>{dia(p.pagoEm)} · {FORMAS.find((x) => x.value === p.forma)?.label}{p.observacao ? ` · ${p.observacao}` : ''}</span>
              <span className="num">{brl(p.valor)}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
