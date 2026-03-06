import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  errorEnvelopeSchema,
  startWorkflowResponseSchema,
} from '@composable-workflow/workflow-api-types';

import type { IntegrationHarness } from '../../harness/create-harness.js';
import {
  SUCCESS_WORKFLOW_TYPE,
  advanceRunToTerminal,
  createE2eHarness,
  expectFourDimensions,
} from '../setup.js';

const parseErrorEnvelope = (payload: unknown) => errorEnvelopeSchema.parse(payload);

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
    const missingEnvelope = parseErrorEnvelope(missing.json());
    expect(missingEnvelope.code).toBe('WORKFLOW_TYPE_NOT_FOUND');
    expect(missingEnvelope.message).toContain('Unknown workflow type');
    expect(missingEnvelope.requestId.length).toBeGreaterThan(0);
    expect(missingEnvelope.details).toBeUndefined();

    const invalid = await harness.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/start',
      payload: {
        workflowType: '   ',
        input: {},
      },
    });
    expect(invalid.statusCode).toBe(400);
    const invalidEnvelope = parseErrorEnvelope(invalid.json());
    expect(invalidEnvelope.code).toBe('VALIDATION_ERROR');
    expect(invalidEnvelope.message).toBe('Request validation failed');
    expect(invalidEnvelope.requestId.length).toBeGreaterThan(0);
    expect(Array.isArray(invalidEnvelope.details?.issues)).toBe(true);

    const createResponse = await harness.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/start',
      payload: {
        workflowType: SUCCESS_WORKFLOW_TYPE,
        input: {
          requestId: 'start-001',
          customerId: 'cust-start',
          amountCents: 2200,
          currency: 'USD',
        },
        idempotencyKey: `start-create-${randomUUID()}`,
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const started = startWorkflowResponseSchema.parse(createResponse.json());

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
    const firstResponse = await harness.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/start',
      payload: {
        workflowType: SUCCESS_WORKFLOW_TYPE,
        input,
        idempotencyKey: sameKey,
      },
    });
    expect(firstResponse.statusCode).toBe(201);
    const first = startWorkflowResponseSchema.parse(firstResponse.json());

    const secondResponse = await harness.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/start',
      payload: {
        workflowType: SUCCESS_WORKFLOW_TYPE,
        input,
        idempotencyKey: sameKey,
      },
    });
    expect(secondResponse.statusCode).toBe(200);
    const second = startWorkflowResponseSchema.parse(secondResponse.json());

    expect(second).toEqual(first);

    const duplicateStarts = await harness.db.pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1 AND event_type = 'workflow.started'",
      [first.runId],
    );
    expect(duplicateStarts.rows[0]?.count).toBe(1);

    const thirdResponse = await harness.server.inject({
      method: 'POST',
      url: '/api/v1/workflows/start',
      payload: {
        workflowType: SUCCESS_WORKFLOW_TYPE,
        input,
        idempotencyKey: `${sameKey}-other`,
      },
    });
    expect(thirdResponse.statusCode).toBe(201);
    const third = startWorkflowResponseSchema.parse(thirdResponse.json());

    expect(third.runId).not.toBe(first.runId);
  });
});
