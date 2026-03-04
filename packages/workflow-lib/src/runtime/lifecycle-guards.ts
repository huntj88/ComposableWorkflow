import type { WorkflowLifecycle } from '../contracts/workflow-contracts.js';

export type WorkflowControlAction = 'pause' | 'resume' | 'cancel' | 'recover' | 'launchChild';

const ACTION_ALLOWED_LIFECYCLES: Readonly<
  Record<WorkflowControlAction, ReadonlySet<WorkflowLifecycle>>
> = {
  pause: new Set<WorkflowLifecycle>(['running']),
  resume: new Set<WorkflowLifecycle>(['paused']),
  cancel: new Set<WorkflowLifecycle>([
    'running',
    'pausing',
    'paused',
    'resuming',
    'recovering',
    'cancelling',
  ]),
  recover: new Set<WorkflowLifecycle>(['failed', 'cancelled']),
  launchChild: new Set<WorkflowLifecycle>(['running']),
};

export const isLifecycleActionAllowed = (
  lifecycle: WorkflowLifecycle,
  action: WorkflowControlAction,
): boolean => ACTION_ALLOWED_LIFECYCLES[action].has(lifecycle);

export const canLaunchChild = (lifecycle: WorkflowLifecycle): boolean =>
  isLifecycleActionAllowed(lifecycle, 'launchChild');

export const assertLifecycleActionAllowed = (
  lifecycle: WorkflowLifecycle,
  action: WorkflowControlAction,
): void => {
  if (isLifecycleActionAllowed(lifecycle, action)) {
    return;
  }

  throw new Error(`Lifecycle action not allowed: action=${action} lifecycle=${lifecycle}`);
};
