// Documentos da jornada: termo de ciência de marcação incorreta, medidas disciplinares e comunicado coletivo.
// Cada emissão fica registrada (s.discipline) com quem emitiu e quando. MODELOS: revisar com o jurídico antes do uso real.
import { auditEntry } from '../lib/audit';
import { useMemo, useState } from 'react';
import { useStore, useStoreData } from '../lib/store';
import { Button, Card, Field, Input, Select, SearchSelect, Table, Tabs, Textarea, Check, Callout, TextButton, toast, EmptyState } from './ui';
import { Icon } from './icons';
import { usePrint } from './PrintPortal';
import { computeDays } from '../lib/jornada';
import { fmtD, fmtDT, toInputD, uid, DAY } from '../lib/utils';

export const MEASURES: Record<string, string> = {
  marcacao: 'Termo de marcação incorreta', verbal: 'Advertência verbal', escrita: 'Advertência escrita',
  susp1: 'Suspensão de 1 dia', susp3: 'Suspensão de 3 dias', susp5: 'Suspensão de 5 dias', justa_causa: 'Justa causa', coletivo: 'Comunicado coletivo',
};
// escala usual (gradação da pena); a empresa decide caso a caso
const LADDER = ['verbal', 'escrita', 'susp1', 'susp3', 'susp5', 'justa_causa'];

export const LegalNote = () => <Callout>Modelo de documento. Precisa de revisão do jurídico da empresa antes do uso real.</Callout>;

const Sign = ({ left, right }: { left: React.ReactNode; right: React.ReactNode }) => (
  <div className="grid grid-cols-2 gap-10 text-center text-[13px] mt-14"><div className="border-t border-ink pt-2">{left}</div><div className="border-t border-ink pt-2">{right}</div></div>
);
const Head = ({ title, company }: { title: string; company: any }) => (
  <header className="mb-6 text-center"><p className="text-[12px] text-ink-2">{company.name}{company.cnpj ? ` · CNPJ ${company.cnpj}` : ''}{company.address ? ` · ${company.address}` : ''}</p><h2 className="text-[19px] font-semibold mt-2">{title}</h2></header>
);
const Doc = ({ children }: { children: React.ReactNode }) => <article className="doc-sheet bg-card border border-line rounded-card p-8 md:p-12 max-w-3xl text-[14px] leading-relaxed">{children}</article>;

export function JornadaDocs({ company }: { company: { name: string; cnpj?: string; address?: string } }) {
  const s = useStoreData();
  const cfg = s.journeyCfg || { maxExtra: 2 };
  const { print, portal } = usePrint();
  const [kind, setKind] = useState('marcacao');
  const [d, setD] = useState(s.drivers[0].id);
  const [from, setFrom] = useState(toInputD(Date.now() - 30 * DAY));
  const [picked, setPicked] = useState<string[]>([]);
  const [measure, setMeasure] = useState('escrita');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(toInputD(Date.now()));
  const [subject, setSubject] = useState('Cumprimento das pausas e do registro de jornada');
  const [body, setBody] = useState('Lembramos a todos os motoristas que as pausas de descanso, o intervalo de refeição e a interjornada são obrigatórios (Lei 13.103/2015) e que todas as marcações devem ser feitas no teclado embarcado ou no aplicativo no momento em que acontecem. Nas últimas semanas, o sistema registrou descumprimentos recorrentes. A partir desta data, os casos serão tratados conforme o regulamento interno.');
  const [targets, setTargets] = useState<string[]>(s.drivers.map((x: any) => x.id));
  const drv = s.drivers.find((x: any) => x.id === d);
  const log: any[] = s.discipline || [];
  const prevOf = (pid: string) => log.filter((l) => l.driverIds.includes(pid) && LADDER.includes(l.kind));
  const viol = useMemo(() => computeDays(s.journey.filter((m: any) => m.driverId === d), drv?.regime, cfg)
    .filter((x) => x.day >= new Date(from + 'T00:00').getTime()).flatMap((x) => x.violations.map((v) => ({ id: `${x.day}:${v.code}`, day: x.day, ...v }))).sort((a, b) => b.day - a.day), [d, from, s.journey.length, JSON.stringify(cfg)]);
  const chosen = viol.filter((v) => picked.includes(v.id));
  const prev = prevOf(d);
  const suggestion = LADDER[Math.min(LADDER.length - 1, prev.length ? LADDER.indexOf(prev[prev.length - 1].kind) + 1 : 0)];
  const register = (k: string, ids: string[], detail: string) => s.patch((st: any) => ({ discipline: [...(st.discipline || []), { id: uid('md'), ts: Date.now(), date, kind: k, driverIds: ids, detail, by: st.session?.name || 'Gestor' }], ...(ids.length > 1 ? auditEntry(st, { coll: 'discipline', refId: '', label: detail || k, action: `registrou documento para ${ids.length} motoristas em lote`, count: ids.length }) : {}) }));
  const today = new Date(date + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const docMarcacao = (
    <Doc>
      <Head title="Termo de ciência de marcação incorreta de jornada" company={company} />
      <p className="mb-3">Eu, <b>{drv?.name}</b>, CNH nº <b>{drv?.cnh}</b>{drv?.cpf ? <>, CPF <b>{drv.cpf}</b></> : null}, declaro estar ciente de que as marcações de jornada listadas abaixo foram registradas de forma incorreta ou fora do momento em que os fatos aconteceram, gerando os apontamentos do controle de jornada da empresa:</p>
      <table className="w-full text-[13px] border-collapse my-4"><thead><tr className="text-left border-b border-line-strong"><th className="py-1.5 pr-3">Data</th><th className="py-1.5 pr-3">Apontamento</th><th className="py-1.5">Detalhe</th></tr></thead>
        <tbody>{(chosen.length ? chosen : [{ id: '-', day: 0, label: '—', detail: 'Selecione os apontamentos' } as any]).map((v) => <tr key={v.id} className="border-b border-line"><td className="py-1.5 pr-3 num">{v.day ? fmtD(v.day) : '—'}</td><td className="py-1.5 pr-3">{v.label}</td><td className="py-1.5">{v.detail}</td></tr>)}</tbody></table>
      <p className="mb-3">Fui orientado(a) sobre a forma correta de registrar início e fim de jornada, direção, refeição, espera e descanso, e me comprometo a fazer as marcações no momento em que acontecem. Estou ciente de que a reincidência poderá ser tratada conforme o regulamento interno e a legislação.</p>
      <p className="mt-6">Local e data: ______________________, {today}</p>
      <Sign left={<>{drv?.name}<br />Motorista</>} right={<>{company.name}<br />Empregador</>} />
    </Doc>
  );
  const verbal = measure === 'verbal';
  const docMedida = (
    <Doc>
      <Head title={verbal ? 'Registro de advertência verbal' : measure === 'justa_causa' ? 'Comunicado de dispensa por justa causa' : `Comunicado de ${MEASURES[measure].toLowerCase()}`} company={company} />
      <p className="mb-3">Ao(À) colaborador(a) <b>{drv?.name}</b>, CNH nº <b>{drv?.cnh}</b>{drv?.matricula ? <>, matrícula <b>{drv.matricula}</b></> : null}.</p>
      <p className="mb-3">{verbal ? `Registramos que em ${today} o(a) colaborador(a) recebeu advertência verbal` : measure === 'escrita' ? 'Fica o(a) colaborador(a) formalmente advertido(a)' : measure === 'justa_causa' ? 'Comunicamos a rescisão do contrato de trabalho por justa causa, nos termos do art. 482 da CLT,' : `Fica o(a) colaborador(a) suspenso(a) por ${measure.replace('susp', '')} dia(s), sem remuneração, a partir de ${today},`} pelo(s) seguinte(s) motivo(s):</p>
      <p className="mb-3 whitespace-pre-wrap border-l-2 border-line-strong pl-3">{reason || chosen.map((v) => `${fmtD(v.day)} — ${v.label}: ${v.detail}`).join('\n') || 'Descreva o motivo.'}</p>
      {prev.length > 0 && <p className="mb-3 text-[13px]">Medidas anteriores: {prev.map((p) => `${MEASURES[p.kind]} em ${fmtD(p.ts)}`).join('; ')}.</p>}
      {measure !== 'justa_causa' && <p className="mb-3">A reincidência poderá acarretar a aplicação de medidas mais severas, conforme o regulamento interno e a legislação trabalhista.</p>}
      <p className="mt-6">Local e data: ______________________, {today}</p>
      <Sign left={<>{drv?.name}<br />Colaborador(a) — ciente</>} right={<>{company.name}<br />Empregador</>} />
      <div className="grid grid-cols-2 gap-10 text-center text-[13px] mt-12"><div className="border-t border-ink pt-2">Testemunha 1</div><div className="border-t border-ink pt-2">Testemunha 2</div></div>
    </Doc>
  );
  const sel = s.drivers.filter((x: any) => targets.includes(x.id));
  const docColetivo = (
    <Doc>
      <Head title={`Comunicado: ${subject}`} company={company} />
      <p className="mb-3">Aos motoristas e ajudantes,</p>
      <p className="mb-5 whitespace-pre-wrap">{body}</p>
      <p className="mb-2">{today}.</p>
      <p className="mb-6">{company.name}</p>
      <p className="font-medium mb-2">Ciência dos colaboradores</p>
      <table className="w-full text-[13px] border-collapse"><thead><tr className="text-left border-b border-line-strong"><th className="py-2 pr-3">Nome</th><th className="py-2 pr-3 w-32">Data</th><th className="py-2 w-56">Assinatura</th></tr></thead>
        <tbody>{sel.map((x: any) => <tr key={x.id} className="border-b border-line"><td className="py-3 pr-3">{x.name}</td><td /><td /></tr>)}</tbody></table>
    </Doc>
  );

  const docs: Record<string, JSX.Element> = { marcacao: docMarcacao, medida: docMedida, coletivo: docColetivo };
  const issue = () => {
    if (kind === 'marcacao') register('marcacao', [d], chosen.map((v) => `${fmtD(v.day)} ${v.label}`).join('; '));
    if (kind === 'medida') register(measure, [d], reason || chosen.map((v) => `${fmtD(v.day)} ${v.label}`).join('; '));
    if (kind === 'coletivo') register('coletivo', targets, subject);
    print(docs[kind]);
    toast(kind === 'coletivo' ? 'Comunicado registrado no histórico.' : 'Documento registrado no histórico.', { detail: 'A janela de impressão abriu; assine e guarde a via impressa.' });
  };
  const canIssue = kind === 'coletivo' ? targets.length > 0 : kind === 'marcacao' ? chosen.length > 0 : !!(reason.trim() || chosen.length);
  const name = (id: string) => s.drivers.find((x: any) => x.id === id)?.name || id;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <Tabs value={kind} onChange={setKind} tabs={[{ key: 'marcacao', label: 'Termo de marcação incorreta' }, { key: 'medida', label: 'Medida disciplinar' }, { key: 'coletivo', label: 'Comunicado coletivo' }]} />
        <div className="flex flex-col gap-4 mt-4">
          {kind !== 'coletivo' && <div className="flex flex-wrap gap-3 items-end">
            <Field label="Motorista"><SearchSelect className="w-56" value={d} onChange={(v) => { setD(v); setPicked([]); }} options={s.drivers.map((x: any) => ({ value: x.id, label: x.name }))} /></Field>
            <Field label="Apontamentos desde"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Data do documento"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            {kind === 'medida' && <Field label="Medida"><Select className="w-52" value={measure} onChange={(e) => setMeasure(e.target.value)} options={LADDER.map((k) => ({ value: k, label: MEASURES[k] }))} /></Field>}
          </div>}
          {kind === 'medida' && <p className="text-small text-ink-2">{prev.length ? `Medidas anteriores de ${drv?.name}: ${prev.map((p) => `${MEASURES[p.kind]} (${fmtD(p.ts)})`).join(', ')}. ` : `${drv?.name} não tem medidas anteriores. `}Próximo passo usual: <b>{MEASURES[suggestion]}</b>. A empresa decide caso a caso.</p>}
          {kind !== 'coletivo' && (
            <div>
              <p className="text-small font-medium text-ink-2 mb-2">Apontamentos do controle de jornada ({viol.length})</p>
              {viol.length === 0 ? <p className="text-small text-ink-2">Nenhum apontamento no período.</p> : (
                <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-2">{viol.map((v) => <Check key={v.id} checked={picked.includes(v.id)} onChange={(on) => setPicked(on ? [...picked, v.id] : picked.filter((x) => x !== v.id))} label={`${fmtD(v.day)} · ${v.label} — ${v.detail}`} />)}</div>
              )}
              {viol.length > 0 && <TextButton className="mt-2" onClick={() => setPicked(picked.length === viol.length ? [] : viol.map((v) => v.id))}>{picked.length === viol.length ? 'Desmarcar todos' : 'Marcar todos'}</TextButton>}
            </div>
          )}
          {kind === 'medida' && <Field label="Motivo" hint="Vazio: usa os apontamentos marcados."><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
          {kind === 'coletivo' && <>
            <Field label="Assunto"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
            <Field label="Texto"><Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
            <Field label="Data do documento"><Input type="date" className="w-48" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <div><p className="text-small font-medium text-ink-2 mb-2">Destinatários</p><div className="flex flex-wrap gap-x-5 gap-y-2">{s.drivers.map((x: any) => <Check key={x.id} label={x.name} checked={targets.includes(x.id)} onChange={(on) => setTargets(on ? [...targets, x.id] : targets.filter((t) => t !== x.id))} />)}</div></div>
          </>}
          <LegalNote />
          <div><Button disabled={!canIssue} onClick={issue}><Icon name="imprimir" size={18} />Registrar e imprimir</Button></div>
        </div>
      </Card>
      <div className="overflow-x-auto">{docs[kind]}</div>
      <Card title="Histórico de medidas e termos" icon="historico">
        <Table minWidth={760} emptyState={<EmptyState icon="documento" title="Nenhum termo ou medida emitido" detail="Os documentos registrados aqui ficam no histórico do motorista." />} head={['Data', 'Documento', 'Colaborador', 'Motivo', 'Emitido por']} rows={[...log].reverse().map((l) => [<span className="num">{fmtD(new Date(l.date + 'T12:00').getTime())}</span>, MEASURES[l.kind], l.driverIds.length > 2 ? `${l.driverIds.length} colaboradores` : l.driverIds.map(name).join(', '), <span className="text-small text-ink-2">{l.detail}</span>, <span className="text-small">{l.by} · <span className="font-mono">{fmtDT(l.ts)}</span></span>])} empty="Nenhum documento emitido ainda." />
      </Card>
      {portal}
    </div>
  );
}
