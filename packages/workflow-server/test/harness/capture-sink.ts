import type {
  WorkflowEvent,
  WorkflowMetric,
  WorkflowTrace,
} from '@composable-workflow/workflow-lib/contracts';

import type { WorkflowLogRecord, WorkflowLogger } from '../../src/observability/logger.js';
import type { WorkflowMetrics } from '../../src/observability/metrics.js';
import type { WorkflowTracing } from '../../src/observability/tracing.js';

export interface HarnessCaptureSink {
  telemetry: {
    logger: WorkflowLogger;
    metrics: WorkflowMetrics;
    tracing: WorkflowTracing;
  };
  recordEvent: (event: WorkflowEvent) => void;
  clear: () => void;
  eventsByRunId: (runId: string) => WorkflowEvent[];
  eventsByType: (eventType: string) => WorkflowEvent[];
  logsByRunId: (runId: string) => WorkflowLogRecord[];
  metricsByRunId: (runId: string) => WorkflowMetric[];
  tracesByRunId: (runId: string) => WorkflowTrace[];
  snapshot: () => {
    events: WorkflowEvent[];
    logs: WorkflowLogRecord[];
    metrics: WorkflowMetric[];
    traces: WorkflowTrace[];
  };
}

interface InMemoryTracing extends WorkflowTracing {
  records: WorkflowTrace[];
}

const createInMemoryTracing = (): InMemoryTracing => {
  const records: WorkflowTrace[] = [];

  return {
    records,
    onTrace: (trace) => {
      records.push(trace);
    },
    onEvent: (event) => {
      records.push({
        name: `workflow.event.${event.eventType}`,
        runId: event.runId,
        workflowType: event.workflowType,
        startTime: event.timestamp,
        endTime: event.timestamp,
        attributes: {
          eventId: event.eventId,
          sequence: event.sequence,
          eventType: event.eventType,
        },
      });
    },
    listRecordedSpans: () => [],
  };
};

export const createCaptureSink = (): HarnessCaptureSink => {
  const events: WorkflowEvent[] = [];
  const logs: WorkflowLogRecord[] = [];
  const metrics: WorkflowMetric[] = [];
  const tracing = createInMemoryTracing();

  return {
    telemetry: {
      logger: {
        emit: (record) => {
          logs.push(record);
        },
      },
      metrics: {
        emit: (metric) => {
          metrics.push(metric);
        },
      },
      tracing,
    },
    recordEvent: (event) => {
      events.push(event);
    },
    clear: () => {
      events.length = 0;
      logs.length = 0;
      metrics.length = 0;
      tracing.records.length = 0;
    },
    eventsByRunId: (runId) => events.filter((event) => event.runId === runId),
    eventsByType: (eventType) => events.filter((event) => event.eventType === eventType),
    logsByRunId: (runId) => logs.filter((record) => record.runId === runId),
    metricsByRunId: (runId) => metrics.filter((metric) => metric.tags?.runId === runId),
    tracesByRunId: (runId) => tracing.records.filter((trace) => trace.runId === runId),
    snapshot: () => ({
      events: [...events],
      logs: [...logs],
      metrics: [...metrics],
      traces: [...tracing.records],
    }),
  };
};
