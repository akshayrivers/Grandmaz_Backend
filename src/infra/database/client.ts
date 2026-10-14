import pg from "pg";
import { env } from "../../config/index.js";

const { Pool } = pg;

export const pool = new Pool(
  env.DATABASE_URL
    ? { connectionString: env.DATABASE_URL }
    : {
        host: env.PGHOST,
        port: env.PGPORT,
        user: env.PGUSER,
        password: env.PGPASSWORD,
        database: env.PGDATABASE,
      }
);

export type QueryFn = <T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
) => Promise<pg.QueryResult<T>>;

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

/**
 * Runs `fn` inside a single transaction on one pooled connection.
 * Rolls back on any thrown error.
 */
export async function withTransaction<T>(fn: (tx: QueryFn) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const tx: QueryFn = (text, params) => client.query(text, params);
  try {
    await client.query("BEGIN");
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
