// Console da Locale · Tipos de alerta: alertas GERAIS da plataforma (/superadmin/alerta-tipos), que valem para todos os
// clientes (cada cliente pode desligar os que não quer no Setup dele; todos nascem ligados). Três formas de disparar:
//  - Condição sobre o estado do rastreador: a plataforma avalia a cada posição (tensão, alimentação, bloqueio, entrada
//    digital, qualquer atributo do Traccar…), com duração mínima, intervalo de repetição e encerramento automático
//    quando a condição normaliza;
//  - Alarme do rastreador: o aparelho manda pronto (`attributes.alarm` do Traccar) e aqui só se decide como vira alerta;
//  - Sistema: rotina da plataforma (sem posição, dados do painel), só tratamento e notificação são ajustáveis.
// Em todos: prioridade, se exige tratamento (ocorrência no "Precisa de você") e se notifica no celular.
import { useState } from 'react';
import { Card, PageHeader, PageBody, Table, Badge, Button, TextButton, Modal, Field, FormGroup, Input, Select, Check, EmptyState, IconButton, Pills, Stack, toast, confirmAction } from '../components/ui';
import { StatusDot, priorityKind } from '../components/story';
import { Icon } from '../components/icons';
import { useStore } from '../lib/store';
import { adminApi, useAdminQuery, type AlertaTipo, type CondicaoAlerta } from '../lib/localleApi';

const PRIO: Record<string, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const TRAT = [{ value: 'prioridade', label: 'Pela prioridade (alta exige)' }, { value: 'sim', label: 'Sim: ocorrência, encerra com desfecho' }, { value: 'nao', label: 'Não: aviso, sai com “lido”' }];
const tratDe = (v: boolean | null) => (v === null ? 'prioridade' : v ? 'sim' : 'nao');
const tratPara = (v: string) => (v === 'prioridade' ? null : v === 'sim');
const tratLabel = (t: AlertaTipo) => (t.exigeTratamento === null ? `Pela prioridade${t.prioridade ? ` (${t.prioridade === 'alta' ? 'sim' : 'não'})` : ''}` : t.exigeTratamento ? 'Sim' : 'Não');
const DISPARO: Record<AlertaTipo['disparo'], string> = { condicao: 'Condição', alarme: 'Alarme do rastreador', sistema: 'Sistema' };

// Estado do rastreador que a condição pode ler — o mesmo catálogo da API (CAMPOS_PLATAFORMA em avaliar-regra.ts)
const CAMPOS: Record<string, { label: string; ops: string[]; values?: string[]; unidade?: string }> = {
  tensao: { label: 'Tensão da bateria do veículo', ops: ['<', '>'], unidade: 'V' },
  alimentacao: { label: 'Alimentação externa', ops: ['='], values: ['Desconectada', 'Conectada'] },
  bloqueio: { label: 'Bloqueio', ops: ['='], values: ['Ativo', 'Livre'] },
  ignicao: { label: 'Ignição', ops: ['='], values: ['Ligada', 'Desligada'] },
  velocidade: { label: 'Velocidade', ops: ['>', '<'], unidade: 'km/h' },
  satelites: { label: 'Satélites do GPS', ops: ['<', '>'] },
  sinal_gsm: { label: 'Sinal da rede celular (0 a 5)', ops: ['<', '>'] },
  temperatura: { label: 'Temperatura (sensor 1)', ops: ['>', '<'], unidade: '°C' },
  porta: { label: 'Porta', ops: ['='], values: ['Aberta', 'Fechada'] },
  atributo: { label: 'Atributo do rastreador (Traccar)', ops: ['=', '≠', '>', '<'] },
  horario: { label: 'Horário', ops: ['depois de', 'antes de'] },
  dia_semana: { label: 'Dia', ops: ['='], values: ['Dia útil', 'Fim de semana'] },
};
const novaCondicao = (): CondicaoAlerta => ({ field: 'tensao', op: '<', value: '11.5' });
const descreve = (c: CondicaoAlerta) => `${c.field === 'atributo' ? c.attr : CAMPOS[c.field]?.label || c.field} ${c.op} ${c.value}${CAMPOS[c.field]?.unidade ? ` ${CAMPOS[c.field].unidade}` : ''}`;

type Form = {
  novo: boolean; padrao: boolean; disparo: AlertaTipo['disparo']; chave: string; nome: string; prioridade: string; trat: string; geraAlerta: boolean; notificaPush: boolean;
  condicoes: CondicaoAlerta[]; duracaoMin: string; encerraSozinho: boolean; repetirMin: string;
};
const blank = (): Form => ({ novo: true, padrao: false, disparo: 'condicao', chave: '', nome: '', prioridade: 'media', trat: 'prioridade', geraAlerta: true, notificaPush: true, condicoes: [novaCondicao()], duracaoMin: '0', encerraSozinho: true, repetirMin: '15' });
const minutos = (s: string) => { const n = Number(s); return Number.isInteger(n) && n >= 0 && n <= 1440 ? n : null; };

export default function TiposAlerta() {
  const session = useStore((s) => s.session);
  const { data, error, loading, reload } = useAdminQuery(adminApi.alertaTipos);
  const [f, setF] = useState<Form | null>(null);
  const [salvando, setSalvando] = useState(false);
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com o acesso da Locale para ver o Console da Locale." /></Card>;

  const editar = (t: AlertaTipo) => setF({
    novo: false, padrao: t.padrao, disparo: t.disparo, chave: t.chave, nome: t.nome, prioridade: t.prioridade || 'media', trat: tratDe(t.exigeTratamento), geraAlerta: t.geraAlerta,
    notificaPush: t.notificaPush, condicoes: t.condicoes || [novaCondicao()], duracaoMin: String(t.duracaoMin), encerraSozinho: t.encerraSozinho, repetirMin: String(t.repetirMin),
  });
  const setCond = (i: number, c: Partial<CondicaoAlerta>) => f && setF({ ...f, condicoes: f.condicoes.map((x, j) => (j === i ? { ...x, ...c } : x)) });
  const trocaCampo = (i: number, field: string) => { const d = CAMPOS[field]; setCond(i, { field, op: d.ops[0], value: d.values?.[0] ?? '', attr: field === 'atributo' ? '' : undefined }); };

  const faltando = !f ? [] : [
    f.disparo !== 'sistema' && !f.nome.trim() && 'o título',
    f.novo && f.disparo === 'alarme' && !f.chave.trim() && 'a chave do alarme',
    f.disparo === 'condicao' && f.condicoes.some((c) => !c.value.trim() || (c.field === 'atributo' && !c.attr?.trim())) && 'completar as condições',
    f.disparo === 'condicao' && minutos(f.repetirMin) === null && 'repetir após (0 a 1440 min)',
    f.disparo === 'condicao' && minutos(f.duracaoMin) === null && 'duração (0 a 1440 min)',
  ].filter(Boolean);

  const salvar = async () => {
    if (!f) return;
    setSalvando(true);
    try {
      const comum = { exigeTratamento: tratPara(f.trat), notificaPush: f.notificaPush };
      const proprio = f.disparo === 'sistema' ? {} : { geraAlerta: f.geraAlerta, nome: f.nome.trim(), prioridade: f.prioridade as AlertaTipo['prioridade'] };
      const condicao = f.disparo === 'condicao' ? { repetirMin: minutos(f.repetirMin)!, condicoes: f.condicoes.map((c) => ({ field: c.field, op: c.op, value: c.value.trim(), ...(c.field === 'atributo' ? { attr: c.attr!.trim() } : {}) })), duracaoMin: minutos(f.duracaoMin)!, encerraSozinho: f.encerraSozinho } : {};
      const body = { ...comum, ...proprio, ...condicao };
      if (f.novo) await adminApi.criarAlertaTipo({ disparo: f.disparo as 'alarme' | 'condicao', ...(f.disparo === 'alarme' ? { chave: f.chave.trim() } : {}), ...body });
      else await adminApi.atualizarAlertaTipo(f.chave, body);
      toast(f.novo ? 'Alerta incluído. Vale para todos os clientes a partir de agora.' : 'Alerta salvo. Vale para os alertas novos.');
      setF(null);
      reload();
    } catch (e: any) {
      toast(e.message || String(e), { tone: 'crit' });
    } finally {
      setSalvando(false);
    }
  };
  const excluir = async (t: AlertaTipo) => {
    if (!(await confirmAction({ title: `Excluir "${t.nome}"?`, tone: 'danger', confirmLabel: 'Excluir', detail: `Deixa de gerar alerta em todos os clientes${t.disparo === 'alarme' ? ' (o alarme do rastreador fica só como evento)' : ''}. Os alertas já gerados continuam no histórico.` }))) return;
    try { await adminApi.excluirAlertaTipo(t.chave); toast('Alerta excluído.'); reload(); } catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
  };

  const tipos = data || [];
  const sistema = f?.disparo === 'sistema';
  return (
    <div>
      <PageHeader title="Tipos de alerta" subtitle="Alertas gerais da plataforma: o que capturar do rastreador, com que prioridade, se exige tratamento e se notifica no celular." />
      <PageBody>
        <Card title={`Alertas da plataforma (${tipos.length})`} icon="alerta" actions={<Button onClick={() => setF(blank())}><Icon name="mais" size={16} />Novo alerta</Button>}>
          <p className="text-small text-ink-2 mb-card-head">Valem para todos os clientes, ligados por padrão; cada cliente desliga os que não quer no Setup dele. Ocorrência (exige tratamento) fica no “Precisa de você” até alguém encerrar com o desfecho; aviso sai com “lido”.</p>
          <Table
            loading={loading}
            minWidth={980}
            head={['Alerta', 'Dispara por', 'Prioridade', 'Exige tratamento', 'Celular', '']}
            emptyState={<EmptyState icon="alerta" title={error || 'Nenhum alerta cadastrado'} />}
            rows={tipos.map((t) => [
              <div className="flex flex-col gap-hair">
                <span className="font-medium">{t.nome}{t.disparo === 'condicao' && <Badge className="ml-tight align-middle">{t.padrao ? 'Padrão' : 'Avançado'}</Badge>}{!t.geraAlerta && <Badge className="ml-tight align-middle">Desligado</Badge>}</span>
                <span className="text-caption text-ink-2">
                  {t.disparo === 'condicao' ? (t.condicoes || []).map(descreve).join(' e ') + (t.duracaoMin ? ` · por ${t.duracaoMin} min` : '') + (t.encerraSozinho ? ' · encerra ao normalizar' : '')
                    : t.disparo === 'alarme' ? <>alarme <code className="font-mono">{t.chave}</code></> : 'regra interna da plataforma'}
                </span>
              </div>,
              t.disparo === 'condicao' ? (t.padrao ? 'Estado (padrão)' : 'Condição avançada') : DISPARO[t.disparo],
              t.prioridade ? <StatusDot kind={priorityKind(t.prioridade)} label={PRIO[t.prioridade]} /> : <span className="text-small text-ink-2">Pela rotina</span>,
              tratLabel(t),
              t.notificaPush ? 'Notifica' : <span className="text-ink-2">Não</span>,
              <div className="flex gap-3"><TextButton onClick={() => editar(t)}>Editar</TextButton>{!t.sistema && !t.padrao && <TextButton tone="danger" onClick={() => excluir(t)}>Excluir</TextButton>}</div>,
            ])}
          />
        </Card>
      </PageBody>
      <Modal open={!!f} onClose={() => setF(null)} title={f?.novo ? 'Novo alerta da plataforma' : 'Editar alerta da plataforma'} width="max-w-3xl"
        footer={<><span className="mr-auto self-center text-small text-ink-2">{faltando.length ? `Falta: ${faltando.join(', ')}` : ''}</span><Button variant="quiet" onClick={() => setF(null)}>Cancelar</Button><Button loading={salvando} disabled={faltando.length > 0} onClick={salvar}>Salvar</Button></>}>
        {f && <Stack gap="group">
          {f.novo && <Field label="Dispara por">
            <Pills value={f.disparo} onChange={(k) => setF({ ...f, disparo: k as Form['disparo'] })} options={[{ key: 'condicao', label: 'Avançado: condição sobre o estado' }, { key: 'alarme', label: 'Alarme que o rastreador manda' }]} />
          </Field>}
          {f.novo && f.disparo === 'condicao' && <p className="text-small text-ink-2">Para o que os alertas padrão não cobrem, como uma entrada digital ligada a um acessório num modelo específico (ex.: botão de pânico na in2). Precisa conhecer o nome do atributo no Traccar.</p>}
          {f.padrao && <p className="text-small text-ink-2">Alerta padrão da plataforma: o que ele mede é fixo. Aqui ficam o limite e a duração padrão; cada cliente pode ajustar no Setup dele.</p>}
          <FormGroup cols={2}>
            <Field label="Título do alerta" hint={sistema ? 'Calculado pela rotina.' : 'É o que o cliente vê.'}>
              <Input value={f.nome} disabled={sistema} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Bateria do veículo baixa" />
            </Field>
            <Field label="Prioridade" hint={sistema ? 'Calculada pela rotina (sobe de nível).' : undefined}>
              <Select value={f.prioridade} disabled={sistema} onChange={(e) => setF({ ...f, prioridade: e.target.value })} options={['alta', 'media', 'baixa'].map((p) => ({ value: p, label: PRIO[p] }))} />
            </Field>
          </FormGroup>

          {f.disparo === 'alarme' && <Field label="Chave do alarme" hint="Nome do alarme no Traccar (attributes.alarm), ex.: sos, powerCut, tamper. Só funciona se o rastreador manda esse alarme.">
            <Input className="font-mono" value={f.chave} disabled={!f.novo} onChange={(e) => setF({ ...f, chave: e.target.value })} placeholder="ex.: hardBraking" />
          </Field>}

          {f.disparo === 'condicao' && <FormGroup title="Quando (todas as condições ao mesmo tempo)">
            {f.condicoes.map((c, i) => {
              const d = CAMPOS[c.field] || CAMPOS.tensao;
              return (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:grid-cols-[1.6fr_auto_1fr_auto] gap-tight items-center">
                  <Select className="max-md:col-span-3" aria-label="Estado" disabled={f.padrao} value={c.field} onChange={(e) => trocaCampo(i, e.target.value)} options={Object.entries(CAMPOS).map(([k, v]) => ({ value: k, label: v.label }))} />
                  {c.field === 'atributo' && <Input className="font-mono max-md:col-span-3 md:col-start-1" aria-label="Nome do atributo" disabled={f.padrao} value={c.attr || ''} onChange={(e) => setCond(i, { attr: e.target.value })} placeholder="nome no Traccar, ex.: in1, io239" />}
                  <Select aria-label="Operador" disabled={f.padrao} value={c.op} onChange={(e) => setCond(i, { op: e.target.value })} options={d.ops} />
                  {d.values
                    ? <Select aria-label="Valor" value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} options={d.values} />
                    : <Input aria-label="Valor" type={c.field === 'horario' ? 'time' : 'text'} inputMode={c.field === 'atributo' || c.field === 'horario' ? undefined : 'decimal'} value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} placeholder={d.unidade || (c.field === 'atributo' ? 'true, 1, texto' : '')} />}
                  <IconButton aria-label="Remover condição" tone="danger-outline" disabled={f.padrao || f.condicoes.length <= 1} onClick={() => setF({ ...f, condicoes: f.condicoes.filter((_, j) => j !== i) })}><Icon name="fechar" size={18} /></IconButton>
                </div>
              );
            })}
            {!f.padrao && <Button variant="secondary" className="justify-self-start" disabled={f.condicoes.length >= 10} onClick={() => setF({ ...f, condicoes: [...f.condicoes, novaCondicao()] })}>Adicionar condição</Button>}
            <FormGroup cols={2}>
              <Field label="Por pelo menos (min)" hint="0 = dispara na primeira posição que atender. Evita alerta por oscilação.">
                <Input type="number" min={0} max={1440} value={f.duracaoMin} onChange={(e) => setF({ ...f, duracaoMin: e.target.value })} />
              </Field>
              <Field label="Repetir no mesmo veículo após (min)" hint="Depois de normalizar, só alerta de novo passado esse tempo do último.">
                <Input type="number" min={0} max={1440} value={f.repetirMin} onChange={(e) => setF({ ...f, repetirMin: e.target.value })} />
              </Field>
            </FormGroup>
            <Check label="Encerrar sozinho quando a condição deixar de valer (fica no histórico como “Normalizado”)" checked={f.encerraSozinho} onChange={(v) => setF({ ...f, encerraSozinho: v })} />
          </FormGroup>}

          <FormGroup title="Para o cliente">
            <Field label="Exige tratamento">
              <Select value={f.trat} onChange={(e) => setF({ ...f, trat: e.target.value })} options={TRAT} />
            </Field>
            <Check label="Notificar no celular (o usuário ainda pode desligar este tipo nas preferências dele)" checked={f.notificaPush} onChange={(v) => setF({ ...f, notificaPush: v })} />
            {!sistema && <Check label="Ligado na plataforma (desligado, não gera alerta para nenhum cliente)" checked={f.geraAlerta} onChange={(v) => setF({ ...f, geraAlerta: v })} />}
          </FormGroup>
        </Stack>}
      </Modal>
    </div>
  );
}
