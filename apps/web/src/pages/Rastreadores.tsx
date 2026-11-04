// Console da Locale · Rastreadores e chips: inventário real do backend (rotas /superadmin/rastreadores):
// cadastro de rastreador e chip, vínculo chip↔rastreador, vínculo rastreador↔cliente, instalação vigente,
// último pacote, desinstalação e desativação. Em qual ativo o rastreador está é o próprio cliente que indica
// (Gestão de ativos). Custo, avaria e recolhimento físico não existem no schema.
import { useState, type ReactNode } from 'react';
import { Card, PageHeader, PageBody, Section, Grid, Table, Badge, Button, Select, SearchSelect, TextButton, Modal, Field, FormGroup, Input, Callout, EmptyState, toast, confirmAction } from '../components/ui';
import { KpiTile } from '../components/story';
import { useStore } from '../lib/store';
import { adminApi, useAdminQuery, type AdminRastreador, type AdminRastreadorModelo, type AdminSimCard, type FichaTraccar } from '../lib/localleApi';
import { fmtD, fmtDT } from '@localle/shared/utils';
import { itensDoDiagnostico, sugerirMapeamento, type Tom } from '../lib/diagnosticoRastreador';
import { normalizarIdentificador, ROTULO_IDENTIFICADOR, TIPOS_IDENTIFICADOR, validarIdentificador, type TipoIdentificador } from '@localle/shared/rastreadorModelos';

// Modelos: o catálogo Localle (migration 1793160000000) já traz protocolo, porta e identificador conferidos na lista do
// Traccar — no cadastro de rastreador basta escolher o modelo. Modelo não listado: protocolo em texto livre, com o nome
// que o Traccar usa; as sugestões são o que a plataforma já viu (modelos e protocolos detectados nas posições).
// Protocolo novo: o log do Traccar mostra o nome em "[T…: <protocolo> < ip] Unknown device - …".
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
  const [diagnosticando, setDiagnosticando] = useState<AdminRastreador | null>(null);
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
                    {s !== 'desativado' && <TextButton onClick={() => setDiagnosticando(r)}>Diagnóstico</TextButton>}
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
              <p className="text-small text-ink-2 mr-auto max-w-[80ch]">O catálogo já traz protocolo, porta e identificador de cada modelo, conferidos na lista do Traccar: no cadastro de rastreador basta escolher o modelo. A primeira posição confere o protocolo; em Editar, a ficha mostra o que o Traccar aceita do modelo.</p>
              <Button variant="secondary" onClick={() => setEditandoModelo('novo')}>Modelo não listado</Button>
            </div>
            <Table minWidth={820} loading={loading && !data} align={['left', 'left', 'right', 'left', 'right', 'left', 'right']}
              head={['Modelo', 'Protocolo', 'Porta', 'Identificador', 'Rastreadores', 'Situação', '']}
              emptyState={<EmptyState icon="sinal" title="Nenhum modelo cadastrado" action={<Button onClick={() => setEditandoModelo('novo')}>Cadastrar modelo</Button>} />}
              rows={modelos.map((m) => [
                <span><span className="font-medium">{nomeModelo(m)}</span><span className="block text-caption text-ink-2">{m.origem === 'catalogo' ? 'Catálogo Localle' : 'Cadastrado pela tela'}</span></span>, <span className="font-mono text-small">{m.protocolo}</span>, <span className="num">{m.porta}</span>,
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
      {diagnosticando && <DiagnosticoModal rastreador={diagnosticando} modelo={modelos.find((m) => m.id === diagnosticando.modelo_id) ?? null}
        onClose={() => setDiagnosticando(null)}
        onEditarModelo={(m) => { setDiagnosticando(null); setEditandoModelo(m); }}
        onTrocarModelo={() => { setTrocandoModelo(diagnosticando); setDiagnosticando(null); }} />}
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
  const [tensao, setTensao] = useState(modelo?.atributo_tensao || '');
  const [sinalMax, setSinalMax] = useState(modelo?.sinal_max ? String(modelo.sinal_max) : '');
  const [bloqueio, setBloqueio] = useState(modelo?.atributo_bloqueio || '');
  // modelo do catálogo: dados técnicos vêm conferidos e ficam travados; destravar é decisão explícita
  const [destravado, setDestravado] = useState(false);
  const travado = modelo?.origem === 'catalogo' && !destravado;
  const portaN = Number(porta);
  const atributoOk = (v: string) => !v || /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(v);
  const sinalN = sinalMax ? Number(sinalMax) : null;
  const ok = fabricante.trim() && nome.trim() && /^[a-z0-9]{2,30}$/.test(protocolo) && Number.isInteger(portaN) && portaN >= 1 && portaN <= 65535
    && atributoOk(tensao) && atributoOk(bloqueio) && (sinalN === null || (sinalN >= 1 && sinalN <= 100));
  const body = { fabricante: fabricante.trim(), nome: nome.trim(), protocolo, porta: portaN, tipoIdentificador: tipo, atributoTensao: tensao || null, sinalMax: sinalN, atributoBloqueio: bloqueio || null };
  const { busy, submit } = useSubmit(() => (modelo ? adminApi.atualizarModelo(modelo.id, body) : adminApi.criarModelo(body)), modelo ? 'Modelo atualizado.' : 'Modelo cadastrado.', onDone, onClose);
  // protocolo já usado em outro modelo: sugere a mesma porta (só se a porta ainda estiver vazia)
  const escolherProtocolo = (v: string) => {
    const p = v.trim().toLowerCase();
    setProtocolo(p);
    const ja = conhecidos.find((x) => x.protocolo === p);
    if (ja?.porta && !porta) setPorta(String(ja.porta));
  };
  return (
    <Modal open onClose={onClose} title={modelo ? `Editar modelo · ${nomeModelo(modelo)}` : 'Modelo não listado'} width="max-w-xl"
      footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!ok} onClick={submit}>{modelo ? 'Salvar' : 'Cadastrar'}</Button></>}>
      {modelo && <FichaTraccarModelo modelo={modelo} />}
      {!modelo && <p className="text-small text-ink-2">Antes de cadastrar, procure o modelo no catálogo. Se ele não estiver lá, pegue o protocolo e a porta na <a className="underline" href="https://www.traccar.org/devices/" target="_blank" rel="noreferrer">lista de aparelhos do Traccar</a>.</p>}
      {modelo?.origem === 'catalogo' && (
        <p className="text-small text-ink-2 rounded-ctl bg-surface-muted px-3 py-2">
          Modelo do catálogo Localle: protocolo, porta e identificador conferidos na lista do Traccar.{' '}
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
      {modelo && modelo.rastreadores > 0 && <Callout tone="warn">{modelo.rastreadores} rastreador(es) usam este modelo. Mudar protocolo ou porta muda o que a plataforma confere na próxima posição deles.</Callout>}
    </Modal>
  );
}

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
            <li key={k} className="flex gap-2 text-small"><span aria-hidden className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${TOM_COR[i.tom]}`} /><span>{i.texto}</span></li>
          ))}
        </ul>
      )}
      <p className="text-caption text-ink-2">Não confere firewall nem portas publicadas no Docker/VPS: isso só aparece quando o aparelho tenta conectar.</p>
    </section>
  );
}

// Checklist do rastreador: cada etapa do caminho aparelho → Traccar → plataforma, com o que fazer quando não bate.
function DiagnosticoModal({ rastreador, modelo, onClose, onEditarModelo, onTrocarModelo }: {
  rastreador: AdminRastreador; modelo: AdminRastreadorModelo | null; onClose: () => void;
  onEditarModelo: (m: AdminRastreadorModelo) => void; onTrocarModelo: () => void;
}) {
  const { data, error, loading, reload } = useAdminQuery(() => adminApi.diagnosticoRastreador(rastreador.id), [rastreador.id]);
  const itens = data ? itensDoDiagnostico(data, modelo && { nome: nomeModelo(modelo), protocolo: modelo.protocolo, porta: modelo.porta }) : [];
  const telemetriaIncompleta = itens.some((i) => i.etapa === 'Telemetria' && i.tom === 'warn');
  const protocoloErrado = itens.some((i) => (i.etapa === 'Protocolo' || i.etapa === 'Modelo') && i.tom === 'crit');
  return (
    <Modal open onClose={onClose} title={`Diagnóstico · ${rastreador.imei}`} width="max-w-xl"
      footer={<><Button variant="quiet" loading={loading} onClick={reload}>Consultar de novo</Button><Button onClick={onClose}>Fechar</Button></>}>
      {loading && !data && <p className="text-small text-ink-2">Consultando a plataforma e o Traccar…</p>}
      {error && <Callout tone="crit">{error}</Callout>}
      {data && (
        <ol className="flex flex-col gap-stack">
          {itens.map((i) => (
            <li key={i.etapa} className="flex gap-3 text-small">
              <span aria-hidden className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${TOM_COR[i.tom]}`} />
              <span><b className="font-medium">{i.etapa}</b><span className="block text-ink-2">{i.texto}</span></span>
            </li>
          ))}
        </ol>
      )}
      {data && (protocoloErrado || (telemetriaIncompleta && modelo)) && (
        <div className="flex flex-wrap gap-3 border-t border-line pt-card-head">
          {protocoloErrado && <TextButton onClick={onTrocarModelo}>{modelo ? 'Trocar modelo' : 'Definir modelo'}</TextButton>}
          {telemetriaIncompleta && modelo && <TextButton onClick={() => onEditarModelo(modelo)}>Ver sugestões de mapeamento</TextButton>}
        </div>
      )}
    </Modal>
  );
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
