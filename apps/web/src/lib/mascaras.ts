// Máscaras e validação de campos brasileiros. `aplicarMascara` restringe o que pode ser digitado e formata enquanto
// a pessoa digita (é idempotente: aplicar de novo no valor formatado devolve o mesmo); `mascaraValida` diz se o valor
// completo é aceitável. Valor vazio é sempre válido aqui — obrigatoriedade é decisão do formulário, não da máscara.
export type Mascara = 'cpf' | 'cnpj' | 'telefone' | 'placa' | 'cnh' | 'ano' | 'digitos';

import { cnpjValido, cpfValido, soDigitos, telefoneValido } from '@localle/shared/documentos';

export { cnpjValido, cpfValido, soDigitos, telefoneValido };

const agrupa = (d: string, partes: [number, string][]) => {
  let out = '', i = 0;
  for (const [n, sep] of partes) {
    if (i >= d.length) break;
    out += (i > 0 ? sep : '') + d.slice(i, i + n);
    i += n;
  }
  return out;
};

export const formatarCpf = (v: string) => agrupa(soDigitos(v).slice(0, 11), [[3, ''], [3, '.'], [3, '.'], [2, '-']]);
export const formatarCnpj = (v: string) => agrupa(soDigitos(v).slice(0, 14), [[2, ''], [3, '.'], [3, '.'], [4, '/'], [2, '-']]);

// (11) 98765-4321 · (81) 3456-7890 · 0800 123 4567. Sem DDD não é aceito: telefone de motorista e de suporte é
// discado de qualquer lugar do país.
export function formatarTelefone(v: string) {
  const d = soDigitos(v).slice(0, 11);
  if (/^0[358]00/.test(d)) return agrupa(d, [[4, ''], [3, ' '], [4, ' ']]);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  const local = d.slice(2);
  const corte = local.length > 8 ? 5 : 4;
  return `(${d.slice(0, 2)}) ${local.length > corte ? `${local.slice(0, corte)}-${local.slice(corte)}` : local}`;
}

// Placa antiga (ABC1234) e Mercosul (ABC1D23), sem hífen — é o formato já gravado nos ativos. Cada posição só aceita
// o tipo de caractere que cabe nela: 3 letras, 1 dígito, letra ou dígito, 2 dígitos.
const POS_PLACA = [/[A-Z]/, /[A-Z]/, /[A-Z]/, /\d/, /[A-Z\d]/, /\d/, /\d/];
export function formatarPlaca(v: string) {
  let out = '';
  for (const c of (v || '').toUpperCase().replace(/[^A-Z\d]/g, '')) {
    if (out.length === 7) break;
    if (POS_PLACA[out.length].test(c)) out += c;
  }
  return out;
}

// Ano de fabricação/modelo: "2024" ou "2024/2025".
export const formatarAno = (v: string) => agrupa(soDigitos(v).slice(0, 8), [[4, ''], [4, '/']]);

export function aplicarMascara(m: Mascara, v: string, maxDigitos?: number) {
  switch (m) {
    case 'cpf': return formatarCpf(v);
    case 'cnpj': return formatarCnpj(v);
    case 'telefone': return formatarTelefone(v);
    case 'placa': return formatarPlaca(v);
    case 'ano': return formatarAno(v);
    case 'cnh': return soDigitos(v).slice(0, 11);
    case 'digitos': return maxDigitos ? soDigitos(v).slice(0, maxDigitos) : soDigitos(v);
  }
}

export const placaValida = (v: string) => /^[A-Z]{3}\d[A-Z\d]\d{2}$/.test((v || '').toUpperCase());

export function mascaraValida(m: Mascara, v: string, maxDigitos?: number) {
  if (!v) return true;
  switch (m) {
    case 'cpf': return cpfValido(v);
    case 'cnpj': return cnpjValido(v);
    case 'telefone': return telefoneValido(v);
    case 'placa': return placaValida(v);
    case 'ano': return /^\d{4}(\/\d{4})?$/.test(v);
    case 'cnh': return /^\d{9,11}$/.test(v); // mesma regra da API (motoristas.controller)
    case 'digitos': return /^\d+$/.test(v) && (!maxDigitos || v.length <= maxDigitos);
  }
}

export const MENSAGEM_INVALIDA: Record<Mascara, string> = {
  cpf: 'CPF inválido: confira os dígitos.',
  cnpj: 'CNPJ inválido: confira os dígitos.',
  telefone: 'Telefone inválido: informe DDD e número.',
  placa: 'Placa inválida: use ABC1234 ou ABC1D23.',
  cnh: 'CNH precisa ter de 9 a 11 dígitos.',
  ano: 'Use 2024 ou 2024/2025.',
  digitos: 'Use só números.',
};

// Teclado do celular e tamanho máximo de cada máscara.
export const ATRIBUTOS_MASCARA: Record<Mascara, { inputMode: 'numeric' | 'tel' | 'text'; maxLength?: number; placeholder?: string; autoCapitalize?: string }> = {
  cpf: { inputMode: 'numeric', maxLength: 14, placeholder: '000.000.000-00' },
  cnpj: { inputMode: 'numeric', maxLength: 18, placeholder: '00.000.000/0000-00' },
  telefone: { inputMode: 'tel', maxLength: 15, placeholder: '(00) 00000-0000' },
  placa: { inputMode: 'text', maxLength: 7, placeholder: 'ABC1D23', autoCapitalize: 'characters' },
  cnh: { inputMode: 'numeric', maxLength: 11 },
  ano: { inputMode: 'numeric', maxLength: 9, placeholder: '2024/2025' },
  digitos: { inputMode: 'numeric' },
};
