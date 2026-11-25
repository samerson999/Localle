import { BlockList, isIP } from 'node:net';

/** `::ffff:1.2.3.4` (IPv4 numa conexão IPv6) → `1.2.3.4`. */
export function normalizarIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  const s = v4 ? v4[1] : ip;
  return isIP(s) ? s : null;
}

/** O IP está em alguma das faixas CIDR (`1.2.3.4/32`, `10.0.0.0/8`, `2001:db8::/32`)? */
export function ipPermitido(ip: string | null, faixas: string[]): boolean {
  if (!ip) return false;
  const lista = new BlockList();
  for (const f of faixas) {
    const [rede, bits] = f.split('/');
    const familia = isIP(rede) === 6 ? 'ipv6' : 'ipv4';
    lista.addSubnet(rede, Number(bits ?? (familia === 'ipv6' ? 128 : 32)), familia);
  }
  return lista.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4');
}

/** Valida e normaliza uma faixa digitada no Console: IP solto vira /32 (ou /128). `null` se inválida. */
export function faixaValida(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const [rede, bits, ...resto] = v.trim().split('/');
  if (resto.length) return null;
  const fam = isIP(rede);
  if (!fam) return null;
  const max = fam === 6 ? 128 : 32;
  if (bits === undefined) return `${rede}/${max}`;
  if (!/^\d{1,3}$/.test(bits) || Number(bits) > max) return null;
  return `${rede}/${bits}`;
}
