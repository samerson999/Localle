import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RequestAuth } from '../auth/auth.guard';

/**
 * Filtro global (`APP_FILTER`, `app.module.ts`). Dois papéis:
 * - time técnico: todo 5xx loga método, rota, status, `client_id`/`user_id` do JWT (quando há) e a mensagem
 *   original com stack — o handler padrão do Nest logava só o stack, sem dizer de qual cliente/rota veio;
 * - usuário: erro inesperado responde em português, nunca o `Internal server error` do Nest. HttpException
 *   lançada pelo código (400/401/403/404/409/503…) passa intacta — a mensagem dela já é pensada para a tela.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request & { auth?: RequestAuth }>();
    const res = http.getResponse<Response>();
    const esperada = exception instanceof HttpException;
    const status = esperada ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const corpo = esperada ? exception.getResponse() : null;

    if (status >= 500) {
      const err = exception as Error;
      this.logger.error(`${status} ${req.method} ${req.originalUrl ?? req.url} — ${contexto(req.auth)}: ${err?.message ?? String(exception)}`, err?.stack);
    }
    if (res.headersSent) return; // SSE/stream já em curso: só o log acima
    res.status(status).json(
      esperada
        ? typeof corpo === 'string'
          ? { statusCode: status, message: corpo }
          : corpo
        : { statusCode: status, message: 'Erro inesperado no servidor. Tente de novo; se persistir, avise o suporte.' },
    );
  }
}

function contexto(auth: RequestAuth | undefined): string {
  if (!auth) return 'sem auth';
  return auth.role === 'superadmin' ? `superadmin user_id=${auth.userId}` : `client_id=${auth.clientId} user_id=${auth.userId}`;
}
