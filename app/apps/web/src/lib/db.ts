import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env";

/**
 * One pg Pool per server process. In dev, Next's hot reload re-evaluates
 * modules, so the pool is cached on globalThis to avoid leaking connections.
 */
const g = globalThis as unknown as { __navopulsePool?: Pool };

export function pool(): Pool {
  if (!g.__navopulsePool) {
    g.__navopulsePool = new Pool({ connectionString: env.databaseUrl, max: 10 });
  }
  return g.__navopulsePool;
}

export type Queryable = Pick<PoolClient, "query">;

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client: Queryable = pool(),
): Promise<T[]> {
  const res = await client.query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client: Queryable = pool(),
): Promise<T | null> {
  const rows = await query<T>(text, params, client);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
