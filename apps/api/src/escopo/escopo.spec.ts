import { NotFoundException, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { filtrarPorEscopo, idsDoPedido, registroForaDoEscopo } from './escopo';
import { EscopoInterceptor } from './escopo.interceptor';

const ativos = new Set(['a1', 'a2']);

describe('escopo de veículos — filtro pelo formato do dado', () => {
  it('tira da lista o item de veículo fora do escopo, em qualquer nível, e mantém o que não é de veículo', () => {
    const corpo = {
      itens: [{ assetId: 'a1', n: 1 }, { assetId: 'x9', n: 2 }, { asset_id: 'x8' }, { semVeiculo: true }, { assetId: null, n: 3 }],
      grupos: [{ id: 'g1', assetIds: ['a1', 'x9', 'a2'] }],
      total: 5,
      ts: new Date(0),
    };
    expect(filtrarPorEscopo(corpo, ativos)).toEqual({
      itens: [{ assetId: 'a1', n: 1 }, { semVeiculo: true }, { assetId: null, n: 3 }],
      grupos: [{ id: 'g1', assetIds: ['a1', 'a2'] }],
      total: 5,
      ts: new Date(0),
    });
    expect(filtrarPorEscopo([{ assetId: 'x' }, { assetId: 'a2' }], ativos)).toEqual([{ assetId: 'a2' }]);
  });

  it('registro único de veículo fora do escopo é reconhecido', () => {
    expect(registroForaDoEscopo({ id: 'm1', assetId: 'x9' }, ativos)).toBe(true);
    expect(registroForaDoEscopo({ id: 'm1', assetId: 'a1' }, ativos)).toBe(false);
    expect(registroForaDoEscopo({ id: 'm1' }, ativos)).toBe(false);
  });

  it('lê os ids de veículo da rota, da query (lista separada por vírgula) e do corpo', () => {
    expect(idsDoPedido({ params: { assetId: 'p1' }, query: { assetIds: 'q1, q2' }, body: { assetId: 'b1', assetIds: ['b2'] } })).toEqual(['p1', 'q1', 'q2', 'b1', 'b2']);
    expect(idsDoPedido({ params: { id: 'nao-e-veiculo' } })).toEqual([]);
  });
});

describe('EscopoInterceptor', () => {
  const ctx = (auth: unknown, req: Record<string, unknown> = {}) =>
    ({ getType: () => 'http', switchToHttp: () => ({ getRequest: () => ({ auth, params: {}, query: {}, ...req }) }) }) as unknown as ExecutionContext;
  const handler = (corpo: unknown): CallHandler => ({ handle: () => of(corpo) });
  const interceptor = new EscopoInterceptor();
  const restrito = { userId: 'u', clientId: 'c', role: 'operador', sessionStart: 0, ativos };

  it('sem escopo (vê tudo) não mexe na resposta', async () => {
    const corpo = [{ assetId: 'x9' }];
    expect(await lastValueFrom(interceptor.intercept(ctx({ ...restrito, ativos: null }), handler(corpo)))).toBe(corpo);
  });

  it('pedido citando veículo fora do escopo responde 404 sem chegar ao handler', () => {
    expect(() => interceptor.intercept(ctx(restrito, { query: { assetId: 'x9' } }), handler([]))).toThrow(NotFoundException);
    expect(() => interceptor.intercept(ctx(restrito, { body: { assetIds: ['a1', 'x9'] } }), handler([]))).toThrow(NotFoundException);
  });

  it('filtra a lista e recusa o registro único de fora', async () => {
    expect(await lastValueFrom(interceptor.intercept(ctx(restrito), handler([{ assetId: 'a1' }, { assetId: 'x9' }])))).toEqual([{ assetId: 'a1' }]);
    await expect(lastValueFrom(interceptor.intercept(ctx(restrito), handler({ assetId: 'x9' })))).rejects.toThrow(NotFoundException);
  });
});
