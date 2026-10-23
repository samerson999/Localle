import type { Pool, PoolClient } from 'pg';

/**
 * Repositório que aceita um `Pool` (uso normal, fora de transação) ou um `PoolClient` já aberto (quando
 * o service precisa que duas escritas de repositories diferentes façam parte da mesma transação — achado
 * #4 da auditoria de 23/10/2026: mutação + registro de auditoria precisam ser atômicos).
 */
export type Queryable = Pool | PoolClient;
