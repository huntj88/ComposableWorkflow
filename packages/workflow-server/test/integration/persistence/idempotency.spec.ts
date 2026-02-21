import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

import { createPool, withTransaction } from '../../../src/persistence/db.js';
import { createIdempotencyRepository } from '../../../src/persistence/idempotency-repository.js';
import { runMigrations } from '../../../src/persistence/migrate.js';
import { createRunRepository } from '../../../src/persistence/run-repository.js';

describe('persistence idempotency', () => {
  let container: StartedTestContainer | undefined;
  let databaseUrl: string;
  let runtimeAvailable = true;

  beforeAll(async () => {
    try {
      container = await new GenericContainer('postgres:16-alpine')
        .withEnvironment({
          POSTGRES_DB: 'workflow',
          POSTGRES_USER: 'workflow',
          POSTGRES_PASSWORD: 'workflow',
        })
        .withExposedPorts(5432)
        .start();

      databaseUrl = `postgresql://workflow:workflow@${container.getHost()}:${container.getMappedPort(5432)}/workflow`;

      await runMigrations({ databaseUrl, direction: 'up' });
      await runMigrations({ databaseUrl, direction: 'up' });
    } catch {
      runtimeAvailable = false;
    }
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
  });

  it('stores start key once and returns existing run on lookup', async (context) => {
    if (!runtimeAvailable) {
      context.skip();
    }

    const pool = createPool({ connectionString: databaseUrl });
    const runRepository = createRunRepository();
    const idempotencyRepository = createIdempotencyRepository();

    await withTransaction(pool, async (client) => {
      await runRepository.upsertRunSummary(client, {
        runId: 'run-idem-1',
        workflowType: 'wf.idempotency',
        workflowVersion: '1.0.0',
        lifecycle: 'running',
        currentState: 'start',
        parentRunId: null,
        startedAt: '2026-02-21T02:00:00.000Z',
        endedAt: null,
      });
    });

    const firstInsert = await withTransaction(pool, async (client) =>
      idempotencyRepository.reserveStartKey(client, {
        workflowType: 'wf.idempotency',
        idempotencyKey: 'idem-key-1',
        runId: 'run-idem-1',
        createdAt: '2026-02-21T02:00:01.000Z',
      }),
    );
    expect(firstInsert?.runId).toBe('run-idem-1');

    const duplicateInsert = await withTransaction(pool, async (client) =>
      idempotencyRepository.reserveStartKey(client, {
        workflowType: 'wf.idempotency',
        idempotencyKey: 'idem-key-1',
        runId: 'run-idem-2',
        createdAt: '2026-02-21T02:00:02.000Z',
      }),
    );
    expect(duplicateInsert).toBeNull();

    const existing = await withTransaction(pool, async (client) =>
      idempotencyRepository.getByKey(client, 'wf.idempotency', 'idem-key-1'),
    );
    expect(existing?.runId).toBe('run-idem-1');

    const none = await withTransaction(pool, async (client) =>
      idempotencyRepository.getByKey(client, 'wf.idempotency', 'idem-key-missing'),
    );
    expect(none).toBeNull();

    await pool.end();
  });
});
