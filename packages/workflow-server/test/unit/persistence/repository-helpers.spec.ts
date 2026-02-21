import { describe, expect, it, vi } from 'vitest';

import {
  ALLOCATE_SEQUENCE_SQL,
  INSERT_EVENT_SQL,
  LOCK_RUN_FOR_SEQUENCE_SQL,
  mapWorkflowEventRow,
} from '../../../src/persistence/event-repository.js';
import {
  INSERT_IDEMPOTENCY_SQL,
  SELECT_IDEMPOTENCY_SQL,
  mapIdempotencyRow,
} from '../../../src/persistence/idempotency-repository.js';
import {
  UPSERT_RUN_SUMMARY_SQL,
  mapWorkflowRunRow,
} from '../../../src/persistence/run-repository.js';
import { withTransaction } from '../../../src/persistence/db.js';

describe('persistence repository helpers', () => {
  it('exposes expected query contracts', () => {
    expect(LOCK_RUN_FOR_SEQUENCE_SQL).toContain('FOR UPDATE');
    expect(ALLOCATE_SEQUENCE_SQL).toContain('COALESCE(MAX(sequence), 0) + 1');
    expect(INSERT_EVENT_SQL).toContain('INSERT INTO workflow_events');
    expect(UPSERT_RUN_SUMMARY_SQL).toContain('ON CONFLICT (run_id)');
    expect(INSERT_IDEMPOTENCY_SQL).toContain(
      'ON CONFLICT (workflow_type, idempotency_key) DO NOTHING',
    );
    expect(SELECT_IDEMPOTENCY_SQL).toContain('FROM workflow_idempotency');
  });

  it('maps database rows to domain records', () => {
    const event = mapWorkflowEventRow({
      event_id: 'evt-1',
      run_id: 'run-1',
      sequence: 4,
      event_type: 'transition.completed',
      timestamp: new Date('2026-02-21T10:00:00.000Z'),
      payload_jsonb: { ok: true },
      error_jsonb: null,
    });
    const run = mapWorkflowRunRow({
      run_id: 'run-1',
      workflow_type: 'wf.test',
      workflow_version: '1.0.0',
      lifecycle: 'running',
      current_state: 'processing',
      parent_run_id: null,
      started_at: new Date('2026-02-21T09:00:00.000Z'),
      ended_at: null,
    });
    const idempotency = mapIdempotencyRow({
      workflow_type: 'wf.test',
      idempotency_key: 'idem-1',
      run_id: 'run-1',
      created_at: new Date('2026-02-21T09:00:00.000Z'),
    });

    expect(event.timestamp).toBe('2026-02-21T10:00:00.000Z');
    expect(run.startedAt).toBe('2026-02-21T09:00:00.000Z');
    expect(idempotency.idempotencyKey).toBe('idem-1');
  });

  it('enforces transaction boundaries with commit and rollback', async () => {
    const query = vi
      .fn<[string], Promise<{ rowCount: number; rows: never[] }>>()
      .mockResolvedValue({ rowCount: 0, rows: [] });
    const release = vi.fn();

    const pool = {
      connect: vi.fn().mockResolvedValue({ query, release }),
    };

    await withTransaction(pool as never, async () => 'ok');
    expect(query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(query).toHaveBeenNthCalledWith(2, 'COMMIT');

    query.mockClear();
    await expect(
      withTransaction(pool as never, async () => {
        throw new Error('forced');
      }),
    ).rejects.toThrow('forced');

    expect(query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(query).toHaveBeenNthCalledWith(2, 'ROLLBACK');
    expect(release).toHaveBeenCalledTimes(2);
  });
});
