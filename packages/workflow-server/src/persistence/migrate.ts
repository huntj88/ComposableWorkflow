import path from 'node:path';
import { fileURLToPath } from 'node:url';

import runner from 'node-pg-migrate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type MigrationDirection = 'up' | 'down';

export interface MigrationOptions {
  direction?: MigrationDirection;
  count?: number;
  databaseUrl?: string;
}

export const runMigrations = async (options: MigrationOptions = {}): Promise<void> => {
  const databaseUrl =
    options.databaseUrl ??
    process.env.DATABASE_URL ??
    'postgresql://workflow:workflow@localhost:5432/workflow';

  await runner({
    dbClient: undefined,
    databaseUrl,
    dir: path.resolve(__dirname, '../../migrations'),
    direction: options.direction ?? 'up',
    migrationsTable: 'workflow_schema_migrations',
    count: options.count,
    verbose: false,
    noLock: false,
    checkOrder: true,
    ignorePattern: '.*\\.d\\.ts$',
  });
};

export const runMigrationsOnStartup = async (): Promise<void> => {
  await runMigrations({ direction: 'up' });
};

if (process.argv[1] === __filename) {
  const directionArg = process.argv[2];
  const direction: MigrationDirection = directionArg === 'down' ? 'down' : 'up';

  runMigrations({ direction }).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
