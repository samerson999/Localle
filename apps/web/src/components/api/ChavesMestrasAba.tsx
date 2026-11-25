// Console › API › Chaves mestras (docs/PLANO-API-PUBLICA.md § 3.6): consultam qualquer cliente pelo
// caminho /api/v1/clientes/{clientId}/..., só dos IPs cadastrados e por no máximo 90 dias. Cada consulta fica registrada
// aqui; o cliente não vê. Não aparecem na documentação pública da API.
import { useState } from 'react';
import { Badge, Button, Callout, Card, DateInput, Field, FormGroup, Input, Modal, Section, Table, Textarea, TextButton, confirmAction, toast } from '../ui';
import { useAdminQuery } from '../../lib/localleApi';
import { chavesMestrasApi, situacaoDaChave, type ChaveMestra } from '../../lib/apiChavesApi';
import { ChaveCriadaModal } from './ChaveCriadaModal';
import { fmtD, fmtDT } from '@localle/shared/utils';

const MAX_DIAS = 90;
const diasAFrente = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export function ChavesMestrasAba() {
  const { data, error, loading, reload } = useAdminQuery(chavesMestrasApi.listar);
  const [criando, setCriando] = useState(false);
  const [criada, setCriada] = useState<{ chave: string; titulo: string } | null>(null);
  const [vendo, setVendo] = useState<ChaveMestra | null>(null);
  const lista = data ?? [];

  const revogar = async (c: ChaveMestra) => {
    if (!(await confirmAction({ title: 'Revogar chave mestra?', detail: `"${c.nome}" para de funcionar em até 1 minuto. Não dá para desfazer.`, confirmLabel: 'Revogar' }))) return;
    try { await chavesMestrasApi.revogar(c.id); toast('Chave revogada.'); reload(); } catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
  };
  const resetar = async (c: ChaveMestra) => {
    if (!(await confirmAction({ title: 'Resetar a chave mestra?', detail: `"${c.nome}" ganha um valor novo, com os mesmos IPs e validade. O valor atual para de funcionar na hora.`, confirmLabel: 'Resetar' }))) return;
    try { setCriada({ chave: (await chavesMestrasApi.resetar(c.id)).chave, titulo: 'Chave mestra resetada' }); reload(); } catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
  };
  const acoes = (c: ChaveMestra) => (
    <div className="flex gap-3 justify-end whitespace-nowrap">
      <TextButton onClick={() => setVendo(c)}>Acessos</TextButton>
      {!c.revogada_em && Date.parse(c.expira_em) > Date.now() && <><TextButton onClick={() => resetar(c)}>Resetar</TextButton><TextButton tone="danger" onClick={() => revogar(c)}>Revogar</TextButton></>}
    </div>
  );

  return (
    <>
        {error && <Callout tone="crit">Não foi possível carregar as chaves: {error}</Callout>}
        <Section title="Chaves mestras" description="Consultam qualquer cliente pelo caminho /api/v1/clientes/{id}/..., só dos IPs cadastrados e por no máximo 90 dias. Cada consulta fica registrada; o cliente não vê." actions={<Button onClick={() => setCriando(true)}>Nova chave mestra</Button>}>
          <Card>
            <Table minWidth={860} loading={loading && !data} align={['left', 'left', 'left', 'left', 'left', 'right']}
              head={['Chave', 'IPs permitidos', 'Situação', 'Último uso', 'Vence em', '']}
              empty="Nenhuma chave mestra."
              card={(i) => {
                const c = lista[i];
                const s = situacaoDaChave(c);
                return (
                  <div className="flex flex-col gap-hair min-w-0">
                    <div className="flex items-baseline justify-between gap-stack"><span className="text-body font-medium min-w-0">{c.nome}</span><Badge tone={s.tone}>{s.label}</Badge></div>
                    <span className="text-small text-ink-2 font-mono">{c.prefixo}…</span>
                    <span className="text-small text-ink-2 num">{c.ips_permitidos.join(', ')}</span>
                    <span className="text-caption text-ink-2">Último uso: {c.ultimo_uso_em ? fmtDT(c.ultimo_uso_em) : 'nunca'} · vence em {fmtD(c.expira_em)}</span>
                    <div className="mt-tight">{acoes(c)}</div>
                  </div>
                );
              }}
              rows={lista.map((c) => {
                const s = situacaoDaChave(c);
                return [
                  <span className="text-small"><span className="font-medium">{c.nome}</span><span className="block text-caption text-ink-2 font-mono">{c.prefixo}…</span></span>,
                  <span className="text-small num">{c.ips_permitidos.join(', ')}</span>,
                  <Badge tone={s.tone}>{s.label}</Badge>,
                  <span className="text-small num">{c.ultimo_uso_em ? fmtDT(c.ultimo_uso_em) : 'Nunca'}</span>,
                  <span className="text-small num">{fmtD(c.expira_em)}<span className="block text-caption text-ink-2">criada por {c.criada_por_email ?? '—'}</span></span>,
                  acoes(c),
                ];
              })}
            />
          </Card>
          <p className="text-caption text-ink-2">Uso: <span className="font-mono">GET /api/v1/clientes</span> lista os clientes; <span className="font-mono">GET /api/v1/clientes/{'{clientId}'}/veiculos</span> e as demais rotas da documentação, com o cliente no caminho. Todo superadmin recebe e-mail quando uma chave é criada, revogada ou usada de um IP novo.</p>
        </Section>
      {criando && <NovaChaveMestraModal onClose={() => setCriando(false)} onCriada={(chave) => { setCriando(false); setCriada({ chave, titulo: 'Chave mestra criada' }); reload(); }} />}
      {criada && <ChaveCriadaModal chave={criada.chave} titulo={criada.titulo} onClose={() => setCriada(null)} />}
      {vendo && <AcessosModal chave={vendo} onClose={() => setVendo(null)} />}
    </>
  );
}

function NovaChaveMestraModal({ onClose, onCriada }: { onClose: () => void; onCriada: (chave: string) => void }) {
  const [nome, setNome] = useState('');
  const [ips, setIps] = useState('');
  const [vence, setVence] = useState(diasAFrente(30));
  const [busy, setBusy] = useState(false);
  const lista = ips.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const hoje = diasAFrente(0);
  const max = diasAFrente(MAX_DIAS - 1);
  const venceOk = !!vence && vence > hoje && vence <= max;
  const valido = nome.trim() !== '' && lista.length > 0 && lista.length <= 20 && venceOk;

  const criar = async () => {
    setBusy(true);
    try {
      const { chave } = await chavesMestrasApi.criar({ nome: nome.trim(), ips: lista, expiraEm: new Date(`${vence}T23:59:59`).toISOString() });
      onCriada(chave);
    } catch (e: any) {
      toast(e.message || String(e), { tone: 'crit' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Nova chave mestra" width="max-w-xl" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!valido} onClick={criar}>Gerar chave</Button></>}>
      <FormGroup>
        <Field label="Nome" required><Input autoFocus value={nome} maxLength={80} placeholder="Ex.: Suporte, BI interno" onChange={(e) => setNome(e.target.value)} /></Field>
        <Field label="IPs permitidos" required hint="Um por linha ou separados por vírgula. IP solto ou faixa (10.0.0.0/24). Até 20.">
          <Textarea rows={3} value={ips} placeholder="200.141.18.98" onChange={(e) => setIps(e.target.value)} />
        </Field>
        <Field label="Vence em" required hint={`No máximo ${MAX_DIAS} dias`} error={vence && !venceOk ? `Escolha uma data entre amanhã e ${fmtD(max + 'T12:00')}` : undefined}>
          <DateInput type="date" value={vence} min={diasAFrente(1)} max={max} onChange={(e) => setVence(e.target.value)} />
        </Field>
      </FormGroup>
    </Modal>
  );
}

function AcessosModal({ chave, onClose }: { chave: ChaveMestra; onClose: () => void }) {
  const { data, error, loading } = useAdminQuery(() => chavesMestrasApi.acessos(chave.id), [chave.id]);
  return (
    <Modal open onClose={onClose} title={`Acessos de "${chave.nome}"`} width="max-w-3xl" footer={<Button variant="quiet" onClick={onClose}>Fechar</Button>}>
      {error && <Callout tone="crit">Não foi possível carregar os acessos: {error}</Callout>}
      <Table minWidth={640} dense loading={loading && !data} align={['left', 'left', 'left', 'left', 'right']}
        head={['Quando', 'Cliente', 'Rota', 'IP', 'Status']} empty="Esta chave ainda não foi usada."
        rows={(data ?? []).map((a) => [
          <span className="text-small num">{fmtDT(a.criado_em)}</span>,
          <span className="text-small">{a.client_name ?? (a.client_id ? a.client_id : 'Lista de clientes')}</span>,
          <span className="text-small font-mono break-all">{a.rota}</span>,
          <span className="text-small num">{a.ip ?? '—'}</span>,
          <Badge tone={a.status < 300 ? 'green' : a.status < 500 ? 'orange' : 'red'}>{a.status}</Badge>,
        ])} />
      <p className="text-caption text-ink-2 mt-tight">Os 200 acessos mais recentes.</p>
    </Modal>
  );
}
