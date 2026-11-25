import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { faixaValida, ipPermitido, normalizarIp } from '../auth/ip';
import { ALFABETO, formatoDeChave, gerarChave, hashDaChave, TAMANHO } from '../chaves/chave';
import { semChaveMestra } from '../swagger';
import { lerCursor, lerLimite, montarPagina } from './paginacao';

describe('chave de acesso', () => {
  it('64 caracteres do alfabeto (letras, números e símbolos), hash SHA-256 e início para exibição', () => {
    const { chave, hash, exibicao } = gerarChave();
    expect(chave).toHaveLength(TAMANHO);
    expect([...chave].every((c) => ALFABETO.includes(c))).toBe(true);
    expect(hash).toEqual(hashDaChave(chave));
    expect(hash.length).toBe(32);
    expect(exibicao).toBe(chave.slice(0, 6));
    expect(gerarChave().chave).not.toBe(chave);
  });

  it('usa letras, números e símbolos (amostra grande cobre as três classes e todo o alfabeto)', () => {
    const amostra = Array.from({ length: 200 }, () => gerarChave().chave).join('');
    expect(amostra).toMatch(/[A-Z]/);
    expect(amostra).toMatch(/[a-z]/);
    expect(amostra).toMatch(/[0-9]/);
    expect(amostra).toMatch(/[!#%*+\-.=@^_~]/);
    expect(new Set(amostra).size).toBe(ALFABETO.length);
  });

  it('formato: aceita a chave gerada e recusa JWT, tamanho errado e caractere fora do alfabeto', () => {
    const c = gerarChave().chave;
    expect(formatoDeChave(c)).toBe(true);
    expect(formatoDeChave(c.slice(0, -1))).toBe(false);
    expect(formatoDeChave(c + 'a')).toBe(false);
    expect(formatoDeChave('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc')).toBe(false);
    expect(formatoDeChave('a'.repeat(63) + '$')).toBe(false);
    expect(formatoDeChave('a'.repeat(63) + ' ')).toBe(false);
    expect(formatoDeChave('')).toBe(false);
  });
});

describe('IP da chave mestra', () => {
  it('normaliza IPv4 mapeado em IPv6 e recusa lixo', () => {
    expect(normalizarIp('::ffff:200.141.18.98')).toBe('200.141.18.98');
    expect(normalizarIp('2001:db8::1')).toBe('2001:db8::1');
    expect(normalizarIp('abc')).toBeNull();
    expect(normalizarIp(undefined)).toBeNull();
  });

  it('confere IP solto e faixa CIDR, v4 e v6', () => {
    expect(ipPermitido('200.141.18.98', ['200.141.18.98/32'])).toBe(true);
    expect(ipPermitido('200.141.18.99', ['200.141.18.98/32'])).toBe(false);
    expect(ipPermitido('10.1.2.3', ['10.0.0.0/8'])).toBe(true);
    expect(ipPermitido('2001:db8::5', ['2001:db8::/32'])).toBe(true);
    expect(ipPermitido('10.1.2.3', ['2001:db8::/32'])).toBe(false);
    expect(ipPermitido(null, ['0.0.0.0/0'])).toBe(false);
  });

  it('faixa digitada: IP solto vira /32 ou /128; máscara inválida é recusada', () => {
    expect(faixaValida(' 200.141.18.98 ')).toBe('200.141.18.98/32');
    expect(faixaValida('2001:db8::1')).toBe('2001:db8::1/128');
    expect(faixaValida('10.0.0.0/8')).toBe('10.0.0.0/8');
    expect(faixaValida('10.0.0.0/33')).toBeNull();
    expect(faixaValida('10.0.0.0/8/1')).toBeNull();
    expect(faixaValida('exemplo.com')).toBeNull();
    expect(faixaValida(42)).toBeNull();
  });
});

describe('paginação por cursor', () => {
  const linhas = [1, 2, 3].map((n) => ({ nome: `v${n}`, id: `00000000-0000-4000-8000-00000000000${n}` }));

  it('com sobra devolve o cursor da última linha da página; sem sobra, null', () => {
    const p = montarPagina(linhas, 2, (l) => ({ k: l.nome, id: l.id }), (l) => l.nome);
    expect(p.dados).toEqual(['v1', 'v2']);
    expect(lerCursor(p.proximoCursor)).toEqual({ k: 'v2', id: linhas[1].id });
    expect(montarPagina(linhas, 3, (l) => ({ k: l.nome, id: l.id }), (l) => l.nome).proximoCursor).toBeNull();
  });

  it('cursor adulterado e limite fora da faixa dão 400', () => {
    expect(lerCursor(undefined)).toBeNull();
    expect(() => lerCursor('não-é-base64')).toThrow(BadRequestException);
    expect(() => lerCursor(Buffer.from(JSON.stringify({ k: 'x', id: "1' or 1=1" })).toString('base64url'))).toThrow(BadRequestException);
    expect(lerLimite(undefined)).toBe(100);
    expect(lerLimite('500')).toBe(500);
    expect(() => lerLimite('501')).toThrow(BadRequestException);
    expect(() => lerLimite('0')).toThrow(BadRequestException);
    expect(() => lerLimite('1.5')).toThrow(BadRequestException);
  });
});

describe('Swagger sem chave mestra', () => {
  it('tira todos os caminhos /v1/clientes e qualquer rota fora de /v1, e mantém os demais', () => {
    const doc = { openapi: '3.0.0', info: { title: 't', version: 'v1' }, paths: { '/v1/veiculos': {}, '/v1/clientes': {}, '/v1/clientes/{clientId}/veiculos': {}, '/superadmin/api-chaves-mestras': {}, '/api-chaves': {} } } as any;
    expect(Object.keys(semChaveMestra(doc).paths)).toEqual(['/v1/veiculos']);
  });
});

describe('parâmetros documentados no Swagger', () => {
  // metadado que o @nestjs/swagger lê de cada `@ApiQuery`
  const doc = (alvo: object, metodo: string) =>
    (Reflect.getMetadata('swagger/apiParameters', (alvo as any).prototype[metodo]) ?? []) as { name: string; required: boolean }[];

  it('lista de veículos: nenhum parâmetro obrigatório (placa e os demais são filtros)', async () => {
    const { VeiculosController } = await import('../veiculos/veiculos.controller');
    const ps = doc(VeiculosController, 'listar');
    expect(ps.map((p) => p.name).sort()).toEqual(['cursor', 'identificador', 'incluirInativos', 'limite', 'placa']);
    expect(ps.every((p) => !p.required)).toBe(true);
  });

  it('série temporal: só o período obrigatório; relatório de um veículo: veículo e período', async () => {
    const { TelemetriaController } = await import('../telemetria/telemetria.controller');
    const { RelatoriosController } = await import('../relatorios/relatorios.controller');
    const obrigatorios = (ps: { name: string; required: boolean }[]) => ps.filter((p) => p.required).map((p) => p.name).sort();
    expect(obrigatorios(doc(TelemetriaController, 'eventos'))).toEqual(['ate', 'de']);
    expect(obrigatorios(doc(RelatoriosController, 'quilometragem'))).toEqual(['ate', 'de', 'veiculoId']);
  });
});
