import { describe, expect, it, vi } from 'vitest';

import type { DbClient } from '../../src/persistence/db.js';
import type { EventInsert } from '../../src/persistence/event-repository.js';
import { runTransitionStep } from '../../src/orchestrator/transition-runner.js';
import { createWorkflowRegistry } from '../../src/registry/workflow-registry.js';

const FORBIDDEN_LIFECYCLES = ['pausing', 'paused', 'resuming', 'cancelling', 'recovering'] as const;

describe('itx.lifecycle.ITX-009', () => {
  it('prevents child launch side effects when a step enters from forbidden lifecycles', async () => {
    const registry = createWorkflowRegistry('reject');
    registry.register({
      workflowType: 'wf.itx.009',
      workflowVersion: '1.0.0',
      factory: () => ({
        initialState: 'start',
        states: {
          start: async (ctx) => {
            await ctx.launchChild({
              workflowType: 'wf.itx.009',
              input: {},
            });
            ctx.complete({ ok: true });
          },
        },
      }),
      packageName: 'itx-tests',
      packageVersion: '1.0.0',
      source: 'path',
      sourceValue: 'test',
    });

    for (const lifecycle of FORBIDDEN_LIFECYCLES) {
      const appendedEvents: EventInsert[] = [];

      await runTransitionStep({
        client: {} as DbClient,
        deps: {
          registry,
          runRepository: {
            getRunSummary: vi.fn().mockResolvedValue({
              runId: `wr_itx_009_${lifecycle}`,
              workflowType: 'wf.itx.009',
              workflowVersion: '1.0.0',
              lifecycle,
              currentState: 'start',
              parentRunId: null,
              startedAt: '2026-02-21T00:00:00.000Z',
              endedAt: null,
            }),
            upsertRunSummary: vi.fn().mockImplementation(async (_client, input) => input),
          },
          eventRepository: {
            appendEvent: vi.fn().mockImplementation(async (_client, event: EventInsert) => {
              appendedEvents.push(event);
              return {
                eventId: event.eventId,
                runId: event.runId,
                eventType: event.eventType,
                sequence: appendedEvents.length,
                timestamp: event.timestamp,
                payload: event.payload ?? null,
                error: event.error ?? null,
              };
            }),
          },
          idempotencyRepository: {
            reserveStartKey: vi.fn(),
            getByKey: vi.fn(),
          },
          eventIdFactory: () => `evt_${appendedEvents.length + 1}`,
          runIdFactory: () => `run_${lifecycle}`,
          now: () => new Date('2026-02-21T00:00:01.000Z'),
        },
        run: {
          runId: `wr_itx_009_${lifecycle}`,
          workflowType: 'wf.itx.009',
          workflowVersion: '1.0.0',
          lifecycle,
          currentState: 'start',
          parentRunId: null,
          startedAt: '2026-02-21T00:00:00.000Z',
          endedAt: null,
        },
      });

      expect(appendedEvents.some((event) => event.eventType.startsWith('child.'))).toBe(false);
    }
  });
});
