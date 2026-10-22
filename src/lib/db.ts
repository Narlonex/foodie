import "server-only";
import { Pool, types, type PoolClient, type QueryResultRow } from "pg";
import { requireDatabaseUrl } from "./env";

// Keep PostgreSQL `date` values as ISO strings so calendar dates never shift
// through a timezone when they are read or rendered.
types.setTypeParser(1082, (value: string) => value);

const globalForDb = globalThis as unknown as {
  foodiePool?: Pool;
};

function createPool(): Pool {
  const connectionString = requireDatabaseUrl();
  const isLocal = /localhost|127\.0\.0\.1|::1/.test(connectionString);
  return new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
}

export function getPool(): Pool {
  if (!globalForDb.foodiePool) {
    globalForDb.foodiePool = createPool();
  }
  return globalForDb.foodiePool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: ReadonlyArray<unknown> = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, [...params]);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: ReadonlyArray<unknown> = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function sqlDate(value: string): string {
  return value;
}
