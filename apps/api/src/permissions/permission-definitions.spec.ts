import { describe, expect, it } from 'vitest';
import { listDefinitions as listSettingDefinitions } from '../settings/setting-definitions';
import { listPermissionDefinitions } from './permission-definitions';

describe('catálogo de permissões — sanidade', () => {
  it('toda definição tem padrão para os três papéis de cliente', () => {
    for (const def of listPermissionDefinitions()) {
      expect(def.defaultByRole).toHaveProperty('admin');
      expect(def.defaultByRole).toHaveProperty('gestor');
      expect(def.defaultByRole).toHaveProperty('operador');
      expect(typeof def.defaultByRole.admin).toBe('boolean');
      expect(typeof def.defaultByRole.gestor).toBe('boolean');
      expect(typeof def.defaultByRole.operador).toBe('boolean');
    }
  });

  it('admin sempre tem o padrão true em todas as permissões do catálogo', () => {
    for (const def of listPermissionDefinitions()) {
      expect(def.defaultByRole.admin).toBe(true);
    }
  });

  it('"permissoes.gerenciar" é travada (não editável pelo cliente) — proteção contra autoescalonamento', () => {
    const def = listPermissionDefinitions().find((d) => d.key === 'permissoes.gerenciar');
    expect(def?.editableByClient).toBe(false);
    expect(def?.defaultByRole.gestor).toBe(false);
    expect(def?.defaultByRole.operador).toBe(false);
  });

  it('não há chaves duplicadas no catálogo', () => {
    const keys = listPermissionDefinitions().map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('achado #3 da auditoria: "setup.configurar" só cobre parâmetros operacionais, nunca financeiro/contratual — tripwire contra expansão silenciosa do escopo', () => {
    const chavesFinanceiras = ['faturamento', 'contrato', 'plano', 'cobranca', 'pagamento'];
    const chavesDeSetting = listSettingDefinitions().map((d) => d.key);
    for (const chave of chavesDeSetting) {
      const prefixo = chave.split('.')[0];
      expect(
        chavesFinanceiras,
        `"${chave}" parece financeiro/contratual — não deveria estar sob setup.configurar; crie permissão própria (ver comentário em permission-definitions.ts)`,
      ).not.toContain(prefixo);
    }
  });
});
