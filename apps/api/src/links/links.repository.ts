import { Injectable } from '@nestjs/common';
import { BaseRepository } from '../db/base.repository';

export interface Link {
  id: string;
  assetId: string;
  destinatario: string | null;
  criadoPor: string | null;
  criadoEm: string;
  expiraEm: string;
  revogadoEm: string | null;
  aberturas: string[];
}

interface LinkRow {
  id: string;
  client_id: string;
  asset_id: string;
  destinatario: string | null;
  criado_por_email: string | null;
  criado_em: Date;
  expira_em: Date;
  revogado_em: Date | null;
  aberturas: Date[] | null;
}

export interface LinkPublico {
  linkId: string;
  clientId: string;
  assetId: string;
  plate: string;
  expiraEm: Date;
  revogadoEm: Date | null;
}

const SELECT = `
  select l.id, l.client_id, l.asset_id, l.destinatario, u.email as criado_por_email, l.criado_em, l.expira_em, l.revogado_em,
    -- as 200 mais recentes (em ordem): basta para "quantas e quando" na tela sem resposta sem limite
    (select array_agg(x.aberto_em order by x.aberto_em) from (
       select aberto_em from link_aberturas a where a.link_id = l.id order by aberto_em desc limit 200) x) as aberturas
  from links_localizacao l left join users u on u.id = l.criado_por`;

const toLink = (r: LinkRow): Link => ({
  id: r.id,
  assetId: r.asset_id,
  destinatario: r.destinatario,
  criadoPor: r.criado_por_email,
  criadoEm: r.criado_em.toISOString(),
  expiraEm: r.expira_em.toISOString(),
  revogadoEm: r.revogado_em ? r.revogado_em.toISOString() : null,
  aberturas: (r.aberturas ?? []).map((d) => d.toISOString()),
});

/**
 * Rotas do gestor: `client_id` sempre o primeiro filtro (regra do BaseRepository). A leitura pública
 * (`buscarPorHash`) é a única sem `client_id`: o token É a credencial, e o `client_id` sai do link.
 */
@Injectable()
export class LinksRepository extends BaseRepository<LinkRow> {
  protected readonly table = 'links_localizacao';

  async criar(
    clientId: string,
    l: { assetId: string; tokenHash: string; destinatario: string | null; criadoPor: string; expiraEm: Date },
  ): Promise<Link | null> {
    // insert ... select: o ativo precisa ser do mesmo cliente, senão nada é criado (sem IDOR pelo assetId)
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into links_localizacao (client_id, asset_id, token_hash, destinatario, criado_por, expira_em)
       select $1, a.id, $3, $4, $5, $6 from assets a where a.client_id = $1 and a.id = $2
       returning id`,
      [clientId, l.assetId, l.tokenHash, l.destinatario, l.criadoPor, l.expiraEm],
    );
    if (!rows[0]) return null;
    const { rows: link } = await this.pool.query<LinkRow>(`${SELECT} where l.client_id = $1 and l.id = $2`, [clientId, rows[0].id]);
    return toLink(link[0]);
  }

  async listar(clientId: string, assetId: string): Promise<Link[]> {
    const { rows } = await this.pool.query<LinkRow>(`${SELECT} where l.client_id = $1 and l.asset_id = $2 order by l.criado_em desc`, [
      clientId,
      assetId,
    ]);
    return rows.map(toLink);
  }

  async revogar(clientId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'update links_localizacao set revogado_em = coalesce(revogado_em, now()) where client_id = $1 and id = $2',
      [clientId, id],
    );
    return (rowCount ?? 0) > 0;
  }

  async buscarPorHash(tokenHash: string): Promise<LinkPublico | null> {
    const { rows } = await this.pool.query<LinkPublico>(
      `select l.id as "linkId", l.client_id as "clientId", l.asset_id as "assetId", a.plate, l.expira_em as "expiraEm", l.revogado_em as "revogadoEm"
       from links_localizacao l join assets a on a.id = l.asset_id and a.client_id = l.client_id
       where l.token_hash = $1`,
      [tokenHash],
    );
    return rows[0] ?? null;
  }

  /**
   * No máximo uma abertura por link por minuto: a rota é pública e quem tem o token poderia repetir a
   * chamada para inflar a contagem e a lista (recarregar a página no mesmo minuto também não é "outra" abertura).
   */
  async registrarAbertura(linkId: string): Promise<void> {
    await this.pool.query(
      `insert into link_aberturas (link_id)
       select $1 where not exists (
         select 1 from link_aberturas where link_id = $1 and aberto_em > now() - interval '1 minute')`,
      [linkId],
    );
  }

  /** Só a posição atual do ativo do link — nada de histórico, motorista ou outro veículo. */
  async posicaoAtual(clientId: string, assetId: string) {
    const { rows } = await this.pool.query<{ lat: number; lon: number; fix_time: Date; speed_kmh: string | null; ignition: boolean | null }>(
      `select st_y(geom) as lat, st_x(geom) as lon, fix_time, speed_kmh, ignition
       from v_localizacao_atual where client_id = $1 and asset_id = $2
       order by fix_time desc limit 1`,
      [clientId, assetId],
    );
    return rows[0] ?? null;
  }
}
