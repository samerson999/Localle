// Perfis de acesso da equipe do cliente: os três embutidos (Administrador, Gestor, Operador) e os próprios do cliente
// (Setup › Equipe e acessos). O valor de "perfil" que a API aceita é 'gestor', 'operador' ou o id do perfil próprio.
import type { MembroEquipe, PerfilAcesso } from '../../lib/localleApi';

export const PAPEL: Record<MembroEquipe['role'], { label: string; desc: string }> = {
  admin: { label: 'Administrador', desc: 'Conta da empresa: equipe, permissões e configurações' },
  gestor: { label: 'Gestor', desc: 'Gerencia a frota: cadastros, manutenção, combustível, relatórios' },
  operador: { label: 'Operador', desc: 'Acompanha a operação: monitoramento, alertas e lançamentos do dia a dia' },
};

export interface OpcaoPerfil { value: string; label: string; desc: string }

/** Perfis que o admin pode dar a alguém: Gestor, Operador e os próprios. Nunca Administrador (só pela Localle). */
export function opcoesDePerfil(perfis: PerfilAcesso[]): OpcaoPerfil[] {
  return [
    { value: 'gestor', label: PAPEL.gestor.label, desc: PAPEL.gestor.desc },
    { value: 'operador', label: PAPEL.operador.label, desc: PAPEL.operador.desc },
    ...perfis.map((p) => ({ value: p.id, label: p.nome, desc: p.descricao || `Baseado em ${PAPEL[p.baseRole].label}` })),
  ];
}

/** Valor de perfil de um membro (o próprio, se tiver; senão o papel). */
export const perfilDe = (m: MembroEquipe) => m.perfilId ?? m.role;

export function nomeDoPerfil(m: MembroEquipe, perfis: PerfilAcesso[]): string {
  return (m.perfilId && perfis.find((p) => p.id === m.perfilId)?.nome) || PAPEL[m.role]?.label || m.role;
}
