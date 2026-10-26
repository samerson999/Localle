import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from '../db/pg-pool.provider';
import { withTransaction } from '../db/with-transaction';
import { getDefinition, listDefinitions, REGRAS_CRUZADAS, type SettingDefinition, type SettingValue } from './setting-definitions';
import { SettingsRepository } from './settings.repository';

export type Origem = 'grupo' | 'cliente' | 'padrao';

export interface ResolvedSetting {
  key: string;
  modulo: string;
  label: string;
  type: SettingDefinition['type'];
  options?: string[];
  min: number;
  max: number;
  porGrupo: boolean;
  legal?: SettingDefinition['legal'];
  aplicacao: SettingDefinition['aplicacao'];
  somenteLocale: boolean;
  value: SettingValue;
  origin: Origem;
}

export interface Mudanca {
  groupId?: string | null;
  userId?: string | null;
  reason?: string | null;
}

/**
 * Resolução em camadas (docs/PLANO-SETUP-ADMIN.md § 1): grupo → cliente → padrão da plataforma (código).
 * Toda escrita valida tipo, faixa, piso legal (só endurece) e regras cruzadas, e vai para o histórico —
 * é o único ponto de escrita, como a `fn_set_setting` do plano, só que no service.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly repo: SettingsRepository,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async resolveAll(clientId: string, groupId: string | null = null): Promise<ResolvedSetting[]> {
    if (groupId && !(await this.repo.grupoExiste(clientId, groupId))) throw new NotFoundException('Grupo não encontrado');
    const [cliente, grupo] = await Promise.all([this.repo.findAllOverrides(clientId), groupId ? this.repo.findGroupOverrides(clientId, groupId) : ({} as Record<string, SettingValue>)]);
    return listDefinitions().map((def) => {
      const emGrupo = def.porGrupo && def.key in grupo;
      const emCliente = def.key in cliente;
      return {
        key: def.key,
        modulo: def.modulo,
        label: def.label,
        type: def.type,
        options: def.options,
        min: def.min,
        max: def.max,
        porGrupo: def.porGrupo === true,
        legal: def.legal,
        aplicacao: def.aplicacao,
        somenteLocale: def.somenteLocale === true,
        value: emGrupo ? grupo[def.key] : emCliente ? cliente[def.key] : def.default,
        origin: emGrupo ? 'grupo' : emCliente ? 'cliente' : 'padrao',
      };
    });
  }

  /** Usado pelos relatórios/regras — nunca falha por chave ausente, cai no padrão. Só chaves numéricas/booleanas. */
  async resolve(clientId: string, key: string, groupId: string | null = null): Promise<number> {
    const v = await this.resolveValor(clientId, key, groupId);
    return typeof v === 'number' ? v : Number.NaN;
  }

  async resolveValor(clientId: string, key: string, groupId: string | null = null): Promise<SettingValue> {
    const def = this.definicao(key);
    const override = await this.repo.findOverride(clientId, key, def.porGrupo ? groupId : null);
    return override ?? def.default;
  }

  /**
   * Valor vigente numa data (chaves `aplicacao: 'agora'`, ex.: espelho de ponto): reconstrói pelo histórico.
   * Sem histórico antes da data, o override atual ainda não existia → padrão.
   */
  async resolveEm(clientId: string, key: string, at: Date, groupId: string | null = null): Promise<SettingValue> {
    const def = this.definicao(key);
    if (def.porGrupo && groupId) {
      const g = await this.repo.valorEm(clientId, key, groupId, at);
      if (g !== undefined && g !== null) return g;
    }
    const c = await this.repo.valorEm(clientId, key, null, at);
    return c === undefined || c === null ? def.default : c;
  }

  async set(clientId: string, key: string, value: SettingValue, mudanca: Mudanca = {}): Promise<ResolvedSetting> {
    const def = this.definicao(key);
    const groupId = mudanca.groupId ?? null;
    if (def.somenteLocale) throw new ForbiddenException(`Parâmetro "${key}" é definido pela Locale`);
    if (groupId && !def.porGrupo) throw new BadRequestException(`Parâmetro "${key}" não aceita valor por grupo`);
    this.validarValor(def, value);
    return withTransaction(this.pool, async (tx) => {
      if (groupId && !(await this.repo.grupoExiste(clientId, groupId, tx))) throw new NotFoundException('Grupo não encontrado');
      const atuais = groupId ? await this.repo.findGroupOverrides(clientId, groupId, tx) : await this.repo.findAllOverrides(clientId, tx);
      const anterior = atuais[key] ?? null;
      await this.validarCruzadas(clientId, groupId, key, value, tx);
      await this.repo.setOverride(tx, clientId, key, value, groupId);
      await this.repo.registrarHistorico(tx, { clientId, groupId, key, oldValue: anterior, newValue: value, changedBy: mudanca.userId ?? null, reason: mudanca.reason ?? null });
      return this.resolvido(def, value, groupId ? 'grupo' : 'cliente');
    });
  }

  async restoreDefault(clientId: string, key: string, mudanca: Mudanca = {}): Promise<ResolvedSetting> {
    const def = this.definicao(key);
    if (def.somenteLocale) throw new ForbiddenException(`Parâmetro "${key}" é definido pela Locale`);
    const groupId = mudanca.groupId ?? null;
    return withTransaction(this.pool, async (tx) => {
      if (groupId && !(await this.repo.grupoExiste(clientId, groupId, tx))) throw new NotFoundException('Grupo não encontrado');
      const atuais = groupId ? await this.repo.findGroupOverrides(clientId, groupId, tx) : await this.repo.findAllOverrides(clientId, tx);
      const anterior = atuais[key] ?? null;
      await this.repo.clearOverride(tx, clientId, key, groupId);
      if (anterior !== null) {
        await this.repo.registrarHistorico(tx, { clientId, groupId, key, oldValue: anterior, newValue: null, changedBy: mudanca.userId ?? null, reason: mudanca.reason ?? null });
      }
      const herdado = groupId ? (await this.repo.findOverride(clientId, key, null)) ?? def.default : def.default;
      return this.resolvido(def, herdado, groupId && herdado !== def.default ? 'cliente' : 'padrao');
    });
  }

  historico(clientId: string, key: string, groupId: string | null = null) {
    this.definicao(key);
    return this.repo.historico(clientId, key, groupId);
  }

  private definicao(key: string): SettingDefinition {
    const def = getDefinition(key);
    if (!def) throw new NotFoundException(`Parâmetro "${key}" não existe`);
    return def;
  }

  private validarValor(def: SettingDefinition, value: SettingValue) {
    if (def.type === 'option') {
      if (typeof value !== 'string' || !def.options!.includes(value)) throw new BadRequestException(`Parâmetro "${def.key}" aceita só: ${def.options!.join(', ')}`);
      return;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new BadRequestException(`Parâmetro "${def.key}" precisa ser um número`);
    if (def.type === 'boolean' && value !== 0 && value !== 1) throw new BadRequestException(`Parâmetro "${def.key}" aceita só 0 ou 1`);
    // piso legal antes da faixa: a mensagem diz o porquê (a faixa do registro coincide com o limite legal)
    if (def.legal) {
      const afrouxa = def.legal.endurece === 'down' ? value > def.legal.limite : value < def.legal.limite;
      if (afrouxa) throw new BadRequestException(`Parâmetro "${def.key}" tem piso legal de ${def.legal.limite} (${def.legal.ref}) e só pode ser mais rigoroso`);
    }
    if (def.type === 'number' && (value < def.min || value > def.max)) throw new BadRequestException(`Parâmetro "${def.key}" precisa estar entre ${def.min} e ${def.max}`);
  }

  /** Confere as regras cruzadas com os valores que ficariam vigentes no escopo depois da mudança. */
  private async validarCruzadas(clientId: string, groupId: string | null, key: string, value: SettingValue, tx: Pool | import('pg').PoolClient) {
    const regras = REGRAS_CRUZADAS.filter((r) => r.ordem.includes(key));
    if (regras.length === 0) return;
    const cliente = await this.repo.findAllOverrides(clientId, tx);
    const grupo = groupId ? await this.repo.findGroupOverrides(clientId, groupId, tx) : {};
    const vigente = (k: string): number => {
      if (k === key) return value as number;
      const def = getDefinition(k)!;
      const v = (def.porGrupo && grupo[k]) ?? cliente[k] ?? def.default;
      return v as number;
    };
    for (const r of regras) {
      const valores = r.ordem.map(vigente);
      for (let i = 1; i < valores.length; i++) if (!(valores[i - 1] < valores[i])) throw new BadRequestException(r.mensagem);
    }
  }

  private resolvido(def: SettingDefinition, value: SettingValue, origin: Origem): ResolvedSetting {
    return {
      key: def.key,
      modulo: def.modulo,
      label: def.label,
      type: def.type,
      options: def.options,
      min: def.min,
      max: def.max,
      porGrupo: def.porGrupo === true,
      legal: def.legal,
      aplicacao: def.aplicacao,
      somenteLocale: def.somenteLocale === true,
      value,
      origin,
    };
  }
}
