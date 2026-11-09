import { Logger } from '@nestjs/common';

/**
 * Chaves VAPID do canal webpush (docs/PLANO-APK-TWA.md § 2). Em dev/HML sem `VAPID_PUBLIC_KEY`/
 * `VAPID_PRIVATE_KEY` definidas no ambiente, o módulo fica "sem canal configurado": a rota de chave
 * pública devolve 503 em vez de derrubar o processo todo, porque o resto da API não depende de push.
 * Em produção as chaves são geradas uma única vez (Fase 4) e nunca trocadas depois — trocar invalidaria
 * todas as assinaturas já registradas nos aparelhos dos usuários.
 */
export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * `web-push` exige `mailto:...` ou `https://...` (RFC 8292) e lança se não for — achado real em produção
 * (09/11/2026): `VAPID_SUBJECT` configurado só com o e-mail, sem o `mailto:`, derrubava a API inteira na
 * subida (o erro só aparecia dentro do worker, longe de onde a variável foi digitada errado). Validar
 * aqui faz o módulo cair para "inativo" (mesmo caminho de chave ausente), com um log que aponta a causa.
 */
function subjectValido(subject: string): boolean {
  return subject.startsWith('mailto:') || subject.startsWith('https://');
}

export function vapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  const subject = process.env.VAPID_SUBJECT || 'mailto:suporte@localle.com.br';
  if (!subjectValido(subject)) {
    Logger.warn(`VAPID_SUBJECT inválido ("${subject}") — precisa começar com "mailto:" ou "https://"; notificações push ficam inativas`, 'vapid');
    return null;
  }
  return { publicKey, privateKey, subject };
}
