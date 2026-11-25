// Estado dos filtros comuns das telas de relatório: período, grupo, veículo e busca. Cada tela soma os filtros próprios
// (velocidade mínima, cerca, raio). Regras puras em relatorioFiltros.ts.
import { useRef, useState } from 'react';
import { hadTracker, operatedIn } from '@localle/shared/assetStatus';
import { toInputDT } from '@localle/shared/utils';
import { useStore } from './store';
import { casaBusca } from './busca';
import { camposDoVeiculo, instante, textoFiltros, veiculosDoGrupo } from './relatorioFiltros';

const inicioDeHoje = () => new Date().setHours(0, 0, 0, 0);

export function useFiltrosRelatorio() {
  const all = useStore((s) => s.assets);
  const accessLog = useStore((s) => s.accessLog);
  const groups = useStore((s) => s.groups);

  const [from, setFrom] = useState(() => toInputDT(inicioDeHoje()));
  const [to, setTo] = useState(() => toInputDT(Date.now()));
  const [grp, setGrpRaw] = useState('');
  const [aid, setAid] = useState('');
  const [busca, setBusca] = useState('');

  // campo apagado ou incompleto: vale o último instante válido. A reserva precisa ser estável — Date.now() mudaria a cada
  // render e a consulta à API (chave com o período) recomeçaria sem parar.
  const ultimo = useRef<{ f: number; t: number } | null>(null);
  if (!ultimo.current) ultimo.current = { f: instante(from, inicioDeHoje()), t: instante(to, Date.now()) };
  const f = instante(from, ultimo.current.f), t = instante(to, ultimo.current.t);
  ultimo.current = { f, t };

  const assets = all.filter((a: any) => hadTracker({ accessLog }, a) && operatedIn(a, f));
  const opcoesVeiculo = veiculosDoGrupo(assets, grp);
  const scope = opcoesVeiculo.filter((a: any) => !aid || a.id === aid);
  // trocar para um grupo que não tem o veículo escolhido solta o veículo (antes a tela ficava vazia sem explicação)
  const setGrp = (g: string) => {
    setGrpRaw(g);
    if (g && aid && !all.find((a: any) => a.id === aid)?.groupIds?.includes(g)) setAid('');
  };
  const grupoNome: string | undefined = groups.find((g: any) => g.id === grp)?.name;
  const veiculo = assets.find((a: any) => a.id === aid);

  return {
    from, setFrom, to, setTo, grp, setGrp, aid, setAid, busca, setBusca, f, t, groups,
    assets, opcoesVeiculo, scope, grupoNome, veiculo,
    /** O veículo casa com a busca (placa, nome ou apelido) e com os campos extras da linha. */
    casa: (a: any, ...extras: (string | null | undefined)[]) => casaBusca(busca, ...camposDoVeiculo(a), ...extras),
    filtrosTxt: (...extras: (string | false | null | undefined)[]) => textoFiltros([`Grupo: ${grupoNome || 'todos'}`, `Veículo: ${veiculo?.name || 'todos'}`, ...extras], busca),
    /** Volta ao período de hoje e limpa grupo, veículo e busca. */
    limpar: () => { setGrpRaw(''); setAid(''); setBusca(''); setFrom(toInputDT(inicioDeHoje())); setTo(toInputDT(Date.now())); },
  };
}
