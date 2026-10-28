// Resultado de um convite (equipe do cliente, equipe da Localle, admin de cliente): com SMTP o e-mail sai e
// basta avisar; sem SMTP (ou falha no envio) a API devolve o link de uso único para quem convidou repassar
// por outro meio (WhatsApp, por exemplo). O link dá acesso à conta convidada — não deixar à vista de terceiros.
import { Button, Modal, Input, toast } from './ui';

export function ConviteLink({ email, link, onClose }: { email: string; link: string; onClose: () => void }) {
  const copiar = async () => {
    try { await navigator.clipboard.writeText(link); toast('Link copiado.'); }
    catch { toast('Não foi possível copiar; selecione o link e copie manualmente.', { tone: 'crit' }); }
  };
  return (
    <Modal open onClose={onClose} title="Convite criado" width="max-w-xl" footer={<><Button variant="quiet" onClick={onClose}>Fechar</Button><Button onClick={copiar}>Copiar link</Button></>}>
      <p className="text-body">O e-mail não pôde ser enviado agora. Envie este link para <span className="font-medium">{email}</span> por outro meio, por exemplo WhatsApp:</p>
      <Input readOnly value={link} className="font-mono text-small" onFocus={(e) => e.currentTarget.select()} />
      <p className="text-caption text-ink-2">O link é de uso único e expira. Quem abrir o link cria a senha desta conta, então envie só para a própria pessoa.</p>
    </Modal>
  );
}

/** Depois de convidar/reenviar: avisa que o e-mail saiu, ou abre o link para repassar. */
export function avisarEntrega(r: { conviteEnviado: boolean; link: string | null }, email: string, abrirLink: (v: { email: string; link: string }) => void) {
  if (r.conviteEnviado) toast(`Convite enviado para ${email}.`);
  else if (r.link) abrirLink({ email, link: r.link });
  else toast('Convite criado, mas o e-mail não foi enviado.', { tone: 'crit' });
}
