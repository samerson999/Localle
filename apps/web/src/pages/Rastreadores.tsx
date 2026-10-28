// Console da Locale · Rastreadores e chips: inventário real do backend (rotas /superadmin/rastreadores):
// cadastro de rastreador e chip, vínculo chip↔rastreador, vínculo rastreador↔cliente, instalação vigente,
// último pacote, desinstalação e desativação. Em qual ativo o rastreador está é o próprio cliente que indica
// (Gestão de ativos). Custo, avaria e recolhimento físico não existem no schema.
import { useState } from 'react';
import { Card, PageHeader, PageBody, Section, Grid, Table, Badge, Button, Select, SearchSelect, TextButton, Modal, Field, FormGroup, Input, Callout, EmptyState, toast, confirmAction } from '../components/ui';
import { KpiTile } from '../components/story';
import { useStore } from '../lib/store';
import { adminApi, useAdminQuery, type AdminRastreador, type AdminRastreadorModelo, type AdminSimCard } from '../lib/localleApi';
import { fmtD, fmtDT } from '@localle/shared/utils';
import { normalizarIdentificador, ROTULO_IDENTIFICADOR, TIPOS_IDENTIFICADOR, validarIdentificador, type TipoIdentificador } from '@localle/shared/rastreadorModelos';

// Protocolos do Traccar mais usados e a porta padrão de cada um (sugestão ao cadastrar modelo; o nome é o que o Traccar
// informa em cada posição — o JT808 se chama "huabao" no Traccar)
const PROTOCOLOS_TRACCAR: { protocolo: string; porta: number; rotulo: string }[] = [
  { protocolo: 'gt06', porta: 5023, rotulo: 'GT06 / Concox / Jimi' },
  { protocolo: 'teltonika', porta: 5027, rotulo: 'Teltonika' },
  { protocolo: 'huabao', porta: 5015, rotulo: 'JT808 (Huabao)' },
  { protocolo: 'suntech', porta: 5011, rotulo: 'Suntech' },
  { protocolo: 'h02', porta: 5013, rotulo: 'H02' },
  { protocolo: 'gps103', porta: 5001, rotulo: 'GPS103 / Coban' },
  { protocolo: 'tk103', porta: 5002, rotulo: 'TK103' },
  { protocolo: 'gl200', porta: 5004, rotulo: 'Queclink' },
  { protocolo: 'ruptela', porta: 5046, rotulo: 'Ruptela' },
  { protocolo: 'osmand', porta: 5055, rotulo: 'OsmAnd (celular)' },
];
const nomeModelo = (m: { fabricante: string; nome: string }) => `${m.fabricante} ${m.nome}`;

type Situacao = 'instalado' | 'vinculado' | 'estoque' | 'desativado';
const situacao = (r: AdminRastreador): Situacao => (r.status === 'desativado' ? 'desativado' : r.instalacao_id ? 'instalado' : r.vinculo_id ? 'vinculado' : 'estoque');
const SIT_BADGE: Record<Situacao, { tone: string; label: string }> = {
  instalado: { tone: 'green', label: 'Instalado' },
  vinculado: { tone: 'orange', label: 'Com o cliente' },
  estoque: { tone: 'gray', label: 'Em estoque' },
  desativado: { tone: 'red', label: 'Desativado' },
};

const carregar = () => Promise.all([adminApi.rastreadores(), adminApi.simCards(), adminApi.clients(), adminApi.modelos()]);

export default function Rastreadores() {
  const session = useStore((s) => s.session);
  const { data, error, loading, reload } = useAdminQuery(carregar);
  const [filtro, setFiltro] = useState('');
  const [modal, setModal] = useState<'rastreador' | 'chip' | null>(null);
  const [vinculando, setVinculando] = useState<AdminRastreador | null>(null);
  const [aoCliente, setAoCliente] = useState<AdminRastreador | null>(null);
  const [trocandoModelo, setTrocandoModelo] = useState<AdminRastreador | null>(null);
  const [editandoModelo, setEditandoModelo] = useState<AdminRastreadorModelo | 'novo' | null>(null);
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com o acesso da Locale para ver o Console da Locale." /></Card>;

  const [rastreadores, chips, clientes, modelos] = data || [[], [], [], []];
  const modelosAtivos = modelos.filter((m) => m.ativo);
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
                  <ModeloCelula r={r} onTrocar={s !== 'desativado' ? () => setTrocandoModelo(r) : undefined} />,
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
        <Section title="Modelos de rastreador">
          <Card>
            <div className="flex flex-wrap items-center gap-stack mb-card-head">
              <p className="text-small text-ink-2 mr-auto max-w-[80ch]">O modelo diz o protocolo do Traccar, a porta em que o aparelho conecta e o identificador que ele manda. O cadastro de rastreador exige o modelo; o protocolo da primeira posição é conferido com o do modelo.</p>
              <Button variant="secondary" onClick={() => setEditandoModelo('novo')}>Novo modelo</Button>
            </div>
            <Table minWidth={820} loading={loading && !data} align={['left', 'left', 'right', 'left', 'right', 'left', 'right']}
              head={['Modelo', 'Protocolo', 'Porta', 'Identificador', 'Rastreadores', 'Situação', '']}
              emptyState={<EmptyState icon="sinal" title="Nenhum modelo cadastrado" action={<Button onClick={() => setEditandoModelo('novo')}>Novo modelo</Button>} />}
              rows={modelos.map((m) => [
                <span className="font-medium">{nomeModelo(m)}</span>, <span className="font-mono text-small">{m.protocolo}</span>, <span className="num">{m.porta}</span>,
                <span className="text-small">{ROTULO_IDENTIFICADOR[m.tipo_identificador]}</span>, <span className="num">{m.rastreadores}</span>,
                <Badge tone={m.ativo ? 'green' : 'gray'}>{m.ativo ? 'Ativo' : 'Desativado'}</Badge>,
                <div className="flex gap-3 justify-end">
                  <TextButton onClick={() => setEditandoModelo(m)}>Editar</TextButton>
                  <TextButton onClick={() => acao(() => adminApi.atualizarModelo(m.id, { ativo: !m.ativo }), m.ativo ? 'Modelo desativado: não aparece mais no cadastro.' : 'Modelo reativado.')}>{m.ativo ? 'Desativar' : 'Reativar'}</TextButton>
                </div>,
              ])} />
          </Card>
        </Section>
      </PageBody>
      {modal === 'rastreador' && <NovoRastreadorModal modelos={modelosAtivos} onClose={() => setModal(null)} onDone={reload} onNovoModelo={() => { setModal(null); setEditandoModelo('novo'); }} />}
      {trocandoModelo && <TrocarModeloModal rastreador={trocandoModelo} modelos={modelosAtivos} onClose={() => setTrocandoModelo(null)} onDone={reload} />}
      {editandoModelo && <ModeloModal modelo={editandoModelo === 'novo' ? null : editandoModelo} onClose={() => setEditandoModelo(null)} onDone={reload} />}
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

// Modelo e protocolo de um rastreador do inventário: o esperado (do modelo) e o detectado na 1ª posição.
function ModeloCelula({ r, onTrocar }: { r: AdminRastreador; onTrocar?: () => void }) {
  if (!r.modelo_id) return (
    <span>{r.modelo || '—'}<span className="block text-caption text-warn-ink">sem modelo do catálogo{r.protocolo ? ` · detectado: ${r.protocolo}` : ''}</span>
      {onTrocar && <TextButton className="text-caption" onClick={onTrocar}>Definir modelo</TextButton>}</span>
  );
  return (
    <span>{r.modelo}
      {r.protocolo_divergente
        ? <span className="block text-caption text-crit-ink">Protocolo diferente do modelo: detectado {r.protocolo}, o modelo espera {r.modelo_protocolo} (porta {r.modelo_porta}). Aparelho na porta errada ou modelo errado.</span>
        : <span className="block text-caption text-ink-2">{r.modelo_protocolo} · porta {r.modelo_porta}{r.protocolo ? ' · confirmado na 1ª posição' : ' · aguardando 1ª posição'}</span>}
      {r.protocolo_divergente && onTrocar && <TextButton className="text-caption" onClick={onTrocar}>Trocar modelo</TextButton>}
    </span>
  );
}

function NovoRastreadorModal({ modelos, onClose, onDone, onNovoModelo }: { modelos: AdminRastreadorModelo[]; onClose: () => void; onDone: () => void; onNovoModelo: () => void }) {
  const [modeloId, setModeloId] = useState('');
  const [ident, setIdent] = useState('');
  const [tocado, setTocado] = useState(false);
  const modelo = modelos.find((m) => m.id === modeloId);
  const invalido = modelo ? validarIdentificador(modelo.tipo_identificador, ident) : null;
  const pronto = !!modelo && !invalido;
  const { busy, submit } = useSubmit(() => adminApi.createRastreador({ imei: normalizarIdentificador(ident), modeloId }), 'Rastreador cadastrado.', onDone, onClose);
  return (
    <Modal open onClose={onClose} title="Cadastrar rastreador" width="max-w-xl" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!pronto} onClick={submit}>Cadastrar</Button></>}>
      {modelos.length === 0 ? (
        <Callout tone="warn">Nenhum modelo ativo no catálogo. <TextButton onClick={onNovoModelo}>Cadastrar um modelo</TextButton> antes do rastreador.</Callout>
      ) : <>
        <Field label="Modelo"><SearchSelect value={modeloId} onChange={(v) => { setModeloId(v); setTocado(false); }} placeholder="Escolha o modelo"
          options={modelos.map((m) => ({ value: m.id, label: nomeModelo(m), sub: `${m.protocolo} · porta ${m.porta}` }))} /></Field>
        {modelo && <>
          <Field label={ROTULO_IDENTIFICADOR[modelo.tipo_identificador]} error={tocado ? invalido || undefined : undefined}
            hint={modelo.tipo_identificador === 'terminal_jt808' ? 'No JT808 o aparelho se identifica pelo número do terminal, que pode não ser o IMEI. Sem cadastro, o log do Traccar mostra "Unknown device - <número>".' : undefined}>
            <Input inputMode={modelo.tipo_identificador === 'outro' ? undefined : 'numeric'} value={ident} invalid={tocado && !!invalido}
              onChange={(e) => setIdent(e.target.value)} onBlur={() => setTocado(true)} />
          </Field>
          <p className="text-small text-ink-2 rounded-ctl bg-surface-muted px-3 py-2">Configure o aparelho para enviar ao servidor do Traccar na <b className="text-ink">porta {modelo.porta}</b> (protocolo {modelo.protocolo}). O device é criado no Traccar no cadastro; a primeira posição confirma o protocolo.</p>
        </>}
        <p className="text-caption text-ink-2">Modelo que não está na lista? <TextButton className="text-caption" onClick={onNovoModelo}>Cadastrar modelo</TextButton></p>
      </>}
    </Modal>
  );
}

function TrocarModeloModal({ rastreador, modelos, onClose, onDone }: { rastreador: AdminRastreador; modelos: AdminRastreadorModelo[]; onClose: () => void; onDone: () => void }) {
  const [modeloId, setModeloId] = useState(rastreador.modelo_id || '');
  const { busy, submit } = useSubmit(() => adminApi.trocarModeloRastreador(rastreador.id, modeloId), 'Modelo do rastreador atualizado.', onDone, onClose);
  const sugerido = rastreador.protocolo ? modelos.filter((m) => m.protocolo === rastreador.protocolo) : [];
  return (
    <Modal open onClose={onClose} title={`Modelo · ${rastreador.imei}`} width="max-w-md" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!modeloId || modeloId === rastreador.modelo_id} onClick={submit}>Salvar</Button></>}>
      <Field label="Modelo"><SearchSelect value={modeloId} onChange={setModeloId} placeholder="Escolha o modelo" options={modelos.map((m) => ({ value: m.id, label: nomeModelo(m), sub: `${m.protocolo} · porta ${m.porta}` }))} /></Field>
      {rastreador.protocolo && <p className="text-caption text-ink-2">Protocolo detectado na 1ª posição: <b>{rastreador.protocolo}</b>{sugerido.length ? ` — modelos com esse protocolo: ${sugerido.map(nomeModelo).join(', ')}.` : '.'}</p>}
    </Modal>
  );
}

function ModeloModal({ modelo, onClose, onDone }: { modelo: AdminRastreadorModelo | null; onClose: () => void; onDone: () => void }) {
  const [fabricante, setFabricante] = useState(modelo?.fabricante || '');
  const [nome, setNome] = useState(modelo?.nome || '');
  const [protocolo, setProtocolo] = useState(modelo?.protocolo || '');
  const [porta, setPorta] = useState(modelo ? String(modelo.porta) : '');
  const [tipo, setTipo] = useState<TipoIdentificador>(modelo?.tipo_identificador || 'imei');
  const portaN = Number(porta);
  const ok = fabricante.trim() && nome.trim() && /^[a-z0-9]{2,30}$/.test(protocolo) && Number.isInteger(portaN) && portaN >= 1 && portaN <= 65535;
  const body = { fabricante: fabricante.trim(), nome: nome.trim(), protocolo, porta: portaN, tipoIdentificador: tipo };
  const { busy, submit } = useSubmit(() => (modelo ? adminApi.atualizarModelo(modelo.id, body) : adminApi.criarModelo(body)), modelo ? 'Modelo atualizado.' : 'Modelo cadastrado.', onDone, onClose);
  // escolher um protocolo conhecido sugere a porta padrão do Traccar
  const escolherProtocolo = (p: string) => { setProtocolo(p); const conhecido = PROTOCOLOS_TRACCAR.find((x) => x.protocolo === p); if (conhecido && !porta) setPorta(String(conhecido.porta)); if (p === 'huabao' && tipo === 'imei') setTipo('terminal_jt808'); };
  return (
    <Modal open onClose={onClose} title={modelo ? `Editar modelo · ${nomeModelo(modelo)}` : 'Novo modelo de rastreador'} width="max-w-xl"
      footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!ok} onClick={submit}>{modelo ? 'Salvar' : 'Cadastrar'}</Button></>}>
      <FormGroup cols={2}>
        <Field label="Fabricante"><Input autoFocus value={fabricante} onChange={(e) => setFabricante(e.target.value)} placeholder="Ex.: JMAK" /></Field>
        <Field label="Modelo"><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: JR12" /></Field>
      </FormGroup>
      <FormGroup cols={2}>
        <Field label="Protocolo do Traccar" hint="Nome que o Traccar usa (aparece no log e em cada posição).">
          <SearchSelect value={protocolo} onChange={escolherProtocolo} placeholder="Escolha o protocolo"
            options={[...PROTOCOLOS_TRACCAR.map((x) => ({ value: x.protocolo, label: x.protocolo, sub: `${x.rotulo} · porta ${x.porta}` })),
              ...(protocolo && !PROTOCOLOS_TRACCAR.some((x) => x.protocolo === protocolo) ? [{ value: protocolo, label: protocolo }] : [])]} />
        </Field>
        <Field label="Porta"><Input inputMode="numeric" value={porta} onChange={(e) => setPorta(e.target.value.replace(/\D/g, ''))} /></Field>
      </FormGroup>
      <Field label="Identificador que o aparelho manda">
        <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoIdentificador)} options={TIPOS_IDENTIFICADOR.map((t) => ({ value: t, label: ROTULO_IDENTIFICADOR[t] }))} />
      </Field>
      {modelo && modelo.rastreadores > 0 && <Callout tone="warn">{modelo.rastreadores} rastreador(es) usam este modelo. Mudar protocolo ou porta muda o que a plataforma confere na próxima posição deles.</Callout>}
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
