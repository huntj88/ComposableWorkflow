import { describe, expect, it } from 'vitest';

import type { WorkflowInstrumentation } from '@composable-workflow/workflow-lib/contracts';

import { createInstrumentedEventRepository } from '../../../src/observability/instrumentation-adapter.js';
import type {
  EventInsert,
  EventRepository,
  PersistedEvent,
} from '../../../src/persistence/event-repository.js';
import type { RunRepository } from '../../../src/persistence/run-repository.js';

const createBaseEventRepository = (): EventRepository => {
  let sequence = 0;

  return {
    appendEvent: async (_client, input: EventInsert): Promise<PersistedEvent> => {
      sequence += 1;

      return {
        eventId: input.eventId,
        runId: input.runId,
        eventType: input.eventType,
        sequence,
        timestamp: input.timestamp,
        payload: input.payload ?? null,
        error: input.error ?? null,
      };
    },
  };
};

const runRepository: RunRepository = {
  upsertRunSummary: async () => {
    throw new Error('not used');
  },
  getRunSummary: async (_client, runId) => ({
    runId,
    workflowType: 'wf.failure-isolation',
    workflowVersion: '1.0.0',
    lifecycle: 'running',
    currentState: 'start',
    parentRunId: null,
    startedAt: '2026-02-21T00:00:00.000Z',
    endedAt: null,
  }),
};

describe('observability failure isolation', () => {
  it('swallows sink failures and still returns persisted event', async () => {
    const instrumentation: WorkflowInstrumentation = {
      onEvent: async (event) => {
        if (event.sequence === 1) {
          throw new Error('sink unavailable');
        }
      },
      onMetric: async () => {
        return;
      },
      onTrace: async () => {
        return;
      },
    };

    const repository = createInstrumentedEventRepository({
      baseEventRepository: createBaseEventRepository(),
      runRepository,
      instrumentation,
    });

    const firstPersisted = await repository.appendEvent({} as never, {
      eventId: 'evt_first',
      runId: 'wr_failure',
      eventType: 'workflow.started',
      timestamp: '2026-02-21T00:00:00.000Z',
    });
    const secondPersisted = await repository.appendEvent({} as never, {
      eventId: 'evt_second',
      runId: 'wr_failure',
      eventType: 'workflow.completed',
      timestamp: '2026-02-21T00:00:01.000Z',
    });

    expect(firstPersisted.sequence).toBe(1);
    expect(secondPersisted.sequence).toBe(2);
    expect(secondPersisted.eventType).toBe('workflow.completed');
  });
});
