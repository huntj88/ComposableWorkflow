import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { setTimeout as delay } from 'node:timers/promises';

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

export const createPostgresTestContainer = async (
  options: PostgresTestContainerOptions = {},
): Promise<PostgresTestContainerHandle> => {
  const database = options.database ?? 'workflow';
  const username = options.username ?? 'workflow';
  const password = options.password ?? 'workflow';

  const container = await new GenericContainer(options.image ?? 'postgres:16-alpine')
    .withEnvironment({
      POSTGRES_DB: database,
      POSTGRES_USER: username,
      POSTGRES_PASSWORD: password,
    })
    .withExposedPorts(5432)
    .start();

  const connectionString = `postgresql://${username}:${password}@${container.getHost()}:${container.getMappedPort(5432)}/${database}`;

  if (options.migrate ?? true) {
    await runMigrationsWithRetry(connectionString);
  }

  return {
    container,
    connectionString,
    stop: async () => {
      await container.stop();
    },
  };
};
