import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { type AbastecimentoRow, AbastecimentosRepository } from './abastecimentos.repository';

const DIA = 86_400_000;

export type TipoDivergencia = 'litros' | 'valor' | 'data' | 'posto' | 'km' | 'salto_km';
export interface Divergencia {
  tipo: TipoDivergencia;
  detalhe: string;
}

export interface Tolerancias {
  tolLitrosPct: number;
  tolValorRs: number;
  tolDataDias: number;
  exigirMesmoPosto: boolean;
  tolKmRastreador: number;
  saltoKmSuspeito: number;
}

/**
 * Mesmas checagens de packages/shared/src/fuel.ts (`nfCheck`, `kmCheck`) com as tolerâncias do Setup
 * (`combustivel.*`) em vez de `FUEL_PARAMS`; mais o salto de km suspeito contra o lançamento anterior
 * do mesmo ativo (hoje só validado na tela — divergência 5 do plano).
 */
export function divergenciasDe(a: AbastecimentoRow, t: Tolerancias, odometroAnterior: number | null): Divergencia[] {
  const out: Divergencia[] = [];
  const litros = Number(a.litros);
  const total = Number(a.total);
  const odometro = Number(a.odometro);
  const n = a.nf;
  if (n) {
    if (n.litros != null && Math.abs(n.litros - litros) > (litros * t.tolLitrosPct) / 100) out.push({ tipo: 'litros', detalhe: `nota ${n.litros.toFixed(2)} L × lançado ${litros.toFixed(2)} L` });
    if (n.total != null && Math.abs(n.total - total) > t.tolValorRs) out.push({ tipo: 'valor', detalhe: `nota R$ ${n.total.toFixed(2)} × lançado R$ ${total.toFixed(2)}` });
    if (n.data && Math.abs(Date.parse(n.data) - a.ts.getTime()) > t.tolDataDias * DIA) out.push({ tipo: 'data', detalhe: `nota ${n.data.slice(0, 10)} × lançado ${a.ts.toISOString().slice(0, 10)}` });
    const soDigitos = (s: string) => s.replace(/\D/g, '');
    if (t.exigirMesmoPosto && n.cnpj && a.posto_cnpj && soDigitos(n.cnpj) !== soDigitos(a.posto_cnpj)) {
      out.push({ tipo: 'posto', detalhe: `CNPJ da nota ${n.cnpj} × posto lançado ${a.posto ?? a.posto_cnpj}` });
    }
  }
  if (a.km_rastreador != null) {
    const diff = odometro - Number(a.km_rastreador);
    if (Math.abs(diff) > t.tolKmRastreador) out.push({ tipo: 'km', detalhe: `lançado ${odometro} km × rastreador ${Number(a.km_rastreador)} km (${diff > 0 ? '+' : ''}${diff} km)` });
  }
  if (odometroAnterior != null && (odometro < odometroAnterior || odometro - odometroAnterior > t.saltoKmSuspeito)) {
    out.push({ tipo: 'salto_km', detalhe: `odômetro ${odometro} km contra ${odometroAnterior} km no abastecimento anterior` });
  }
  return out;
}

@Injectable()
export class CombustivelService {
  constructor(
    private readonly repo: AbastecimentosRepository,
    private readonly settings: SettingsService,
  ) {}

  async tolerancias(clientId: string): Promise<Tolerancias> {
    const [tolLitrosPct, tolValorRs, tolDataDias, exigirMesmoPosto, tolKmRastreador, saltoKmSuspeito] = await Promise.all([
      this.settings.resolve(clientId, 'combustivel.tol_litros_pct'),
      this.settings.resolve(clientId, 'combustivel.tol_valor_rs'),
      this.settings.resolve(clientId, 'combustivel.tol_data_dias'),
      this.settings.resolve(clientId, 'combustivel.exigir_mesmo_posto'),
      this.settings.resolve(clientId, 'combustivel.tol_km_rastreador'),
      this.settings.resolve(clientId, 'combustivel.salto_km_suspeito'),
    ]);
    return { tolLitrosPct, tolValorRs, tolDataDias, exigirMesmoPosto: exigirMesmoPosto === 1, tolKmRastreador, saltoKmSuspeito };
  }

  /** Lista com as divergências de cada lançamento (nota, km do rastreador, salto contra o anterior). */
  async listar(clientId: string, de: Date, ate: Date, assetId: string | null) {
    const [t, linhas] = await Promise.all([this.tolerancias(clientId), this.repo.listar(clientId, de, ate, assetId)]);
    const out = [];
    for (const a of linhas) {
      const anterior = await this.repo.odometroAnterior(clientId, a.asset_id, a.ts, a.id);
      out.push({ ...a, divergencias: divergenciasDe(a, t, anterior) });
    }
    return out;
  }
}
