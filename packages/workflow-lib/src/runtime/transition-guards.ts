import type {
  WorkflowEventEnvelope,
  WorkflowFailure,
  WorkflowTransitionDescriptor,
} from '../contracts/workflow-contracts.js';
import type { WorkflowEvent } from '../contracts/workflow-events.js';
import type { EventFactory } from './event-factory.js';

export interface TransitionValidationResult {
  valid: boolean;
  reason?: string;
}

export const validateTransition = (
  from: string,
  to: string,
  transitions?: readonly WorkflowTransitionDescriptor[],
): TransitionValidationResult => {
  if (!transitions || transitions.length === 0) {
    return { valid: true };
  }

  const isAllowed = transitions.some(
    (transition) => transition.from === from && transition.to === to,
  );

  if (isAllowed) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: `Invalid transition from "${from}" to "${to}"`,
  };
};

export const assertTransitionAllowed = (
  from: string,
  to: string,
  transitions?: readonly WorkflowTransitionDescriptor[],
): void => {
  const result = validateTransition(from, to, transitions);
  if (result.valid) {
    return;
  }

  throw new Error(result.reason ?? 'Invalid transition');
};

const toWorkflowFailure = (error: unknown): WorkflowFailure => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: 'Error',
    message: typeof error === 'string' ? error : 'Unknown state handler error',
  };
};

export interface UncaughtStateHandlerFailureResult {
  lifecycle: 'failed';
  events: [WorkflowEvent, WorkflowEvent];
}

export const handleUncaughtStateHandlerError = async (params: {
  envelope: WorkflowEventEnvelope;
  fromState?: string;
  toState?: string;
  error: unknown;
  eventFactory: EventFactory;
}): Promise<UncaughtStateHandlerFailureResult> => {
  const workflowError = toWorkflowFailure(params.error);

  const transitionFailedEvent = await params.eventFactory.create({
    ...params.envelope,
    eventType: 'transition.failed',
    transition: {
      from: params.fromState,
      to: params.toState,
    },
    error: workflowError,
  });

  const workflowFailedEvent = await params.eventFactory.create({
    ...params.envelope,
    eventType: 'workflow.failed',
    error: workflowError,
  });

  return {
    lifecycle: 'failed',
    events: [transitionFailedEvent, workflowFailedEvent],
  };
};

export const shouldRetryStateHandlerFailure = (): false => false;
