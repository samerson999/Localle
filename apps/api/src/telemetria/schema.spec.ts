import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * Regressão do schema de telemetria (docs/ARQUITETURA-INTEGRACAO-TRACCAR.md § 4) — ainda sem camada de
 * repositório (nasce só como fundação para o módulo de monitoramento), então o que se testa aqui são as
 * regras que o próprio banco garante: exclusion constraints de `instalacoes`, dedup de ingestão, e a
 * view `v_localizacao_atual`. Roda contra o Postgres local de verdade (infra/plataforma), como a suite
 * de isolamento de assets — é premissa do projeto que todo módulo/etapa nasça com teste.
 */
describe('schema de telemetria', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let clientId: string;
  let assetId: string;

  beforeAll(async () => {
    const { rows } = await pool.query<{ id: string }>(
      'insert into clients (name) values ($1) returning id',
      [`teste-telemetria-${randomUUID()}`],
    );
    clientId = rows[0].id;
    const asset = await pool.query<{ id: string }>(
      'insert into assets (client_id, plate) values ($1, $2) returning id',
      [clientId, 'TEL1E22'],
    );
    assetId = asset.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('delete from clients where id = $1', [clientId]); // cascade cuida de assets/instalacoes
    await pool.end();
  });

  async function criarRastreador() {
    const imei = randomUUID().replace(/-/g, '').slice(0, 15);
    const { rows } = await pool.query<{ id: string }>(
      'insert into rastreadores (imei) values ($1) returning id',
      [imei],
    );
    return rows[0].id;
  }

  async function limparRastreador(rastreadorId: string) {
    await pool.query('delete from rastreador_comunicacao where rastreador_id = $1', [rastreadorId]);
    await pool.query('delete from ultima_posicao where rastreador_id = $1', [rastreadorId]);
    await pool.query('delete from eventos where rastreador_id = $1', [rastreadorId]);
    await pool.query('delete from ingest_eventos_recebidos where rastreador_id = $1', [rastreadorId]);
    await pool.query('delete from posicoes where rastreador_id = $1', [rastreadorId]);
    await pool.query('delete from ingest_posicoes_recebidas where rastreador_id = $1', [rastreadorId]);
    await pool.query('delete from instalacoes where rastreador_id = $1', [rastreadorId]);
    await pool.query('delete from rastreadores where id = $1', [rastreadorId]);
  }

  const rastreadoresCriados: string[] = [];
  afterEach(async () => {
    while (rastreadoresCriados.length) {
      await limparRastreador(rastreadoresCriados.pop()!);
    }
  });

  async function instalar(
    rastreadorId: string,
    opts: { papel?: string; instaladoEm: string; desinstaladoEm?: string | null; assetIdOverride?: string },
  ) {
    return pool.query(
      `insert into instalacoes (client_id, rastreador_id, asset_id, papel, instalado_em, desinstalado_em, tecnico)
       values ($1, $2, $3, $4, $5, $6, 'teste')`,
      [
        clientId,
        rastreadorId,
        opts.assetIdOverride ?? assetId,
        opts.papel ?? 'principal',
        opts.instaladoEm,
        opts.desinstaladoEm ?? null,
      ],
    );
  }

  it('impede duas instalações sobrepostas do mesmo rastreador', async () => {
    const rastreadorId = await criarRastreador();
    rastreadoresCriados.push(rastreadorId);

    await instalar(rastreadorId, { instaladoEm: '2026-01-01T00:00:00Z', desinstaladoEm: '2026-02-01T00:00:00Z' });

    await expect(
      instalar(rastreadorId, { instaladoEm: '2026-01-15T00:00:00Z' }),
    ).rejects.toThrow(/exclusion constraint/i);
  });

  it('permite reinstalar o mesmo rastreador depois que a instalação anterior fechou', async () => {
    const rastreadorId = await criarRastreador();
    rastreadoresCriados.push(rastreadorId);

    await instalar(rastreadorId, { instaladoEm: '2026-01-01T00:00:00Z', desinstaladoEm: '2026-02-01T00:00:00Z' });
    await expect(
      instalar(rastreadorId, { instaladoEm: '2026-02-01T00:00:00Z' }),
    ).resolves.toBeDefined();
  });

  it('impede duas instalações vigentes do mesmo papel no mesmo ativo', async () => {
    const rastreadorA = await criarRastreador();
    const rastreadorB = await criarRastreador();
    rastreadoresCriados.push(rastreadorA, rastreadorB);

    await instalar(rastreadorA, { instaladoEm: '2026-01-01T00:00:00Z' });
    await expect(
      instalar(rastreadorB, { instaladoEm: '2026-01-02T00:00:00Z' }),
    ).rejects.toThrow(/exclusion constraint/i);
  });

  it('permite papéis diferentes (GPS principal + módulo CAN) coexistirem no mesmo ativo', async () => {
    const rastreadorA = await criarRastreador();
    const rastreadorB = await criarRastreador();
    rastreadoresCriados.push(rastreadorA, rastreadorB);

    await instalar(rastreadorA, { instaladoEm: '2026-01-01T00:00:00Z' });
    await expect(
      instalar(rastreadorB, { papel: 'can', instaladoEm: '2026-01-02T00:00:00Z' }),
    ).resolves.toBeDefined();
  });

  it('barra desinstalação igual ou anterior à instalação', async () => {
    const rastreadorId = await criarRastreador();
    rastreadoresCriados.push(rastreadorId);

    await expect(
      instalar(rastreadorId, { instaladoEm: '2026-01-10T00:00:00Z', desinstaladoEm: '2026-01-05T00:00:00Z' }),
    ).rejects.toThrow(/instalacoes_desinstalado_apos_instalado/);
  });

  it('dedup de ingestão: a mesma traccar_position_id não grava posição duas vezes', async () => {
    const rastreadorId = await criarRastreador();
    rastreadoresCriados.push(rastreadorId);

    const primeira = await pool.query(
      `insert into ingest_posicoes_recebidas (rastreador_id, traccar_position_id)
       values ($1, 999) on conflict (rastreador_id, traccar_position_id) do nothing
       returning rastreador_id`,
      [rastreadorId],
    );
    expect(primeira.rowCount).toBe(1);

    const reentrega = await pool.query(
      `insert into ingest_posicoes_recebidas (rastreador_id, traccar_position_id)
       values ($1, 999) on conflict (rastreador_id, traccar_position_id) do nothing
       returning rastreador_id`,
      [rastreadorId],
    );
    expect(reentrega.rowCount).toBe(0);
  });

  it('grava posição na hypertable e resolve client_id/asset_id', async () => {
    const rastreadorId = await criarRastreador();
    rastreadoresCriados.push(rastreadorId);

    const { rows } = await pool.query<{ id: string }>(
      `insert into posicoes
        (rastreador_id, traccar_position_id, client_id, asset_id, fix_time, server_time, valid, geom, speed_kmh)
       values ($1, 1, $2, $3, now(), now(), true, st_setsrid(st_makepoint(-34.88, -8.05), 4326), 42)
       returning id`,
      [rastreadorId, clientId, assetId],
    );
    expect(rows[0].id).toBeDefined();
  });

  it('v_localizacao_atual não herda a posição do rastreador anterior após troca de instalação', async () => {
    const rastreadorId = await criarRastreador();
    rastreadoresCriados.push(rastreadorId);

    // instalação vigente a partir das 14:05; última posição válida é das 13:58 (antes da instalação) —
    // não deve aparecer como localização atual do ativo (docs § 4.4, terceira passada).
    await instalar(rastreadorId, { instaladoEm: '2026-01-01T14:05:00Z' });
    await pool.query(
      `insert into ultima_posicao (rastreador_id, asset_id, client_id, posicao_id, fix_time, geom)
       values ($1, $2, $3, 1, '2026-01-01T13:58:00Z', st_setsrid(st_makepoint(-34.88, -8.05), 4326))`,
      [rastreadorId, assetId, clientId],
    );

    const { rows } = await pool.query('select * from v_localizacao_atual where asset_id = $1', [assetId]);
    expect(rows).toHaveLength(0);
  });

  it('v_localizacao_atual mostra a posição quando ela é posterior à instalação vigente', async () => {
    const rastreadorId = await criarRastreador();
    rastreadoresCriados.push(rastreadorId);

    await instalar(rastreadorId, { instaladoEm: '2026-01-01T14:05:00Z' });
    await pool.query(
      `insert into ultima_posicao (rastreador_id, asset_id, client_id, posicao_id, fix_time, geom)
       values ($1, $2, $3, 1, '2026-01-01T14:10:00Z', st_setsrid(st_makepoint(-34.88, -8.05), 4326))`,
      [rastreadorId, assetId, clientId],
    );

    const { rows } = await pool.query('select asset_id, client_id from v_localizacao_atual where asset_id = $1', [
      assetId,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].client_id).toBe(clientId);
  });
});
