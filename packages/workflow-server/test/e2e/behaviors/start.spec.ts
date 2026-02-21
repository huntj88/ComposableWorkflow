import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { IntegrationHarness } from '../../harness/create-harness.js';
import {
  SUCCESS_WORKFLOW_TYPE,
  advanceRunToTerminal,
  createE2eHarness,
  expectFourDimensions,
  startWorkflow,
} from '../setup.js';

describe('e2e.behaviors.start', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createE2eHarness();
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('B-START-001/002 returns run metadata for valid start and rejects unknown workflow', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const missing = await harness.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/start',
      payload: {
        workflowType: 'missing.workflow.type',
        input: {},
      },
    });
    expect(missing.statusCode).toBe(404);

    const started = await startWorkflow({
      harness,
      workflowType: SUCCESS_WORKFLOW_TYPE,
      input: {
        requestId: 'start-001',
        customerId: 'cust-start',
        amountCents: 2200,
        currency: 'USD',
      },
    });

    expect(started.workflowType).toBe(SUCCESS_WORKFLOW_TYPE);
    expect(started.workflowVersion).toBe('1.0.0');

    await advanceRunToTerminal(harness, started.runId);
    const dimensions = await expectFourDimensions({ harness, runId: started.runId });
    expect(['completed', 'failed']).toContain(dimensions.summary.lifecycle);
  });

  it('B-START-003/004 deduplicates same idempotency key and creates distinct runs for different keys', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const input = {
      requestId: `idem-${randomUUID()}`,
      customerId: 'cust-idem',
      amountCents: 5000,
      currency: 'USD',
    };

    const sameKey = `idem-${randomUUID()}`;
    const first = await startWorkflow({
      harness,
      workflowType: SUCCESS_WORKFLOW_TYPE,
      input,
      idempotencyKey: sameKey,
    });
    const second = await startWorkflow({
      harness,
      workflowType: SUCCESS_WORKFLOW_TYPE,
      input,
      idempotencyKey: sameKey,
    });

    expect(first.runId).toBe(second.runId);

    const duplicateStarts = await harness.db.pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1 AND event_type = 'workflow.started'",
      [first.runId],
    );
    expect(duplicateStarts.rows[0]?.count).toBe(1);

    const third = await startWorkflow({
      harness,
      workflowType: SUCCESS_WORKFLOW_TYPE,
      input,
      idempotencyKey: `${sameKey}-other`,
    });

    expect(third.runId).not.toBe(first.runId);
  });
});
