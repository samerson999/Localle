import { useState } from 'react';
import { Button, Field, Input, Modal, Select, toast } from '../ui';
import { equipeApi, type PerfilAcesso } from '../../lib/localleApi';
import { opcoesDePerfil } from './perfis';

/** Novo perfil (copiando de outro) ou renomear um existente. */
export function PerfilModal({ perfil, perfis, onClose, onDone }: { perfil?: PerfilAcesso; perfis: PerfilAcesso[]; onClose: () => void; onDone: () => void }) {
  const [nome, setNome] = useState(perfil?.nome ?? '');
  const [descricao, setDescricao] = useState(perfil?.descricao ?? '');
  const [copiarDe, setCopiarDe] = useState('operador');
  const [busy, setBusy] = useState(false);
  const salvar = async () => {
    setBusy(true);
    try {
      if (perfil) await equipeApi.renomearPerfil(perfil.id, nome.trim(), descricao.trim());
      else await equipeApi.criarPerfil(nome.trim(), descricao.trim(), copiarDe);
      toast(perfil ? 'Perfil salvo.' : 'Perfil criado. Ajuste as permissões dele na tabela.');
      onClose(); onDone();
    } catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={perfil ? 'Editar perfil' : 'Novo perfil de acesso'} width="max-w-xl"
      footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!nome.trim()} onClick={salvar}>{perfil ? 'Salvar' : 'Criar perfil'}</Button></>}>
      <Field label="Nome"><Input autoFocus maxLength={60} value={nome} placeholder="Ex.: Portaria, Financeiro" onChange={(e) => setNome(e.target.value)} /></Field>
      <Field label="Descrição (opcional)"><Input maxLength={200} value={descricao} placeholder="O que esse perfil faz no dia a dia" onChange={(e) => setDescricao(e.target.value)} /></Field>
      {!perfil && (
        <Field label="Começar com as permissões de">
          <Select aria-label="Começar com as permissões de" value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)} options={opcoesDePerfil(perfis).map((o) => ({ value: o.value, label: o.label }))} />
        </Field>
      )}
    </Modal>
  );
}
