// Console da Locale · Rastreadores e chips: inventário real do backend (rotas /superadmin/rastreadores):
// cadastro de rastreador e chip, vínculo chip↔rastreador, vínculo rastreador↔cliente, instalação vigente,
// último pacote, desinstalação e desativação. Em qual ativo o rastreador está é o próprio cliente que indica
// (Gestão de ativos). Custo, avaria e recolhimento físico não existem no schema.
import { useState } from 'react';
import { Card, PageHeader, PageBody, Section, Grid, Table, Badge, Button, Select, SearchSelect, TextButton, Modal, Field, FormGroup, Input, Callout, EmptyState, toast, confirmAction } from '../components/ui';
import { KpiTile } from '../components/story';
import { useStore } from '../lib/store';
import { adminApi, useAdminQuery, type AdminRastreador, type AdminSimCard } from '../lib/localleApi';
import { fmtD, fmtDT } from '@localle/shared/utils';

type Situacao = 'instalado' | 'vinculado' | 'estoque' | 'desativado';
const situacao = (r: AdminRastreador): Situacao => (r.status === 'desativado' ? 'desativado' : r.instalacao_id ? 'instalado' : r.vinculo_id ? 'vinculado' : 'estoque');
const SIT_BADGE: Record<Situacao, { tone: string; label: string }> = {
  instalado: { tone: 'green', label: 'Instalado' },
  vinculado: { tone: 'orange', label: 'Com o cliente' },
  estoque: { tone: 'gray', label: 'Em estoque' },
  desativado: { tone: 'red', label: 'Desativado' },
};

const carregar = () => Promise.all([adminApi.rastreadores(), adminApi.simCards(), adminApi.clients()]);

export default function Rastreadores() {
  const session = useStore((s) => s.session);
  const { data, error, loading, reload } = useAdminQuery(carregar);
  const [filtro, setFiltro] = useState('');
  const [modal, setModal] = useState<'rastreador' | 'chip' | null>(null);
  const [vinculando, setVinculando] = useState<AdminRastreador | null>(null);
  const [aoCliente, setAoCliente] = useState<AdminRastreador | null>(null);
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com o acesso da Locale para ver o Console da Locale." /></Card>;

  const [rastreadores, chips, clientes] = data || [[], [], []];
  const list = filtro ? rastreadores.filter((r) => situacao(r) === filtro) : rastreadores;
  const count = (s: Situacao) => rastreadores.filter((r) => situacao(r) === s).length;
  const chipsLivres = chips.filter((c) => !c.rastreador_id && c.status !== 'inativo');

  const acao = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast(ok); reload(); } catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
  };
  const desinstalar = async (r: AdminRastreador) => {
    if (!(await confirmAction({ title: 'Desinstalar rastreador?', detail: `${r.imei} deixa de enviar posições para ${r.client_name} (${r.asset_plate}). O histórico da instalação é mantido.`, confirmLabel: 'Desinstalar' }))) return;
    acao(() => adminApi.desinstalar(r.instalacao_id!), 'Rastreador desinstalado; continua com o cliente.');
  };
  const desvincular = async (r: AdminRastreador) => {
    if (!(await confirmAction({ title: 'Desvincular do cliente?', detail: `${r.imei} deixa de aparecer para ${r.client_name} e volta para o estoque. O histórico do vínculo é mantido.`, confirmLabel: 'Desvincular' }))) return;
    acao(() => adminApi.desvincularCliente(r.id), 'Rastreador desvinculado; voltou para o estoque.');
  };
  const desativar = async (r: AdminRastreador) => {
    if (!(await confirmAction({ title: 'Desativar rastreador?', detail: `${r.imei} sai do inventário ativo. O IMEI fica livre para recadastro.`, confirmLabel: 'Desativar' }))) return;
    acao(() => adminApi.desativarRastreador(r.id), 'Rastreador desativado.');
  };

  return (
    <div>
      <PageHeader icon="sinal" title="Rastreadores e chips" subtitle="Inventário, chips, instalações vigentes e último sinal">
        <Button variant="quiet" onClick={() => setModal('chip')}>Cadastrar chip</Button>
        <Button onClick={() => setModal('rastreador')}>Cadastrar rastreador</Button>
      </PageHeader>
      <PageBody>
        {error && <Callout tone="crit">Não foi possível carregar o inventário: {error}</Callout>}
        <Section title="Resumo">
          <Grid cols={4} equal>
            <KpiTile label="Instalados" value={count('instalado')} sub={`${count('vinculado')} com o cliente, sem ativo`} />
            <KpiTile label="Em estoque" value={count('estoque')} status={count('estoque') ? 'parado' : undefined} />
            <KpiTile label="Desativados" value={count('desativado')} />
            <KpiTile label="Chips livres" value={chipsLivres.length} />
          </Grid>
        </Section>
        <Section title={`${list.length} rastreadores`}>
          <Card>
            <div className="mb-card-head">
              <Select aria-label="Filtrar por situação" className="w-full sm:w-64" value={filtro} onChange={(e) => setFiltro(e.target.value)}
                options={[{ value: '', label: 'Todas as situações' }, { value: 'instalado', label: 'Instalado' }, { value: 'vinculado', label: 'Com o cliente' }, { value: 'estoque', label: 'Em estoque' }, { value: 'desativado', label: 'Desativado' }]} />
            </div>
            <Table minWidth={1100} loading={loading && !data} align={['left', 'left', 'left', 'left', 'left', 'left', 'right']}
              head={['IMEI', 'Modelo / protocolo', 'Chip', 'Cliente e ativo', 'Situação', 'Último sinal', '']}
              emptyState={<EmptyState illustration="ilu-estoque" title="Nenhum rastreador cadastrado" action={<Button onClick={() => setModal('rastreador')}>Cadastrar rastreador</Button>} />}
              rows={list.map((r) => {
                const s = situacao(r);
                return [
                  <span className="font-mono text-small">{r.imei}{!r.traccar_device_id && s !== 'desativado' && <span className="block text-caption text-warn-ink">sem device no Traccar</span>}</span>,
                  <span>{r.modelo || '—'}<span className="block text-caption text-ink-2">{r.protocolo || 'protocolo: aguardando 1ª posição'}</span></span>,
                  r.iccid ? <span className="text-small">{r.operadora || '—'}<span className="block text-caption text-ink-2 font-mono">{r.iccid}</span></span> : <span className="text-ink-3">—</span>,
                  r.client_name ? <span>{r.client_name}<span className="block text-caption text-ink-2">{r.asset_plate ? `${r.asset_plate} · desde ${fmtD(Date.parse(r.instalado_em!))}` : 'aguardando o cliente indicar o ativo'}</span></span> : <span className="text-ink-3">—</span>,
                  <Badge tone={SIT_BADGE[s].tone}>{SIT_BADGE[s].label}</Badge>,
                  <span className="num text-small">{r.ultimo_pacote_em ? fmtDT(Date.parse(r.ultimo_pacote_em)) : '—'}</span>,
                  <div className="flex gap-3 justify-end">
                    {s !== 'desativado' && (r.sim_card_id
                      ? <TextButton onClick={() => acao(() => adminApi.desvincularSimCard(r.sim_card_id!), 'Chip desvinculado.')}>Desvincular chip</TextButton>
                      : <TextButton onClick={() => setVinculando(r)}>Vincular chip</TextButton>)}
                    {s === 'instalado' && <TextButton onClick={() => desinstalar(r)}>Desinstalar</TextButton>}
                    {s === 'vinculado' && <TextButton onClick={() => desvincular(r)}>Desvincular do cliente</TextButton>}
                    {s === 'estoque' && <TextButton onClick={() => setAoCliente(r)}>Vincular a cliente</TextButton>}
                    {s === 'estoque' && <TextButton onClick={() => desativar(r)}>Desativar</TextButton>}
                  </div>,
                ];
              })}
            />
          </Card>
        </Section>
      </PageBody>
      {modal === 'rastreador' && <NovoRastreadorModal onClose={() => setModal(null)} onDone={reload} />}
      {modal === 'chip' && <NovoChipModal onClose={() => setModal(null)} onDone={reload} />}
      {vinculando && <VincularModal rastreador={vinculando} chips={chipsLivres} onClose={() => setVinculando(null)} onDone={reload} />}
      {aoCliente && <ClienteModal rastreador={aoCliente} clientes={clientes} onClose={() => setAoCliente(null)} onDone={reload} />}
    </div>
  );
}

function useSubmit(run: () => Promise<unknown>, ok: string, onDone: () => void, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await run(); toast(ok); onDone(); onClose(); }
    catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
    finally { setBusy(false); }
  };
  return { busy, submit };
}

function NovoRastreadorModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [imei, setImei] = useState('');
  const [modelo, setModelo] = useState('');
  const { busy, submit } = useSubmit(() => adminApi.createRastreador({ imei: imei.trim(), modelo: modelo.trim() || undefined }), 'Rastreador cadastrado.', onDone, onClose);
  return (
    <Modal open onClose={onClose} title="Cadastrar rastreador" width="max-w-xl" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!imei.trim()} onClick={submit}>Cadastrar</Button></>}>
      <Field label="IMEI"><Input autoFocus inputMode="numeric" value={imei} onChange={(e) => setImei(e.target.value)} /></Field>
      <Field label="Modelo" hint="Opcional"><Input value={modelo} onChange={(e) => setModelo(e.target.value)} /></Field>
      <p className="text-caption text-ink-2">O protocolo não é digitado: ele é detectado na primeira posição recebida, pelo que o Traccar usou para decodificar (cada protocolo tem sua porta). O device é criado no Traccar no cadastro; se o Traccar estiver fora, o rastreador fica marcado como "sem device no Traccar".</p>
    </Modal>
  );
}

function NovoChipModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [iccid, setIccid] = useState('');
  const [operadora, setOperadora] = useState('');
  const [numero, setNumero] = useState('');
  const { busy, submit } = useSubmit(() => adminApi.createSimCard({ iccid: iccid.trim(), operadora: operadora.trim() || undefined, numero: numero.trim() || undefined }), 'Chip cadastrado.', onDone, onClose);
  return (
    <Modal open onClose={onClose} title="Cadastrar chip" width="max-w-xl" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!iccid.trim()} onClick={submit}>Cadastrar</Button></>}>
      <Field label="ICCID"><Input autoFocus inputMode="numeric" value={iccid} onChange={(e) => setIccid(e.target.value)} /></Field>
      <FormGroup cols={2}>
        <Field label="Operadora" hint="Opcional"><Input value={operadora} onChange={(e) => setOperadora(e.target.value)} /></Field>
        <Field label="Número" hint="Opcional"><Input value={numero} onChange={(e) => setNumero(e.target.value)} /></Field>
      </FormGroup>
    </Modal>
  );
}

function VincularModal({ rastreador, chips, onClose, onDone }: { rastreador: AdminRastreador; chips: AdminSimCard[]; onClose: () => void; onDone: () => void }) {
  const [chipId, setChipId] = useState(chips[0]?.id || '');
  const { busy, submit } = useSubmit(() => adminApi.vincularSimCard(chipId, rastreador.id), 'Chip vinculado.', onDone, onClose);
  return (
    <Modal open onClose={onClose} title={`Vincular chip · ${rastreador.imei}`} width="max-w-md" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!chipId} onClick={submit}>Vincular</Button></>}>
      {chips.length
        ? <Field label="Chip livre"><Select value={chipId} onChange={(e) => setChipId(e.target.value)} options={chips.map((c) => ({ value: c.id, label: `${c.operadora || 'Sem operadora'} · ${c.iccid}` }))} /></Field>
        : <p className="text-small text-ink-2">Nenhum chip livre. Cadastre um chip primeiro.</p>}
    </Modal>
  );
}

function ClienteModal({ rastreador, clientes, onClose, onDone }: { rastreador: AdminRastreador; clientes: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [clientId, setClientId] = useState('');
  const { busy, submit } = useSubmit(() => adminApi.vincularCliente(rastreador.id, clientId), 'Rastreador vinculado ao cliente.', onDone, onClose);
  return (
    <Modal open onClose={onClose} title={`Vincular a cliente · ${rastreador.imei}`} width="max-w-md" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!clientId} onClick={submit}>Vincular</Button></>}>
      <Field label="Cliente"><SearchSelect value={clientId} onChange={setClientId} placeholder="Escolha o cliente" options={clientes.map((c) => ({ value: c.id, label: c.name }))} /></Field>
      <p className="text-caption text-ink-2">O rastreador passa a aparecer só para esse cliente, que indica em qual ativo ele está (Gestão de ativos). Vale também para aparelho do próprio cliente.</p>
    </Modal>
  );
}
