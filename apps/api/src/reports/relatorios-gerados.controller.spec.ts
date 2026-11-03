import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RelatoriosGeradosController } from './relatorios-gerados.controller';
import type { RelatoriosGeradosRepository } from './relatorios-gerados.repository';

const CLIENTE = '11111111-1111-4111-8111-111111111111';
const USUARIO = '22222222-2222-4222-8222-222222222222';

function montar() {
  const repo = {
    registrar: vi.fn(async (_c: string, _u: string, r: any) => ({ id: 'r1', ...r })),
    recentes: vi.fn(async () => [{
      id: 'r1', client_id: CLIENTE, user_id: USUARIO, tipo: 'velocidade', periodo_inicio: new Date('2026-11-01T00:00:00Z'), periodo_fim: new Date('2026-11-02T00:00:00Z'),
      filtros: 'Grupo: todos', registros: 3, formato: 'pdf', created_at: new Date('2026-11-02T10:00:00Z'), gerado_por: 'gestor@demo.com',
    }]),
  };
  return { repo, ctrl: new RelatoriosGeradosController(repo as unknown as RelatoriosGeradosRepository) };
}
const valido = { tipo: 'velocidade', inicio: '2026-11-01T00:00:00Z', fim: '2026-11-02T00:00:00Z', filtros: 'Grupo: todos', registros: 3, formato: 'pdf' };

describe('RelatoriosGeradosController', () => {
  it('registra com o cliente e o usuário do token', async () => {
    const { repo, ctrl } = montar();
    await expect(ctrl.registrar(CLIENTE, USUARIO, valido)).resolves.toEqual({ id: 'r1' });
    expect(repo.registrar).toHaveBeenCalledWith(CLIENTE, USUARIO, expect.objectContaining({ tipo: 'velocidade', formato: 'pdf', registros: 3 }));
  });

  it('recusa tipo, formato, contagem e período inválidos com 400', async () => {
    const { repo, ctrl } = montar();
    for (const ruim of [{ tipo: 'outro' }, { formato: 'doc' }, { registros: -1 }, { registros: 1.5 }, { inicio: '2026-11-03T00:00:00Z' }, { fim: 'ontem' }, { filtros: 'x'.repeat(501) }]) {
      await expect(ctrl.registrar(CLIENTE, USUARIO, { ...valido, ...ruim })).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(repo.registrar).not.toHaveBeenCalled();
  });

  it('filtros vazio vira texto vazio', async () => {
    const { repo, ctrl } = montar();
    await ctrl.registrar(CLIENTE, USUARIO, { ...valido, filtros: '' });
    expect(repo.registrar).toHaveBeenCalledWith(CLIENTE, USUARIO, expect.objectContaining({ filtros: '' }));
  });

  it('lista no formato do front, com quem gerou', async () => {
    const { ctrl } = montar();
    const [r] = await ctrl.listar(CLIENTE);
    expect(r).toEqual({ id: 'r1', tipo: 'velocidade', inicio: expect.any(Date), fim: expect.any(Date), filtros: 'Grupo: todos', registros: 3, formato: 'pdf', geradoEm: expect.any(Date), geradoPor: 'gestor@demo.com' });
  });
});
