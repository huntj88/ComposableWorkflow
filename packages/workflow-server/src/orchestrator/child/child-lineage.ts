import {
  shouldBlockChildLaunch,
  type WorkflowLifecycle,
} from '../../lifecycle/lifecycle-machine.js';

export interface ChildLaunchRequest {
  workflowType: string;
  input: unknown;
  correlationId?: string;
  idempotencyKey?: string;
}

export interface ChildLifecyclePayload {
  childRunId: string;
  childWorkflowType: string;
  lifecycle: WorkflowLifecycle;
}

export class ChildLaunchForbiddenLifecycleError extends Error {
  readonly code = 'CHILD_LAUNCH_FORBIDDEN_LIFECYCLE';
  readonly lifecycle: WorkflowLifecycle;

  constructor(lifecycle: WorkflowLifecycle) {
    super(`Child launch blocked in lifecycle ${lifecycle}`);
    this.name = 'ChildLaunchForbiddenLifecycleError';
    this.lifecycle = lifecycle;
  }
}

export const assertChildLaunchAllowed = (lifecycle: WorkflowLifecycle): void => {
  if (shouldBlockChildLaunch(lifecycle)) {
    throw new ChildLaunchForbiddenLifecycleError(lifecycle);
  }
};

export const toChildLaunchRequest = (value: unknown): ChildLaunchRequest => {
  if (!value || typeof value !== 'object') {
    throw new Error('launchChild request must be an object');
  }

  const candidate = value as Record<string, unknown>;

  if (typeof candidate.workflowType !== 'string' || candidate.workflowType.trim().length === 0) {
    throw new Error('launchChild request.workflowType must be a non-empty string');
  }

  if (!('input' in candidate)) {
    throw new Error('launchChild request.input is required');
  }

  if (
    'correlationId' in candidate &&
    candidate.correlationId !== undefined &&
    typeof candidate.correlationId !== 'string'
  ) {
    throw new Error('launchChild request.correlationId must be a string when provided');
  }

  if (
    'idempotencyKey' in candidate &&
    candidate.idempotencyKey !== undefined &&
    typeof candidate.idempotencyKey !== 'string'
  ) {
    throw new Error('launchChild request.idempotencyKey must be a string when provided');
  }

  return {
    workflowType: candidate.workflowType,
    input: candidate.input,
    correlationId:
      typeof candidate.correlationId === 'string' ? candidate.correlationId : undefined,
    idempotencyKey:
      typeof candidate.idempotencyKey === 'string' ? candidate.idempotencyKey : undefined,
  };
};

export const toChildLifecyclePayload = (
  childRunId: string,
  childWorkflowType: string,
  lifecycle: WorkflowLifecycle,
): ChildLifecyclePayload => ({
  childRunId,
  childWorkflowType,
  lifecycle,
});
