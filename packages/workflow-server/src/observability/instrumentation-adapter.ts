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
  if (event.eventType === 'log') {
    const level =
      typeof event.payload?.level === 'string'
        ? event.payload.level
        : typeof event.payload?.severity === 'string'
          ? event.payload.severity
          : 'info';
    const normalized = level.toLowerCase();

    if (normalized === 'warning') {
      return 'warn';
    }

    if (normalized === 'trace' || normalized === 'debug' || normalized === 'info') {
      return 'info';
    }

    if (normalized === 'warn') {
      return 'warn';
    }

    if (normalized === 'error' || normalized === 'fatal') {
      return 'error';
    }
  }

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

  if (event.eventType === 'workflow.started') {
    metrics.push({
      name: 'workflow.run.count',
      value: 1,
      unit: '1',
      tags: {
        ...baseTags,
        lifecycle: 'started',
      },
      timestamp: event.timestamp,
    });
    metrics.push({
      name: 'workflow.run.active',
      value: 1,
      unit: '1',
      tags: {
        ...baseTags,
        lifecycle: 'active',
      },
      timestamp: event.timestamp,
    });
  }

  if (event.eventType === 'workflow.completed') {
    metrics.push({
      name: 'workflow.run.count',
      value: 1,
      unit: '1',
      tags: {
        ...baseTags,
        lifecycle: 'completed',
      },
      timestamp: event.timestamp,
    });
    metrics.push({
      name: 'workflow.run.active',
      value: -1,
      unit: '1',
      tags: {
        ...baseTags,
        lifecycle: 'active',
      },
      timestamp: event.timestamp,
    });
  }

  if (event.eventType === 'workflow.failed' || event.eventType === 'workflow.cancelled') {
    metrics.push({
      name: 'workflow.run.count',
      value: 1,
      unit: '1',
      tags: {
        ...baseTags,
        lifecycle: event.eventType.replace('workflow.', ''),
      },
      timestamp: event.timestamp,
    });
    metrics.push({
      name: 'workflow.run.active',
      value: -1,
      unit: '1',
      tags: {
        ...baseTags,
        lifecycle: 'active',
      },
      timestamp: event.timestamp,
    });
  }

  if (event.eventType === 'transition.requested') {
    metrics.push({
      name: 'workflow.transition.count',
      value: 1,
      unit: '1',
      tags: baseTags,
      timestamp: event.timestamp,
    });
  }

  if (event.eventType === 'transition.failed') {
    metrics.push({
      name: 'workflow.transition.failure.count',
      value: 1,
      unit: '1',
      tags: baseTags,
      timestamp: event.timestamp,
    });
  }

  if (event.eventType === 'command.started') {
    metrics.push({
      name: 'workflow.command.invocation.count',
      value: 1,
      unit: '1',
      tags: baseTags,
      timestamp: event.timestamp,
    });
  }

  if (event.eventType === 'command.failed') {
    metrics.push({
      name: 'workflow.command.failure.count',
      value: 1,
      unit: '1',
      tags: baseTags,
      timestamp: event.timestamp,
    });

    if (event.payload?.timeout === true) {
      metrics.push({
        name: 'workflow.command.timeout.count',
        value: 1,
        unit: '1',
        tags: baseTags,
        timestamp: event.timestamp,
      });
    }
  }

  if (event.eventType === 'child.started') {
    metrics.push({
      name: 'workflow.child.launch.count',
      value: 1,
      unit: '1',
      tags: baseTags,
      timestamp: event.timestamp,
    });
  }

  if (event.eventType === 'child.failed') {
    metrics.push({
      name: 'workflow.child.failure.count',
      value: 1,
      unit: '1',
      tags: baseTags,
      timestamp: event.timestamp,
    });
  }

  return metrics;
};

const createDerivedDurationMetricsProjector = () => {
  const runStartedAtByRunId = new Map<string, number>();
  const transitionStartedAtByRunId = new Map<string, number>();
  const childStartedAtByKey = new Map<string, number>();

  return (event: WorkflowEvent): WorkflowMetric[] => {
    const timestampMs = Date.parse(event.timestamp);
    const fallbackTags = {
      workflowType: event.workflowType,
      lifecycle: 'none',
      transition:
        typeof event.payload?.name === 'string'
          ? event.payload.name
          : typeof event.payload?.to === 'string'
            ? event.payload.to
            : 'none',
      command: typeof event.payload?.command === 'string' ? event.payload.command : 'none',
      outcome: event.eventType.endsWith('.failed') ? 'failed' : 'success',
    };

    if (!Number.isFinite(timestampMs)) {
      return [];
    }

    const derived: WorkflowMetric[] = [];

    if (event.eventType === 'workflow.started') {
      runStartedAtByRunId.set(event.runId, timestampMs);
      return derived;
    }

    if (
      event.eventType === 'workflow.completed' ||
      event.eventType === 'workflow.failed' ||
      event.eventType === 'workflow.cancelled'
    ) {
      const startedAt = runStartedAtByRunId.get(event.runId);
      runStartedAtByRunId.delete(event.runId);

      if (typeof startedAt === 'number' && timestampMs >= startedAt) {
        derived.push({
          name: 'workflow.run.duration.ms',
          value: timestampMs - startedAt,
          unit: 'ms',
          tags: {
            ...fallbackTags,
            lifecycle: event.eventType.replace('workflow.', ''),
          },
          timestamp: event.timestamp,
        });
      }
    }

    if (event.eventType === 'transition.requested') {
      transitionStartedAtByRunId.set(event.runId, timestampMs);
      return derived;
    }

    if (event.eventType === 'transition.completed' || event.eventType === 'transition.failed') {
      const startedAt = transitionStartedAtByRunId.get(event.runId);
      transitionStartedAtByRunId.delete(event.runId);

      if (typeof startedAt === 'number' && timestampMs >= startedAt) {
        derived.push({
          name: 'workflow.transition.duration.ms',
          value: timestampMs - startedAt,
          unit: 'ms',
          tags: fallbackTags,
          timestamp: event.timestamp,
        });
      }
    }

    if (event.eventType === 'child.started' && typeof event.payload?.childRunId === 'string') {
      childStartedAtByKey.set(`${event.runId}:${event.payload.childRunId}`, timestampMs);
      return derived;
    }

    if (
      (event.eventType === 'child.completed' || event.eventType === 'child.failed') &&
      typeof event.payload?.childRunId === 'string'
    ) {
      const key = `${event.runId}:${event.payload.childRunId}`;
      const startedAt = childStartedAtByKey.get(key);
      childStartedAtByKey.delete(key);

      if (typeof startedAt === 'number' && timestampMs >= startedAt) {
        derived.push({
          name: 'workflow.child.duration.ms',
          value: timestampMs - startedAt,
          unit: 'ms',
          tags: fallbackTags,
          timestamp: event.timestamp,
        });
      }
    }

    return derived;
  };
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
  const projectDerivedDurationMetrics = createDerivedDurationMetricsProjector();

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

      for (const metric of projectDerivedDurationMetrics(event)) {
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
}): EventRepository => {
  const getLatestTransitionData = params.baseEventRepository.getLatestTransitionData;
  const getStartedInput = params.baseEventRepository.getStartedInput;

  return {
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
    getLatestTransitionData: getLatestTransitionData
      ? async (client, runId, toState) => getLatestTransitionData(client, runId, toState)
      : undefined,
    getStartedInput: getStartedInput
      ? async (client, runId) => getStartedInput(client, runId)
      : undefined,
  };
};
