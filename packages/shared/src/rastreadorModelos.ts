// Catálogo de modelos de rastreador (cadastro de rastreadores, decisão de 28/10/2026): cada modelo diz o protocolo do
// Traccar, a porta e que identificador o aparelho manda — o Traccar não expõe essa lista pela API (o protocolo é a
// porta em que o aparelho conecta). Regra usada no cadastro pela API e pela tela.

export const TIPOS_IDENTIFICADOR = ['imei', 'terminal_jt808', 'outro'] as const;
export type TipoIdentificador = (typeof TIPOS_IDENTIFICADOR)[number];

export const ROTULO_IDENTIFICADOR: Record<TipoIdentificador, string> = {
  imei: 'IMEI (15 dígitos)',
  terminal_jt808: 'Número do terminal JT808 (12 ou 20 dígitos)',
  outro: 'Identificador do aparelho',
};

const FORMATO: Record<TipoIdentificador, { re: RegExp; dica: string }> = {
  imei: { re: /^\d{15}$/, dica: 'o IMEI tem 15 dígitos, só números' },
  // JT808-2013: terminal de 6 bytes BCD (12 dígitos); JT808-2019: 10 bytes (20 dígitos). No log do Traccar aparece
  // como "Unknown device - <número>" quando não está cadastrado.
  terminal_jt808: { re: /^(\d{12}|\d{20})$/, dica: 'o número do terminal JT808 tem 12 dígitos (ou 20, na versão 2019), só números' },
  outro: { re: /^[A-Za-z0-9._-]{4,40}$/, dica: 'use de 4 a 40 letras, números, ponto, hífen ou sublinhado' },
};

/** Identificador sem espaços (o que vai para o Traccar como `uniqueId`). */
export const normalizarIdentificador = (valor: string) => valor.replace(/\s+/g, '');

/** `null` = válido para o tipo do modelo; senão, a mensagem para o usuário. */
export function validarIdentificador(tipo: TipoIdentificador, valor: string): string | null {
  const v = normalizarIdentificador(valor);
  if (!v) return 'Informe o identificador do aparelho';
  const f = FORMATO[tipo];
  return f.re.test(v) ? null : `Identificador inválido para este modelo: ${f.dica}`;
}
