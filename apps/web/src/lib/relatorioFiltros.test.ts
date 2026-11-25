import { describe, expect, it } from 'vitest';
import { casaBusca } from './busca';
import { camposDoVeiculo, instante, textoFiltros, veiculosDoGrupo } from './relatorioFiltros';

describe('filtros dos relatórios', () => {
  it('busca ignora acento, maiúsculas e o hífen da placa, e olha o apelido', () => {
    const a = { name: 'ABC-1D23', plate: 'ABC-1D23', apelido: 'Caminhão da Obra' };
    expect(casaBusca('abc1d23', ...camposDoVeiculo(a))).toBe(true);
    expect(casaBusca('caminhao', ...camposDoVeiculo(a))).toBe(true);
    expect(casaBusca('  ', ...camposDoVeiculo(a))).toBe(true);
    expect(casaBusca('xyz', ...camposDoVeiculo(a))).toBe(false);
  });

  it('campo de data apagado usa a reserva em vez de virar data inválida', () => {
    expect(instante('', 123)).toBe(123);
    expect(instante('2026-11-24T', 123)).toBe(123);
    expect(instante('2026-11-24T08:00', 123)).toBe(new Date('2026-11-24T08:00').getTime());
  });

  it('veículos oferecidos respeitam o grupo', () => {
    const assets = [{ id: '1', groupIds: ['g1'] }, { id: '2', groupIds: ['g2'] }, { id: '3' }];
    expect(veiculosDoGrupo(assets, '').map((a) => a.id)).toEqual(['1', '2', '3']);
    expect(veiculosDoGrupo(assets, 'g2').map((a) => a.id)).toEqual(['2']);
  });

  it('texto dos filtros inclui a busca quando houver', () => {
    expect(textoFiltros(['Grupo: todos', false, 'Veículo: todos'], '')).toBe('Grupo: todos · Veículo: todos');
    expect(textoFiltros(['Grupo: todos'], ' abc ')).toBe('Grupo: todos · Busca: "abc"');
  });
});
