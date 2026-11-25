// Console › API › Chaves dos clientes (docs/PLANO-API-PUBLICA.md § 3.5, decisão de 24/11/2026): a equipe da Localle gera
// a chave vinculada a um cliente (64 caracteres sorteados entre letras, números e símbolos), escolhe os escopos que o
// contrato dele permite, reseta (valor novo na mesma chave) e revoga. Rotas /superadmin/api-chaves.
import { useEffect, useState } from 'react';
import { Badge, Button, Callout, Card, Check, DateInput, Field, FormGroup, Input, Modal, Section, Select, Table, TextButton, confirmAction, toast } from '../ui';
import { adminApi, useAdminQuery, type AdminClient } from '../../lib/localleApi';
import { chavesApi, situacaoDaChave, type ChaveApi, type EscopoApi } from '../../lib/apiChavesApi';
import { mensagemDeErro } from '../../lib/apiErro';
import { fmtD, fmtDT } from '@localle/shared/utils';
import { ChaveCriadaModal } from './ChaveCriadaModal';

export function ChavesClientesAba() {
  const [cliente, setCliente] = useState('');
  const { data, error, loading, reload } = useAdminQuery(() => chavesApi.listar(cliente || undefined), [cliente]);
  const clientes = useAdminQuery(adminApi.clients);
  const [gerando, setGerando] = useState(false);
  const [gerada, setGerada] = useState<{ chave: string; titulo: string } | null>(null);
  const lista = data ?? [];

  const resetar = async (c: ChaveApi) => {
    if (!(await confirmAction({ title: 'Resetar a chave?', detail: `"${c.nome}" (${c.client_name}) ganha um valor novo, com os mesmos escopos e validade. O valor atual para de funcionar na hora: o sistema que usa esta chave precisa receber o novo.`, confirmLabel: 'Resetar' }))) return;
    try { setGerada({ chave: (await chavesApi.resetar(c.id)).chave, titulo: 'Chave resetada' }); reload(); } catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
  };
  const revogar = async (c: ChaveApi) => {
    if (!(await confirmAction({ title: 'Revogar a chave?', detail: `"${c.nome}" (${c.client_name}) para de funcionar na hora. Não dá para desfazer.`, confirmLabel: 'Revogar' }))) return;
    try { await chavesApi.revogar(c.id); toast('Chave revogada.'); reload(); } catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
  };
  const ativa = (c: ChaveApi) => situacaoDaChave(c).label !== 'Revogada' && situacaoDaChave(c).label !== 'Vencida';
  const acoes = (c: ChaveApi) => ativa(c)
    ? <div className="flex gap-3 justify-end whitespace-nowrap"><TextButton onClick={() => resetar(c)}>Resetar</TextButton><TextButton tone="danger" onClick={() => revogar(c)}>Revogar</TextButton></div>
    : null;
  const opcoesCliente = (clientes.data ?? []).map((c: AdminClient) => ({ value: c.id, label: c.name }));

  return (
    <Section title="Chaves dos clientes" description="Cada chave consulta só os dados do cliente a que está vinculada, nos escopos marcados e nos módulos do contrato dele. Até 10 ativas por cliente."
      actions={<div className="flex gap-tight items-center max-md:w-full">
        <Select aria-label="Filtrar por cliente" className="w-56 max-md:flex-1" value={cliente} onChange={(e) => setCliente(e.target.value)} options={[{ value: '', label: 'Todos os clientes' }, ...opcoesCliente]} />
        <Button onClick={() => setGerando(true)}>Gerar chave</Button>
      </div>}>
      {error && <Callout tone="crit">Não foi possível carregar as chaves: {error}</Callout>}
      <Card>
        <Table minWidth={960} loading={loading && !data} align={['left', 'left', 'left', 'left', 'left', 'left', 'right']}
          head={['Chave', 'Cliente', 'Escopos', 'Situação', 'Último uso', 'Validade', '']}
          empty="Nenhuma chave gerada."
          card={(i) => {
            const c = lista[i];
            const s = situacaoDaChave(c);
            return (
              <div className="flex flex-col gap-hair min-w-0">
                <div className="flex items-baseline justify-between gap-stack"><span className="text-body font-medium min-w-0">{c.nome}</span><Badge tone={s.tone}>{s.label}</Badge></div>
                <span className="text-small">{c.client_name}</span>
                <span className="text-small text-ink-2 font-mono">{c.prefixo}…</span>
                <span className="text-small text-ink-2">{c.escopos.join(', ')}</span>
                <span className="text-caption text-ink-2">Último uso: {c.ultimo_uso_em ? fmtDT(c.ultimo_uso_em) : 'nunca'} · {c.expira_em ? `vence em ${fmtD(c.expira_em)}` : 'sem vencimento'}</span>
                {acoes(c) && <div className="mt-tight">{acoes(c)}</div>}
              </div>
            );
          }}
          rows={lista.map((c) => {
            const s = situacaoDaChave(c);
            return [
              <span className="text-small"><span className="font-medium">{c.nome}</span><span className="block text-caption text-ink-2 font-mono">{c.prefixo}…</span></span>,
              <span className="text-small">{c.client_name}</span>,
              <span className="text-small">{c.escopos.join(', ')}</span>,
              <Badge tone={s.tone}>{s.label}</Badge>,
              <span className="text-small num">{c.ultimo_uso_em ? fmtDT(c.ultimo_uso_em) : 'Nunca'}</span>,
              <span className="text-small num">{c.expira_em ? fmtD(c.expira_em) : 'Sem vencimento'}<span className="block text-caption text-ink-2">{c.resetada_em ? `resetada em ${fmtD(c.resetada_em)}` : `por ${c.criada_por_email ?? '—'}`}</span></span>,
              acoes(c),
            ];
          })}
        />
      </Card>
      {gerando && <GerarChaveModal clientes={opcoesCliente} clienteInicial={cliente} onClose={() => setGerando(false)} onGerada={(chave) => { setGerando(false); setGerada({ chave, titulo: 'Chave gerada' }); reload(); }} />}
      {gerada && <ChaveCriadaModal chave={gerada.chave} titulo={gerada.titulo} onClose={() => setGerada(null)} />}
    </Section>
  );
}

function GerarChaveModal({ clientes, clienteInicial, onClose, onGerada }: { clientes: { value: string; label: string }[]; clienteInicial: string; onClose: () => void; onGerada: (chave: string) => void }) {
  const [cliente, setCliente] = useState(clienteInicial);
  const [nome, setNome] = useState('');
  const [escopos, setEscopos] = useState<EscopoApi[] | null>(null);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [vence, setVence] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const hoje = new Date().toISOString().slice(0, 10);
  const valido = !!cliente && nome.trim() !== '' && marcados.length > 0 && (!vence || vence > hoje);

  // os escopos dependem do contrato do cliente escolhido
  useEffect(() => {
    setEscopos(null); setMarcados([]); setErro('');
    if (!cliente) return;
    let vivo = true;
    chavesApi.escopos(cliente).then((e) => vivo && setEscopos(e)).catch((e) => vivo && setErro(mensagemDeErro(e)));
    return () => { vivo = false; };
  }, [cliente]);

  const gerar = async () => {
    setBusy(true);
    try {
      // validade: fim do dia escolhido, no horário local
      const { chave } = await chavesApi.criar({ clientId: cliente, nome: nome.trim(), escopos: marcados, expiraEm: vence ? new Date(`${vence}T23:59:59`).toISOString() : null });
      onGerada(chave);
    } catch (e: any) {
      toast(e.message || String(e), { tone: 'crit' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Gerar chave de acesso" width="max-w-xl" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!valido} onClick={gerar}>Gerar chave</Button></>}>
      <FormGroup>
        <Field label="Cliente" required><Select value={cliente} onChange={(e) => setCliente(e.target.value)} options={[{ value: '', label: 'Escolha o cliente' }, ...clientes]} /></Field>
        <Field label="Nome" required hint="Para reconhecer onde a chave é usada"><Input value={nome} maxLength={80} placeholder="Ex.: Power BI, ERP" onChange={(e) => setNome(e.target.value)} /></Field>
        <Field label="O que a chave pode consultar" required hint={cliente ? 'Só os módulos do contrato do cliente' : 'Escolha o cliente primeiro'}>
          {erro ? <Callout tone="crit">{erro}</Callout>
            : <div className="grid grid-cols-2 gap-tight max-md:grid-cols-1">
              {(escopos ?? []).map((e) => <Check key={e.key} label={e.nome} checked={marcados.includes(e.key)} onChange={(on) => setMarcados((m) => (on ? [...m, e.key] : m.filter((x) => x !== e.key)))} />)}
            </div>}
        </Field>
        <Field label="Vence em" hint="Vazio = sem vencimento" error={vence && vence <= hoje ? 'Escolha uma data futura' : undefined}>
          <DateInput type="date" value={vence} min={hoje} onChange={(e) => setVence(e.target.value)} />
        </Field>
      </FormGroup>
    </Modal>
  );
}
