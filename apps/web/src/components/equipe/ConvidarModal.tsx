import { useState } from 'react';
import { Button, Field, Input, Modal, Radio, toast } from '../ui';
import { equipeApi, type Entrega, type PerfilAcesso } from '../../lib/localleApi';
import { opcoesDePerfil } from './perfis';

export function ConvidarModal({ perfis, onClose, onDone }: { perfis: PerfilAcesso[]; onClose: () => void; onDone: (r: Entrega, email: string) => void }) {
  const [email, setEmail] = useState('');
  const [perfil, setPerfil] = useState('gestor');
  const [busy, setBusy] = useState(false);
  const enviar = async () => {
    setBusy(true);
    try { const r = await equipeApi.convidar(email.trim().toLowerCase(), perfil); onClose(); onDone(r, r.email); }
    catch (e: any) { toast(e.message || String(e), { tone: 'crit' }); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Convidar pessoa" width="max-w-xl" footer={<><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!email.includes('@')} onClick={enviar}>Enviar convite</Button></>}>
      <Field label="E-mail"><Input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <div role="radiogroup" aria-label="Perfil de acesso" className="flex flex-col gap-2">
        {opcoesDePerfil(perfis).map((o) => <Radio key={o.value} name="perfil" label={o.label} description={o.desc} checked={perfil === o.value} onChange={() => setPerfil(o.value)} />)}
      </div>
      <p className="text-caption text-ink-2">A pessoa recebe um link para criar a própria senha; ninguém mais conhece a senha dela. O que cada perfil pode fazer é ajustado nesta tela, em Perfis e permissões.</p>
    </Modal>
  );
}
