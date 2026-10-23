import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getDefinition, listDefinitions } from './setting-definitions';
import { SettingsRepository } from './settings.repository';

export interface ResolvedSetting {
  key: string;
  label: string;
  value: number;
  origin: 'cliente' | 'padrao';
}

@Injectable()
export class SettingsService {
  constructor(private readonly repo: SettingsRepository) {}

  async resolveAll(clientId: string): Promise<ResolvedSetting[]> {
    const overrides = await this.repo.findAllOverrides(clientId);
    return listDefinitions().map((def) => ({
      key: def.key,
      label: def.label,
      value: overrides[def.key] ?? def.default,
      origin: def.key in overrides ? 'cliente' : 'padrao',
    }));
  }

  /** Usado pelos relatórios/regras de monitoramento — nunca falha por chave ausente, cai no padrão. */
  async resolve(clientId: string, key: string): Promise<number> {
    const def = getDefinition(key);
    if (!def) throw new NotFoundException(`Parâmetro "${key}" não existe`);
    const override = await this.repo.findOverride(clientId, key);
    return override ?? def.default;
  }

  async set(clientId: string, key: string, value: number): Promise<ResolvedSetting> {
    const def = getDefinition(key);
    if (!def) throw new NotFoundException(`Parâmetro "${key}" não existe`);
    if (def.type === 'boolean' && value !== 0 && value !== 1) {
      throw new BadRequestException(`Parâmetro "${key}" aceita só 0 ou 1`);
    }
    if (def.type === 'number' && (value < def.min || value > def.max)) {
      throw new BadRequestException(`Parâmetro "${key}" precisa estar entre ${def.min} e ${def.max}`);
    }
    await this.repo.setOverride(clientId, key, value);
    return { key: def.key, label: def.label, value, origin: 'cliente' };
  }

  async restoreDefault(clientId: string, key: string): Promise<ResolvedSetting> {
    const def = getDefinition(key);
    if (!def) throw new NotFoundException(`Parâmetro "${key}" não existe`);
    await this.repo.clearOverride(clientId, key);
    return { key: def.key, label: def.label, value: def.default, origin: 'padrao' };
  }
}
