import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../db/base.repository';

export const TIPOS_MARCACAO = [
  'inicio_jornada', 'fim_jornada', 'inicio_direcao', 'fim_direcao', 'inicio_refeicao', 'fim_refeicao',
  'inicio_espera', 'fim_espera', 'inicio_descanso', 'fim_descanso',
] as const;
export type TipoMarcacao = (typeof TIPOS_MARCACAO)[number];
export const ORIGENS = ['teclado', 'app', 'rastreador', 'manual'] as const;
export type OrigemMarcacao = (typeof ORIGENS)[number];

export interface MarcacaoRow {
  id: string;
  client_id: string;
  motorista_id: string;
  asset_id: string | null;
  ts: Date;
  tipo: TipoMarcacao;
  origem: OrigemMarcacao;
  criado_por: string | null;
  criado_em: Date;
}

@Injectable()
export class JornadaRepository extends BaseRepository<MarcacaoRow> {
  protected readonly table = 'jornada_marcacoes';

  async listar(clientId: string, motoristaId: string | null, de: Date, ate: Date): Promise<MarcacaoRow[]> {
    const { rows } = await this.pool.query<MarcacaoRow>(
      `select * from jornada_marcacoes where client_id = $1 and ($2::uuid is null or motorista_id = $2) and ts >= $3 and ts <= $4 order by ts`,
      [clientId, motoristaId, de, ate],
    );
    return rows;
  }

  /** `insert ... select`: o motorista (e o ativo, se informado) precisam ser do cliente; senão nada é criado. */
  async criar(
    clientId: string,
    m: { motoristaId: string; assetId: string | null; ts: Date; tipo: TipoMarcacao; origem: OrigemMarcacao; criadoPor: string | null },
  ): Promise<MarcacaoRow | null> {
    const { rows } = await this.pool.query<MarcacaoRow>(
      `insert into jornada_marcacoes (client_id, motorista_id, asset_id, ts, tipo, origem, criado_por)
       select $1, m.id, (select a.id from assets a where a.client_id = $1 and a.id = $3), $4, $5, $6, $7
       from motoristas m where m.client_id = $1 and m.id = $2
       returning *`,
      [clientId, m.motoristaId, m.assetId, m.ts, m.tipo, m.origem, m.criadoPor],
    );
    return rows[0] ?? null;
  }

  async regimeDoMotorista(clientId: string, motoristaId: string): Promise<'cargas' | 'passageiros' | null> {
    const { rows } = await this.pool.query<{ regime: 'cargas' | 'passageiros' }>('select regime from motoristas where client_id = $1 and id = $2', [
      clientId,
      motoristaId,
    ]);
    return rows[0]?.regime ?? null;
  }
}
