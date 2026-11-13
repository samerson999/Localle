// Console da Locale · Despesas: o custo que a Visão geral desconta da receita (/superadmin/despesas). Cada despesa é fixa
// no mês ou por veículo ativo, com vigência por mês — reajuste é encerrar a antiga e cadastrar a nova, para os meses
// passados manterem o custo que tinham.
import { useState } from 'react';
import { Card, PageHeader, PageBody, Section, Table, Badge, Button, TextButton, Modal, Field, FormGroup, Input, DateInput, Select, Textarea, Callout, toast, confirmAction } from '../components/ui';
import { adminApi, useAdminQuery, type Despesa, type DespesaBody, type TipoDespesa } from '../lib/localleApi';
import { brl, monthLabel } from '@localle/shared/utils';

const TIPO_LABEL: Record<TipoDespesa, string> = { fixa: 'Fixa no mês', por_veiculo: 'Por veículo ativo' };
const mesAtual = () => new Date().toISOString().slice(0, 7);
const vigente = (d: Despesa, ym = mesAtual()) => d.inicioEm <= ym && (d.fimEm === null || d.fimEm >= ym);
const vigencia = (d: Despesa) => `${monthLabel(d.inicioEm)} → ${d.fimEm ? monthLabel(d.fimEm) : 'sem fim'}`;
const valor = (d: Despesa) => `${brl(d.valor)}${d.tipo === 'por_veiculo' ? ' / veículo' : ''}`;

export default function Despesas() {
  const { data, error, loading, reload } = useAdminQuery(adminApi.despesas);
  const [editando, setEditando] = useState<Despesa | 'nova' | null>(null);
  const lista = data ?? [];

  const excluir = async (d: Despesa) => {
    if (!(await confirmAction({ title: 'Excluir despesa?', detail: `"${d.nome}" sai de todos os meses, inclusive dos passados. Para parar de contar só daqui para frente, edite e preencha o fim da vigência.`, confirmLabel: 'Excluir' }))) return;
    try { await adminApi.excluirDespesa(d.id); toast('Despesa excluída.'); reload(); } catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
  };

  return (
    <div>
      <PageHeader icon="dinheiro" title="Despesas" subtitle="Custos da Locale descontados da receita na Visão geral" />
      <PageBody>
        {error && <Callout tone="crit">Não foi possível carregar as despesas: {error}</Callout>}
        <Section title="Despesas cadastradas" actions={<Button onClick={() => setEditando('nova')}>Nova despesa</Button>}>
          <Card>
            <Table minWidth={760} loading={loading && !data} align={['left', 'left', 'right', 'left', 'right']}
              head={['Despesa', 'Tipo', 'Valor', 'Vigência', '']}
              empty="Nenhuma despesa cadastrada. Sem despesas, a margem da Visão geral é a própria receita."
              card={(i) => {
                const d = lista[i];
                return (
                  <div className="flex flex-col gap-hair min-w-0">
                    <div className="flex items-baseline justify-between gap-stack">
                      <span className="text-body font-medium min-w-0">{d.nome}</span>
                      <span className="shrink-0 num text-body">{valor(d)}</span>
                    </div>
                    <span className="text-small text-ink-2">{TIPO_LABEL[d.tipo]} · {vigencia(d)}</span>
                    {!vigente(d) && <Badge tone="gray" className="self-start">Fora da vigência</Badge>}
                    <div className="flex gap-3 mt-tight"><TextButton onClick={() => setEditando(d)}>Editar</TextButton><TextButton tone="danger" onClick={() => excluir(d)}>Excluir</TextButton></div>
                  </div>
                );
              }}
              rows={lista.map((d) => [
                <span className="text-small">{d.nome}{d.observacao && <span className="block text-caption text-ink-2">{d.observacao}</span>}</span>,
                <span className="text-small">{TIPO_LABEL[d.tipo]}</span>,
                <span className="num text-small">{valor(d)}</span>,
                <span className="text-small">{vigencia(d)}{!vigente(d) && <Badge tone="gray" className="ml-tight">Fora da vigência</Badge>}</span>,
                <div className="flex gap-3 justify-end"><TextButton onClick={() => setEditando(d)}>Editar</TextButton><TextButton tone="danger" onClick={() => excluir(d)}>Excluir</TextButton></div>,
              ])}
            />
          </Card>
          <p className="text-caption text-ink-2">Reajuste de valor: encerre a despesa no último mês do valor antigo e cadastre uma nova a partir do mês seguinte. Assim os meses passados continuam com o custo que tinham.</p>
        </Section>
      </PageBody>
      {editando && <DespesaModal despesa={editando === 'nova' ? null : editando} onClose={() => setEditando(null)} onDone={reload} />}
    </div>
  );
}

function DespesaModal({ despesa, onClose, onDone }: { despesa: Despesa | null; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({
    nome: despesa?.nome ?? '', tipo: despesa?.tipo ?? ('fixa' as TipoDespesa), valor: despesa ? String(despesa.valor) : '',
    inicioEm: despesa?.inicioEm ?? mesAtual(), fimEm: despesa?.fimEm ?? '', observacao: despesa?.observacao ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const numero = Number(v.valor.replace(',', '.'));
  const fimAntes = !!v.fimEm && v.fimEm < v.inicioEm;
  const valido = v.nome.trim() !== '' && v.valor.trim() !== '' && Number.isFinite(numero) && numero >= 0 && !!v.inicioEm && !fimAntes;

  const salvar = async () => {
    setBusy(true);
    const body: DespesaBody = { nome: v.nome.trim(), tipo: v.tipo, valor: numero, inicioEm: v.inicioEm, fimEm: v.fimEm || null, observacao: v.observacao.trim() || null };
    try {
      if (despesa) await adminApi.atualizarDespesa(despesa.id, body);
      else await adminApi.criarDespesa(body);
      toast('Despesa salva.');
      onDone();
      onClose();
    } catch (e: any) {
      toast(e.message || String(e), { tone: 'crit' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={despesa ? 'Editar despesa' : 'Nova despesa'} width="max-w-xl" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!valido} onClick={salvar}>Salvar</Button></>}>
      <FormGroup>
        <Field label="Nome" required><Input autoFocus value={v.nome} maxLength={120} placeholder="Ex.: Servidor, chip, Google Maps" onChange={set('nome')} /></Field>
        <FormGroup cols={2}>
          <Field label="Tipo"><Select value={v.tipo} onChange={set('tipo')} options={[{ value: 'fixa', label: TIPO_LABEL.fixa }, { value: 'por_veiculo', label: TIPO_LABEL.por_veiculo }]} /></Field>
          <Field label={v.tipo === 'fixa' ? 'Valor no mês (R$)' : 'Valor por veículo (R$)'} required><Input type="number" step="0.01" min={0} inputMode="decimal" value={v.valor} onChange={set('valor')} /></Field>
          <Field label="Início da vigência" required><DateInput type="month" value={v.inicioEm} onChange={set('inicioEm')} /></Field>
          <Field label="Fim da vigência" hint="Vazio = sem fim; o mês do fim ainda conta" error={fimAntes ? 'Antes do início' : undefined}><DateInput type="month" value={v.fimEm} onChange={set('fimEm')} /></Field>
        </FormGroup>
        <Field label="Observação"><Textarea rows={2} maxLength={500} value={v.observacao} onChange={set('observacao')} /></Field>
      </FormGroup>
    </Modal>
  );
}
