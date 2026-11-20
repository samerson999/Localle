// Setup › Equipe e acessos (20/11/2026; antes a tela /equipe): o admin da conta convida pessoas por e-mail (link de uso
// único; a pessoa cria a própria senha), escolhe o perfil de cada uma, cria perfis próprios e marca o que cada perfil
// vê e faz em cada tela. Rotas /users e /permissions (permissão "permissoes.gerenciar" — na prática, o admin). Novo
// admin só pela Localle.
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Callout, Card, EmptyState, Section, Select, Table, TextButton, toast, confirmAction } from '../ui';
import { useStore } from '../../lib/store';
import { equipeApi, type MembroEquipe, type PerfilAcesso, type PermissaoPapel } from '../../lib/localleApi';
import { mensagemDeErro } from '../../lib/apiErro';
import { ConviteLink, avisarEntrega } from '../ConviteLink';
import { fmtD } from '@localle/shared/utils';
import { ConvidarModal } from './ConvidarModal';
import { MatrizPermissoes } from './MatrizPermissoes';
import { PAPEL, nomeDoPerfil, opcoesDePerfil, perfilDe } from './perfis';

const situacao = (m: MembroEquipe) => (!m.ativo ? { tone: 'red', label: 'Desativado' } : m.pendente ? { tone: 'orange', label: 'Convite pendente' } : { tone: 'green', label: 'Ativo' });

interface Dados { equipe: MembroEquipe[]; papeis: PermissaoPapel[]; perfis: PerfilAcesso[] }

export function EquipeAcessos() {
  const meuEmail = useStore((s) => s.session?.email);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  const [convidando, setConvidando] = useState(false);
  const [link, setLink] = useState<{ email: string; link: string } | null>(null);
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
    if (!(await confirmAction({ title: 'Desativar acesso?', detail: `${m.email} perde o acesso na hora, inclusive em sessões já abertas. Dá para reativar depois.`, confirmLabel: 'Desativar' }))) return;
    acao(() => equipeApi.desativar(m.id), 'Acesso desativado.');
  };
  const reenviar = async (m: MembroEquipe) => {
    try { avisarEntrega(await equipeApi.reenviarConvite(m.id), m.email, setLink); } catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
  };
  const trocarPerfil = async (m: MembroEquipe, perfil: string) => {
    setTrocando(m.id);
    await acao(() => equipeApi.definirPerfil(m.id, perfil), `Perfil de ${m.email} alterado. Vale a partir da próxima ação da pessoa.`);
    setTrocando('');
  };

  if (/403|permiss/i.test(erro) && !dados) {
    return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Só o administrador da conta gerencia a equipe" detail="Peça ao administrador da sua empresa para convidar pessoas ou mudar o perfil de acesso." /></Card>;
  }
  const perfis = dados?.perfis ?? [];
  const opcoes = opcoesDePerfil(perfis).map((o) => ({ value: o.value, label: o.label }));

  return (
    <div className="flex flex-col gap-section">
      {erro && <Callout tone="crit">Não foi possível carregar a equipe: {erro}</Callout>}
      <Section title="Pessoas com acesso" actions={<Button onClick={() => setConvidando(true)}>Convidar pessoa</Button>}>
        <Card>
          <Table minWidth={820} loading={!dados && !erro} align={['left', 'left', 'left', 'left', 'right']}
            head={['E-mail', 'Perfil de acesso', 'Situação', 'Desde', '']}
            emptyState={<EmptyState illustration="ilu-equipe" title="Ninguém além de você ainda" action={<Button onClick={() => setConvidando(true)}>Convidar pessoa</Button>} />}
            rows={(dados?.equipe || []).map((m) => {
              const st = situacao(m);
              const eu = m.email === meuEmail;
              return [
                <span className="text-small">{m.email}{eu && <span className="block text-caption text-ink-2">você</span>}</span>,
                m.role === 'admin' || eu
                  ? <span className="text-small">{m.role === 'admin' ? PAPEL.admin.label : nomeDoPerfil(m, perfis)}</span>
                  : <Select className="w-52" aria-label={`Perfil de ${m.email}`} disabled={trocando === m.id} value={perfilDe(m)} options={opcoes} onChange={(e) => trocarPerfil(m, e.target.value)} />,
                <Badge tone={st.tone}>{st.label}</Badge>,
                <span className="num text-small">{fmtD(Date.parse(m.createdAt))}</span>,
                <div className="flex gap-3 justify-end">
                  {m.role !== 'admin' && !eu && m.ativo && m.pendente && <TextButton onClick={() => reenviar(m)}>Reenviar convite</TextButton>}
                  {m.role !== 'admin' && !eu && (m.ativo
                    ? <TextButton tone="danger" onClick={() => desativar(m)}>Desativar</TextButton>
                    : <TextButton onClick={() => acao(() => equipeApi.reativar(m.id), 'Acesso reativado.')}>Reativar</TextButton>)}
                </div>,
              ];
            })}
          />
        </Card>
      </Section>
      <MatrizPermissoes papeis={dados?.papeis ?? null} perfis={perfis} loading={!dados && !erro} error={dados ? erro : ''} onChange={carregar} />
      {convidando && <ConvidarModal perfis={perfis} onClose={() => setConvidando(false)} onDone={(r, email) => { void carregar(); avisarEntrega(r, email, setLink); }} />}
      {link && <ConviteLink email={link.email} link={link.link} onClose={() => setLink(null)} />}
    </div>
  );
}
