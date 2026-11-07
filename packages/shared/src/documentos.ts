// Validação de documentos e telefone brasileiros. Usada pelo front (máscaras dos campos, apps/web/src/lib/mascaras.ts)
// e pela API (motoristas, combustível, chips), para as duas pontas recusarem o mesmo valor.
export const soDigitos = (v: string) => (v || '').replace(/\D/g, '');

export function cpfValido(v: string) {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +d[9] && dv(10) === +d[10];
}

export function cnpjValido(v: string) {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n: number) => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += +d[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === +d[12] && dv(13) === +d[13];
}

// Com DDD: fixo (10 dígitos, começa em 2–5) ou celular (11, começa em 9); 0300/0500/0800 com 11 dígitos.
export function telefoneValido(v: string) {
  const d = soDigitos(v);
  if (/^0[358]00/.test(d)) return d.length === 11;
  if (d.length !== 10 && d.length !== 11) return false;
  if (+d.slice(0, 2) < 11) return false; // DDDs começam em 11
  return d.length === 10 ? /^[2-5]/.test(d[2]) : d[2] === '9';
}
