// Setup › Equipe e acessos (20/11/2026; antes a tela /equipe). Desde 25/11/2026 sem convite por e-mail: o admin da conta
// cria o acesso com usuário + senha, escolhe o perfil e os veículos que a pessoa vê (grupos/operações), ativa, desativa,
// troca a senha e exclui. A pessoa informa o próprio e-mail no primeiro acesso. Também cria perfis próprios e marca o
// que cada perfil vê e faz em cada tela. Rotas /users e /permissions (permissão "permissoes.gerenciar" — na prática, o
// admin). Novo admin só pela Localle.
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Callout, Card, EmptyState, Menu, Section, Select, Table, TextButton, toast, confirmAction, type MenuItem } from '../ui';
import { useStore } from '../../lib/store';
import { equipeApi, type MembroEquipe, type PerfilAcesso, type PermissaoPapel } from '../../lib/localleApi';
import { mensagemDeErro } from '../../lib/apiErro';
import { fmtD } from '@localle/shared/utils';
import { EscopoModal, useResumoDoEscopo } from './EscopoVeiculos';
import { MatrizPermissoes } from './MatrizPermissoes';
import { NovoAcessoModal, SenhaModal } from './NovoAcessoModal';
import { PAPEL, nomeDoPerfil, opcoesDePerfil, perfilDe } from './perfis';

const situacao = (m: MembroEquipe) => (!m.ativo ? { tone: 'red', label: 'Desativado' } : m.pendente ? { tone: 'orange', label: 'Sem senha' } : { tone: 'green', label: 'Ativo' });
const nomeDe = (m: MembroEquipe) => m.usuario || m.email || '—';

interface Dados { equipe: MembroEquipe[]; papeis: PermissaoPapel[]; perfis: PerfilAcesso[] }

export function EquipeAcessos() {
  const meuLogin = useStore((s) => s.session?.email);
  const resumo = useResumoDoEscopo();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [criando, setCriando] = useState(false);
  const [escopoDe, setEscopoDe] = useState<MembroEquipe | null>(null);
  const [senhaDe, setSenhaDe] = useState<MembroEquipe | null>(null);
  const [trocando, setTrocando] = useState('');

  // devolve a promessa: quem altera espera a tabela nova antes de soltar a caixa (sem piscar o valor antigo)
  const carregar = useCallback(() => Promise.all([equipeApi.listar(), equipeApi.permissoes(), equipeApi.perfis()])
    .then(([equipe, papeis, perfis]) => { setDados({ equipe, papeis, perfis }); setErro(''); })
    .catch((e) => setErro(mensagemDeErro(e))), []);
  useEffect(() => { void carregar(); }, [carregar]);

  const acao = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast(ok); await carregar(); } catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
  };
  const desativar = async (m: MembroEquipe) => {
    if (!(await confirmAction({ title: 'Desativar acesso?', detail: `${nomeDe(m)} perde o acesso na hora, inclusive em sessões já abertas. Dá para reativar depois.`, confirmLabel: 'Desativar' }))) return;
    acao(() => equipeApi.desativar(m.id), 'Acesso desativado.');
  };
  const excluir = async (m: MembroEquipe) => {
    if (!(await confirmAction({ title: `Excluir ${nomeDe(m)}?`, detail: 'A pessoa perde o acesso na hora e sai da lista. O que ela já registrou (comandos, alertas tratados) continua no histórico com o nome dela. Não dá para desfazer.', confirmLabel: 'Excluir' }))) return;
    acao(() => equipeApi.excluir(m.id), `${nomeDe(m)} excluído.`);
  };
  const trocarPerfil = async (m: MembroEquipe, perfil: string) => {
    setTrocando(m.id);
    await acao(() => equipeApi.definirPerfil(m.id, perfil), `Perfil de ${nomeDe(m)} alterado. Vale a partir da próxima ação da pessoa.`);
    setTrocando('');
  };

  if (/403|permiss/i.test(erro) && !dados) {
    return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Só o administrador da conta gerencia a equipe" detail="Peça ao administrador da sua empresa para criar acessos ou mudar o perfil de acesso." /></Card>;
  }
  const perfis = dados?.perfis ?? [];
  const opcoes = opcoesDePerfil(perfis).map((o) => ({ value: o.value, label: o.label }));

  return (
    <div className="flex flex-col gap-section">
      {erro && <Callout tone="crit">Não foi possível carregar a equipe: {erro}</Callout>}
      <Section title="Pessoas com acesso" actions={<Button onClick={() => setCriando(true)}>Novo acesso</Button>}>
        <Card>
          <Table minWidth={960} loading={!dados && !erro} align={['left', 'left', 'left', 'left', 'left', 'right']}
            head={['Usuário', 'Perfil de acesso', 'Veículos', 'Situação', 'Desde', '']}
            emptyState={<EmptyState illustration="ilu-equipe" title="Ninguém além de você ainda" action={<Button onClick={() => setCriando(true)}>Novo acesso</Button>} />}
            rows={(dados?.equipe || []).map((m) => {
              const st = situacao(m);
              const eu = !!meuLogin && (m.email === meuLogin || m.usuario === meuLogin);
              const editavel = m.role !== 'admin' && !eu;
              const menu: MenuItem[] = [
                { label: 'Trocar senha', icon: 'cadeado', onClick: () => setSenhaDe(m) },
                m.ativo ? { label: 'Desativar', danger: true, onClick: () => void desativar(m) } : { label: 'Reativar', onClick: () => void acao(() => equipeApi.reativar(m.id), 'Acesso reativado.') },
                { label: 'Excluir', danger: true, onClick: () => void excluir(m) },
              ];
              return [
                <span className="text-small">
                  {nomeDe(m)}
                  {eu && <span className="block text-caption text-ink-2">você</span>}
                  {!eu && m.usuario && <span className="block text-caption text-ink-2">{m.email || 'E-mail ainda não cadastrado'}</span>}
                </span>,
                editavel
                  ? <Select className="w-52" aria-label={`Perfil de ${nomeDe(m)}`} disabled={trocando === m.id} value={perfilDe(m)} options={opcoes} onChange={(e) => trocarPerfil(m, e.target.value)} />
                  : <span className="text-small">{m.role === 'admin' ? PAPEL.admin.label : nomeDoPerfil(m, perfis)}</span>,
                m.role === 'admin'
                  ? <span className="text-small text-ink-2">Todos os veículos</span>
                  : <span className="flex flex-col items-start gap-0.5 text-small max-w-64">
                      <span className="truncate max-w-full" title={resumo(m.escopo)}>{resumo(m.escopo)}</span>
                      {editavel && <TextButton onClick={() => setEscopoDe(m)}>Alterar</TextButton>}
                    </span>,
                <Badge tone={st.tone}>{st.label}</Badge>,
                <span className="num text-small">{fmtD(Date.parse(m.createdAt))}</span>,
                <div className="flex justify-end">{editavel && <Menu label={`Ações de ${nomeDe(m)}`} items={menu} />}</div>,
              ];
            })}
          />
        </Card>
      </Section>
      <MatrizPermissoes papeis={dados?.papeis ?? null} perfis={perfis} loading={!dados && !erro} error={dados ? erro : ''} onChange={carregar} />
      {criando && <NovoAcessoModal perfis={perfis} onClose={() => setCriando(false)} onDone={(u) => { toast(`Acesso de ${u} criado. Repasse o usuário e a senha à pessoa.`); void carregar(); }} />}
      {escopoDe && <EscopoModal membro={escopoDe} onClose={() => setEscopoDe(null)} onDone={() => void carregar()} />}
      {senhaDe && <SenhaModal nome={nomeDe(senhaDe)} id={senhaDe.id} onClose={() => setSenhaDe(null)} />}
    </div>
  );
}
