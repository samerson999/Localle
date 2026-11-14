// Console da Locale · Rastreadores e chips: inventário real do backend (rotas /superadmin/rastreadores):
// cadastro de rastreador e chip, vínculo chip↔rastreador, vínculo rastreador↔cliente, instalação vigente,
// último pacote, desinstalação e desativação. Em qual ativo o rastreador está é o próprio cliente que indica
// (Gestão de ativos). Custo, avaria e recolhimento físico não existem no schema.
import { useEffect, useState, type ReactNode } from 'react';
import { Card, PageHeader, PageBody, Section, Grid, Table, Badge, Button, Select, SearchSelect, SearchInput, TextButton, Modal, Field, FormGroup, Input, Check, Callout, EmptyState, Tabs, TabPanel, toast, confirmAction, useUrlTab, CardActions, Menu, type MenuItem, FilterSheet } from '../components/ui';
import { KpiTile } from '../components/story';
import { Icon } from '../components/icons';
import { useStore } from '../lib/store';
import { adminApi, useAdminQuery, type AdminRastreador, type AdminRastreadorModelo, type AdminSimCard, type FichaTraccar, type SinaisMotorDiagnostico, type SinalMotor, type SituacaoProtocolo, type SuporteCan, type TransmissaoRastreador, type PreviaModelo, type EscolhaDeModelo } from '../lib/localleApi';
import { fmtD, fmtDT } from '@localle/shared/utils';
import { coordenadas, haQuanto, itensDoDiagnostico, itensDosSinaisMotor, leituraAntiga, PAROU_H, ROTULO_SINAL, ROTULO_SUPORTE_CAN, SINAIS_MOTOR, semFixDeGps, situacaoTransmissao, sugerirMapeamento, TRANSMITINDO_MIN, type SituacaoTransmissao, type Tom } from '../lib/diagnosticoRastreador';
import { nomeDoModelo, normalizarIdentificador, ROTULO_IDENTIFICADOR, TIPOS_IDENTIFICADOR, validarIdentificador, type TipoIdentificador } from '@localle/shared/rastreadorModelos';

// Modelos: a fonte é a lista de aparelhos do Traccar (migration 1793170000000, ~2.200 modelos com protocolo e porta);
// o catálogo guarda só os modelos em uso, criados sozinhos no cadastro do primeiro rastreador, com o que o Traccar não
// sabe (identificador, mapeamento da telemetria). Aparelho fora da lista: cadastro à mão, protocolo em texto livre com o
// nome que o Traccar usa — o log mostra em "[T…: <protocolo> < ip] Unknown device - …".
const nomeModelo = nomeDoModelo;

type Situacao = 'instalado' | 'vinculado' | 'estoque' | 'desativado';
const situacao = (r: AdminRastreador): Situacao => (r.status === 'desativado' ? 'desativado' : r.instalacao_id ? 'instalado' : r.vinculo_id ? 'vinculado' : 'estoque');
const SIT_BADGE: Record<Situacao, { tone: string; label: string }> = {
  instalado: { tone: 'green', label: 'Instalado' },
  vinculado: { tone: 'orange', label: 'Com o cliente' },
  estoque: { tone: 'gray', label: 'Em estoque' },
  desativado: { tone: 'red', label: 'Desativado' },
};

// Diagnóstico e aba Transmissão se atualizam sozinhos enquanto abertos (o aparelho pode estar sendo instalado agora).
const ATUALIZA_MS = 10_000;
function useAtualizacao(reload: () => void) {
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, ATUALIZA_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

type Acompanhado = Pick<AdminRastreador, 'id' | 'imei' | 'modelo_id'>;

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
  const [diagnosticando, setDiagnosticando] = useState<{ r: Acompanhado; recemCadastrado?: boolean } | null>(null);
  const [tab, setTab] = useUrlTab('inventario');
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
  // de vez, para cadastro errado: o que já transmitiu ou já foi de cliente a API recusa (o histórico precisa dele)
  const excluir = async (r: AdminRastreador) => {
    if (!(await confirmAction({ title: 'Excluir rastreador?', tone: 'danger', confirmLabel: 'Excluir',
      detail: `${r.imei} sai da plataforma e do Traccar de vez${r.sim_card_id ? ', e o chip volta a ficar livre' : ''}. Serve para cadastro errado: rastreador que já transmitiu ou já foi de um cliente só pode ser desativado.` }))) return;
    acao(() => adminApi.excluirRastreador(r.id), 'Rastreador excluído.');
  };
  // ações da linha conforme a situação: no desktop viram links lado a lado; no card do celular, Diagnóstico fica à
  // vista e o resto vai para o menu (até 6 links quebrando em 3 linhas abafavam o próprio rastreador)
  const acoesDe = (r: AdminRastreador): MenuItem[] => {
    const s = situacao(r);
    if (s === 'desativado') return !r.ultimo_pacote_em ? [{ label: 'Excluir', icon: 'excluir' as const, danger: true, onClick: () => excluir(r) }] : [];
    return [
      { label: 'Diagnóstico', icon: 'sinal', onClick: () => setDiagnosticando({ r }) },
      r.sim_card_id
        ? { label: 'Desvincular chip', icon: 'link' as const, danger: true, onClick: async () => { if (await confirmAction({ title: 'Desvincular o chip?', detail: `${r.imei} fica sem chip e para de comunicar até receber outro.`, confirmLabel: 'Desvincular' })) acao(() => adminApi.desvincularSimCard(r.sim_card_id!), 'Chip desvinculado.'); } }
        : { label: 'Vincular chip', icon: 'link', onClick: () => setVinculando(r) },
      ...(s === 'instalado' ? [{ label: 'Desinstalar', icon: 'ativos' as const, onClick: () => desinstalar(r) }] : []),
      ...(s === 'vinculado' ? [{ label: 'Desvincular do cliente', icon: 'revenda' as const, danger: true, onClick: () => desvincular(r) }] : []),
      ...(s === 'estoque' ? [{ label: 'Vincular a cliente', icon: 'revenda' as const, onClick: () => setAoCliente(r) }, { label: 'Desativar', icon: 'cadeado' as const, danger: true, onClick: () => desativar(r) }] : []),
      ...(s === 'estoque' && !r.ultimo_pacote_em ? [{ label: 'Excluir', icon: 'excluir' as const, danger: true, onClick: () => excluir(r) }] : []),
    ];
  };
  const excluirModelo = async (m: AdminRastreadorModelo) => {
    if (!(await confirmAction({ title: 'Excluir modelo?', tone: 'danger', confirmLabel: 'Excluir',
      detail: `${nomeModelo(m)} sai do catálogo${m.atributo_tensao || m.sinal_max || m.atributo_bloqueio ? ', com o mapeamento da telemetria' : ''}. Se for da lista do Traccar, volta a aparecer na busca do cadastro.` }))) return;
    acao(() => adminApi.excluirModelo(m.id), 'Modelo excluído do catálogo.');
  };

  return (
    <div>
      <PageHeader icon="sinal" title="Rastreadores e chips" subtitle="Inventário, chips, instalações vigentes e último sinal">
        <Button variant="quiet" onClick={() => setModal('chip')}>Cadastrar chip</Button>
        <Button onClick={() => setModal('rastreador')}>Cadastrar rastreador</Button>
      </PageHeader>
      <div className="flex flex-wrap items-center gap-tight mb-card-head max-md:mb-page-head">
        <Tabs value={tab} onChange={setTab} tabs={[{ key: 'inventario', label: 'Inventário' }, { key: 'transmissao', label: 'Transmissão' }]} />
      </div>
      <TabPanel id={tab}>
      {tab === 'transmissao' && <PageBody><TransmissaoAba onDiagnostico={(r) => setDiagnosticando({ r })} /></PageBody>}
      {tab === 'inventario' && <PageBody>
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
            <div className="mb-card-head empty:hidden">
              <FilterSheet count={filtro ? 1 : 0}><Select aria-label="Filtrar por situação" className="w-full sm:w-64" value={filtro} onChange={(e) => setFiltro(e.target.value)}
                options={[{ value: '', label: 'Todas as situações' }, { value: 'instalado', label: 'Instalado' }, { value: 'vinculado', label: 'Com o cliente' }, { value: 'estoque', label: 'Em estoque' }, { value: 'desativado', label: 'Desativado' }]} /></FilterSheet>
            </div>
            <Table minWidth={1100} loading={loading && !data} align={['left', 'left', 'left', 'left', 'left', 'left', 'right']}
              head={['IMEI', 'Modelo / protocolo', 'Chip', 'Cliente e ativo', 'Situação', 'Último sinal', '']}
              sort={{ 0: (i) => list[i].imei, 3: (i) => list[i].client_name, 4: (i) => SIT_BADGE[situacao(list[i])].label, 5: (i) => (list[i].ultimo_pacote_em ? Date.parse(list[i].ultimo_pacote_em!) : null) }}
              emptyState={<EmptyState illustration="ilu-rastreador" title="Nenhum rastreador cadastrado" action={<Button onClick={() => setModal('rastreador')}>Cadastrar rastreador</Button>} />}
              card={(i) => {
                const r = list[i], s = situacao(r), acoes = acoesDe(r);
                const [primeira, ...resto] = acoes[0]?.label === 'Diagnóstico' ? acoes : [undefined, ...acoes];
                return (
                  <div className="flex flex-col gap-tight min-w-0">
                    <div className="flex items-start justify-between gap-stack">
                      <span className="font-mono text-body font-medium break-all">{r.imei}</span>
                      <span className="shrink-0 pt-px"><Badge tone={SIT_BADGE[s].tone}>{SIT_BADGE[s].label}</Badge></span>
                    </div>
                    <div className="text-small"><ModeloCelula r={r} onTrocar={s !== 'desativado' ? () => setTrocandoModelo(r) : undefined} /></div>
                    {!r.traccar_device_id && s !== 'desativado' && <span className="text-caption text-warn-ink">sem device no Traccar</span>}
                    {r.client_name && <span className="text-small">{r.client_name}<span className="text-ink-2"> · {r.asset_plate ? `${r.asset_plate} desde ${fmtD(Date.parse(r.instalado_em!))}` : 'aguardando o cliente indicar o ativo'}</span></span>}
                    <span className="flex flex-wrap gap-x-stack gap-y-hair text-caption text-ink-2">
                      <span>{r.iccid ? <>{r.operadora || 'Chip'} <span className="font-mono">{r.iccid}</span></> : 'Sem chip'}</span>
                      <span className="num">{r.ultimo_pacote_em ? `Último sinal ${fmtDT(Date.parse(r.ultimo_pacote_em))}` : 'Nunca transmitiu'}</span>
                    </span>
                    {acoes.length > 0 && (
                      <CardActions>
                        {primeira && <TextButton onClick={primeira.onClick}>{primeira.label}</TextButton>}
                        {resto.length > 0 && <Menu label={`Mais ações de ${r.imei}`} items={resto} trigger={({ ref, open, toggle }) => (
                          <button ref={ref} type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle}
                            className="alvo-toque inline-flex items-center gap-hair text-small font-medium link-brand">Mais ações<Icon name="mais-opcoes" size={18} /></button>
                        )} />}
                      </CardActions>
                    )}
                  </div>
                );
              }}
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
                    {acoesDe(r).map((a) => <TextButton key={a.label} tone={a.danger ? 'danger' : 'brand'} onClick={a.onClick}>{a.label}</TextButton>)}
                  </div>,
                ];
              })}
            />
          </Card>
        </Section>
        <Section title="Modelos de rastreador">
          <Card>
            <div className="flex flex-wrap items-center gap-stack mb-card-head">
              <p className="text-small text-ink-2 mr-auto max-w-[80ch]">Os modelos em uso. No cadastro de rastreador basta digitar o modelo: a busca procura também na lista do Traccar e, na primeira vez, o modelo entra aqui com protocolo e porta de lá. Em Editar ficam a ficha do Traccar e o mapeamento da telemetria.</p>
              <ListaTraccarResumo onAtualizada={reload} />
            </div>
            <Table minWidth={820} loading={loading && !data} align={['left', 'left', 'right', 'left', 'right', 'left', 'right']}
              head={['Modelo', 'Protocolo', 'Porta', 'Identificador', 'Rastreadores', 'Situação', '']}
              emptyState={<EmptyState icon="sinal" title="Nenhum modelo em uso" detail="O modelo entra aqui quando o primeiro rastreador dele é cadastrado." />}
              rows={modelos.map((m) => [
                <span><span className="font-medium">{nomeModelo(m)}</span><span className="block text-caption text-ink-2">{m.origem === 'catalogo' ? 'Da lista do Traccar' : 'Cadastrado à mão'}</span></span>, <span className="font-mono text-small">{m.protocolo}</span>, <span className="num">{m.porta}</span>,
                <span className="text-small">{ROTULO_IDENTIFICADOR[m.tipo_identificador]}</span>, <span className="num">{m.rastreadores}</span>,
                <Badge tone={m.ativo ? 'green' : 'gray'}>{m.ativo ? 'Ativo' : 'Desativado'}</Badge>,
                <div className="flex gap-3 justify-end">
                  <TextButton onClick={() => setEditandoModelo(m)}>Editar</TextButton>
                  <TextButton tone={m.ativo ? 'danger' : 'brand'} onClick={async () => { if (m.ativo && !(await confirmAction({ title: `Desativar o modelo ${nomeModelo(m)}?`, detail: 'Ele deixa de aparecer no cadastro de rastreadores. Os rastreadores já cadastrados continuam. Dá para reativar depois.', confirmLabel: 'Desativar' }))) return; acao(() => adminApi.atualizarModelo(m.id, { ativo: !m.ativo }), m.ativo ? 'Modelo desativado: não aparece mais no cadastro.' : 'Modelo reativado.'); }}>{m.ativo ? 'Desativar' : 'Reativar'}</TextButton>
                  {m.rastreadores === 0 && <TextButton tone="danger" onClick={() => excluirModelo(m)}>Excluir</TextButton>}
                </div>,
              ])} />
            <p className="text-caption text-ink-2 mt-card-head">Aparelho que não está na lista do Traccar? <TextButton className="text-caption" onClick={() => setEditandoModelo('novo')}>Cadastrar à mão</TextButton></p>
          </Card>
        </Section>
      </PageBody>}
      </TabPanel>
      {modal === 'rastreador' && <NovoRastreadorModal modelos={modelosAtivos} onClose={() => setModal(null)} onDone={reload}
        onCriado={(r) => setDiagnosticando({ r, recemCadastrado: true })} onNovoModelo={() => { setModal(null); setEditandoModelo('novo'); }} />}
      {diagnosticando && <DiagnosticoModal rastreador={diagnosticando.r} recemCadastrado={diagnosticando.recemCadastrado}
        modelo={modelos.find((m) => m.id === diagnosticando.r.modelo_id) ?? null}
        onClose={() => setDiagnosticando(null)}
        onEditarModelo={(m) => { setDiagnosticando(null); setEditandoModelo(m); }}
        onTrocarModelo={() => { const r = rastreadores.find((x) => x.id === diagnosticando.r.id); if (r) setTrocandoModelo(r); setDiagnosticando(null); }} />}
      {trocandoModelo && <TrocarModeloModal rastreador={trocandoModelo} modelos={modelosAtivos} onClose={() => setTrocandoModelo(null)} onDone={reload} />}
      {editandoModelo && <ModeloModal modelo={editandoModelo === 'novo' ? null : editandoModelo} conhecidos={protocolosConhecidos(modelos, rastreadores)} onClose={() => setEditandoModelo(null)} onDone={reload} />}
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

// Depois de cadastrar, abre o diagnóstico do rastreador novo para acompanhar a primeira transmissão.
function NovoRastreadorModal({ modelos, onClose, onDone, onCriado, onNovoModelo }: { modelos: AdminRastreadorModelo[]; onClose: () => void; onDone: () => void; onCriado: (r: AdminRastreador) => void; onNovoModelo: () => void }) {
  const [modelo, setModelo] = useState<ModeloEscolhido | null>(null);
  const [ident, setIdent] = useState('');
  const [tocado, setTocado] = useState(false);
  const invalido = modelo ? validarIdentificador(modelo.tipo_identificador, ident) : null;
  const pronto = !!modelo && !invalido;
  const { busy, submit } = useSubmit(async () => onCriado(await adminApi.createRastreador({ imei: normalizarIdentificador(ident), ...escolha(modelo!) })), 'Rastreador cadastrado.', onDone, onClose);
  return (
    <Modal open onClose={onClose} title="Cadastrar rastreador" width="max-w-xl" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!pronto} onClick={submit}>Cadastrar</Button></>}>
      <>
        <Field label="Modelo"><ModeloBusca value={modelo} modelos={modelos} onChange={(m) => { setModelo(m); setTocado(false); }} /></Field>
        {modelo && <>
          <Field label={ROTULO_IDENTIFICADOR[modelo.tipo_identificador]} error={tocado ? invalido || undefined : undefined}
            hint={modelo.tipo_identificador === 'terminal_jt808' ? 'No JT808 o aparelho se identifica pelo número do terminal, que pode não ser o IMEI. Sem cadastro, o log do Traccar mostra "Unknown device - <número>".' : undefined}>
            <Input inputMode={modelo.tipo_identificador === 'outro' ? undefined : 'numeric'} value={ident} invalid={tocado && !!invalido}
              onChange={(e) => setIdent(e.target.value)} onBlur={() => setTocado(true)} />
          </Field>
          <p className="text-small text-ink-2 rounded-ctl bg-surface-muted px-3 py-2">Configure o aparelho para enviar ao servidor do Traccar na <b className="text-ink">porta {modelo.porta}</b> (protocolo {modelo.protocolo}). O device é criado no Traccar no cadastro; a primeira posição confirma o protocolo.</p>
        </>}
        <p className="text-caption text-ink-2">Aparelho que não está na lista do Traccar? <TextButton className="text-caption" onClick={onNovoModelo}>Cadastrar modelo à mão</TextButton></p>
      </>
    </Modal>
  );
}

function TrocarModeloModal({ rastreador, modelos, onClose, onDone }: { rastreador: AdminRastreador; modelos: AdminRastreadorModelo[]; onClose: () => void; onDone: () => void }) {
  const [modelo, setModelo] = useState<ModeloEscolhido | null>(() => modelos.find((m) => m.id === rastreador.modelo_id) ?? null);
  const { busy, submit } = useSubmit(() => adminApi.trocarModeloRastreador(rastreador.id, escolha(modelo!)), 'Modelo do rastreador atualizado.', onDone, onClose);
  const sugerido = rastreador.protocolo ? modelos.filter((m) => m.protocolo === rastreador.protocolo) : [];
  return (
    <Modal open onClose={onClose} title={`Modelo · ${rastreador.imei}`} width="max-w-md" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!modelo || (!!modelo.id && modelo.id === rastreador.modelo_id)} onClick={submit}>Salvar</Button></>}>
      <Field label="Modelo"><ModeloBusca value={modelo} modelos={modelos} onChange={setModelo} /></Field>
      {rastreador.protocolo && <p className="text-caption text-ink-2">Protocolo detectado na 1ª posição: <b>{rastreador.protocolo}</b>{sugerido.length ? ` — modelos com esse protocolo: ${sugerido.map(nomeModelo).join(', ')}.` : '.'}</p>}
    </Modal>
  );
}

const situacaoTexto = (s: SituacaoProtocolo, porta: number) => (!s ? '' : !s.ativo ? ' · protocolo inativo no nosso Traccar' : s.porta !== porta ? ` · nosso Traccar escuta na porta ${s.porta}` : '');

// Modelo escolhido na busca: do catálogo, ou um aparelho da lista do Traccar que vira modelo só no cadastro (ou na troca).
type ModeloEscolhido = PreviaModelo & { aparelhoId?: number };
const escolha = (m: ModeloEscolhido): EscolhaDeModelo => (m.id ? { modeloId: m.id } : { aparelhoId: m.aparelhoId! });
const chaveDoModelo = (m: ModeloEscolhido) => (m.id ? `m:${m.id}` : `t:${m.aparelhoId}`);

// Busca única de modelo: os em uso (catálogo) e os da lista do Traccar, com protocolo e porta de lá — ninguém digita
// protocolo. Escolher um da lista só pré-visualiza: nada entra no catálogo até salvar o rastreador.
function ModeloBusca({ value, modelos, onChange }: {
  value: ModeloEscolhido | null; modelos: AdminRastreadorModelo[]; onChange: (m: ModeloEscolhido | null) => void;
}) {
  const [consultando, setConsultando] = useState(false);
  const todos: ModeloEscolhido[] = [...modelos, ...(value && !modelos.some((m) => m.id && m.id === value.id) ? [value] : [])];
  const onQuery = async (q: string) => {
    const r = await adminApi.buscarModelos(q);
    return [
      ...r.modelos.map((m) => ({ value: `m:${m.id}`, label: nomeModelo(m), sub: `Em uso · ${m.protocolo} · porta ${m.porta}${situacaoTexto(m.situacao, m.porta)}` })),
      ...r.aparelhos.map((a) => ({ value: `t:${a.id}`, label: a.nome, sub: `Lista do Traccar · ${a.protocolo} · porta ${a.porta}${situacaoTexto(a.situacao, a.porta)}` })),
    ];
  };
  const escolher = async (v: string) => {
    if (!v) return onChange(null);
    const doCatalogo = todos.find((m) => chaveDoModelo(m) === v);
    if (doCatalogo) return onChange(doCatalogo);
    if (v.startsWith('m:')) return onChange(null);
    const aparelhoId = Number(v.slice(2));
    setConsultando(true);
    try {
      onChange({ ...(await adminApi.previaDoAparelhoTraccar(aparelhoId)), aparelhoId });
    } catch (e: any) {
      toast(e.message || String(e), { tone: 'crit' });
      onChange(null);
    } finally {
      setConsultando(false);
    }
  };
  return (
    <>
      <SearchSelect value={value ? chaveDoModelo(value) : ''} onChange={escolher} onQuery={onQuery} placeholder="Digite o modelo (ex.: JR12, GV300, FMB920)"
        emptyLabel="Nenhum modelo com esse nome no catálogo nem na lista do Traccar" options={todos.map((m) => ({ value: chaveDoModelo(m), label: nomeModelo(m), sub: `${m.protocolo} · porta ${m.porta}` }))} />
      {consultando && <p className="text-caption text-ink-2 mt-hair">Consultando o modelo na lista do Traccar…</p>}
      {value && !value.id && !consultando && <p className="text-caption text-ink-2 mt-hair">Modelo novo: entra no catálogo quando você salvar.</p>}
    </>
  );
}

// Quantos modelos a lista do Traccar tem e quando foi atualizada; o botão baixa a página do Traccar de novo.
function ListaTraccarResumo({ onAtualizada }: { onAtualizada: () => void }) {
  const { data, reload } = useAdminQuery(() => adminApi.listaTraccar());
  const [busy, setBusy] = useState(false);
  const atualizar = async () => {
    setBusy(true);
    try {
      const r = await adminApi.atualizarListaTraccar();
      toast(`Lista do Traccar atualizada: ${r.total.toLocaleString('pt-BR')} modelos${r.removidos ? `, ${r.removidos} saíram` : ''}.`);
      reload();
      onAtualizada();
    } catch (e: any) {
      toast(e.message || String(e), { tone: 'crit' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-stack">
      {data && <span className="text-caption text-ink-2">Lista do Traccar: {data.total.toLocaleString('pt-BR')} modelos{data.atualizado_em ? ` · ${fmtD(Date.parse(data.atualizado_em))}` : ''}</span>}
      <Button variant="secondary" loading={busy} onClick={atualizar}>Atualizar lista do Traccar</Button>
    </div>
  );
}

/** Protocolos que a plataforma já conhece, com a porta quando vem de um modelo. */
function protocolosConhecidos(modelos: AdminRastreadorModelo[], rastreadores: AdminRastreador[]) {
  const porta = new Map<string, number | null>();
  for (const m of modelos) porta.set(m.protocolo, m.porta);
  for (const r of rastreadores) if (r.protocolo && !porta.has(r.protocolo)) porta.set(r.protocolo, null);
  return [...porta].map(([protocolo, p]) => ({ protocolo, porta: p })).sort((a, b) => a.protocolo.localeCompare(b.protocolo));
}

function ModeloModal({ modelo, conhecidos, onClose, onDone }: { modelo: AdminRastreadorModelo | null; conhecidos: { protocolo: string; porta: number | null }[]; onClose: () => void; onDone: () => void }) {
  const [fabricante, setFabricante] = useState(modelo?.fabricante || '');
  const [nome, setNome] = useState(modelo?.nome || '');
  const [protocolo, setProtocolo] = useState(modelo?.protocolo || '');
  const [porta, setPorta] = useState(modelo ? String(modelo.porta) : '');
  const [tipo, setTipo] = useState<TipoIdentificador>(modelo?.tipo_identificador || 'imei');
  const [tipoAparelho, setTipoAparelho] = useState<'rastreador' | 'tag'>(modelo?.tipo_aparelho || 'rastreador');
  const [tensao, setTensao] = useState(modelo?.atributo_tensao || '');
  const [sinalMax, setSinalMax] = useState(modelo?.sinal_max ? String(modelo.sinal_max) : '');
  const [bloqueio, setBloqueio] = useState(modelo?.atributo_bloqueio || '');
  const [suporteCan, setSuporteCan] = useState<SuporteCan>(modelo?.suporte_can || 'nao_informado');
  const [sinais, setSinais] = useState<SinalMotor[]>(modelo?.sinais_motor || []);
  const [atributosSinal, setAtributosSinal] = useState<Record<SinalMotor, string>>({
    rpm: modelo?.atributo_rpm || '', odometro: modelo?.atributo_odometro || '', combustivel: modelo?.atributo_combustivel || '', horimetro: modelo?.atributo_horimetro || '',
  });
  // modelo do catálogo: dados técnicos vêm conferidos e ficam travados; destravar é decisão explícita
  const [destravado, setDestravado] = useState(false);
  const travado = modelo?.origem === 'catalogo' && !destravado;
  const portaN = Number(porta);
  const atributoOk = (v: string) => !v || /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(v);
  const sinalN = sinalMax ? Number(sinalMax) : null;
  const ok = fabricante.trim() && nome.trim() && /^[a-z0-9]{2,30}$/.test(protocolo) && Number.isInteger(portaN) && portaN >= 1 && portaN <= 65535
    && atributoOk(tensao) && atributoOk(bloqueio) && (sinalN === null || (sinalN >= 1 && sinalN <= 100)) && SINAIS_MOTOR.every((x) => atributoOk(atributosSinal[x]));
  const body = {
    fabricante: fabricante.trim(), nome: nome.trim(), protocolo, porta: portaN, tipoIdentificador: tipo, tipoAparelho, atributoTensao: tensao || null, sinalMax: sinalN, atributoBloqueio: bloqueio || null,
    suporteCan, sinaisMotor: suporteCan === 'nao' ? [] : sinais,
    atributoRpm: atributosSinal.rpm || null, atributoOdometro: atributosSinal.odometro || null, atributoCombustivel: atributosSinal.combustivel || null, atributoHorimetro: atributosSinal.horimetro || null,
  };
  const { busy, submit } = useSubmit(() => (modelo ? adminApi.atualizarModelo(modelo.id, body) : adminApi.criarModelo(body)), modelo ? 'Modelo atualizado.' : 'Modelo cadastrado.', onDone, onClose);
  // protocolo já usado em outro modelo: sugere a mesma porta (só se a porta ainda estiver vazia)
  const escolherProtocolo = (v: string) => {
    const p = v.trim().toLowerCase();
    setProtocolo(p);
    const ja = conhecidos.find((x) => x.protocolo === p);
    if (ja?.porta && !porta) setPorta(String(ja.porta));
  };
  return (
    <Modal open onClose={onClose} title={modelo ? `Editar modelo · ${nomeModelo(modelo)}` : 'Aparelho fora da lista do Traccar'} width="max-w-xl"
      footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!ok} onClick={submit}>{modelo ? 'Salvar' : 'Cadastrar'}</Button></>}>
      {modelo && <FichaTraccarModelo modelo={modelo} />}
      {!modelo && <p className="text-small text-ink-2">Só para aparelho que não está na lista do Traccar: o cadastro de rastreador já procura nela e traz protocolo e porta sozinho. Aqui o protocolo é o nome que o Traccar usa, confira na <a className="underline" href="https://www.traccar.org/devices/" target="_blank" rel="noreferrer">página de aparelhos do Traccar</a> ou no log dele.</p>}
      {modelo?.origem === 'catalogo' && (
        <p className="text-small text-ink-2 rounded-ctl bg-surface-muted px-3 py-2">
          Protocolo e porta vieram da lista do Traccar.{' '}
          {travado ? <TextButton className="text-small" onClick={() => setDestravado(true)}>Editar dados técnicos</TextButton> : <b className="text-warn-ink">Edição liberada: confira com o aparelho real antes de salvar.</b>}
        </p>
      )}
      <FormGroup cols={2}>
        <Field label="Fabricante"><Input autoFocus={!modelo} disabled={travado} value={fabricante} onChange={(e) => setFabricante(e.target.value)} placeholder="Ex.: JMAK" /></Field>
        <Field label="Modelo"><Input disabled={travado} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: JR12" /></Field>
      </FormGroup>
      <FormGroup cols={2}>
        <Field label="Protocolo do Traccar" hint={travado ? undefined : 'Nome exato que o Traccar usa. Para um aparelho novo, aparece no log: "[T…: protocolo < ip] Unknown device - …".'}>
          <Input list="protocolos-conhecidos" disabled={travado} value={protocolo} onChange={(e) => escolherProtocolo(e.target.value)} placeholder="Ex.: gt06" autoComplete="off" spellCheck={false} />
          <datalist id="protocolos-conhecidos">{conhecidos.map((x) => <option key={x.protocolo} value={x.protocolo}>{x.porta ? `porta ${x.porta}` : 'detectado em posições'}</option>)}</datalist>
        </Field>
        <Field label="Porta"><Input inputMode="numeric" disabled={travado} value={porta} onChange={(e) => setPorta(e.target.value.replace(/\D/g, ''))} /></Field>
      </FormGroup>
      <Field label="Identificador que o aparelho manda">
        <Select disabled={travado} value={tipo} onChange={(e) => setTipo(e.target.value as TipoIdentificador)} options={TIPOS_IDENTIFICADOR.map((t) => ({ value: t, label: ROTULO_IDENTIFICADOR[t] }))} />
      </Field>
      <Field label="Tipo de aparelho" hint="Tag é o aparelho de bateria, de redundância: em veículo só entra como backup; em objeto pode ser o principal.">
        <Select value={tipoAparelho} onChange={(e) => setTipoAparelho(e.target.value as 'rastreador' | 'tag')} options={[{ value: 'rastreador', label: 'Rastreador' }, { value: 'tag', label: 'Tag' }]} />
      </Field>
      <fieldset className="flex flex-col gap-stack border-t border-line pt-card-head">
        <legend className="text-body font-medium">Telemetria</legend>
        <p className="text-small text-ink-2">Deixe vazio quando o aparelho segue o padrão do Traccar (tensão em <code>power</code>, sinal de 0 a 5, bloqueio em <code>blocked</code>). Preencha só o que for diferente, olhando os atributos recebidos abaixo.</p>
        <FormGroup cols={3}>
          <Field label="Atributo da tensão externa" hint="Ex.: adc1, vin. Em mV é convertido sozinho."><Input value={tensao} invalid={!atributoOk(tensao)} onChange={(e) => setTensao(e.target.value.trim())} placeholder="power" spellCheck={false} /></Field>
          <Field label="Sinal: valor máximo" hint="Ex.: 4, 31 (CSQ)."><Input inputMode="numeric" value={sinalMax} onChange={(e) => setSinalMax(e.target.value.replace(/\D/g, ''))} placeholder="5" /></Field>
          <Field label="Atributo do bloqueio" hint="Ex.: out1. Só se o aparelho informar."><Input value={bloqueio} invalid={!atributoOk(bloqueio)} onChange={(e) => setBloqueio(e.target.value.trim())} placeholder="blocked" spellCheck={false} /></Field>
        </FormGroup>
        {modelo && <AtributosRecebidosLista modeloId={modelo.id} atual={{ atributo_tensao: tensao || null, sinal_max: sinalN, atributo_bloqueio: bloqueio || null }}
          onUsar={(campo, valor) => (campo === 'atributoTensao' ? setTensao(valor) : campo === 'sinalMax' ? setSinalMax(valor) : setBloqueio(valor))} />}
      </fieldset>
      <fieldset className="flex flex-col gap-stack border-t border-line pt-card-head">
        <legend className="text-body font-medium">Dados do painel (CAN)</legend>
        <p className="text-small text-ink-2">O que o modelo consegue ler do veículo, pela ficha do fabricante. É capacidade, não garantia: o diagnóstico de cada instalação mostra o que chega de fato. Sem ficha conferida, deixe "Não informado": nada é cobrado.</p>
        <Field label="Leitura da rede CAN">
          <Select value={suporteCan} onChange={(e) => setSuporteCan(e.target.value as SuporteCan)}
            options={(Object.keys(ROTULO_SUPORTE_CAN) as SuporteCan[]).map((k) => ({ value: k, label: ROTULO_SUPORTE_CAN[k] }))} />
        </Field>
        {suporteCan !== 'nao' && (
          <>
            <div className="flex flex-col gap-tight">
              <p className="text-small font-medium">Dados que o modelo entrega</p>
              <div className="flex flex-wrap gap-x-5 gap-y-tight">
                {SINAIS_MOTOR.map((x) => (
                  <Check key={x} label={ROTULO_SINAL[x]} checked={sinais.includes(x)}
                    onChange={(v) => setSinais((atual) => (v ? [...atual, x] : atual.filter((y) => y !== x)))} />
                ))}
              </div>
            </div>
            <FormGroup cols={2}>
              {SINAIS_MOTOR.map((x) => (
                <Field key={x} label={`Atributo: ${ROTULO_SINAL[x].toLowerCase()}`} hint={DICA_ATRIBUTO_SINAL[x]}>
                  <Input value={atributosSinal[x]} invalid={!atributoOk(atributosSinal[x])} placeholder={PADRAO_ATRIBUTO_SINAL[x] ?? 'sem padrão'} spellCheck={false}
                    onChange={(e) => { const v = e.target.value.trim(); setAtributosSinal((a) => ({ ...a, [x]: v })); }} />
                </Field>
              ))}
            </FormGroup>
          </>
        )}
      </fieldset>
      {modelo && modelo.rastreadores > 0 && <Callout tone="warn">{modelo.rastreadores} rastreador(es) usam este modelo. Mudar protocolo ou porta muda o que a plataforma confere na próxima posição deles.</Callout>}
    </Modal>
  );
}

// chave padrão do Traccar para cada dado do painel (mesma regra de apps/api/src/telemetria/sinais-motor.ts)
const PADRAO_ATRIBUTO_SINAL: Record<SinalMotor, string | null> = { rpm: 'rpm', odometro: 'obdOdometer', combustivel: 'fuelLevel', horimetro: null };
const DICA_ATRIBUTO_SINAL: Record<SinalMotor, string> = {
  rpm: 'Ex.: io85 na Teltonika.',
  odometro: 'Do painel, não o "odometer" do aparelho.',
  combustivel: '"fuelLevel" em %, "fuel" em litros.',
  horimetro: '"hours" é contado pela ignição: use só o que vem do painel.',
};

const COMANDO_ROTULO: Record<string, string> = { engineStop: 'Bloqueio', engineResume: 'Desbloqueio', positionSingle: 'Pedir posição' };
const TOM_COR: Record<Tom, string> = { ok: 'bg-pos', warn: 'bg-warn', crit: 'bg-crit', info: 'bg-ink-3' };

/** Itens da ficha, a partir do que o Traccar respondeu: um por linha, com o que fazer quando algo não bate. */
function itensDaFicha(m: AdminRastreadorModelo, f: FichaTraccar): { tom: Tom; texto: ReactNode }[] {
  if (!f.traccar.configurado) return [{ tom: 'info', texto: 'Traccar não configurado nesta API (TRACCAR_URL/USER/PASSWORD): não há o que consultar.' }];
  if (f.traccar.erro) return [{ tom: 'crit', texto: f.traccar.erro }];
  const versao = f.traccar.versao ? `Traccar ${f.traccar.versao}` : 'Traccar';
  const itens: { tom: Tom; texto: ReactNode }[] = [];
  const p = f.protocolo;
  if (!p) itens.push({ tom: 'info', texto: `${versao} não informa os protocolos ativos (só a partir da 6.17). Confira no traccar.xml se ${m.protocolo} está na porta ${m.porta}.` });
  else if (!p.ativo) itens.push({ tom: 'crit', texto: <>Protocolo <b>{m.protocolo}</b> não está ativo no {versao}: aparelhos deste modelo não conseguem conectar.</> });
  else if (p.porta !== m.porta) itens.push({ tom: 'warn', texto: <>O {versao} escuta <b>{m.protocolo}</b> na porta <b>{p.porta ?? '?'}</b>, mas o modelo diz {m.porta}. Configure o aparelho para a porta do Traccar ou corrija o modelo.</> });
  else itens.push({ tom: 'ok', texto: <>Protocolo <b>{m.protocolo}</b> ativo no {versao}, porta <b>{p.porta}</b>{p.transporte ? ` (${p.transporte})` : ''}.</> });
  const c = f.comandos;
  if (!c) itens.push({ tom: 'info', texto: 'Comandos aceitos: aparecem depois que um aparelho deste modelo mandar a primeira posição. O Traccar só informa os comandos de um aparelho conectado, não de um protocolo.' });
  else {
    const aceitos = Object.keys(COMANDO_ROTULO).filter((t) => c.tipos.includes(t));
    const bloqueia = c.tipos.includes('engineStop') && c.tipos.includes('engineResume');
    itens.push({ tom: bloqueia ? 'ok' : 'warn', texto: <>
      {aceitos.length ? <>Comandos aceitos: <b>{aceitos.map((t) => COMANDO_ROTULO[t]).join(', ')}</b>.</> : 'Nenhum comando da plataforma é aceito.'}
      {!bloqueia && <> O {versao} não sabe enviar bloqueio/desbloqueio pelo protocolo {m.protocolo}. Uma versão mais nova do Traccar pode ter adicionado: confira as notas de versão.</>}
      <span className="block text-caption text-ink-2">Consultado no aparelho <span className="font-mono">{c.imei}</span>.</span>
    </> });
  }
  return itens;
}

// Ficha do modelo: o que o Traccar diz agora (versão, protocolo ativo e porta, comandos aceitos).
function FichaTraccarModelo({ modelo }: { modelo: AdminRastreadorModelo }) {
  const { data, error, loading } = useAdminQuery(() => adminApi.fichaTraccarDoModelo(modelo.id), [modelo.id]);
  return (
    <section className="flex flex-col gap-tight rounded-ctl border border-line px-3 py-2">
      <p className="text-small font-medium">No Traccar agora</p>
      {loading && <p className="text-caption text-ink-2">Consultando o Traccar…</p>}
      {error && <p className="text-caption text-crit-ink">{error}</p>}
      {data && (
        <ul className="flex flex-col gap-tight">
          {itensDaFicha(modelo, data).map((i, k) => (
            <li key={k} className="flex gap-2 text-small"><span aria-hidden className={`mt-[calc((var(--lh-small)*1em-0.5rem)/2)] h-2 w-2 shrink-0 rounded-full ${TOM_COR[i.tom]}`} /><span>{i.texto}</span></li>
          ))}
        </ul>
      )}
      <p className="text-caption text-ink-2">Não confere firewall nem portas publicadas no Docker/VPS: isso só aparece quando o aparelho tenta conectar.</p>
    </section>
  );
}

// Checklist do rastreador: cada etapa do caminho aparelho → Traccar → plataforma, com o que fazer quando não bate.
// Atualiza sozinho enquanto aberto: serve para acompanhar a instalação (recém-cadastrado: aguardando a 1ª transmissão).
function DiagnosticoModal({ rastreador, recemCadastrado, modelo, onClose, onEditarModelo, onTrocarModelo }: {
  rastreador: Acompanhado; recemCadastrado?: boolean; modelo: AdminRastreadorModelo | null; onClose: () => void;
  onEditarModelo: (m: AdminRastreadorModelo) => void; onTrocarModelo: () => void;
}) {
  const { data, error, loading, reload } = useAdminQuery(() => adminApi.diagnosticoRastreador(rastreador.id), [rastreador.id]);
  useAtualizacao(reload);
  const aguardando = recemCadastrado && data && !data.ultimoPacoteEm;
  const itens = data ? itensDoDiagnostico(data, modelo && { nome: nomeModelo(modelo), protocolo: modelo.protocolo, porta: modelo.porta }) : [];
  const telemetriaIncompleta = itens.some((i) => i.etapa === 'Telemetria' && i.tom === 'warn');
  const protocoloErrado = itens.some((i) => (i.etapa === 'Protocolo' || i.etapa === 'Modelo') && i.tom === 'crit');
  return (
    <Modal open onClose={onClose} title={`${aguardando ? 'Aguardando a 1ª transmissão' : 'Diagnóstico'} · ${rastreador.imei}`} width="max-w-xl"
      footer={<><span className="mr-auto self-center text-caption text-ink-2">Atualiza sozinho a cada {ATUALIZA_MS / 1000} s</span><Button onClick={onClose}>Fechar</Button></>}>
      {loading && !data && <p className="text-small text-ink-2">Consultando a plataforma e o Traccar…</p>}
      {error && <Callout tone="crit">{error}</Callout>}
      {aguardando && modelo && <p className="text-small text-ink-2 rounded-ctl bg-surface-muted px-3 py-2">Rastreador cadastrado. Ligue o aparelho e configure-o para enviar ao servidor do Traccar na <b className="text-ink">porta {modelo.porta}</b> (protocolo {modelo.protocolo}): o primeiro pacote aparece aqui, sem precisar recarregar.</p>}
      {data && (
        <ol className="flex flex-col gap-stack">
          {itens.map((i) => (
            <li key={i.etapa} className="flex gap-3 text-small">
              <span aria-hidden className={`mt-[calc((var(--lh-small)*1em-0.5rem)/2)] h-2 w-2 shrink-0 rounded-full ${TOM_COR[i.tom]}`} />
              <span><b className="font-medium">{i.etapa}</b><span className="block text-ink-2">{i.texto}</span></span>
            </li>
          ))}
        </ol>
      )}
      {data && <SinaisPainel s={data.sinaisMotor} />}
      {data && data.atributosEm && <DadosRecebidos d={data} />}
      {data && (protocoloErrado || (telemetriaIncompleta && modelo)) && (
        <div className="flex flex-wrap gap-3 border-t border-line pt-card-head">
          {protocoloErrado && <TextButton onClick={onTrocarModelo}>{modelo ? 'Trocar modelo' : 'Definir modelo'}</TextButton>}
          {telemetriaIncompleta && modelo && <TextButton onClick={() => onEditarModelo(modelo)}>Ver sugestões de mapeamento</TextButton>}
        </div>
      )}
    </Modal>
  );
}

// Dados do painel (rede CAN) na instalação vigente: o que o modelo promete e o que está chegando de fato.
function SinaisPainel({ s }: { s: SinaisMotorDiagnostico }) {
  const itens = itensDosSinaisMotor(s);
  if (!itens.length && s.suporteCan === 'nao') return null;
  return (
    <section className="flex flex-col gap-tight border-t border-line pt-card-head">
      <p className="text-small font-medium">Dados do painel (CAN) <span className="font-normal text-ink-2">· {ROTULO_SUPORTE_CAN[s.suporteCan]}</span></p>
      {itens.length ? (
        <ol className="flex flex-col gap-stack">
          {itens.map((i) => (
            <li key={i.etapa} className="flex gap-3 text-small">
              <span aria-hidden className={`mt-[calc((var(--lh-small)*1em-0.5rem)/2)] h-2 w-2 shrink-0 rounded-full ${TOM_COR[i.tom]}`} />
              <span><b className="font-medium">{i.etapa}</b><span className="block text-ink-2">{i.texto}</span></span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-small text-ink-2">{s.suporteCan === 'nao_informado'
          ? 'O modelo ainda não tem a ficha de CAN conferida, então nada é cobrado. Dado do painel que chegar aparece aqui.'
          : 'O modelo ainda não diz quais dados do painel entrega: marque no catálogo depois de conferir com o aparelho instalado.'}</p>
      )}
    </section>
  );
}

// O último valor de cada dado que este aparelho mandou (o Traccar decodifica; a plataforma guarda o último de cada chave).
// Chave que não vem há mais de LEITURA_ANTIGA_MIN em relação ao último pacote fica apagada, com a idade: o aparelho
// deixou de mandar esse dado (decoder do Traccar, firmware ou configuração mudou).
function DadosRecebidos({ d }: { d: { atributos: Record<string, unknown>; atributosEm: string | null; atributosVistosEm?: Record<string, string>; ultimaPosicao: TransmissaoRastreador['ultimaPosicao'] } }) {
  const p = d.ultimaPosicao;
  const ref = d.atributosEm ? Date.parse(d.atributosEm) : Date.now();
  return (
    <section className="flex flex-col gap-hair border-t border-line pt-card-head">
      <p className="text-small font-medium">Dados recebidos <span className="font-normal text-ink-2">· {fmtDT(Date.parse(d.atributosEm!))}</span></p>
      {p && <p className="text-small text-ink-2">Posição {coordenadas(p)}{p.velocidadeKmh !== null ? ` · ${Math.round(p.velocidadeKmh)} km/h` : ''}{p.ignicao !== null ? ` · ignição ${p.ignicao ? 'ligada' : 'desligada'}` : ''}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-hair font-mono text-caption">
        {Object.entries(d.atributos).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
          <AtributoRecebido key={k} chave={k} valor={v} antigo={leituraAntiga(d.atributosVistosEm?.[k], ref) && `há ${haQuanto(d.atributosVistosEm![k], Date.now())}`} />
        ))}
      </dl>
    </section>
  );
}

function AtributoRecebido({ chave, valor, antigo }: { chave: string; valor: unknown; antigo: string | null }) {
  return (
    <div className={antigo ? 'contents text-ink-3' : 'contents'}>
      <dt className={antigo ? '' : 'text-ink-2'}>{chave}</dt>
      <dd className="break-all">{JSON.stringify(valor)}{antigo && <span className="font-sans"> · parou de vir, último {antigo}</span>}</dd>
    </div>
  );
}

// Aba Transmissão: se cada rastreador está transmitindo e o quê (posição e telemetria), sem consultar o Traccar.
const SIT_TRANSMISSAO: Record<SituacaoTransmissao, { tone: string; label: string }> = {
  agora: { tone: 'green', label: 'Transmitindo' },
  recente: { tone: 'orange', label: 'Sem pacote recente' },
  parou: { tone: 'red', label: 'Parou' },
  nunca: { tone: 'gray', label: 'Nunca transmitiu' },
};
function TransmissaoAba({ onDiagnostico }: { onDiagnostico: (r: Acompanhado) => void }) {
  const { data, error, loading, reload } = useAdminQuery(adminApi.transmissao);
  useAtualizacao(reload);
  const [filtro, setFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const agora = Date.now();
  const lista = (data || []).map((t) => ({ t, sit: situacaoTransmissao(t.ultimoPacoteEm, agora), semGps: semFixDeGps(t.ultimoPacoteEm, t.ultimaPosicao?.em ?? null) }));
  const count = (s: SituacaoTransmissao) => lista.filter((x) => x.sit === s).length;
  const termo = busca.trim().toLowerCase();
  const visiveis = lista.filter((x) => (!filtro || (filtro === 'sem_gps' ? x.semGps : x.sit === filtro))
    && (!termo || [x.t.imei, x.t.placa, x.t.cliente, x.t.modelo].some((v) => v?.toLowerCase().includes(termo))));
  return (
    <>
      {error && <Callout tone="crit">Não foi possível carregar a transmissão: {error}</Callout>}
      <Section title="Agora">
        <Grid cols={4} equal>
          <KpiTile label="Transmitindo" value={count('agora')} status="mov" sub={`pacote nos últimos ${TRANSMITINDO_MIN} min`} />
          <KpiTile label="Sem pacote recente" value={count('recente')} status="parado" sub={`último entre ${TRANSMITINDO_MIN} min e ${PAROU_H} h`} />
          <KpiTile label="Parou" value={count('parou')} status={count('parou') ? 'crit' : undefined} sub={`nada há mais de ${PAROU_H} h`} />
          <KpiTile label="Nunca transmitiu" value={count('nunca')} sub={`${lista.filter((x) => x.semGps).length} comunicando sem GPS`} />
        </Grid>
      </Section>
      <Section title={`${visiveis.length} rastreadores`}>
        <Card>
          <div className="flex flex-wrap gap-stack mb-card-head">
            <FilterSheet count={filtro ? 1 : 0}><Select aria-label="Filtrar por transmissão" className="w-full sm:w-64" value={filtro} onChange={(e) => setFiltro(e.target.value)}
              options={[{ value: '', label: 'Todos' }, ...(Object.keys(SIT_TRANSMISSAO) as SituacaoTransmissao[]).map((k) => ({ value: k, label: SIT_TRANSMISSAO[k].label })), { value: 'sem_gps', label: 'Comunicando sem GPS' }]} /></FilterSheet>
            <SearchInput className="w-full sm:w-72" value={busca} onChange={setBusca} placeholder="IMEI, placa, cliente ou modelo" />
            <span className="sm:ml-auto self-center text-caption text-ink-2">Atualiza sozinho a cada {ATUALIZA_MS / 1000} s</span>
          </div>
          <Table minWidth={1100} loading={loading && !data} align={['left', 'left', 'left', 'left', 'left', 'right']}
            head={['IMEI', 'Cliente e ativo', 'Transmissão', 'Posição', 'Telemetria', '']}
            emptyState={<EmptyState icon="sinal" illustration={lista.length ? undefined : 'ilu-rastreador'} title={lista.length ? 'Nenhum rastreador com esse filtro' : 'Nenhum rastreador cadastrado'} />}
            onRow={(i) => { const { t } = visiveis[i]; onDiagnostico({ id: t.id, imei: t.imei, modelo_id: t.modeloId }); }}
            card={(i) => {
              const { t, sit, semGps } = visiveis[i];
              const p = t.ultimaPosicao;
              return (
                <div className="flex flex-col gap-tight min-w-0">
                  <div className="flex items-start justify-between gap-stack">
                    <span className="font-mono text-body font-medium break-all">{t.imei}</span>
                    <span className="shrink-0 pt-px"><Badge tone={SIT_TRANSMISSAO[sit].tone}>{SIT_TRANSMISSAO[sit].label}</Badge></span>
                  </div>
                  <span className="text-small">{t.cliente ? <>{t.cliente}<span className="text-ink-2"> · {t.placa || 'sem ativo'}</span></> : <span className="text-ink-2">Em estoque</span>}</span>
                  <span className="text-caption text-ink-2">{t.modelo || 'sem modelo'}{t.modeloProtocolo ? ` · ${t.modeloProtocolo} ${t.modeloPorta}` : ''}
                    {t.ultimoPacoteEm && <span className="num"> · há {haQuanto(t.ultimoPacoteEm, agora)}, {t.pacotesUltimaHora} na última hora</span>}</span>
                  {t.protocoloDetectado && t.modeloProtocolo && t.protocoloDetectado !== t.modeloProtocolo && <span className="text-caption text-crit-ink">chegou como {t.protocoloDetectado}</span>}
                  {!t.traccarDeviceId && <span className="text-caption text-warn-ink">sem device no Traccar</span>}
                  {p && <span className="text-caption text-ink-2"><span className="num">{coordenadas(p)}</span>{p.velocidadeKmh !== null && ` · ${Math.round(p.velocidadeKmh)} km/h`}{p.ignicao !== null && ` · ignição ${p.ignicao ? 'ligada' : 'desligada'}`}</span>}
                  {!p && sit !== 'nunca' && <span className="text-caption text-warn-ink">sem posição com GPS</span>}
                  {semGps && p && <span className="text-caption text-warn-ink">sem GPS há {haQuanto(p.em, agora)}</span>}
                  {[t.telemetria.tensaoV, t.telemetria.sinalGsm, t.telemetria.satelites, t.telemetria.bloqueado, t.telemetria.alimentacaoExterna ?? null].some((v) => v !== null) && <span className="text-ink-2 [&>span]:text-caption"><TelemetriaCelula t={t.telemetria} /></span>}
                </div>
              );
            }}
            rows={visiveis.map(({ t, sit, semGps }) => [
              <span className="font-mono text-small">{t.imei}
                <span className="block font-sans text-caption text-ink-2">{t.modelo || 'sem modelo'}{t.modeloProtocolo ? ` · ${t.modeloProtocolo} ${t.modeloPorta}` : ''}</span>
                {t.protocoloDetectado && t.modeloProtocolo && t.protocoloDetectado !== t.modeloProtocolo && <span className="block font-sans text-caption text-crit-ink">chegou como {t.protocoloDetectado}</span>}
                {!t.traccarDeviceId && <span className="block font-sans text-caption text-warn-ink">sem device no Traccar</span>}</span>,
              t.cliente ? <span>{t.cliente}<span className="block text-caption text-ink-2">{t.placa || 'sem ativo'}</span></span> : <span className="text-ink-3">Em estoque</span>,
              <span><Badge tone={SIT_TRANSMISSAO[sit].tone}>{SIT_TRANSMISSAO[sit].label}</Badge>
                {t.ultimoPacoteEm && <span className="block text-caption text-ink-2 num">há {haQuanto(t.ultimoPacoteEm, agora)} · {t.pacotesUltimaHora} na última hora</span>}</span>,
              t.ultimaPosicao
                ? <span className="text-small"><span className="num">{coordenadas(t.ultimaPosicao)}</span>
                    <span className="block text-caption text-ink-2">{[t.ultimaPosicao.velocidadeKmh !== null && `${Math.round(t.ultimaPosicao.velocidadeKmh)} km/h`, t.ultimaPosicao.ignicao !== null && `ignição ${t.ultimaPosicao.ignicao ? 'ligada' : 'desligada'}`].filter(Boolean).join(' · ')}</span>
                    {semGps && <span className="block text-caption text-warn-ink">sem GPS há {haQuanto(t.ultimaPosicao.em, agora)}</span>}</span>
                : <span className={sit === 'nunca' ? 'text-ink-3' : 'text-small text-warn-ink'}>{sit === 'nunca' ? '—' : 'sem posição com GPS'}</span>,
              <TelemetriaCelula t={t.telemetria} />,
              <TextButton onClick={() => onDiagnostico({ id: t.id, imei: t.imei, modelo_id: t.modeloId })}>Diagnóstico</TextButton>,
            ])} />
        </Card>
      </Section>
    </>
  );
}

// valor com idade quando antigo: o último conhecido pode ser de dias atrás (o aparelho deixou de mandar o dado)
function TelemetriaCelula({ t }: { t: TransmissaoRastreador['telemetria'] }) {
  const com = (texto: string, em: string | null | undefined) => { const a = leituraAntiga(em); return a ? `${texto} (${a})` : texto; };
  const partes = [
    t.tensaoV !== null && com(`${t.tensaoV.toFixed(1)} V`, t.lidaEm?.tensaoV),
    t.alimentacaoExterna === false ? com('alimentação cortada', t.lidaEm?.alimentacaoExterna)
      : t.tensaoV === null && t.alimentacaoExterna === true && com('alimentação ligada', t.lidaEm?.alimentacaoExterna),
    t.sinalGsm !== null && com(`sinal ${t.sinalGsm}/5`, t.lidaEm?.sinalGsm),
    t.satelites !== null && com(`${t.satelites} satélites`, t.lidaEm?.satelites),
    t.bloqueado !== null && com(t.bloqueado ? 'bloqueado' : 'desbloqueado', t.lidaEm?.bloqueado),
  ].filter(Boolean);
  return partes.length ? <span className="text-small">{partes.join(' · ')}</span> : <span className="text-ink-3">—</span>;
}

// O que os aparelhos do modelo mandaram de verdade (último valor de cada atributo): base para preencher o mapeamento.
// Com sugestões de mapeamento tiradas do aparelho mais recente (só sugestão: "Usar" preenche o campo, salvar é do admin).
const CAMPO_ROTULO = { atributoTensao: 'Tensão', sinalMax: 'Sinal máximo', atributoBloqueio: 'Bloqueio' } as const;
function AtributosRecebidosLista({ modeloId, atual, onUsar }: {
  modeloId: string;
  atual: Parameters<typeof sugerirMapeamento>[1];
  onUsar: (campo: keyof typeof CAMPO_ROTULO, valor: string) => void;
}) {
  const { data, error, loading } = useAdminQuery(() => adminApi.atributosDoModelo(modeloId), [modeloId]);
  if (loading) return <p className="text-caption text-ink-2">Carregando atributos recebidos…</p>;
  if (error) return <p className="text-caption text-crit-ink">{error}</p>;
  if (!data?.length) return <p className="text-caption text-ink-2">Nenhum rastreador deste modelo mandou dados ainda.</p>;
  const sugestoes = sugerirMapeamento(data[0].atributos, atual);
  return (
    <div className="flex flex-col gap-tight">
      {sugestoes.length > 0 && (
        <div className="flex flex-col gap-tight rounded-ctl border border-line px-3 py-2">
          <p className="text-small font-medium">Sugestões a partir do aparelho <span className="font-mono">{data[0].imei}</span></p>
          {sugestoes.map((s) => (
            <p key={s.campo} className="text-small">
              <b className="font-medium">{CAMPO_ROTULO[s.campo]}: <span className="font-mono">{s.valor}</span></b> <span className="text-ink-2">({s.motivo})</span>{' '}
              <TextButton className="text-small" onClick={() => onUsar(s.campo, s.valor)}>Usar</TextButton>
            </p>
          ))}
        </div>
      )}
      <p className="text-small font-medium">Atributos recebidos</p>
      {data.map((r) => (
        <div key={r.imei} className="rounded-ctl bg-surface-muted px-3 py-2">
          <p className="text-caption text-ink-2 mb-hair"><span className="font-mono">{r.imei}</span>{r.protocolo ? ` · ${r.protocolo}` : ''} · {new Date(r.atributos_em).toLocaleString('pt-BR')}</p>
          <p className="font-mono text-caption break-all">{Object.entries(r.atributos).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(' · ')}</p>
        </div>
      ))}
    </div>
  );
}

function NovoChipModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [iccid, setIccid] = useState('');
  const [operadora, setOperadora] = useState('');
  const [numero, setNumero] = useState('');
  const { busy, submit } = useSubmit(() => adminApi.createSimCard({ iccid: iccid.trim(), operadora: operadora.trim() || undefined, numero: numero.trim() || undefined }), 'Chip cadastrado.', onDone, onClose);
  return (
    <Modal open onClose={onClose} title="Cadastrar chip" width="max-w-xl" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!iccid.trim()} onClick={submit}>Cadastrar</Button></>}>
      <Field label="ICCID"><Input autoFocus mask="digitos" maxDigits={20} value={iccid} onChange={(e) => setIccid(e.target.value)} /></Field>
      <FormGroup cols={2}>
        <Field label="Operadora" hint="Opcional"><Input value={operadora} onChange={(e) => setOperadora(e.target.value)} /></Field>
        <Field label="Número" hint="Opcional"><Input mask="telefone" value={numero} onChange={(e) => setNumero(e.target.value)} /></Field>
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
        ? <Field label="Chip livre" hint="Digite qualquer parte do ICCID, como os últimos dígitos, ou a operadora."><SearchSelect aria-label="Chip livre" value={chipId} onChange={setChipId} placeholder="Buscar ICCID ou operadora" emptyLabel="Nenhum chip livre com esse número" options={chips.map((c) => ({ value: c.id, label: c.iccid, sub: c.operadora || 'Sem operadora' }))} /></Field>
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
