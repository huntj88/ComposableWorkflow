import { context, trace, type Context, type Span, type Tracer } from '@opentelemetry/api';

import type { WorkflowEvent, WorkflowTrace } from '@composable-workflow/workflow-lib/contracts';

export interface RecordedSpan {
  spanId: string;
  parentSpanId?: string;
  runId: string;
  workflowType: string;
  name: string;
  startTime: string;
  endTime?: string;
  attributes: Record<string, string | number | boolean>;
}

export interface WorkflowTracing {
  onTrace(trace: WorkflowTrace): void;
  onEvent(event: WorkflowEvent): void;
  listRecordedSpans(): RecordedSpan[];
}

interface ActiveSpan {
  span: Span;
  context: Context;
  record: RecordedSpan;
}

const toAttributes = (
  value: Record<string, unknown> | undefined,
): Record<string, string | number | boolean> => {
  if (!value) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, fieldValue]) => ['string', 'number', 'boolean'].includes(typeof fieldValue))
      .map(([key, fieldValue]) => [key, fieldValue as string | number | boolean]),
  );
};

const eventCreatesSpan = (eventType: string): boolean =>
  eventType === 'workflow.started' ||
  eventType === 'transition.requested' ||
  eventType === 'command.started' ||
  eventType === 'child.started';

const eventEndsSpan = (eventType: string): boolean =>
  eventType === 'workflow.completed' ||
  eventType === 'workflow.failed' ||
  eventType === 'workflow.cancelled' ||
  eventType === 'transition.completed' ||
  eventType === 'transition.failed' ||
  eventType === 'command.completed' ||
  eventType === 'command.failed';

const spanTypeForEvent = (
  eventType: string,
): 'run' | 'transition' | 'command' | 'child' | undefined => {
  if (
    eventType === 'workflow.started' ||
    eventType === 'workflow.completed' ||
    eventType === 'workflow.failed' ||
    eventType === 'workflow.cancelled'
  ) {
    return 'run';
  }

  if (eventType.startsWith('transition.')) {
    return 'transition';
  }

  if (eventType.startsWith('command.')) {
    return 'command';
  }

  if (eventType === 'child.started') {
    return 'child';
  }

  return undefined;
};

const transitionSpanName = (event: WorkflowEvent): string => {
  const from = typeof event.payload?.from === 'string' ? event.payload.from : 'unknown';
  const to = typeof event.payload?.to === 'string' ? event.payload.to : 'unknown';
  return `workflow.transition ${from}->${to}`;
};

const commandSpanName = (event: WorkflowEvent): string => {
  const command = typeof event.payload?.command === 'string' ? event.payload.command : 'unknown';
  return `workflow.command ${command}`;
};

const childSpanName = (event: WorkflowEvent): string => {
  const childWorkflowType =
    typeof event.payload?.childWorkflowType === 'string'
      ? event.payload.childWorkflowType
      : 'unknown';
  return `workflow.child ${childWorkflowType}`;
};

const spanNameForEvent = (event: WorkflowEvent): string => {
  if (event.eventType === 'workflow.started') {
    return `workflow.run ${event.workflowType}`;
  }

  if (event.eventType.startsWith('transition.')) {
    return transitionSpanName(event);
  }

  if (event.eventType.startsWith('command.')) {
    return commandSpanName(event);
  }

  if (event.eventType === 'child.started') {
    return childSpanName(event);
  }

  return `workflow.event ${event.eventType}`;
};

export class OTelWorkflowTracing implements WorkflowTracing {
  private readonly rootsByRunId = new Map<string, ActiveSpan>();
  private readonly transitionsByRunId = new Map<string, ActiveSpan>();
  private readonly commandsByRunId = new Map<string, ActiveSpan>();
  private readonly childrenByChildRunId = new Map<string, ActiveSpan>();
  private readonly recorded: RecordedSpan[] = [];
  private sequence = 0;

  constructor(private readonly tracer: Tracer) {}

  onTrace(workflowTrace: WorkflowTrace): void {
    const runId = workflowTrace.runId ?? 'unknown';
    const workflowType = workflowTrace.workflowType ?? 'unknown';
    const spanId = `span_${++this.sequence}`;

    this.recorded.push({
      spanId,
      runId,
      workflowType,
      name: workflowTrace.name,
      startTime: workflowTrace.startTime ?? new Date().toISOString(),
      endTime: workflowTrace.endTime,
      attributes: toAttributes(workflowTrace.attributes as Record<string, unknown> | undefined),
    });
  }

  onEvent(event: WorkflowEvent): void {
    if (eventCreatesSpan(event.eventType)) {
      this.startEventSpan(event);
    }

    if (eventEndsSpan(event.eventType)) {
      this.endEventSpan(event);
    }
  }

  listRecordedSpans(): RecordedSpan[] {
    return [...this.recorded];
  }

  private startEventSpan(event: WorkflowEvent): void {
    const kind = spanTypeForEvent(event.eventType);
    if (!kind) {
      return;
    }

    const parent = this.resolveParentSpan(kind, event);
    const parentContext = parent?.context ?? context.active();
    const span = this.tracer.startSpan(
      spanNameForEvent(event),
      {
        attributes: {
          runId: event.runId,
          workflowType: event.workflowType,
          eventType: event.eventType,
        },
      },
      parentContext,
    );

    const spanContext = trace.setSpan(parentContext, span);
    const record: RecordedSpan = {
      spanId: `span_${++this.sequence}`,
      parentSpanId: parent?.record.spanId,
      runId: event.runId,
      workflowType: event.workflowType,
      name: spanNameForEvent(event),
      startTime: event.timestamp,
      attributes: {
        eventType: event.eventType,
        sequence: event.sequence,
      },
    };

    const active: ActiveSpan = {
      span,
      context: spanContext,
      record,
    };

    this.recorded.push(record);

    if (kind === 'run') {
      this.rootsByRunId.set(event.runId, active);
      return;
    }

    if (kind === 'transition') {
      this.transitionsByRunId.set(event.runId, active);
      return;
    }

    if (kind === 'command') {
      this.commandsByRunId.set(event.runId, active);
      return;
    }

    if (kind === 'child') {
      const childRunId =
        typeof event.payload?.childRunId === 'string' ? event.payload.childRunId : undefined;
      if (childRunId) {
        this.childrenByChildRunId.set(childRunId, active);
      }
    }
  }

  private endEventSpan(event: WorkflowEvent): void {
    const kind = spanTypeForEvent(event.eventType);
    if (!kind) {
      return;
    }

    if (kind === 'run') {
      this.closeSpan(this.rootsByRunId.get(event.runId), event.timestamp);
      this.rootsByRunId.delete(event.runId);
      return;
    }

    if (kind === 'transition') {
      this.closeSpan(this.transitionsByRunId.get(event.runId), event.timestamp);
      this.transitionsByRunId.delete(event.runId);
      return;
    }

    if (kind === 'command') {
      this.closeSpan(this.commandsByRunId.get(event.runId), event.timestamp);
      this.commandsByRunId.delete(event.runId);
    }
  }

  private closeSpan(active: ActiveSpan | undefined, endTime: string): void {
    if (!active) {
      return;
    }

    active.record.endTime = endTime;
    active.span.end();
  }

  private resolveParentSpan(
    kind: 'run' | 'transition' | 'command' | 'child',
    event: WorkflowEvent,
  ): ActiveSpan | undefined {
    if (kind === 'run') {
      if (event.parentRunId) {
        return (
          this.childrenByChildRunId.get(event.runId) ?? this.rootsByRunId.get(event.parentRunId)
        );
      }

      return undefined;
    }

    return this.rootsByRunId.get(event.runId);
  }
}

export const createOtelWorkflowTracing = (
  tracer: Tracer = trace.getTracer('workflow-server-observability'),
): OTelWorkflowTracing => new OTelWorkflowTracing(tracer);
