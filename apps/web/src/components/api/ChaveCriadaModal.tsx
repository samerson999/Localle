// A chave completa aparece uma única vez, logo depois de criada (o banco guarda só o hash). Mesmo modal para a chave
// do cliente (Setup › API) e a chave mestra (Console).
import { Button, Callout, Input, Modal, toast } from '../ui';

export function ChaveCriadaModal({ chave, titulo = 'Chave criada', onClose }: { chave: string; titulo?: string; onClose: () => void }) {
  const copiar = async () => {
    try { await navigator.clipboard.writeText(chave); toast('Chave copiada.'); }
    catch { toast('Não foi possível copiar; selecione o texto e copie manualmente.', { tone: 'crit' }); }
  };
  return (
    <Modal open onClose={onClose} title={titulo} width="max-w-xl" footer={<><Button variant="quiet" onClick={onClose}>Já guardei</Button><Button onClick={copiar}>Copiar chave</Button></>}>
      <div className="flex flex-col gap-stack">
        <Callout>Copie e guarde a chave agora. Ela não aparece de novo: se perder, revogue e crie outra.</Callout>
        <Input readOnly data-testid="chave-criada" aria-label="Chave de acesso" value={chave} className="font-mono text-small" onFocus={(e) => e.currentTarget.select()} />
      </div>
    </Modal>
  );
}
