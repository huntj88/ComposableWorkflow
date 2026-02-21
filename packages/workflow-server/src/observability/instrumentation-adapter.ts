import type {
  WorkflowEvent,
  WorkflowInstrumentation,
  WorkflowLifecycle,
  WorkflowMetric,
  WorkflowTrace,
} from '@composable-workflow/workflow-lib/contracts';

import type { DbClient } from '../persistence/db.js';
import type {
  EventInsert,
  EventRepository,
  PersistedEvent,
} from '../persistence/event-repository.js';
import type { RunRepository } from '../persistence/run-repository.js';
import { createPinoWorkflowLogger, type WorkflowLogRecord, type WorkflowLogger } from './logger.js';
import { createOtelWorkflowMetrics, type WorkflowMetrics } from './metrics.js';
import { createOtelWorkflowTracing, type WorkflowTracing } from './tracing.js';

export interface TelemetrySinks {
  logger: WorkflowLogger;
  metrics: WorkflowMetrics;
  tracing: WorkflowTracing;
}

export interface InstrumentationAdapterOptions {
  sinks?: Partial<TelemetrySinks>;
}

export const createDefaultTelemetrySinks = (): TelemetrySinks => ({
  logger: createPinoWorkflowLogger(),
  metrics: createOtelWorkflowMetrics(),
  tracing: createOtelWorkflowTracing(),
});

const toSeverity = (event: WorkflowEvent): WorkflowLogRecord['severity'] => {
  if (event.eventType.endsWith('.failed') || event.eventType === 'workflow.failed') {
    return 'error';
  }

  if (
    event.eventType === 'workflow.pausing' ||
    event.eventType === 'workflow.resuming' ||
    event.eventType === 'workflow.cancelling'
  ) {
    return 'warn';
  }

  return 'info';
};

const toMessage = (event: WorkflowEvent): string => {
  if (event.eventType === 'log') {
    return typeof event.payload?.message === 'string'
      ? event.payload.message
      : 'Workflow log event emitted';
  }

  return `Workflow event ${event.eventType}`;
};

const toCommandFields = (
  event: WorkflowEvent,
): {
  command?: string;
  args?: string[];
  stdin?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
  timeoutMs?: number;
  truncated?: boolean;
  redactedFields?: string[];
} => {
  if (!event.eventType.startsWith('command.')) {
    return {};
  }

  return {
    command: typeof event.payload?.command === 'string' ? event.payload.command : undefined,
    args: Array.isArray(event.payload?.args)
      ? event.payload.args.filter((value): value is string => typeof value === 'string')
      : undefined,
    stdin: typeof event.payload?.stdin === 'string' ? event.payload.stdin : undefined,
    stdout: typeof event.payload?.stdout === 'string' ? event.payload.stdout : undefined,
    stderr: typeof event.payload?.stderr === 'string' ? event.payload.stderr : undefined,
    exitCode:
      typeof event.payload?.exitCode === 'number' ? Number(event.payload.exitCode) : undefined,
    durationMs:
      typeof event.payload?.durationMs === 'number' ? Number(event.payload.durationMs) : undefined,
    timeoutMs:
      typeof event.payload?.timeoutMs === 'number' ? Number(event.payload.timeoutMs) : undefined,
    truncated:
      typeof event.payload?.truncated === 'boolean' ? Boolean(event.payload.truncated) : undefined,
    redactedFields: Array.isArray(event.payload?.redactedFields)
      ? event.payload.redactedFields.filter((value): value is string => typeof value === 'string')
      : undefined,
  };
};

export const projectEventToLogRecord = (event: WorkflowEvent): WorkflowLogRecord => ({
  runId: event.runId,
  workflowType: event.workflowType,
  eventId: event.eventId,
  sequence: event.sequence,
  timestamp: event.timestamp,
  severity: toSeverity(event),
  message: toMessage(event),
  parentRunId: event.parentRunId,
  state:
    event.state ?? (typeof event.payload?.state === 'string' ? event.payload.state : undefined),
  transition: {
    from: typeof event.payload?.from === 'string' ? event.payload.from : undefined,
    to: typeof event.payload?.to === 'string' ? event.payload.to : undefined,
    name: typeof event.payload?.name === 'string' ? event.payload.name : undefined,
  },
  childRunId: typeof event.payload?.childRunId === 'string' ? event.payload.childRunId : undefined,
  ...toCommandFields(event),
});

export const projectEventMetrics = (event: WorkflowEvent): WorkflowMetric[] => {
  const lifecycleEvent = event.eventType.startsWith('workflow.')
    ? event.eventType.replace('workflow.', '')
    : 'none';
  const transitionName =
    typeof event.payload?.name === 'string'
      ? event.payload.name
      : event.eventType.startsWith('transition.')
        ? event.eventType.replace('transition.', '')
        : 'none';
  const commandName =
    event.eventType.startsWith('command.') && typeof event.payload?.command === 'string'
      ? event.payload.command
      : 'none';
  const outcome = event.eventType.endsWith('.failed') ? 'failed' : 'success';

  const baseTags = {
    workflowType: event.workflowType,
    lifecycle: lifecycleEvent,
    transition: transitionName,
    command: commandName,
    outcome,
  };

  const metrics: WorkflowMetric[] = [
    {
      name: 'workflow.event.count',
      value: 1,
      unit: '1',
      tags: baseTags,
      timestamp: event.timestamp,
    },
  ];

  if (event.eventType.startsWith('command.') && typeof event.payload?.durationMs === 'number') {
    metrics.push({
      name: 'workflow.command.duration.ms',
      value: Number(event.payload.durationMs),
      unit: 'ms',
      tags: baseTags,
      timestamp: event.timestamp,
    });
  }

  return metrics;
};

const projectTraceForEvent = (event: WorkflowEvent): WorkflowTrace => ({
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

export const createWorkflowInstrumentationAdapter = (
  options: InstrumentationAdapterOptions = {},
): WorkflowInstrumentation => {
  const sinks = {
    ...createDefaultTelemetrySinks(),
    ...options.sinks,
  };

  const safeEmit = (kind: 'log' | 'metric' | 'trace', action: () => void): void => {
    try {
      action();
    } catch (error) {
      if (kind !== 'metric') {
        try {
          sinks.metrics.emit({
            name: 'workflow.telemetry.failure',
            value: 1,
            unit: '1',
            tags: {
              workflowType: 'telemetry',
              lifecycle: 'none',
              transition: 'none',
              command: kind,
              outcome: 'failed',
            },
            timestamp: new Date().toISOString(),
          });
        } catch {
          return;
        }
      }

      if (kind !== 'log') {
        try {
          sinks.logger.emit({
            runId: 'telemetry',
            workflowType: 'telemetry',
            eventId: 'telemetry-failure',
            sequence: 0,
            timestamp: new Date().toISOString(),
            severity: 'warn',
            message: `Telemetry sink failure (${kind}): ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          });
        } catch {
          return;
        }
      }
    }
  };

  return {
    onEvent: async (event) => {
      const logRecord = projectEventToLogRecord(event);

      safeEmit('log', () => sinks.logger.emit(logRecord));

      for (const metric of projectEventMetrics(event)) {
        safeEmit('metric', () => sinks.metrics.emit(metric));
      }

      safeEmit('trace', () => sinks.tracing.onEvent(event));
      safeEmit('trace', () => sinks.tracing.onTrace(projectTraceForEvent(event)));
    },
    onMetric: async (metric) => {
      safeEmit('metric', () => sinks.metrics.emit(metric));
    },
    onTrace: async (trace) => {
      safeEmit('trace', () => sinks.tracing.onTrace(trace));
    },
  };
};

const toWorkflowEvent = (
  persisted: PersistedEvent,
  runSummary: {
    runId: string;
    workflowType: string;
    parentRunId: string | null;
  },
): WorkflowEvent => ({
  eventId: persisted.eventId,
  runId: persisted.runId,
  parentRunId: runSummary.parentRunId ?? undefined,
  workflowType: runSummary.workflowType,
  eventType: persisted.eventType as WorkflowEvent['eventType'],
  timestamp: persisted.timestamp,
  sequence: persisted.sequence,
  payload: persisted.payload ?? undefined,
  error: persisted.error
    ? {
        name:
          typeof persisted.error.name === 'string' ? persisted.error.name : 'WorkflowEventError',
        message:
          typeof persisted.error.message === 'string'
            ? persisted.error.message
            : 'Unknown workflow event error',
        stack: typeof persisted.error.stack === 'string' ? persisted.error.stack : undefined,
      }
    : undefined,
  state: typeof persisted.payload?.state === 'string' ? persisted.payload.state : undefined,
  transition: persisted.eventType.startsWith('transition.')
    ? {
        from: typeof persisted.payload?.from === 'string' ? persisted.payload.from : undefined,
        to: typeof persisted.payload?.to === 'string' ? persisted.payload.to : undefined,
        name: typeof persisted.payload?.name === 'string' ? persisted.payload.name : undefined,
      }
    : undefined,
  child: persisted.eventType.startsWith('child.')
    ? {
        childRunId:
          typeof persisted.payload?.childRunId === 'string' ? persisted.payload.childRunId : '',
        childWorkflowType:
          typeof persisted.payload?.childWorkflowType === 'string'
            ? persisted.payload.childWorkflowType
            : '',
        lifecycle:
          typeof persisted.payload?.lifecycle === 'string'
            ? (persisted.payload.lifecycle as WorkflowLifecycle)
            : 'failed',
      }
    : undefined,
  command: persisted.eventType.startsWith('command.')
    ? {
        command:
          typeof persisted.payload?.command === 'string' ? persisted.payload.command : 'unknown',
        args: Array.isArray(persisted.payload?.args)
          ? persisted.payload.args.filter((value): value is string => typeof value === 'string')
          : undefined,
        stdin: typeof persisted.payload?.stdin === 'string' ? persisted.payload.stdin : undefined,
        stdout:
          typeof persisted.payload?.stdout === 'string' ? persisted.payload.stdout : undefined,
        stderr:
          typeof persisted.payload?.stderr === 'string' ? persisted.payload.stderr : undefined,
        exitCode:
          typeof persisted.payload?.exitCode === 'number'
            ? Number(persisted.payload.exitCode)
            : undefined,
      }
    : undefined,
});

export const createInstrumentedEventRepository = (params: {
  baseEventRepository: EventRepository;
  runRepository: RunRepository;
  instrumentation: WorkflowInstrumentation;
}): EventRepository => ({
  appendEvent: async (client: DbClient, input: EventInsert): Promise<PersistedEvent> => {
    const persisted = await params.baseEventRepository.appendEvent(client, input);
    const runSummary = await params.runRepository.getRunSummary(client, persisted.runId);

    if (!runSummary) {
      return persisted;
    }

    const event = toWorkflowEvent(persisted, runSummary);

    try {
      await params.instrumentation.onEvent(event);
    } catch {
      return persisted;
    }

    return persisted;
  },
});
