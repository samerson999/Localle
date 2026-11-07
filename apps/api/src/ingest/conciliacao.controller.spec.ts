import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { SuperadminGuard } from '../auth/superadmin.guard';
import { ConciliacaoController } from './conciliacao.controller';

// A rota mexe no inbox da plataforma inteira (sem client_id): o que a protege é o SuperadminGuard no controller, por
// cima do AuthGuard global. Este teste falha se o guard sair ou a rota mudar de prefixo.
describe('ConciliacaoController', () => {
  it('fica sob /superadmin e exige o SuperadminGuard em todas as rotas', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ConciliacaoController)).toBe('superadmin/conciliacao');
    expect(Reflect.getMetadata(GUARDS_METADATA, ConciliacaoController)).toEqual([SuperadminGuard]);
  });
});
