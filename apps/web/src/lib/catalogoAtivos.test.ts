import { describe, expect, it } from 'vitest';
import { aplicarTipo, chaveCatalogo, marcaModeloDoAtivo, mesmoNome, nomeDoTipo, parecidos, tipoDoAtivo, tiposDoCliente } from './catalogoAtivos';

describe('chaveCatalogo / mesmoNome', () => {
  it('ignora acento, pontuação, espaço e maiúsculas (mesma regra do banco)', () => {
    expect(chaveCatalogo('13.190')).toBe('13190');
    expect(chaveCatalogo(' 13190 ')).toBe('13190');
    expect(chaveCatalogo('Pá-Carregadeira São')).toBe('pacarregadeirasao');
    expect(mesmoNome('VOLKSWAGEN', [{ nome: 'Volkswagen' }])).toEqual({ nome: 'Volkswagen' });
    expect(mesmoNome('...', [{ nome: 'x' }])).toBeUndefined();
  });
});

describe('parecidos', () => {
  const modelos = [{ nome: '13.190' }, { nome: '13.190 CR 4x2' }, { nome: 'Delivery 9.170' }];
  // caso do áudio do teste da FD Locação
  it('"13190" acha "13.190" e "13.190 CR 4x2"; nome sem relação não', () => {
    expect(parecidos('13190', modelos).map((m) => m.nome)).toEqual(['13.190', '13.190 CR 4x2']);
    expect(parecidos('Constellation', modelos)).toEqual([]);
    expect(parecidos('', modelos)).toEqual([]);
  });

  it('uma letra de diferença conta; prefixo curto demais não', () => {
    expect(parecidos('Volksvagen', [{ nome: 'Volkswagen' }])).toHaveLength(1);
    expect(parecidos('13', modelos)).toEqual([]);
  });
});

describe('tipos', () => {
  it('prontos trazem os nomes da linha amarela; renomeado pelo cliente troca nome e ícone; do cliente vem no fim', () => {
    const ops = tiposDoCliente([
      { id: 'r1', nome: 'Compactador', base: 'veiculo', padrao: 'caminhao', icone: '18-coletor' },
      { id: 'c1', nome: 'Guindaste', base: 'linha_amarela', padrao: null, icone: null },
    ]);
    expect(ops.find((o) => o.value === 'trator_esteira')).toMatchObject({ label: 'Trator de esteira', category: 'linha_amarela', kind: 'linha_amarela' });
    expect(ops.find((o) => o.value === 'caminhao')).toMatchObject({ label: 'Compactador', icone: '18-coletor', tipoId: 'r1' });
    expect(ops[ops.length - 1]).toMatchObject({ value: 't:c1', label: 'Guindaste', category: 'linha_amarela', kind: 'linha_amarela' });
  });

  it('ativo antigo sem tipo usa a categoria; aplicar tipo leva categoria e kind', () => {
    const ops = tiposDoCliente([]);
    expect(tipoDoAtivo({ kind: 'linha_amarela' })).toBe('linha_amarela');
    expect(nomeDoTipo({ kind: 'linha_amarela' }, ops)).toBe('Outra máquina (linha amarela)');
    expect(aplicarTipo(ops.find((o) => o.value === 'retroescavadeira')!)).toEqual({ tipo: 'retroescavadeira', category: 'linha_amarela', kind: 'linha_amarela' });
    expect(nomeDoTipo({ tipo: 'retroescavadeira', category: 'linha_amarela' }, ops)).toBe('Retroescavadeira');
  });
});

describe('marcaModeloDoAtivo', () => {
  const c = { marcas: [{ id: 'm1', nome: 'Caterpillar' }], modelos: [{ id: 'o1', marcaId: 'm1', nome: '416F' }], tipos: [] };
  it('modelo da lista traz marca e modelo; sem modelo ou modelo sumido, null', () => {
    expect(marcaModeloDoAtivo('o1', c)).toEqual({ brand: 'Caterpillar', model: '416F', marcaId: 'm1' });
    expect(marcaModeloDoAtivo(null, c)).toBeNull();
    expect(marcaModeloDoAtivo('x', c)).toBeNull();
  });
});
