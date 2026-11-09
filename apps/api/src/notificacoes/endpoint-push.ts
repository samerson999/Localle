/**
 * Achado do `security-review` (09/11/2026): aceitar qualquer `https://` como `endpoint` de push deixa o
 * worker (`notificacoes.worker.ts`) fazer uma requisição de saída para um host arbitrário escolhido pelo
 * usuário — SSRF contra a rede interna (Postgres, Traccar, Redis), sem precisar de acesso de rede direto.
 * `endpoint` só pode ser mesmo o serviço de push do navegador do usuário, nunca outra coisa — por isso a
 * validação é por allowlist de host (sufixo exato), não "parece uma URL https válida".
 */
const HOSTS_PERMITIDOS = [
  'fcm.googleapis.com', // Chrome/Edge (Chromium) e Android
  'android.googleapis.com',
  'updates.push.services.mozilla.com', // Firefox
  'notify.windows.com', // Edge legado / WNS — subdomínios tipo wns2-xx.notify.windows.com
  'web.push.apple.com', // Safari
];

function hostPermitido(host: string): boolean {
  const h = host.toLowerCase();
  return HOSTS_PERMITIDOS.some((permitido) => h === permitido || h.endsWith(`.${permitido}`));
}

/** `null` = endpoint válido; string = motivo da recusa (BadRequestException no controller). */
export function validarEndpointPush(endpoint: string): string | null {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return '"endpoint" não é uma URL válida';
  }
  if (url.protocol !== 'https:') return '"endpoint" precisa ser https';
  if (!hostPermitido(url.hostname)) return '"endpoint" não é um serviço de push de navegador reconhecido';
  return null;
}
