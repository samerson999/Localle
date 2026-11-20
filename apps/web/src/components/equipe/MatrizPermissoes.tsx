import { useState } from 'react';
import { Callout, Card, Check, Section, Table, TextButton, Button, toast, confirmAction } from '../ui';
import { equipeApi, type PerfilAcesso, type PermissaoPapel } from '../../lib/localleApi';
import { PAPEL } from './perfis';
import { PerfilModal } from './PerfilModal';

type Coluna = { id: string; label: string; perfil?: PerfilAcesso; role?: PermissaoPapel['role'] };

/**
 * Uma linha por permissão (agrupadas pela tela onde agem) e uma coluna por perfil: os três embutidos e os próprios do
 * cliente. Cada caixa salva na hora. Administrador é fixo; permissão travada pela Localle aparece sem caixa.
 */
export function MatrizPermissoes({ papeis, perfis, loading, error, onChange }: {
  papeis: PermissaoPapel[] | null; perfis: PerfilAcesso[]; loading: boolean; error: string; onChange: () => Promise<unknown> | void;
}) {
  const [salvando, setSalvando] = useState('');
  const [editando, setEditando] = useState<PerfilAcesso | 'novo' | null>(null);

  const linhas = [...new Map((papeis || []).map((p) => [p.key, p])).values()].sort((a, b) => a.tela.localeCompare(b.tela, 'pt-BR'));
  const colunas: Coluna[] = [
    ...(['admin', 'gestor', 'operador'] as const).map((r) => ({ id: r, label: PAPEL[r].label, role: r })),
    ...perfis.map((p) => ({ id: p.id, label: p.nome, perfil: p })),
  ];

  const mudar = async (id: string, fn: () => Promise<unknown>) => {
    setSalvando(id);
    try { await fn(); await onChange(); } catch (e: any) { toast('Permissão não alterada: ' + (e.message || e), { tone: 'crit' }); } finally { setSalvando(''); }
  };
  const excluir = async (p: PerfilAcesso) => {
    if (p.usuarios > 0) { toast(`Mova as ${p.usuarios} pessoa(s) de ${p.nome} para outro perfil antes de excluí-lo.`, { tone: 'crit' }); return; }
    if (!(await confirmAction({ title: `Excluir o perfil ${p.nome}?`, detail: 'O perfil e as permissões dele deixam de existir. Fica registrado no histórico.', confirmLabel: 'Excluir' }))) return;
    mudar(`del:${p.id}`, () => equipeApi.excluirPerfil(p.id));
  };

  const celula = (key: string, c: Coluna) => {
    const id = `${c.id}:${key}`;
    if (c.role) {
      const p = papeis?.find((x) => x.key === key && x.role === c.role);
      if (!p) return '—';
      if (c.role === 'admin' || !p.editableByClient) return <span className="text-small text-ink-2">{p.allowed ? 'Sim' : 'Não'}{!p.editableByClient && c.role !== 'admin' ? ' · fixo' : ''}</span>;
      const role = c.role;
      return (
        <span className="inline-flex items-center gap-tight">
          <Check aria-label={`${p.label} para ${c.label}`} checked={p.allowed} disabled={salvando === id} onChange={(v) => mudar(id, () => equipeApi.definirPermissao(role, key, v))} />
          {p.origin === 'cliente' && <TextButton disabled={salvando === id} onClick={() => mudar(id, () => equipeApi.restaurarPermissao(role, key))}>Padrão</TextButton>}
        </span>
      );
    }
    const perfil = c.perfil!;
    const p = perfil.permissoes.find((x) => x.key === key);
    if (!p) return '—';
    if (!p.editableByClient) return <span className="text-small text-ink-2">{p.allowed ? 'Sim' : 'Não'} · fixo</span>;
    const label = linhas.find((l) => l.key === key)?.label ?? key;
    return <Check aria-label={`${label} para ${c.label}`} checked={p.allowed} disabled={salvando === id} onChange={(v) => mudar(id, () => equipeApi.definirDoPerfil(perfil.id, key, v))} />;
  };

  const cabecalho = (c: Coluna) => (c.perfil
    ? <span className="inline-flex flex-col items-start gap-hair">
        <span>{c.label}</span>
        <span className="inline-flex gap-tight text-caption font-normal">
          <TextButton onClick={() => setEditando(c.perfil!)}>Editar</TextButton>
          <TextButton tone="danger" disabled={salvando === `del:${c.id}`} onClick={() => excluir(c.perfil!)}>Excluir</TextButton>
        </span>
      </span>
    : c.label);

  return (
    <Section title="Perfis e permissões" actions={<Button variant="quiet" onClick={() => setEditando('novo')}>Novo perfil</Button>}>
      <Card>
        {error && <Callout tone="crit" className="mb-card-head">Não foi possível carregar as permissões: {error}</Callout>}
        <p className="text-small text-ink-2 mb-card-head">
          Cada perfil diz o que a pessoa vê e faz em cada tela. Vale na hora para todas as pessoas do perfil. "Padrão" volta ao que a plataforma define; o Administrador tem acesso fixo.
        </p>
        <Table minWidth={320 + 150 * colunas.length} pageSize={100} card={false} loading={loading && !papeis}
          head={['Permissão', ...colunas.map(cabecalho)]} align={['left', ...colunas.map(() => 'left' as const)]}
          rows={linhas.map((l, i) => [
            <span className="flex flex-col gap-hair">
              {(i === 0 || linhas[i - 1].tela !== l.tela) && <span className="text-caption uppercase tracking-wide text-ink-2">{l.tela}</span>}
              <span className="font-medium">{l.label}</span>
            </span>,
            ...colunas.map((c) => celula(l.key, c)),
          ])} />
      </Card>
      {editando && <PerfilModal perfil={editando === 'novo' ? undefined : editando} perfis={perfis} onClose={() => setEditando(null)} onDone={onChange} />}
    </Section>
  );
}
