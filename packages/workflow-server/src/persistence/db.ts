import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

export type DbClient = Pick<PoolClient, 'query'>;

export interface DbConnection {
  pool: Pool;
  close: () => Promise<void>;
}

export const createPool = (config: PoolConfig = {}): Pool => {
  const pool = config.connectionString
    ? new Pool(config)
    : new Pool({
        connectionString:
          process.env.DATABASE_URL ?? 'postgresql://workflow:workflow@localhost:5432/workflow',
        ...config,
      });

  // Prevent unhandled 'error' events from becoming uncaught exceptions.
  // Idle clients that receive backend errors (e.g. 57P01 admin shutdown)
  // emit on the pool; without a listener Node escalates to process crash.
  pool.on('error', () => {
    // Intentionally swallowed – the pool will remove the dead client
    // automatically and provision a new one on the next checkout.
  });

  return pool;
};

export const createDbConnection = (config: PoolConfig = {}): DbConnection => {
  const pool = createPool(config);

  return {
    pool,
    close: async () => {
      await pool.end();
    },
  };
};

export const withTransaction = async <T>(
  pool: Pool,
  fn: (client: DbClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const queryOne = async <TRow extends QueryResultRow>(
  client: DbClient,
  text: string,
  values: unknown[] = [],
): Promise<TRow | null> => {
  const result = await client.query(text, values);

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0] as TRow;
};

export const assertSingleRow = <TRow extends QueryResultRow>(result: QueryResult<TRow>): TRow => {
  if (result.rowCount !== 1) {
    throw new Error(`Expected exactly one row but received ${result.rowCount}`);
  }

  return result.rows[0];
};
