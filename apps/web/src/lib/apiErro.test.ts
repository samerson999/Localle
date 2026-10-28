import { describe, expect, it } from 'vitest';
import { erroHttp, mensagemDeErro, MSG_SEM_CONEXAO, MSG_SERVIDOR } from './apiErro';

describe('erroHttp', () => {
  it('4xx usa a mensagem da API (string ou lista)', () => {
    expect(erroHttp(400, { message: '"name" precisa ter de 1 a 80 caracteres' }).message).toBe('"name" precisa ter de 1 a 80 caracteres');
    expect(erroHttp(400, { message: ['a', 'b'] }).message).toBe('a; b');
    expect(erroHttp(409, { message: 'Já existe um grupo com esse nome' }).message).toBe('Já existe um grupo com esse nome');
  });
  it('5xx nunca mostra texto técnico', () => {
    expect(erroHttp(500, { message: 'Internal server error' }).message).toBe(MSG_SERVIDOR);
    expect(erroHttp(500, { message: 'Erro inesperado' }).message).toBe(MSG_SERVIDOR);
    expect(erroHttp(502).message).toBe(MSG_SERVIDOR);
    expect(erroHttp(503, { message: 'Service Unavailable' }).message).toBe(MSG_SERVIDOR);
  });
  // HML, 28/10/2026: "Não foi possível registrar o rastreador no Traccar" virava a mensagem genérica na tela
  it('503 com mensagem própria da API mostra a mensagem', () => {
    expect(erroHttp(503, { message: 'Não foi possível registrar o rastreador no Traccar; tente novamente' }).message).toMatch(/registrar o rastreador/);
  });
  it('4xx sem corpo tem frase própria, nunca "HTTP n"', () => {
    expect(erroHttp(403).message).toMatch(/acesso/);
    expect(erroHttp(404).message).toMatch(/não encontrado/);
    expect(erroHttp(418).message).not.toMatch(/^HTTP/);
  });
});

describe('mensagemDeErro', () => {
  it('falha de rede do fetch vira frase de sem conexão', () => {
    expect(mensagemDeErro(new TypeError('Failed to fetch'))).toBe(MSG_SEM_CONEXAO);
    expect(mensagemDeErro(new Error('NetworkError when attempting to fetch resource.'))).toBe(MSG_SEM_CONEXAO);
  });
  it('Error comum mantém a mensagem; valor vazio cai no padrão', () => {
    expect(mensagemDeErro(new Error('Sessão expirada: entre de novo'))).toBe('Sessão expirada: entre de novo');
    expect(mensagemDeErro(undefined)).toBe(MSG_SERVIDOR);
  });
});
