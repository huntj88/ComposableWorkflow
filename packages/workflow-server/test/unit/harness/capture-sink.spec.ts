import { describe, expect, it } from 'vitest';

import type { WorkflowEvent } from '@composable-workflow/workflow-lib/contracts';

import { createCaptureSink } from '../../harness/capture-sink.js';

const sampleEvent = (eventType: WorkflowEvent['eventType']): WorkflowEvent => ({
  eventId: `evt-${eventType}`,
  runId: 'run-1',
  workflowType: 'wf.test',
  eventType,
  timestamp: '2026-02-21T00:00:00.000Z',
  sequence: 1,
});

describe('harness capture sink', () => {
  it('captures and filters events/logs/metrics/traces', () => {
    const sink = createCaptureSink();
    sink.recordEvent(sampleEvent('workflow.started'));
    sink.recordEvent({
      ...sampleEvent('workflow.completed'),
      eventId: 'evt-2',
      sequence: 2,
    });

    sink.telemetry.logger.emit({
      runId: 'run-1',
      workflowType: 'wf.test',
      eventId: 'evt-log-1',
      sequence: 1,
      timestamp: '2026-02-21T00:00:01.000Z',
      severity: 'info',
      message: 'test',
    });

    sink.telemetry.metrics.emit({
      name: 'workflow.event.count',
      value: 1,
      unit: '1',
      tags: {
        runId: 'run-1',
      },
      timestamp: '2026-02-21T00:00:01.000Z',
    });

    sink.telemetry.tracing.onTrace({
      name: 'workflow.event.workflow.started',
      runId: 'run-1',
      workflowType: 'wf.test',
      startTime: '2026-02-21T00:00:00.000Z',
      endTime: '2026-02-21T00:00:00.000Z',
    });

    expect(sink.eventsByRunId('run-1')).toHaveLength(2);
    expect(sink.eventsByType('workflow.completed')).toHaveLength(1);
    expect(sink.logsByRunId('run-1')).toHaveLength(1);
    expect(sink.metricsByRunId('run-1')).toHaveLength(1);
    expect(sink.tracesByRunId('run-1')).toHaveLength(1);
  });
});
