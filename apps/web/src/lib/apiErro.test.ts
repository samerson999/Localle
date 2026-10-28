import { describe, expect, it } from 'vitest';
import { erroHttp, MSG_SERVIDOR } from './apiErro';

describe('erroHttp', () => {
  // HML, 28/10/2026: "Não foi possível registrar o rastreador no Traccar" virava a mensagem genérica na tela
  it('503 com mensagem da API mostra a mensagem', () => {
    expect(erroHttp(503, { message: 'Não foi possível registrar o rastreador no Traccar; tente novamente' }).message).toMatch(/registrar o rastreador/);
  });

  it('500, 502/504 do proxy e 503 sem mensagem própria seguem com a genérica', () => {
    expect(erroHttp(500, { message: 'Erro inesperado' }).message).toBe(MSG_SERVIDOR);
    expect(erroHttp(502).message).toBe(MSG_SERVIDOR);
    expect(erroHttp(503, { message: 'Service Unavailable' }).message).toBe(MSG_SERVIDOR);
  });

  it('4xx com mensagem da API segue como antes', () => {
    expect(erroHttp(409, { message: 'Já existe' }).message).toBe('Já existe');
  });
});
