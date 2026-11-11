import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AVATAR_MAX_CHARS, parseAvatar } from './avatar';

// cabeçalhos mínimos de cada formato (o parse só confere a assinatura, não decodifica a imagem)
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
const url = (tipo: string, b: Buffer) => `data:image/${tipo};base64,${b.toString('base64')}`;

describe('parseAvatar', () => {
  it('aceita JPEG, PNG e WebP com a assinatura certa', () => {
    expect(parseAvatar(url('jpeg', JPEG))).toBe(url('jpeg', JPEG));
    expect(parseAvatar(url('png', PNG))).toBe(url('png', PNG));
    expect(parseAvatar(url('webp', WEBP))).toBe(url('webp', WEBP));
  });

  it('recusa ausente, não-string e vazio', () => {
    for (const v of [undefined, null, 42, {}, '']) expect(() => parseAvatar(v)).toThrow(BadRequestException);
  });

  it('recusa SVG e outros tipos (SVG pode carregar script)', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(() => parseAvatar(`data:image/svg+xml;base64,${svg.toString('base64')}`)).toThrow('JPEG, PNG ou WebP');
    expect(() => parseAvatar(url('gif', JPEG))).toThrow(BadRequestException);
    expect(() => parseAvatar('https://exemplo.com/foto.png')).toThrow(BadRequestException);
  });

  it('recusa tipo declarado que não bate com os bytes', () => {
    expect(() => parseAvatar(url('png', JPEG))).toThrow('imagem válida');
    expect(() => parseAvatar(url('jpeg', Buffer.from('<html>não é imagem</html>')))).toThrow('imagem válida');
  });

  it('recusa base64 com caracteres fora do alfabeto (injeção no data URL)', () => {
    expect(() => parseAvatar(`${url('png', PNG)}"><script>`)).toThrow(BadRequestException);
  });

  it('recusa acima do teto, que é o mesmo do check do banco', () => {
    const grande = Buffer.concat([JPEG, Buffer.alloc(AVATAR_MAX_CHARS)]);
    expect(() => parseAvatar(url('jpeg', grande))).toThrow('grande demais');
  });
});
