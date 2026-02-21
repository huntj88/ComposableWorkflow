import { describe, expect, it } from 'vitest';

import {
  createInstrumentedEventRepository,
  createWorkflowInstrumentationAdapter,
} from '../../src/observability/instrumentation-adapter.js';
import { InMemoryWorkflowLogger } from '../../src/observability/logger.js';
import { InMemoryWorkflowMetrics } from '../../src/observability/metrics.js';
import { OTelWorkflowTracing, type RecordedSpan } from '../../src/observability/tracing.js';
import type {
  EventInsert,
  EventRepository,
  PersistedEvent,
} from '../../src/persistence/event-repository.js';
import type { RunRepository } from '../../src/persistence/run-repository.js';

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

const runRepository: RunRepository = {
  upsertRunSummary: async () => {
    throw new Error('not used');
  },
  getRunSummary: async (_client, runId) => ({
    runId,
    workflowType: runId === 'wr_itx_014_child' ? 'wf.child' : 'wf.parent',
    workflowVersion: '1.0.0',
    lifecycle: 'running',
    currentState: 'start',
    parentRunId: runId === 'wr_itx_014_child' ? 'wr_itx_014_parent' : null,
    startedAt: '2026-02-21T00:00:00.000Z',
    endedAt: null,
  }),
};

const findSpan = (
  spans: RecordedSpan[],
  partialName: string,
  runId: string,
): RecordedSpan | undefined =>
  spans.find((span) => span.runId === runId && span.name.includes(partialName));

describe('itx.obs.ITX-014', () => {
  it('keeps trace tree parentage correct across transition, command, and child nesting', async () => {
    const tracing = new OTelWorkflowTracing({
      startSpan: () =>
        ({
          end: () => {
            return;
          },
        }) as never,
    } as never);

    const repository = createInstrumentedEventRepository({
      baseEventRepository: createBaseEventRepository(),
      runRepository,
      instrumentation: createWorkflowInstrumentationAdapter({
        sinks: {
          logger: new InMemoryWorkflowLogger(),
          metrics: new InMemoryWorkflowMetrics(),
          tracing,
        },
      }),
    });

    await repository.appendEvent({} as never, {
      eventId: 'evt_1',
      runId: 'wr_itx_014_parent',
      eventType: 'workflow.started',
      timestamp: '2026-02-21T00:00:00.000Z',
    });
    await repository.appendEvent({} as never, {
      eventId: 'evt_2',
      runId: 'wr_itx_014_parent',
      eventType: 'transition.requested',
      timestamp: '2026-02-21T00:00:01.000Z',
      payload: { from: 'start', to: 'command' },
    });
    await repository.appendEvent({} as never, {
      eventId: 'evt_3',
      runId: 'wr_itx_014_parent',
      eventType: 'transition.completed',
      timestamp: '2026-02-21T00:00:01.500Z',
      payload: { from: 'start', to: 'command' },
    });
    await repository.appendEvent({} as never, {
      eventId: 'evt_4',
      runId: 'wr_itx_014_parent',
      eventType: 'command.started',
      timestamp: '2026-02-21T00:00:02.000Z',
      payload: { command: 'echo' },
    });
    await repository.appendEvent({} as never, {
      eventId: 'evt_5',
      runId: 'wr_itx_014_parent',
      eventType: 'command.completed',
      timestamp: '2026-02-21T00:00:02.500Z',
      payload: { command: 'echo', durationMs: 1 },
    });
    await repository.appendEvent({} as never, {
      eventId: 'evt_6',
      runId: 'wr_itx_014_parent',
      eventType: 'child.started',
      timestamp: '2026-02-21T00:00:03.000Z',
      payload: {
        childRunId: 'wr_itx_014_child',
        childWorkflowType: 'wf.child',
        lifecycle: 'running',
      },
    });
    await repository.appendEvent({} as never, {
      eventId: 'evt_7',
      runId: 'wr_itx_014_child',
      eventType: 'workflow.started',
      timestamp: '2026-02-21T00:00:04.000Z',
    });
    await repository.appendEvent({} as never, {
      eventId: 'evt_8',
      runId: 'wr_itx_014_child',
      eventType: 'workflow.completed',
      timestamp: '2026-02-21T00:00:04.500Z',
    });
    await repository.appendEvent({} as never, {
      eventId: 'evt_9',
      runId: 'wr_itx_014_parent',
      eventType: 'workflow.completed',
      timestamp: '2026-02-21T00:00:05.000Z',
    });

    const spans = tracing.listRecordedSpans();
    const parentRoot = findSpan(spans, 'workflow.run', 'wr_itx_014_parent');
    const transition = findSpan(spans, 'workflow.transition', 'wr_itx_014_parent');
    const command = findSpan(spans, 'workflow.command', 'wr_itx_014_parent');
    const childLaunch = findSpan(spans, 'workflow.child', 'wr_itx_014_parent');
    const childRoot = findSpan(spans, 'workflow.run', 'wr_itx_014_child');

    expect(parentRoot).toBeDefined();
    expect(transition?.parentSpanId).toBe(parentRoot?.spanId);
    expect(command?.parentSpanId).toBe(parentRoot?.spanId);
    expect(childLaunch?.parentSpanId).toBe(parentRoot?.spanId);
    expect(childRoot?.parentSpanId).toBe(childLaunch?.spanId);
  });
});
