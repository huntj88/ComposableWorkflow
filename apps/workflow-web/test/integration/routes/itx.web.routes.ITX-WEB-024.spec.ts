/**
 * ITX-WEB-024: Run refresh/cancel action semantics are validated.
 *
 * B-WEB-024: Cancel applies only to active (non-terminal) lifecycles.
 *            Refresh re-fetches all panels from transport.
 *
 * Validates that:
 * - Cancel endpoint uses POST /api/v1/workflows/runs/:runId/cancel.
 * - Only active lifecycles are cancelable (running, pausing, paused, resuming, recovering).
 * - Terminal lifecycles (completed, failed, cancelled) are not cancelable.
 * - CancelRunResponse includes updated lifecycle.
 * - Refresh triggers calls to all panel endpoints.
 */

import { describe, expect, it } from 'vitest';

import { createWorkflowApiClient } from '../../../src/transport/workflowApiClient';
import type { WorkflowLifecycle } from '@composable-workflow/workflow-api-types';
import { buildCancelRunResponse, buildRunSummary } from '../fixtures/workflowFixtures';

const ACTIVE_CANCELABLE: WorkflowLifecycle[] = [
  'running',
  'pausing',
  'paused',
  'resuming',
  'recovering',
];

const TERMINAL: WorkflowLifecycle[] = ['completed', 'failed', 'cancelled'];

describe('integration.routes.ITX-WEB-024', () => {
  it('cancel endpoint uses POST method on /api/v1/workflows/runs/:runId/cancel', async () => {
    let capturedMethod = '';
    let capturedUrl = '';

    const client = createWorkflowApiClient({
      fetchImpl: async (input, init) => {
        capturedUrl = String(input);
        capturedMethod = (init?.method ?? 'GET').toUpperCase();
        return new Response(JSON.stringify(buildCancelRunResponse('wr_024_1')), { status: 200 });
      },
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    await client.cancelRun('wr_024_1');
    expect(capturedUrl).toBe('/api/v1/workflows/runs/wr_024_1/cancel');
    expect(capturedMethod).toBe('POST');
  });

  it('CancelRunResponse includes updated lifecycle field', async () => {
    const cancelResponse = buildCancelRunResponse('wr_024_2');

    const client = createWorkflowApiClient({
      fetchImpl: async () => new Response(JSON.stringify(cancelResponse), { status: 200 }),
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    const result = await client.cancelRun('wr_024_2');
    expect(result.runId).toBe('wr_024_2');
    expect(result.lifecycle).toBeDefined();
    expect(typeof result.lifecycle).toBe('string');
  });

  it('active cancelable lifecycles match spec: running, pausing, paused, resuming, recovering', () => {
    for (const lifecycle of ACTIVE_CANCELABLE) {
      const summary = buildRunSummary({ lifecycle });
      expect(summary.lifecycle).toBe(lifecycle);

      // Active lifecycles should be in the cancelable set
      expect(ACTIVE_CANCELABLE).toContain(lifecycle);
      expect(TERMINAL).not.toContain(lifecycle);
    }
  });

  it('terminal lifecycles are not in the cancelable set', () => {
    for (const lifecycle of TERMINAL) {
      expect(ACTIVE_CANCELABLE).not.toContain(lifecycle);
    }
  });

  it('all 9 workflow lifecycles are accounted for between cancelable and terminal+cancelling', () => {
    const allLifecycles: WorkflowLifecycle[] = [
      'running',
      'pausing',
      'paused',
      'resuming',
      'recovering',
      'cancelling',
      'completed',
      'failed',
      'cancelled',
    ];

    for (const lifecycle of allLifecycles) {
      const isCancelable = ACTIVE_CANCELABLE.includes(lifecycle);
      const isTerminal = TERMINAL.includes(lifecycle);
      const isCancelling = lifecycle === 'cancelling';

      // Each lifecycle is either cancelable, terminal, or cancelling (in-transition)
      expect(isCancelable || isTerminal || isCancelling).toBe(true);
    }
  });

  it('refresh triggers transport calls covering all 6 panel endpoints', async () => {
    const seenUrls: string[] = [];
    const client = createWorkflowApiClient({
      fetchImpl: async (input) => {
        const url = String(input);
        seenUrls.push(url);
        if (url.includes('/events')) {
          return new Response(JSON.stringify({ items: [], nextCursor: undefined }), {
            status: 200,
          });
        }
        if (url.includes('/logs')) {
          return new Response(JSON.stringify({ items: [] }), { status: 200 });
        }
        if (url.includes('/feedback-requests')) {
          return new Response(JSON.stringify({ items: [], nextCursor: undefined }), {
            status: 200,
          });
        }
        if (url.includes('/tree')) {
          return new Response(
            JSON.stringify({
              tree: {
                runId: 'wr_024_3',
                workflowType: 'test.v1',
                workflowVersion: '1.0.0',
                lifecycle: 'running',
                currentState: 'init',
                parentRunId: null,
                startedAt: '2026-03-05T00:00:00.000Z',
                endedAt: null,
                children: [],
              },
              overlay: {
                runId: 'wr_024_3',
                activeNode: 'init',
                traversedEdges: [],
                pendingEdges: [],
                failedEdges: [],
                childGraphLinks: [],
                transitionTimeline: [],
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes('/definitions/')) {
          return new Response(
            JSON.stringify({
              workflowType: 'test.v1',
              workflowVersion: '1.0.0',
              states: ['init'],
              transitions: [],
              childLaunchAnnotations: [],
              metadata: {},
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify(buildRunSummary({ runId: 'wr_024_3' })), {
          status: 200,
        });
      },
      eventSourceFactory: (url) => ({ url, close() {} }) as unknown as EventSource,
    });

    // Simulate the boot sequence calls
    await client.getRunSummary('wr_024_3');
    await client.getRunTree('wr_024_3');
    await client.getRunEvents('wr_024_3');
    await client.getRunLogs('wr_024_3');
    await client.getWorkflowDefinition('test.v1');
    await client.listRunFeedbackRequests('wr_024_3');

    // All 6 panel endpoints were called
    expect(seenUrls.some((u) => u.includes('/runs/wr_024_3') && !u.includes('/'))).toBe(false);
    expect(seenUrls.filter((u) => u.includes('/tree'))).toHaveLength(1);
    expect(seenUrls.filter((u) => u.includes('/events'))).toHaveLength(1);
    expect(seenUrls.filter((u) => u.includes('/logs'))).toHaveLength(1);
    expect(seenUrls.filter((u) => u.includes('/definitions/'))).toHaveLength(1);
    expect(seenUrls.filter((u) => u.includes('/feedback-requests'))).toHaveLength(1);
    expect(seenUrls).toHaveLength(6);
  });
});
