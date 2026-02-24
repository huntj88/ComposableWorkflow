export type WorkflowLifecycle =
  | 'running'
  | 'pausing'
  | 'paused'
  | 'resuming'
  | 'recovering'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled';

type WorkflowLifecycleTransitionMap = Readonly<
  Record<WorkflowLifecycle, ReadonlySet<WorkflowLifecycle>>
>;

const WORKFLOW_LIFECYCLE_TRANSITIONS: WorkflowLifecycleTransitionMap = {
  running: new Set<WorkflowLifecycle>([
    'pausing',
    'completed',
    'failed',
    'recovering',
    'cancelling',
  ]),
  pausing: new Set<WorkflowLifecycle>(['paused', 'recovering', 'cancelling']),
  paused: new Set<WorkflowLifecycle>(['resuming', 'cancelling']),
  resuming: new Set<WorkflowLifecycle>(['running', 'failed', 'recovering', 'cancelling']),
  recovering: new Set<WorkflowLifecycle>(['running', 'paused', 'failed', 'cancelled']),
  cancelling: new Set<WorkflowLifecycle>(['cancelled']),
  completed: new Set<WorkflowLifecycle>([]),
  failed: new Set<WorkflowLifecycle>([]),
  cancelled: new Set<WorkflowLifecycle>([]),
};

export class InvalidLifecycleTransitionError extends Error {
  readonly code = 'INVALID_LIFECYCLE';
  readonly currentLifecycle: WorkflowLifecycle;
  readonly targetLifecycle: WorkflowLifecycle;

  constructor(currentLifecycle: WorkflowLifecycle, targetLifecycle: WorkflowLifecycle) {
    super(`Invalid lifecycle transition: ${currentLifecycle} -> ${targetLifecycle}`);
    this.name = 'InvalidLifecycleTransitionError';
    this.currentLifecycle = currentLifecycle;
    this.targetLifecycle = targetLifecycle;
  }
}

export const isWorkflowLifecycle = (value: string): value is WorkflowLifecycle =>
  value in WORKFLOW_LIFECYCLE_TRANSITIONS;

export const canTransitionLifecycle = (
  currentLifecycle: WorkflowLifecycle,
  targetLifecycle: WorkflowLifecycle,
): boolean => WORKFLOW_LIFECYCLE_TRANSITIONS[currentLifecycle].has(targetLifecycle);

export const assertLifecycleTransition = (
  currentLifecycle: WorkflowLifecycle,
  targetLifecycle: WorkflowLifecycle,
): void => {
  if (canTransitionLifecycle(currentLifecycle, targetLifecycle)) {
    return;
  }

  throw new InvalidLifecycleTransitionError(currentLifecycle, targetLifecycle);
};

export const transitionLifecycle = (
  currentLifecycle: WorkflowLifecycle,
  targetLifecycle: WorkflowLifecycle,
): WorkflowLifecycle => {
  assertLifecycleTransition(currentLifecycle, targetLifecycle);
  return targetLifecycle;
};

export const canPauseLifecycle = (lifecycle: WorkflowLifecycle): boolean => lifecycle === 'running';

export const canResumeLifecycle = (lifecycle: WorkflowLifecycle): boolean => lifecycle === 'paused';

export const canCancelLifecycle = (lifecycle: WorkflowLifecycle): boolean =>
  ['running', 'pausing', 'paused', 'resuming'].includes(lifecycle);

export const shouldBlockChildLaunch = (lifecycle: WorkflowLifecycle): boolean =>
  ['pausing', 'paused', 'resuming', 'cancelling', 'recovering'].includes(lifecycle);
