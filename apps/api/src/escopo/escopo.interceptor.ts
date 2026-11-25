import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor, NotFoundException } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import type { RequestAuth } from '../auth/auth.guard';
import { filtrarPorEscopo, idsDoPedido, registroForaDoEscopo } from './escopo';

/** Global (`APP_INTERCEPTOR`): aplica o escopo de veículos do usuário na entrada e na saída — ver `escopo.ts`. */
@Injectable()
export class EscopoInterceptor implements NestInterceptor {
  private readonly logger = new Logger(EscopoInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<{ auth?: RequestAuth; params?: unknown; query?: unknown; body?: unknown; method?: string; url?: string }>();
    const ativos = req.auth && 'ativos' in req.auth ? req.auth.ativos : null;
    if (!ativos) return next.handle();
    const fora = idsDoPedido(req).find((id) => !ativos.has(id));
    if (fora) {
      this.logger.warn(`veículo fora do escopo recusado user_id=${req.auth!.userId} asset_id=${fora} ${req.method} ${req.url?.split('?')[0]}`);
      throw new NotFoundException('Veículo não encontrado');
    }
    return next.handle().pipe(
      map((corpo) => {
        if (registroForaDoEscopo(corpo, ativos)) throw new NotFoundException('Registro não encontrado');
        return filtrarPorEscopo(corpo, ativos);
      }),
    );
  }
}
