import { ativarPush, estadoPush, marcarAlertasLidos, removerRegra, salvarRegra, useCarregando } from '../lib/localleApi';
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { Button, Card, Field, FormGroup, Input, Select, Table, Check, Badge, PageTabs, Modal, TextButton, TabPanel, confirmAction, toast, IconButton, EmptyState, Stack, Cluster, Missing, useUrlTab, useUrlItem, FilterSheet } from '../components/ui';
import { useMobilePageAction } from '../components/Layout';
import { StatusDot, AssetName, IdChip, priorityKind } from '../components/story';
import { Icon } from '../components/icons';
import { MonitorHeader } from '../components/MonitorTabs';
import { RULE_FIELDS } from '@localle/shared/engine';
import { FENCE_TYPES } from '@localle/shared/catalog';
import { fmtDT } from '@localle/shared/utils';
import { STATUS_COMANDO, veSintaxeComando } from '../lib/support';
import { alertIdFor } from '../lib/localleMap';

// prioridade na linguagem de status: alta = crítico, média = atenção, baixa = anel
const PRIO: Record<string, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const Prio = ({ p }: { p: string }) => <StatusDot kind={priorityKind(p)} label={PRIO[p] || p} />;
const blankRule = () => ({ id: '', name: '', active: true, priority: 'media', groupId: '', conditions: [{ field: 'velocidade', op: '>', value: '80' }], actions: { painel: true, email: false, whatsapp: false, motorista: false, bloqueio: false, ranking: false, tratamento: false } });

export default function Alertas() {
  const [tab, setTab] = useUrlTab('alertas');
  const carregando = useCarregando('frota');
  return (
    <div>
      <MonitorHeader title="Alertas e comandos" subtitle="Regras que disparam alertas e o histórico de comandos enviados." />
      <Stack gap="card-head">
      <PageTabs value={tab} onChange={setTab} tabs={[{ key: 'alertas', label: 'Central de alertas' }, { key: 'regras', label: 'Regras de alerta' }, { key: 'comandos', label: 'Comandos cadastrados' }, { key: 'historico', label: 'Histórico de comandos' }]} />
      <TabPanel id={tab} loading={carregando}>
        {tab === 'alertas' && <AlertLog />}
        {tab === 'regras' && <Rules />}
        {tab === 'comandos' && <CmdDefs />}
        {tab === 'historico' && <CmdHistory />}
      </TabPanel>
      </Stack>
    </div>
  );
}

function AtivarPushButton() {
  const [estado, setEstado] = useState<'carregando' | 'inativo' | 'outro'>('carregando');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void estadoPush().then((e) => setEstado(e === 'inativo' ? 'inativo' : 'outro')); }, []);
  if (estado !== 'inativo') return null;
  return (
    <Button
      variant="quiet"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          if (await ativarPush()) { setEstado('outro'); toast('Notificações ativadas neste aparelho.'); }
          else toast.error('Não foi possível ativar — confira a permissão de notificação do navegador.');
        } finally { setBusy(false); }
      }}
    >
      Ativar notificações
    </Button>
  );
}

function AlertLog() {
  const alerts = useStore((s) => s.alerts);
  const assets = useStore((s) => s.assets);
  const [pr, setPr] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  // ?alerta=<id da API> vem do toque na notificação do celular (public/sw.js): limpa os filtros, destaca a linha e rola até ela
  const [foco, setFoco] = useState('');
  useUrlItem('alerta', (id) => alerts.find((a: any) => a.id === alertIdFor(id)), (a: any) => { setPr(''); setOnlyUnread(false); setFoco(a.id); }, [alerts]);
  useEffect(() => {
    if (!foco) return;
    const el = [...document.querySelectorAll<HTMLElement>('[data-alerta-foco]')].find((x) => x.offsetParent);
    el?.scrollIntoView({ block: 'center' });
  }, [foco]);
  const list = [...alerts].reverse().filter((a: any) => (!pr || a.priority === pr) && (!onlyUnread || !a.read));
  const patch = useStore.getState().patch;
  return (
    <Card title={`Alertas (${list.length})`} icon="alerta" actions={<div className="flex gap-stack items-center flex-wrap max-md:w-full max-md:[&>*]:flex-1"><AtivarPushButton /><FilterSheet count={[pr, onlyUnread].filter(Boolean).length}><Select aria-label="Prioridade" className="w-40 max-md:w-full" value={pr} onChange={(e) => setPr(e.target.value)} options={[{ value: '', label: 'Todas prioridades' }, 'alta', 'media', 'baixa']} /><Check label="Só não lidos" checked={onlyUnread} onChange={setOnlyUnread} /></FilterSheet></div>}>
      <Table head={['Quando', 'Prioridade', 'Alerta', 'Ativo', 'Detalhe', '']} emptyState={<EmptyState illustration="ilu-tudo-em-dia" title="Nenhum alerta com esses filtros" />} selected={(i) => list[i].id === foco} rows={list.map((a: any) => [<span className="num whitespace-nowrap">{fmtDT(a.ts)}</span>, <Prio p={a.priority} />, <span className="font-medium" data-alerta-foco={a.id === foco || undefined}>{a.title}</span>, <AssetName name={assets.find((x: any) => x.id === a.assetId)?.name} />, <span className="text-small text-ink-2">{a.detail}</span>, a.read ? <span className="text-caption text-ink-2">Lido</span> : <TextButton onClick={() => { patch((s: any) => ({ alerts: s.alerts.map((x: any) => (x.id === a.id ? { ...x, read: true } : x)) })); marcarAlertasLidos([a.id]).catch((e) => toast('Não foi possível marcar como lido: ' + (e.message || e), { tone: 'crit' })); }}>Marcar como lido</TextButton>])} />
    </Card>
  );
}

function Rules() {
  const rules = useStore((s) => s.rules);
  const groups = useStore((s) => s.groups);
  const alerts = useStore((s) => s.alerts);
  const [r, setR] = useState<any>(null);
  // regras ficam no backend e são avaliadas lá a cada posição, com a tela aberta ou não
  const falhou = (e: any) => toast('Não foi possível salvar a regra: ' + (e?.message || e), { tone: 'crit' });
  const setCond = (i: number, k: string, v: string) => { const c = r.conditions.map((x: any, j: number) => (j === i ? { ...x, [k]: v, ...(k === 'field' ? { op: RULE_FIELDS[v].ops[0], value: RULE_FIELDS[v].values?.[0] || (v.includes('cerca') ? 'Cliente' : '') } : {}) } : x)); setR({ ...r, conditions: c }); };
  const describe = (rule: any) => rule.conditions.map((c: any) => `${RULE_FIELDS[c.field]?.label} ${c.op} ${c.value}`).join(' e ');
  useMobilePageAction({ label: 'Nova regra', icon: 'mais', onClick: () => setR(blankRule()) });
  return (
    <>
      <Card title="Regras ativas" icon="alerta" actions={<Button onClick={() => setR(blankRule())} className="max-md:hidden"><Icon name="mais" size={16} />Nova regra</Button>}>
        <p className="text-small text-ink-2 mb-card-head">As regras são avaliadas a cada posição recebida, cruzando dados do rastreador, sensores, cercas e regras da empresa (horário, dia).</p>
        <Table head={['Regra', 'Condições', 'Escopo', 'Prioridade', 'Disparos', 'Ativa', '']} rows={rules.map((x: any) => [<span className="font-medium">{x.name}</span>, <span className="text-small">{describe(x)}</span>, 'Todos', <Prio p={x.priority} />, <span className="num">{x.disparos30d ?? alerts.filter((a: any) => a.ruleId === x.id).length}</span>,
          <Check aria-label={`Regra ${x.name} ativa`} checked={x.active} onChange={(v) => salvarRegra({ ...x, active: v }).then(() => toast(v ? `Regra "${x.name}" ativada.` : `Regra "${x.name}" desativada.`), falhou)} />, <div className="flex gap-3"><TextButton onClick={() => setR(JSON.parse(JSON.stringify(x)))}>Editar</TextButton><TextButton tone="danger" onClick={async () => { if (await confirmAction({ title: `Excluir a regra "${x.name}"?`, detail: 'Ela para de gerar alertas. Os alertas já gerados continuam no histórico.' })) { removerRegra(x.id).then(() => toast('Regra excluída.', { action: { label: 'Desfazer', onClick: () => salvarRegra({ ...x, id: undefined }).catch(falhou) } }), falhou); } }}>Excluir</TextButton></div>])} />
      </Card>
      <Modal open={!!r} onClose={() => setR(null)} title={r?.id ? 'Editar regra' : 'Nova regra de alerta'} width="max-w-3xl" footer={<><Missing className="mr-auto self-center" items={[!r?.name && 'o nome da regra']} /><Button variant="quiet" onClick={() => setR(null)}>Cancelar</Button><Button disabled={!r?.name} onClick={() => { salvarRegra(r).then(() => { setR(null); toast(r.id ? 'Regra salva.' : 'Regra incluída.'); }, falhou); }}>Salvar regra</Button></>}>
        {r && <Stack gap="group">
          <Field label="Nome da regra"><Input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="Ex.: Veículo só pode rodar até as 22h" /></Field>
          <FormGroup title="Condições (todas precisam ser verdadeiras)">
          {r.conditions.map((c: any, i: number) => {
            const F = RULE_FIELDS[c.field];
            const values = c.field.includes('cerca') ? FENCE_TYPES : F.values;
            return (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:grid-cols-[1.4fr_0.8fr_1fr_auto] gap-tight items-center max-md:pb-stack max-md:border-b max-md:border-line max-md:last:border-b-0">
                <Select className="max-md:col-span-3" aria-label="Campo" value={c.field} onChange={(e) => setCond(i, 'field', e.target.value)} options={Object.entries(RULE_FIELDS).map(([k, v]) => ({ value: k, label: `${v.src}: ${v.label}` }))} />
                <Select aria-label="Operador" value={c.op} onChange={(e) => setCond(i, 'op', e.target.value)} options={F.ops} />
                {values ? <Select aria-label="Valor" value={c.value} onChange={(e) => setCond(i, 'value', e.target.value)} options={values} /> : <Input aria-label="Valor" type={c.field === 'horario' ? 'time' : 'text'} value={c.value} onChange={(e) => setCond(i, 'value', e.target.value)} />}
                <IconButton aria-label="Remover condição" tone="danger-outline" disabled={r.conditions.length <= 1} onClick={() => setR({ ...r, conditions: r.conditions.filter((_: any, j: number) => j !== i) })}><Icon name="fechar" size={18} /></IconButton>
              </div>
            );
          })}
          <Button variant="secondary" className="justify-self-start" onClick={() => setR({ ...r, conditions: [...r.conditions, { field: 'ignicao', op: '=', value: 'Ligada' }] })}>Adicionar condição</Button>
          </FormGroup>
          <FormGroup title="Ações">
          <Cluster gap="grid" rowGap="stack">
            {[['painel', 'Notificar no painel'], ['email', 'E-mail'], ['whatsapp', 'WhatsApp'], ['motorista', 'Alerta ao motorista'], ['bloqueio', 'Bloquear automaticamente'], ['ranking', 'Pontuar no ranking']].map(([k, l]) => <Check key={k} label={l} checked={r.actions[k]} onChange={(v) => setR({ ...r, actions: { ...r.actions, [k]: v } })} />)}
          </Cluster>
          </FormGroup>
          <FormGroup cols={2}>
            <Field label="Aplicar a" hint="Escopo por grupo chega com o cadastro de grupos no servidor."><Select value="" disabled onChange={() => {}} options={[{ value: '', label: 'Todos os veículos' }]} /></Field>
            <Field label="Prioridade"><Select value={r.priority} onChange={(e) => setR({ ...r, priority: e.target.value })} options={['alta', 'media', 'baixa']} /></Field>
          </FormGroup>
          {/* regra gravada antes da opção existir: a API trata como alta = exige */}
          <Check label="Exige tratamento: vira ocorrência no “Precisa de você” e só sai quando alguém encerra com o desfecho" checked={r.actions.tratamento ?? r.priority === 'alta'} onChange={(v) => setR({ ...r, actions: { ...r.actions, tratamento: v } })} />
        </Stack>}
      </Modal>
    </>
  );
}

function CmdDefs() {
  const defs = useStore((s) => s.commandDefs);
  const { upsert, remove } = useStore.getState();
  const [d, setD] = useState({ name: '', desc: '', payload: '' });
  const tecnico = veSintaxeComando(useStore((s) => s.session));
  return (
    <Card title="Comandos cadastrados" icon="comando">
      <p className="text-small text-ink-2 mb-card-head">{tecnico ? 'Cadastre comandos com a sintaxe do seu equipamento. Eles aparecem na janela de envio, por veículo ou por grupo.' : 'Comandos disponíveis na janela de envio, por veículo ou por grupo. Para incluir um comando novo, fale com o suporte.'}</p>
      {tecnico && <div className="grid md:grid-cols-[1fr_1.4fr_1fr_auto] gap-field items-end mb-card-head">
        <Field label="Nome"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Ex.: Abrir trava do baú" /></Field>
        <Field label="Descrição"><Input value={d.desc} onChange={(e) => setD({ ...d, desc: e.target.value })} /></Field>
        <Field label="Comando"><Input className="font-mono" value={d.payload} onChange={(e) => setD({ ...d, payload: e.target.value })} placeholder="OUTPUT2,1#" /></Field>
        <Button disabled={!d.name || !d.payload} onClick={() => { upsert('commandDefs', { ...d, kind: 'custom' }); setD({ name: '', desc: '', payload: '' }); toast('Comando incluído.'); }}>Adicionar</Button>
      </div>}
      <Table head={['Nome', 'Descrição', ...(tecnico ? ['Comando'] : []), 'Tipo', '']} rows={defs.map((x: any) => [<span className="font-medium">{x.name}</span>, <span className="text-small text-ink-2">{x.desc}</span>, ...(tecnico ? [<IdChip size="sm">{x.payload}</IdChip>] : []), x.system ? <Badge>Padrão</Badge> : <Badge>Personalizado</Badge>, x.system ? '' : <TextButton tone="danger" onClick={async () => { if (await confirmAction({ title: `Excluir o comando "${x.name}"?`, detail: 'Ele some da lista de comandos enviáveis aos rastreadores.' })) { remove('commandDefs', x.id); toast('Comando excluído.', { action: { label: 'Desfazer', onClick: () => upsert('commandDefs', x) } }); } }}>Excluir</TextButton>])} />
    </Card>
  );
}

function CmdHistory() {
  const commands = useStore((s) => s.commands);
  const assets = useStore((s) => s.assets);
  const n = (id: string) => assets.find((a: any) => a.id === id)?.name;
  const tecnico = veSintaxeComando(useStore((s) => s.session));
  return (
    <Card title="Histórico de comandos" icon="historico">
      <Table head={['Quando', 'Comando', ...(tecnico ? ['Sintaxe'] : []), 'Destino', 'Por', 'Status por veículo']} emptyState={<EmptyState icon="comando" title="Nenhum comando enviado ainda" detail="Os comandos enviados pelo Monitoramento aparecem aqui com a resposta de cada veículo." />} rows={commands.map((c: any) => [<span className="num whitespace-nowrap">{fmtDT(c.ts)}</span>, <span className="font-medium">{c.name}</span>, ...(tecnico ? [<IdChip size="sm">{c.payload}</IdChip>] : []), c.target === 'grupo' ? `Grupo (${c.assetIds.length})` : <AssetName name={n(c.assetIds[0])} />, c.by,
        <div className="flex flex-wrap gap-x-stack gap-y-hair">{Object.entries<any>(c.status).map(([a, s]) => <StatusDot key={a} kind={s === 'confirmado' ? 'mov' : ['pendente', 'falhou', 'expirado'].includes(s) ? 'crit' : 'parado'} label={`${n(a)}: ${STATUS_COMANDO[s] || s}`} className="text-caption" />)}</div>])} />
    </Card>
  );
}
