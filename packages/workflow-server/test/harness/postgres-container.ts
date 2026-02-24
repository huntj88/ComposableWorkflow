import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

import { runMigrations } from '../../src/persistence/migrate.js';

const RETRYABLE_PG_CODES = new Set(['57P03']);

const isRetryableStartupError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const withCode = error as { code?: unknown; message?: unknown };
  if (typeof withCode.code === 'string' && RETRYABLE_PG_CODES.has(withCode.code)) {
    return true;
  }

  return (
    typeof withCode.message === 'string' &&
    withCode.message.toLowerCase().includes('database system is starting up')
  );
};

const runMigrationsWithRetry = async (databaseUrl: string): Promise<void> => {
  const maxAttempts = 20;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await runMigrations({
        databaseUrl,
        direction: 'up',
      });
      return;
    } catch (error) {
      if (!isRetryableStartupError(error) || attempt === maxAttempts) {
        throw error;
      }

      await delay(250);
    }
  }
};

const withAdminClient = async <T>(
  connectionString: string,
  operation: (client: Client) => Promise<T>,
): Promise<T> => {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    return await operation(client);
  } finally {
    await client.end().catch(() => undefined);
  }
};

const withAdminRetry = async <T>(
  connectionString: string,
  operation: (client: Client) => Promise<T>,
): Promise<T> => {
  const maxAttempts = 20;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await withAdminClient(connectionString, operation);
    } catch (error) {
      if (!isRetryableStartupError(error) || attempt === maxAttempts) {
        throw error;
      }

      await delay(250);
    }
  }

  throw new Error('Unreachable admin retry loop');
};

export interface PostgresTestContainerOptions {
  image?: string;
  database?: string;
  username?: string;
  password?: string;
  migrate?: boolean;
}

export interface PostgresTestContainerHandle {
  container: StartedTestContainer;
  connectionString: string;
  stop: () => Promise<void>;
}

interface SharedContainerState {
  refs: number;
  container?: StartedTestContainer;
  initializing?: Promise<StartedTestContainer>;
}

const sharedContainers = new Map<string, SharedContainerState>();

const quoteIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;

const createSharedContainerKey = (options: PostgresTestContainerOptions): string => {
  const image = options.image ?? 'postgres:16-alpine';
  const username = options.username ?? 'workflow';
  const password = options.password ?? 'workflow';
  return `${image}|${username}|${password}`;
};

const startSharedContainer = async (
  options: PostgresTestContainerOptions,
): Promise<StartedTestContainer> => {
  const username = options.username ?? 'workflow';
  const password = options.password ?? 'workflow';

  return new GenericContainer(options.image ?? 'postgres:16-alpine')
    .withEnvironment({
      POSTGRES_DB: 'postgres',
      POSTGRES_USER: username,
      POSTGRES_PASSWORD: password,
    })
    .withExposedPorts(5432)
    .start();
};

const acquireSharedContainer = async (
  options: PostgresTestContainerOptions,
): Promise<{ key: string; state: SharedContainerState; container: StartedTestContainer }> => {
  const key = createSharedContainerKey(options);
  const state = sharedContainers.get(key) ?? { refs: 0 };
  state.refs += 1;
  sharedContainers.set(key, state);

  if (state.container) {
    return { key, state, container: state.container };
  }

  if (!state.initializing) {
    state.initializing = startSharedContainer(options);
  }

  try {
    const container = await state.initializing;
    state.container = container;
    state.initializing = undefined;
    return { key, state, container };
  } catch (error) {
    state.refs = Math.max(0, state.refs - 1);
    state.initializing = undefined;
    if (state.refs === 0) {
      sharedContainers.delete(key);
    }
    throw error;
  }
};

const releaseSharedContainer = async (key: string): Promise<void> => {
  const state = sharedContainers.get(key);
  if (!state) {
    return;
  }

  state.refs = Math.max(0, state.refs - 1);
  if (state.refs > 0 || !state.container) {
    return;
  }

  const container = state.container;
  sharedContainers.delete(key);
  await container.stop();
};

export const createSharedPostgresTestContainer = async (
  options: PostgresTestContainerOptions = {},
): Promise<PostgresTestContainerHandle> => {
  const username = options.username ?? 'workflow';
  const password = options.password ?? 'workflow';
  const database = options.database ?? `workflow_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

  const { key, container } = await acquireSharedContainer(options);
  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const adminConnectionString = `postgresql://${username}:${password}@${host}:${port}/postgres`;
  const connectionString = `postgresql://${username}:${password}@${host}:${port}/${database}`;

  let databaseCreated = false;
  let released = false;

  try {
    await withAdminRetry(adminConnectionString, async (adminClient) => {
      await adminClient.query(`CREATE DATABASE ${quoteIdentifier(database)}`);
    });
    databaseCreated = true;

    if (options.migrate ?? true) {
      await runMigrationsWithRetry(connectionString);
    }

    return {
      container,
      connectionString,
      stop: async () => {
        if (released) {
          return;
        }

        released = true;
        if (databaseCreated) {
          await withAdminRetry(adminConnectionString, async (adminClient) => {
            await adminClient.query(
              `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
              [database],
            );
            await adminClient.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)}`);
          });
        }

        await releaseSharedContainer(key);
      },
    };
  } catch (error) {
    if (!released) {
      released = true;
      await releaseSharedContainer(key);
    }
    throw error;
  }
};
