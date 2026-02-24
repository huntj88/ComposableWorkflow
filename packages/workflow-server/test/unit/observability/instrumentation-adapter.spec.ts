import { describe, expect, it, vi } from 'vitest';

import type { WorkflowEvent } from '@composable-workflow/workflow-lib/contracts';

import {
  createInstrumentedEventRepository,
  createWorkflowInstrumentationAdapter,
  projectEventMetrics,
  projectEventToLogRecord,
} from '../../../src/observability/instrumentation-adapter.js';
import { InMemoryWorkflowLogger } from '../../../src/observability/logger.js';
import { InMemoryWorkflowMetrics } from '../../../src/observability/metrics.js';
import { createOtelWorkflowTracing } from '../../../src/observability/tracing.js';

describe('observability instrumentation adapter', () => {
  it('preserves getLatestTransitionData passthrough on instrumented repository', async () => {
    const expected = { index: 2, completed: ['req_1:safe-point:1', 'req_1:safe-point:2'] };
    const getLatestTransitionData = vi.fn(async () => expected);

    const repository = createInstrumentedEventRepository({
      baseEventRepository: {
        appendEvent: vi.fn(async () => {
          throw new Error('appendEvent not expected in this test');
        }),
        getLatestTransitionData,
      },
      runRepository: {
        upsertRunSummary: vi.fn(),
        getRunSummary: vi.fn(),
      },
      instrumentation: {
        onEvent: vi.fn(async () => undefined),
      },
    });

    const result = await repository.getLatestTransitionData?.({} as never, 'wr_1', 'checkpoint');

    expect(result).toEqual(expected);
    expect(getLatestTransitionData).toHaveBeenCalledOnce();
    expect(getLatestTransitionData).toHaveBeenCalledWith({} as never, 'wr_1', 'checkpoint');
  });

  it('projects required command log fields', () => {
    const event: WorkflowEvent = {
      eventId: 'evt_1',
      runId: 'wr_1',
      workflowType: 'wf.command',
      eventType: 'command.completed',
      timestamp: '2026-02-21T00:00:00.000Z',
      sequence: 11,
      payload: {
        command: 'echo',
        args: ['hello'],
        stdin: 'in',
        stdout: 'out',
        stderr: '',
        exitCode: 0,
        durationMs: 5,
        timeoutMs: 100,
        truncated: false,
        redactedFields: ['stdin'],
      },
    };

    const logRecord = projectEventToLogRecord(event);

    expect(logRecord).toMatchObject({
      runId: 'wr_1',
      workflowType: 'wf.command',
      eventId: 'evt_1',
      sequence: 11,
      timestamp: '2026-02-21T00:00:00.000Z',
      severity: 'info',
      command: 'echo',
      args: ['hello'],
      stdin: 'in',
      stdout: 'out',
      stderr: '',
      exitCode: 0,
      durationMs: 5,
      timeoutMs: 100,
      truncated: false,
      redactedFields: ['stdin'],
    });
  });

  it('projects bounded metric dimensions', () => {
    const metrics = projectEventMetrics({
      eventId: 'evt_2',
      runId: 'wr_2',
      workflowType: 'wf.metrics',
      eventType: 'transition.failed',
      timestamp: '2026-02-21T00:00:00.000Z',
      sequence: 2,
      payload: {
        from: 'start',
        to: 'end',
        name: 'a'.repeat(120),
      },
    });

    expect(metrics[0]?.tags).toEqual({
      workflowType: 'wf.metrics',
      lifecycle: 'none',
      transition: 'a'.repeat(120),
      command: 'none',
      outcome: 'failed',
    });
  });

  it('isolates sink failures and records local warning metric', async () => {
    const logger = new InMemoryWorkflowLogger();
    const metricSink = new InMemoryWorkflowMetrics();
    const adapter = createWorkflowInstrumentationAdapter({
      sinks: {
        logger: {
          emit: () => {
            throw new Error('logger down');
          },
        },
        metrics: metricSink,
        tracing: createOtelWorkflowTracing(),
      },
    });

    await expect(
      adapter.onEvent({
        eventId: 'evt_3',
        runId: 'wr_3',
        workflowType: 'wf.failure',
        eventType: 'workflow.started',
        timestamp: '2026-02-21T00:00:00.000Z',
        sequence: 1,
      }),
    ).resolves.toBeUndefined();

    expect(metricSink.records.some((record) => record.name === 'workflow.telemetry.failure')).toBe(
      true,
    );
    expect(logger.records).toHaveLength(0);
  });
});
