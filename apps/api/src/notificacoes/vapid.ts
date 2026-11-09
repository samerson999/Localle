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

export function vapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  const subject = process.env.VAPID_SUBJECT || 'mailto:suporte@localle.com.br';
  return { publicKey, privateKey, subject };
}
