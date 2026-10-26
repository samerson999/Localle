import { BadRequestException, HttpStatus, Logger, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from './http-exception.filter';

function host(req: Record<string, unknown>) {
  const res = { headersSent: false, status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return { res, host: { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as any };
}

describe('HttpExceptionFilter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('erro inesperado vira 500 em português e loga rota + tenant + mensagem original', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { res, host: h } = host({ method: 'POST', originalUrl: '/multas', auth: { userId: 'u1', clientId: 'c1', role: 'admin' } });
    new HttpExceptionFilter().catch(new Error('relation "x" does not exist'), h);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.statusCode).toBe(500);
    expect(body.message).not.toMatch(/internal server error|does not exist/i);
    expect(error).toHaveBeenCalledTimes(1);
    const msg = String(error.mock.calls[0][0]);
    expect(msg).toContain('500 POST /multas');
    expect(msg).toContain('client_id=c1 user_id=u1');
    expect(msg).toContain('relation "x" does not exist');
  });

  it('HttpException do código passa intacta e 4xx não loga', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { res, host: h } = host({ method: 'GET', originalUrl: '/x' });
    new HttpExceptionFilter().catch(new BadRequestException('"name" precisa ter de 1 a 80 caracteres'), h);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toBe('"name" precisa ter de 1 a 80 caracteres');
    expect(error).not.toHaveBeenCalled();
  });

  it('503 lançado pelo código mantém a mensagem e loga sem auth', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { res, host: h } = host({ method: 'POST', originalUrl: '/ingest/traccar' });
    new HttpExceptionFilter().catch(new ServiceUnavailableException(), h);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(String(error.mock.calls[0][0])).toContain('sem auth');
  });

  it('não tenta responder quando a resposta já começou (stream)', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { res, host: h } = host({ method: 'GET', originalUrl: '/realtime' });
    res.headersSent = true;
    new HttpExceptionFilter().catch(new Error('boom'), h);
    expect(res.status).not.toHaveBeenCalled();
  });
});
