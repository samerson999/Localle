// Quais veículos a pessoa vê (Setup › Equipe, 25/11/2026): a frota toda ou só os grupos e operações marcados, mais os
// veículos que não estão em grupo nenhum nem têm operação. Quem decide é a API (apps/api/src/escopo): o que estiver
// fora some do mapa, dos relatórios, dos alertas e dos módulos.
import { useState } from 'react';
import { Button, Check, Modal, Radio, toast } from '../ui';
import { useStore } from '../../lib/store';
import { equipeApi, type EscopoVeiculos, type MembroEquipe } from '../../lib/localleApi';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ESCOPO_TUDO: EscopoVeiculos = { restrito: false, semGrupo: false, grupoIds: [], operacaoIds: [] };

/** Restrito sem nada marcado não vê veículo nenhum — a API recusa; a tela avisa antes. */
export const escopoVazio = (e: EscopoVeiculos) => e.restrito && !e.semGrupo && e.grupoIds.length === 0 && e.operacaoIds.length === 0;

/** Grupos e operações já salvos na API (os criados só no navegador ainda não têm id dela). */
function useOpcoesDeEscopo() {
  const groups = useStore((s) => s.groups) as { id: string; name: string }[];
  const operations = useStore((s) => s.operations) as { id: string; name: string }[] | undefined;
  return {
    grupos: groups.filter((g) => UUID.test(g.id)),
    operacoes: (operations || []).filter((o) => UUID.test(o.id)),
  };
}

export function resumoDoEscopo(e: EscopoVeiculos, grupos: { id: string; name: string }[], operacoes: { id: string; name: string }[]): string {
  if (!e.restrito) return 'Todos os veículos';
  const nomes = [
    ...e.grupoIds.map((id) => grupos.find((g) => g.id === id)?.name).filter(Boolean),
    ...e.operacaoIds.map((id) => operacoes.find((o) => o.id === id)?.name).filter(Boolean),
    ...(e.semGrupo ? ['Sem grupo/operação'] : []),
  ];
  return nomes.length ? nomes.join(', ') : 'Nenhum veículo';
}

export function useResumoDoEscopo() {
  const { grupos, operacoes } = useOpcoesDeEscopo();
  return (e: EscopoVeiculos) => resumoDoEscopo(e, grupos, operacoes);
}

export function EscopoCampos({ value, onChange }: { value: EscopoVeiculos; onChange: (e: EscopoVeiculos) => void }) {
  const { grupos, operacoes } = useOpcoesDeEscopo();
  const alternar = (campo: 'grupoIds' | 'operacaoIds', id: string, marcado: boolean) =>
    onChange({ ...value, [campo]: marcado ? [...value[campo], id] : value[campo].filter((x) => x !== id) });

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-small font-medium text-ink mb-2">Veículos que a pessoa vê</legend>
      <div role="radiogroup" aria-label="Veículos que a pessoa vê" className="flex flex-col gap-2">
        <Radio name="escopo" label="Todos os veículos" checked={!value.restrito} onChange={() => onChange(ESCOPO_TUDO)} />
        <Radio name="escopo" label="Só alguns grupos ou operações" description="O que ficar de fora some do mapa, dos relatórios, dos alertas e dos módulos." checked={value.restrito} onChange={() => onChange({ ...value, restrito: true })} />
      </div>
      {value.restrito && (
        <div className="flex flex-col gap-2 rounded-ctl border border-line p-3 max-h-72 overflow-y-auto">
          {grupos.length === 0 && operacoes.length === 0 && <p className="text-small text-ink-2">Nenhum grupo ou operação cadastrado ainda. Cadastre em Setup › Frota.</p>}
          {grupos.length > 0 && <span className="text-caption text-ink-2">Grupos</span>}
          {grupos.map((g) => <Check key={g.id} label={g.name} checked={value.grupoIds.includes(g.id)} onChange={(v) => alternar('grupoIds', g.id, v)} />)}
          {operacoes.length > 0 && <span className="text-caption text-ink-2 mt-1">Operações</span>}
          {operacoes.map((o) => <Check key={o.id} label={o.name} checked={value.operacaoIds.includes(o.id)} onChange={(v) => alternar('operacaoIds', o.id, v)} />)}
          <span className="border-t border-line my-1" />
          <Check label="Veículos sem grupo ou operação" description="Os que não estão em nenhum grupo e não têm operação." checked={value.semGrupo} onChange={(v) => onChange({ ...value, semGrupo: v })} />
        </div>
      )}
      {escopoVazio(value) && <p role="alert" className="text-small text-crit-ink">Marque ao menos um grupo, uma operação ou "Veículos sem grupo ou operação".</p>}
    </fieldset>
  );
}

export function EscopoModal({ membro, onClose, onDone }: { membro: MembroEquipe; onClose: () => void; onDone: () => void }) {
  const [escopo, setEscopo] = useState<EscopoVeiculos>(membro.escopo);
  const [busy, setBusy] = useState(false);
  const salvar = async () => {
    setBusy(true);
    try { await equipeApi.definirEscopo(membro.id, escopo); toast('Veículos visíveis atualizados. Vale a partir da próxima ação da pessoa.'); onClose(); onDone(); }
    catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Veículos de ${membro.usuario || membro.email}`} width="max-w-xl"
      footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={escopoVazio(escopo)} onClick={salvar}>Salvar</Button></>}>
      <EscopoCampos value={escopo} onChange={setEscopo} />
    </Modal>
  );
}
