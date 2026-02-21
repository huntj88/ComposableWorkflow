import type { WorkflowEventEnvelope } from '../contracts/workflow-contracts.js';
import type { WorkflowEvent, WorkflowEventType } from '../contracts/workflow-events.js';

export interface Clock {
  now(): Date;
}

export interface SequenceAllocator {
  next(runId: string): Promise<number> | number;
}

export type WorkflowEventCreateInput = Omit<WorkflowEvent, 'eventId' | 'timestamp' | 'sequence'>;

export interface EventFactory {
  create(input: WorkflowEventCreateInput): Promise<WorkflowEvent>;
}

export interface EventFactoryOptions {
  clock: Clock;
  sequenceAllocator: SequenceAllocator;
  eventIdFactory?: (input: {
    runId: string;
    sequence: number;
    eventType: WorkflowEventType;
    timestamp: string;
  }) => string;
}

export const buildWorkflowEvent = (
  input: WorkflowEventCreateInput,
  metadata: { eventId: string; timestamp: string; sequence: number },
): WorkflowEvent => ({
  ...input,
  eventId: metadata.eventId,
  timestamp: metadata.timestamp,
  sequence: metadata.sequence,
});

export const defaultClock: Clock = {
  now: () => new Date(),
};

const defaultEventIdFactory = ({
  runId,
  sequence,
  eventType,
}: {
  runId: string;
  sequence: number;
  eventType: WorkflowEventType;
}): string => `${runId}:${sequence}:${eventType}`;

export const createEventFactory = ({
  clock,
  sequenceAllocator,
  eventIdFactory = defaultEventIdFactory,
}: EventFactoryOptions): EventFactory => ({
  async create(input: WorkflowEventCreateInput): Promise<WorkflowEvent> {
    const sequence = await sequenceAllocator.next(input.runId);
    const timestamp = clock.now().toISOString();
    const eventId = eventIdFactory({
      runId: input.runId,
      sequence,
      eventType: input.eventType,
      timestamp,
    });

    return buildWorkflowEvent(input, { eventId, timestamp, sequence });
  },
});

export interface AppendOnlyEventBuilder {
  withType(
    eventType: WorkflowEventType,
    payload?: Record<string, unknown>,
  ): WorkflowEventCreateInput;
  stateEntered(state: string, payload?: Record<string, unknown>): WorkflowEventCreateInput;
  transitionRequested(
    transition: NonNullable<WorkflowEvent['transition']>,
    payload?: Record<string, unknown>,
  ): WorkflowEventCreateInput;
  transitionCompleted(
    transition: NonNullable<WorkflowEvent['transition']>,
    payload?: Record<string, unknown>,
  ): WorkflowEventCreateInput;
}

export const createAppendOnlyEventBuilder = (
  envelope: WorkflowEventEnvelope,
): AppendOnlyEventBuilder => {
  const base = (
    eventType: WorkflowEventType,
    payload?: Record<string, unknown>,
  ): WorkflowEventCreateInput => ({
    ...envelope,
    eventType,
    payload,
  });

  return {
    withType(
      eventType: WorkflowEventType,
      payload?: Record<string, unknown>,
    ): WorkflowEventCreateInput {
      return base(eventType, payload);
    },
    stateEntered(state: string, payload?: Record<string, unknown>): WorkflowEventCreateInput {
      return { ...base('state.entered', payload), state };
    },
    transitionRequested(
      transition: NonNullable<WorkflowEvent['transition']>,
      payload?: Record<string, unknown>,
    ): WorkflowEventCreateInput {
      return { ...base('transition.requested', payload), transition };
    },
    transitionCompleted(
      transition: NonNullable<WorkflowEvent['transition']>,
      payload?: Record<string, unknown>,
    ): WorkflowEventCreateInput {
      return { ...base('transition.completed', payload), transition };
    },
  };
};

export class InMemorySequenceAllocator implements SequenceAllocator {
  private readonly sequences = new Map<string, number>();

  next(runId: string): number {
    const nextValue = (this.sequences.get(runId) ?? 0) + 1;
    this.sequences.set(runId, nextValue);
    return nextValue;
  }
}
