// Novo acesso da equipe (25/11/2026; antes, convite por e-mail): o admin cria usuário + senha e repassa à pessoa, que
// informa o próprio e-mail no primeiro acesso (components/PrimeiroAcessoEmail.tsx).
import { useState } from 'react';
import { Button, Field, Input, Modal, Radio, toast } from '../ui';
import { equipeApi, type EscopoVeiculos, type PerfilAcesso } from '../../lib/localleApi';
import { ESCOPO_TUDO, EscopoCampos, escopoVazio } from './EscopoVeiculos';
import { opcoesDePerfil } from './perfis';

/** Mesmo formato da API (users_username_formato): 3 a 40, minúsculas, números, ponto, hífen e sublinhado. */
export const USUARIO_VALIDO = /^[a-z0-9][a-z0-9._-]{2,39}$/;
export const normalizarUsuario = (v: string) => v.trim().toLowerCase();

export function NovoAcessoModal({ perfis, onClose, onDone }: { perfis: PerfilAcesso[]; onClose: () => void; onDone: (usuario: string) => void }) {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [perfil, setPerfil] = useState('operador');
  const [escopo, setEscopo] = useState<EscopoVeiculos>(ESCOPO_TUDO);
  const [busy, setBusy] = useState(false);
  const u = normalizarUsuario(usuario);
  const erroUsuario = usuario && !USUARIO_VALIDO.test(u) ? 'De 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado, sem espaço.' : '';
  const erroSenha = senha && senha.length < 8 ? 'Mínimo de 8 caracteres.' : '';
  const pronto = USUARIO_VALIDO.test(u) && senha.length >= 8 && !escopoVazio(escopo);

  const criar = async () => {
    setBusy(true);
    try { await equipeApi.criar({ usuario: u, senha, perfil, escopo }); onClose(); onDone(u); }
    catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Novo acesso" width="max-w-xl"
      footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!pronto} onClick={criar}>Criar acesso</Button></>}>
      <Field label="Usuário" hint={erroUsuario || 'É com ele que a pessoa entra. Ex.: joao.silva'}>
        <Input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={!!erroUsuario} />
      </Field>
      <Field label="Senha" hint={erroSenha || 'Mínimo de 8 caracteres. Repasse à pessoa; no primeiro acesso ela cadastra o e-mail para poder recuperar a senha.'}>
        <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" aria-invalid={!!erroSenha} />
      </Field>
      <div role="radiogroup" aria-label="Perfil de acesso" className="flex flex-col gap-2">
        <span className="text-small font-medium text-ink">Perfil de acesso</span>
        {opcoesDePerfil(perfis).map((o) => <Radio key={o.value} name="perfil" label={o.label} description={o.desc} checked={perfil === o.value} onChange={() => setPerfil(o.value)} />)}
      </div>
      <EscopoCampos value={escopo} onChange={setEscopo} />
    </Modal>
  );
}

export function SenhaModal({ nome, id, onClose }: { nome: string; id: string; onClose: () => void }) {
  const [senha, setSenha] = useState('');
  const [busy, setBusy] = useState(false);
  const salvar = async () => {
    setBusy(true);
    try { await equipeApi.definirSenha(id, senha); toast(`Senha de ${nome} trocada. As sessões abertas dela foram encerradas.`); onClose(); }
    catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Nova senha para ${nome}`} width="max-w-md"
      footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={senha.length < 8} onClick={salvar}>Salvar senha</Button></>}>
      <Field label="Nova senha" hint="Mínimo de 8 caracteres. A pessoa sai de onde estiver logada e entra com a senha nova.">
        <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus autoComplete="new-password" />
      </Field>
    </Modal>
  );
}
