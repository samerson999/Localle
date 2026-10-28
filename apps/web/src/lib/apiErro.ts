// Tradução única de falha de rede/HTTP para frase em português que pode ir direto ao toast ou ao Callout.
// Antes cada helper lançava `HTTP 502` ou deixava passar o `Failed to fetch` do navegador.

export const MSG_SEM_CONEXAO = 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
export const MSG_SERVIDOR = 'O servidor não respondeu como esperado. Tente de novo em instantes; se persistir, avise o suporte.';
export const MSG_SESSAO = 'Sessão expirada: entre de novo';

/** Erro de uma resposta HTTP já lida. `data` é o corpo JSON (quando houve); a mensagem da API vale para 4xx. */
export function erroHttp(status: number, data?: unknown): Error {
  const m = (data as { message?: unknown } | null)?.message;
  const texto = Array.isArray(m) ? m.join('; ') : typeof m === 'string' ? m : '';
  // 503 lançado pela API traz mensagem pensada para a tela ("Não foi possível registrar no Traccar…"); 500 e 502/504
  // (proxy, API reiniciando) seguem com a genérica
  if (status === 503 && texto && !/service unavailable/i.test(texto)) return new Error(texto);
  if (status >= 500) return new Error(MSG_SERVIDOR);
  if (texto && !/internal server error/i.test(texto)) return new Error(texto);
  if (status === 403) return new Error('Seu acesso não permite esta ação');
  if (status === 404) return new Error('Registro não encontrado. Pode ter sido removido por outro usuário.');
  if (status === 429) return new Error('Muitas tentativas em pouco tempo. Aguarde um instante.');
  return new Error(`Pedido recusado pelo servidor (código ${status})`);
}

/** Texto para mostrar ao usuário a partir de qualquer coisa rejeitada (Error, TypeError do fetch, string). */
export function mensagemDeErro(e: unknown): string {
  if (e instanceof TypeError || (e instanceof Error && /failed to fetch|networkerror|load failed/i.test(e.message))) return MSG_SEM_CONEXAO;
  if (e instanceof Error) return e.message || MSG_SERVIDOR;
  if (typeof e === 'string' && e) return e;
  return MSG_SERVIDOR;
}

/** `fetch` que converte falha de rede em Error com mensagem legível (o resto do tratamento fica em quem chama). */
export async function fetchOuErro(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new Error(mensagemDeErro(e));
  }
}
