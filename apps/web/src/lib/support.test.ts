import { describe, expect, it } from 'vitest';
import { STATUS_COMANDO, veSintaxeComando } from './support';

// Sprint de monitoramento 28/10/2026, melhoria 4: a sintaxe técnica do comando (RELAY,1#…) não aparece para o cliente.
describe('comandos: o que o cliente vê', () => {
  it('sintaxe só para a equipe Localle/revenda, inclusive no acesso de suporte', () => {
    expect(veSintaxeComando({ role: 'gestor' })).toBe(false);
    expect(veSintaxeComando({ role: 'portaria' })).toBe(false);
    expect(veSintaxeComando(null)).toBe(false);
    expect(veSintaxeComando({ role: 'locale' })).toBe(true);
    expect(veSintaxeComando({ role: 'revenda', support: { id: 's1' } })).toBe(true);
  });

  // antes, o histórico mostrava "aguardando" para expirado/falhou/cancelado
  it('cada status final tem o seu texto, nenhum vira "aguardando"', () => {
    for (const s of ['confirmado', 'falhou', 'expirado', 'cancelado', 'nao_suportado', 'pendente']) expect(STATUS_COMANDO[s]).not.toMatch(/aguardando/);
    expect(STATUS_COMANDO.enviado).toMatch(/aguardando/);
  });
});
