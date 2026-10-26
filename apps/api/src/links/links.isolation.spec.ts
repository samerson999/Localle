import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LinksRepository } from './links.repository';
import { hashToken, LinksService } from './links.service';

/**
 * Link temporário contra o Postgres real: token só na criação (banco guarda hash), página pública só
 * com a posição do ativo do link, aberturas registradas, expiração/revogação e isolamento por cliente.
 */
describe('links de localização', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repo = new LinksRepository(pool);
  const service = new LinksService(repo);
  const HORA = 3600_000;

  let clientA: string;
  let clientB: string;
  let assetA: string;
  let userA: string;
  let userB: string;
  let rastreadorId: string;

  beforeAll(async () => {
    clientA = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-links-a-${randomUUID()}`])).rows[0].id;
    clientB = (await pool.query<{ id: string }>('insert into clients (name) values ($1) returning id', [`teste-links-b-${randomUUID()}`])).rows[0].id;
    assetA = (await pool.query<{ id: string }>("insert into assets (client_id, plate) values ($1, 'LNK1A22') returning id", [clientA])).rows[0].id;
    const user = async (c: string) =>
      (await pool.query<{ id: string }>("insert into users (client_id, email, password_hash, role) values ($1, $2, 'x', 'gestor') returning id", [c, `u-${randomUUID()}@teste.local`])).rows[0].id;
    userA = await user(clientA);
    userB = await user(clientB);
    rastreadorId = (await pool.query<{ id: string }>('insert into rastreadores (imei) values ($1) returning id', [randomUUID().replace(/-/g, '').slice(0, 15)])).rows[0].id;
    await pool.query(
      `insert into instalacoes (client_id, rastreador_id, asset_id, instalado_em, tecnico) values ($1, $2, $3, '2026-01-01T00:00:00Z', 'teste')`,
      [clientA, rastreadorId, assetA],
    );
    await pool.query(
      `insert into ultima_posicao (rastreador_id, asset_id, client_id, posicao_id, fix_time, geom, speed_kmh, ignition)
       values ($1, $2, $3, 1, '2026-10-01T12:00:00Z', st_setsrid(st_makepoint(-34.88, -8.05), 4326), 42, true)`,
      [rastreadorId, assetA, clientA],
    );
  });

  afterAll(async () => {
    await pool.query('delete from ultima_posicao where rastreador_id = $1', [rastreadorId]);
    await pool.query('delete from instalacoes where rastreador_id = $1', [rastreadorId]);
    await pool.query('delete from rastreadores where id = $1', [rastreadorId]);
    await pool.query('delete from clients where id in ($1, $2)', [clientA, clientB]);
    await pool.end();
  });

  it('cria com token entregue uma vez; o banco guarda só o hash', async () => {
    const link = await service.criar(clientA, userA, assetA, HORA, 'Atacadão');
    expect(link.token).toMatch(/^lc\./);
    const { rows } = await pool.query('select token_hash from links_localizacao where id = $1', [link.id]);
    expect(rows[0].token_hash).toBe(hashToken(link.token));
    expect(rows[0].token_hash).not.toContain(link.token);
  });

  it('outro cliente não cria link para ativo alheio, não lista e não revoga', async () => {
    await expect(service.criar(clientB, userB, assetA, HORA, null)).rejects.toMatchObject({ status: 404 });
    const link = await service.criar(clientA, userA, assetA, HORA, null);
    expect(await service.listar(clientB, assetA)).toEqual([]);
    await expect(service.revogar(clientB, link.id)).rejects.toMatchObject({ status: 404 });
    expect((await service.abrir(link.token, false)).placa).toBe('LNK1A22');
  });

  it('página pública: só placa e posição atual; abertura conta só quando pedida', async () => {
    const link = await service.criar(clientA, userA, assetA, HORA, null);
    const r = await service.abrir(link.token, true);
    expect(Object.keys(r).sort()).toEqual(['expiraEm', 'placa', 'posicao']);
    expect(r.posicao).toEqual({ lat: -8.05, lon: -34.88, fixTime: '2026-10-01T12:00:00.000Z', speedKmh: 42, ignition: true });
    await service.abrir(link.token, false); // atualização periódica da página
    await service.abrir(link.token, true); // repetida no mesmo minuto: não infla a contagem
    const [listado] = (await service.listar(clientA, assetA)).filter((l) => l.id === link.id);
    expect(listado.aberturas).toHaveLength(1);
  });

  it('revogado → 410 "revogado"; expirado → 410 "expirado"; token desconhecido → 404', async () => {
    const link = await service.criar(clientA, userA, assetA, HORA, null);
    await service.revogar(clientA, link.id);
    await expect(service.abrir(link.token, true)).rejects.toMatchObject({ status: 410, response: { motivo: 'revogado' } });

    const velho = await service.criar(clientA, userA, assetA, HORA, null);
    await pool.query("update links_localizacao set criado_em = now() - interval '3 hours', expira_em = now() - interval '1 hour' where id = $1", [velho.id]);
    await expect(service.abrir(velho.token, true)).rejects.toMatchObject({ status: 410, response: { motivo: 'expirado' } });

    await expect(service.abrir('lc.' + 'x'.repeat(43), true)).rejects.toMatchObject({ status: 404 });
    await expect(service.abrir('lk-token-da-simulacao', true)).rejects.toMatchObject({ status: 404 });
  });
});
