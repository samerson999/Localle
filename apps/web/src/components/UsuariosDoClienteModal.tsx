// Console da Locale · Clientes › Usuários: lista quem acessa a conta do cliente e deixa a Locale definir a senha de
// um usuário (suporte: esqueceu a senha e o e-mail não chega). As sessões abertas do usuário caem na hora.
import { useState } from 'react';
import { Badge, Button, Callout, EmptyState, Field, Input, Modal, Table, TextButton, toast } from './ui';
import { adminApi, useAdminQuery, type AdminClient, type UsuarioDoCliente } from '../lib/localleApi';

const PAPEL: Record<UsuarioDoCliente['role'], string> = { admin: 'Administrador', gestor: 'Gestor', operador: 'Operador' };

export function UsuariosDoClienteModal({ client, onClose }: { client: AdminClient; onClose: () => void }) {
  const { data, error, loading, reload } = useAdminQuery(() => adminApi.usuariosDoCliente(client.id), [client.id]);
  const [redefinindo, setRedefinindo] = useState<UsuarioDoCliente | null>(null);
  const usuarios = data || [];

  if (redefinindo) return <RedefinirSenhaModal client={client} usuario={redefinindo} onClose={() => setRedefinindo(null)} onDone={reload} />;
  return (
    <Modal open onClose={onClose} title={`Usuários · ${client.name}`} width="max-w-2xl" footer={<Button variant="quiet" onClick={onClose}>Fechar</Button>}>
      {error && <Callout tone="crit">Não foi possível carregar os usuários: {error}</Callout>}
      <Table minWidth={520} loading={loading && !data} align={['left', 'left', 'left', 'right']}
        head={['E-mail', 'Perfil', 'Situação', '']}
        emptyState={<EmptyState illustration="ilu-clientes" title="Nenhum usuário" detail="Convide o administrador do cliente." />}
        rows={usuarios.map((u) => [
          <span className="break-all">{u.email}</span>,
          PAPEL[u.role] || u.role,
          !u.ativo ? <Badge tone="gray">Desativado</Badge> : u.pendente ? <Badge tone="orange">Convite pendente</Badge> : <Badge tone="green">Ativo</Badge>,
          <TextButton onClick={() => setRedefinindo(u)}>Redefinir senha</TextButton>,
        ])}
      />
    </Modal>
  );
}

function RedefinirSenhaModal({ client, usuario, onClose, onDone }: { client: AdminClient; usuario: UsuarioDoCliente; onClose: () => void; onDone: () => void }) {
  const [senha, setSenha] = useState('');
  const [repetida, setRepetida] = useState('');
  const [busy, setBusy] = useState(false);
  const curta = senha.length > 0 && senha.length < 8;
  const diferente = repetida.length > 0 && repetida !== senha;
  const salvar = async () => {
    setBusy(true);
    try {
      await adminApi.redefinirSenha(client.id, usuario.id, senha);
      toast(`Senha de ${usuario.email} redefinida.`, { detail: 'Repasse a nova senha ao usuário por um canal seguro.' });
      onDone();
      onClose();
    } catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Redefinir senha · ${usuario.email}`} width="max-w-md"
      footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={senha.length < 8 || senha !== repetida} onClick={salvar}>Redefinir senha</Button></>}>
      <Callout tone="warn">O usuário sai de todas as sessões abertas e passa a entrar com a senha que você definir.{usuario.pendente ? ' O convite pendente deixa de valer.' : ''}</Callout>
      <Field label="Nova senha" hint="Mínimo de 8 caracteres" error={curta ? 'Mínimo de 8 caracteres' : undefined}><Input type="password" autoFocus autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} /></Field>
      <Field label="Repita a senha" error={diferente ? 'As senhas não conferem' : undefined}><Input type="password" autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} /></Field>
    </Modal>
  );
}
