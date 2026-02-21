import { describe, expect, it } from 'vitest';

import {
  errorEnvelopeSchema,
  eventsQuerySchema,
  runSummarySchema,
  runsListQuerySchema,
  startWorkflowBodySchema,
} from '../../../src/api/schemas.js';

describe('api schemas', () => {
  it('parses valid start request payloads', () => {
    const parsed = startWorkflowBodySchema.parse({
      workflowType: 'wf.schema',
      input: { ok: true },
      idempotencyKey: 'idem-1',
      metadata: { source: 'test' },
    });

    expect(parsed.workflowType).toBe('wf.schema');
  });

  it('parses query filters and defaults', () => {
    const listQuery = runsListQuerySchema.parse({
      lifecycle: 'running,paused',
      workflowType: 'wf.a,wf.b',
    });

    const eventsQuery = eventsQuerySchema.parse({
      limit: '25',
    });

    expect(listQuery.lifecycle).toEqual(['running', 'paused']);
    expect(listQuery.workflowType).toEqual(['wf.a', 'wf.b']);
    expect(eventsQuery.limit).toBe(25);
  });

  it('enforces run summary response shape', () => {
    expect(() =>
      runSummarySchema.parse({
        runId: 'run-1',
        workflowType: 'wf.schema',
        workflowVersion: '1.0.0',
        lifecycle: 'running',
        currentState: 'start',
        parentRunId: null,
        childrenSummary: {
          total: 0,
          active: 0,
          completed: 0,
          failed: 0,
          cancelled: 0,
        },
        startedAt: '2026-02-21T00:00:00.000Z',
        endedAt: null,
        counters: {
          eventCount: 1,
          logCount: 0,
          childCount: 0,
        },
      }),
    ).not.toThrow();

    expect(() =>
      errorEnvelopeSchema.parse({
        code: '',
        message: 'bad',
        requestId: 'req',
      }),
    ).toThrow();
  });
});
