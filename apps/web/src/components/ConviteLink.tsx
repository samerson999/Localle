// Resultado de um convite (equipe do cliente, equipe da Localle, admin de cliente): com SMTP o e-mail sai e
// basta avisar; sem SMTP (ou falha no envio) a API devolve o código (usuário de cliente) ou o link (equipe da
// Localle) para quem convidou repassar por outro meio (WhatsApp, por exemplo). Os dois dão acesso à conta
// convidada — não deixar à vista de terceiros.
import type { Entrega } from '../lib/localleApi';
import { Button, Modal, Input, toast } from './ui';

export interface EntregaPendente { email: string; codigo?: string | null; link?: string | null }

/** Tela onde o convidado digita o código, com o e-mail já preenchido. */
export const enderecoPrimeiroAcesso = (email: string) =>
  `${window.location.origin}${window.location.pathname}#/primeiro-acesso?email=${encodeURIComponent(email)}`;

export function ConviteLink({ email, codigo, link, onClose }: EntregaPendente & { onClose: () => void }) {
  const endereco = codigo ? enderecoPrimeiroAcesso(email) : link ?? '';
  const texto = codigo ? `Seu código de acesso: ${codigo}\nCrie sua senha em: ${endereco}` : endereco;
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); toast(codigo ? 'Código e endereço copiados.' : 'Link copiado.'); }
    catch { toast('Não foi possível copiar; selecione o texto e copie manualmente.', { tone: 'crit' }); }
  };
  return (
    <Modal open onClose={onClose} title="Convite criado" width="max-w-xl" footer={<><Button variant="quiet" onClick={onClose}>Fechar</Button><Button onClick={copiar}>{codigo ? 'Copiar código e endereço' : 'Copiar link'}</Button></>}>
      {codigo ? <>
        <p className="text-body">O e-mail não pôde ser enviado agora. Envie este código para <span className="font-medium">{email}</span> por outro meio, por exemplo WhatsApp:</p>
        <p className="text-center text-title font-semibold num tracking-[0.3em] py-2" aria-label={`Código ${codigo.split('').join(' ')}`}>{codigo}</p>
        <p className="text-small text-ink-2">A pessoa digita o código em:</p>
        <Input readOnly value={endereco} className="font-mono text-small" onFocus={(e) => e.currentTarget.select()} />
        <p className="text-caption text-ink-2">O código é de uso único e expira em 48 horas. Quem tiver o código cria a senha desta conta, então envie só para a própria pessoa.</p>
      </> : <>
        <p className="text-body">O e-mail não pôde ser enviado agora. Envie este link para <span className="font-medium">{email}</span> por outro meio, por exemplo WhatsApp:</p>
        <Input readOnly value={endereco} className="font-mono text-small" onFocus={(e) => e.currentTarget.select()} />
        <p className="text-caption text-ink-2">O link é de uso único e expira. Quem abrir o link cria a senha desta conta, então envie só para a própria pessoa.</p>
      </>}
    </Modal>
  );
}

/** Depois de convidar/reenviar: avisa que o e-mail saiu, ou abre o código/link para repassar. */
export function avisarEntrega(r: Entrega, email: string, abrir: (v: EntregaPendente) => void) {
  if (r.conviteEnviado) toast(`Convite enviado para ${email}.`);
  else if (r.codigo || r.link) abrir({ email, codigo: r.codigo, link: r.link });
  else toast('Convite criado, mas o e-mail não foi enviado.', { tone: 'crit' });
}
