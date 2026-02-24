import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createSharedPostgresTestContainer,
  type PostgresTestContainerHandle,
} from '../../harness/postgres-container.js';

import { createPool, withTransaction } from '../../../src/persistence/db.js';
import { createEventRepository } from '../../../src/persistence/event-repository.js';
import { createRunRepository } from '../../../src/persistence/run-repository.js';

describe('persistence atomic append', () => {
  let postgres: PostgresTestContainerHandle | undefined;
  let databaseUrl: string;

  beforeAll(async () => {
    postgres = await createSharedPostgresTestContainer();
    databaseUrl = postgres.connectionString;
  }, 120_000);

  afterAll(async () => {
    await postgres?.stop();
  });

  it('rolls back appended event when projection write fails in same transaction', async () => {
    const pool = createPool({ connectionString: databaseUrl });
    const runRepository = createRunRepository();
    const eventRepository = createEventRepository();

    await withTransaction(pool, async (client) => {
      await runRepository.upsertRunSummary(client, {
        runId: 'run-atomic-rollback',
        workflowType: 'wf.atomic',
        workflowVersion: '1.0.0',
        lifecycle: 'running',
        currentState: 'start',
        parentRunId: null,
        startedAt: '2026-02-21T00:00:00.000Z',
        endedAt: null,
      });
    });

    await expect(
      withTransaction(pool, async (client) => {
        await eventRepository.appendEvent(client, {
          eventId: 'evt-rollback-1',
          runId: 'run-atomic-rollback',
          eventType: 'transition.completed',
          timestamp: '2026-02-21T00:00:01.000Z',
          payload: { to: 'next' },
        });

        throw new Error('inject-failure-after-append');
      }),
    ).rejects.toThrow('inject-failure-after-append');

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1',
      ['run-atomic-rollback'],
    );
    expect(countResult.rows[0].count).toBe(0);

    await pool.end();
  });

  it('allocates monotonic sequence and updates run projection atomically', async () => {
    const pool = createPool({ connectionString: databaseUrl });
    const runRepository = createRunRepository();
    const eventRepository = createEventRepository();

    await withTransaction(pool, async (client) => {
      await runRepository.upsertRunSummary(client, {
        runId: 'run-atomic-success',
        workflowType: 'wf.atomic',
        workflowVersion: '1.0.0',
        lifecycle: 'running',
        currentState: 'start',
        parentRunId: null,
        startedAt: '2026-02-21T01:00:00.000Z',
        endedAt: null,
      });
    });

    await withTransaction(pool, async (client) => {
      const firstEvent = await eventRepository.appendEvent(client, {
        eventId: 'evt-success-1',
        runId: 'run-atomic-success',
        eventType: 'transition.requested',
        timestamp: '2026-02-21T01:00:01.000Z',
      });

      await runRepository.upsertRunSummary(client, {
        runId: 'run-atomic-success',
        workflowType: 'wf.atomic',
        workflowVersion: '1.0.0',
        lifecycle: 'running',
        currentState: 'processing',
        parentRunId: null,
        startedAt: '2026-02-21T01:00:00.000Z',
        endedAt: null,
      });

      const secondEvent = await eventRepository.appendEvent(client, {
        eventId: 'evt-success-2',
        runId: 'run-atomic-success',
        eventType: 'transition.completed',
        timestamp: '2026-02-21T01:00:02.000Z',
      });

      expect(firstEvent.sequence).toBe(1);
      expect(secondEvent.sequence).toBe(2);
    });

    const projection = await pool.query(
      'SELECT current_state FROM workflow_runs WHERE run_id = $1',
      ['run-atomic-success'],
    );
    expect(projection.rows[0].current_state).toBe('processing');

    const sequences = await pool.query(
      'SELECT sequence FROM workflow_events WHERE run_id = $1 ORDER BY sequence ASC',
      ['run-atomic-success'],
    );
    expect(sequences.rows.map((row) => row.sequence)).toEqual([1, 2]);

    await pool.end();
  });
});
