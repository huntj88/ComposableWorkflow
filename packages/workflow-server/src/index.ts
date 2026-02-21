export const getServerStatus = (): 'ready' => 'ready';

export const initializeServerPersistence = async (): Promise<void> => {
  await runMigrationsOnStartup();
};

export * from './persistence/db.js';
export * from './persistence/migrate.js';
export * from './persistence/run-repository.js';
export * from './persistence/event-repository.js';
export * from './persistence/definition-repository.js';
export * from './persistence/idempotency-repository.js';

import { runMigrationsOnStartup } from './persistence/migrate.js';
