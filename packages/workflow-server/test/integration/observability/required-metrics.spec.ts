import { describe, expect, it } from 'vitest';

import {
  createInstrumentedEventRepository,
  createWorkflowInstrumentationAdapter,
} from '../../../src/observability/instrumentation-adapter.js';
import { InMemoryWorkflowLogger } from '../../../src/observability/logger.js';
import { InMemoryWorkflowMetrics } from '../../../src/observability/metrics.js';
import { OTelWorkflowTracing } from '../../../src/observability/tracing.js';
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
        sequence,
        eventType: input.eventType,
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
    workflowType: 'wf.metrics.v1',
    workflowVersion: '1.0.0',
    lifecycle: 'running',
    currentState: 'start',
    parentRunId: null,
    startedAt: '2026-02-21T00:00:00.000Z',
    endedAt: null,
  }),
};

describe('required metrics set', () => {
  it('emits required counters, failures, durations, and active run gauge signals', async () => {
    const metrics = new InMemoryWorkflowMetrics();

    const repository = createInstrumentedEventRepository({
      baseEventRepository: createBaseEventRepository(),
      runRepository,
      instrumentation: createWorkflowInstrumentationAdapter({
        sinks: {
          logger: new InMemoryWorkflowLogger(),
          metrics,
          tracing: new OTelWorkflowTracing({
            startSpan: () =>
              ({
                end: () => {
                  return;
                },
              }) as never,
          } as never),
        },
      }),
    });

    const append = async (
      eventId: string,
      eventType: string,
      timestamp: string,
      payload?: Record<string, unknown>,
    ) => {
      await repository.appendEvent({} as never, {
        eventId,
        runId: 'wr_required_metrics',
        eventType,
        timestamp,
        payload,
      });
    };

    await append('evt-1', 'workflow.started', '2026-02-21T00:00:00.000Z');
    await append('evt-2', 'transition.requested', '2026-02-21T00:00:01.000Z', {
      from: 'start',
      to: 'middle',
      name: 'to-middle',
    });
    await append('evt-3', 'transition.completed', '2026-02-21T00:00:02.000Z', {
      from: 'start',
      to: 'middle',
      name: 'to-middle',
    });
    await append('evt-4', 'command.started', '2026-02-21T00:00:03.000Z', {
      command: 'node',
      args: ['-v'],
    });
    await append('evt-5', 'command.failed', '2026-02-21T00:00:04.000Z', {
      command: 'node',
      args: ['-v'],
      durationMs: 250,
      timeout: true,
    });
    await append('evt-6', 'child.started', '2026-02-21T00:00:05.000Z', {
      childRunId: 'wr_child_1',
      childWorkflowType: 'wf.child.v1',
      lifecycle: 'running',
    });
    await append('evt-7', 'child.failed', '2026-02-21T00:00:06.000Z', {
      childRunId: 'wr_child_1',
      childWorkflowType: 'wf.child.v1',
      lifecycle: 'failed',
    });
    await append('evt-8', 'transition.failed', '2026-02-21T00:00:07.000Z', {
      from: 'middle',
      to: 'done',
      name: 'to-done',
    });
    await append('evt-9', 'workflow.completed', '2026-02-21T00:00:08.000Z');

    const metricNames = new Set(metrics.records.map((record) => record.name));

    expect(metricNames.has('workflow.run.count')).toBe(true);
    expect(metricNames.has('workflow.run.active')).toBe(true);
    expect(metricNames.has('workflow.transition.count')).toBe(true);
    expect(metricNames.has('workflow.transition.failure.count')).toBe(true);
    expect(metricNames.has('workflow.command.invocation.count')).toBe(true);
    expect(metricNames.has('workflow.command.failure.count')).toBe(true);
    expect(metricNames.has('workflow.command.timeout.count')).toBe(true);
    expect(metricNames.has('workflow.child.launch.count')).toBe(true);
    expect(metricNames.has('workflow.child.failure.count')).toBe(true);
    expect(metricNames.has('workflow.run.duration.ms')).toBe(true);
    expect(metricNames.has('workflow.transition.duration.ms')).toBe(true);
    expect(metricNames.has('workflow.child.duration.ms')).toBe(true);
  });
});
