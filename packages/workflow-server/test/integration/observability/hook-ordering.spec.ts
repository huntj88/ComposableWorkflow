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
  const sequenceByRun = new Map<string, number>();

  return {
    appendEvent: async (_client, input: EventInsert): Promise<PersistedEvent> => {
      const sequence = (sequenceByRun.get(input.runId) ?? 0) + 1;
      sequenceByRun.set(input.runId, sequence);

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

const createRunRepository = (): RunRepository => ({
  upsertRunSummary: async () => {
    throw new Error('not used');
  },
  getRunSummary: async () => ({
    runId: 'wr_ordering',
    workflowType: 'wf.ordering',
    workflowVersion: '1.0.0',
    lifecycle: 'running',
    currentState: 'start',
    parentRunId: null,
    startedAt: '2026-02-21T00:00:00.000Z',
    endedAt: null,
  }),
});

describe('observability hook ordering', () => {
  it('preserves onEvent ordering under delayed sink backpressure', async () => {
    const observedOrder: string[] = [];
    const instrumentation: WorkflowInstrumentation = {
      onEvent: async (event) => {
        await new Promise((resolve) => setTimeout(resolve, 3));
        observedOrder.push(`${event.sequence}:${event.eventType}`);
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
      runRepository: createRunRepository(),
      instrumentation,
    });

    await repository.appendEvent({} as never, {
      eventId: 'evt_1',
      runId: 'wr_ordering',
      eventType: 'workflow.started',
      timestamp: '2026-02-21T00:00:00.000Z',
    });
    await repository.appendEvent({} as never, {
      eventId: 'evt_2',
      runId: 'wr_ordering',
      eventType: 'transition.requested',
      timestamp: '2026-02-21T00:00:01.000Z',
      payload: { from: 'start', to: 'end' },
    });
    await repository.appendEvent({} as never, {
      eventId: 'evt_3',
      runId: 'wr_ordering',
      eventType: 'workflow.completed',
      timestamp: '2026-02-21T00:00:02.000Z',
    });

    expect(observedOrder).toEqual([
      '1:workflow.started',
      '2:transition.requested',
      '3:workflow.completed',
    ]);
  });
});
