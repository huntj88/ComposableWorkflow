import { GenericContainer, type StartedTestContainer } from 'testcontainers';

import { runMigrations } from '../../src/persistence/migrate.js';

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
    await runMigrations({
      databaseUrl: connectionString,
      direction: 'up',
    });
  }

  return {
    container,
    connectionString,
    stop: async () => {
      await container.stop();
    },
  };
};
