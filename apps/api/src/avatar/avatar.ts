import { BadRequestException } from '@nestjs/common';

/** Mesmo teto do check da migration (1794280000000_avatares): ~66 KB de imagem, cabe no corpo JSON padrão (100 KB). */
export const AVATAR_MAX_CHARS = 90_000;
const FORMATO = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

// assinatura do arquivo: o tipo declarado no data URL tem de bater com os bytes (não aceita "image/png" com outra coisa dentro)
const ASSINATURA: Record<string, (b: Buffer) => boolean> = {
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  webp: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

/**
 * Valida a foto do avatar: data URL de JPEG, PNG ou WebP, até `AVATAR_MAX_CHARS`, com os bytes do tipo declarado.
 * SVG fica de fora de propósito (pode carregar script). O front já reduz a foto para 256 px antes de enviar.
 */
export function parseAvatar(v: unknown): string {
  if (typeof v !== 'string' || !v) throw new BadRequestException('"imagem" é obrigatória');
  if (v.length > AVATAR_MAX_CHARS) throw new BadRequestException('A foto é grande demais');
  const m = FORMATO.exec(v);
  if (!m) throw new BadRequestException('A foto precisa ser JPEG, PNG ou WebP');
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length < 12 || !ASSINATURA[m[1]](bytes)) throw new BadRequestException('O arquivo não é uma imagem válida');
  return v;
}
