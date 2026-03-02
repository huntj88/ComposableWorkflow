import type { WorkflowEvent } from './workflow-events.js';

export interface WorkflowPackageManifest {
  packageName: string;
  packageVersion: string;
  workflows: WorkflowRegistration[];
}

export interface WorkflowRegistration<I = unknown, O = unknown> {
  workflowType: string;
  workflowVersion: string;
  factory: WorkflowFactory<I, O>;
  metadata?: {
    displayName?: string;
    tags?: string[];
    description?: string;
  };
}

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

export interface WorkflowLogEvent {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  payload?: Record<string, unknown>;
}

export interface ChildWorkflowRequest<I> {
  workflowType: string;
  input: I;
  correlationId?: string;
  idempotencyKey?: string;
}

export interface WorkflowCommandRequest {
  command: string;
  args?: string[];
  stdin?: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  allowNonZeroExit?: boolean;
}

export interface WorkflowCommandResult {
  exitCode: number;
  stdin: string;
  stdout: string;
  stderr: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export interface WorkflowContext<I, O> {
  runId: string;
  workflowType: string;
  input: I;
  now(): Date;
  log(event: WorkflowLogEvent): void;
  transition<TState extends string>(to: TState, data?: unknown): void;
  launchChild<CI, CO>(req: ChildWorkflowRequest<CI>): Promise<CO>;
  runCommand(req: WorkflowCommandRequest): Promise<WorkflowCommandResult>;
  complete(output: O): void;
  fail(error: Error): void;
}

export type WorkflowStateHandler<I, O> = (
  ctx: WorkflowContext<I, O>,
  data?: unknown,
) => void | Promise<void>;

export interface WorkflowTransitionDescriptor {
  from: string;
  to: string;
  name?: string;
}

export interface WorkflowDefinition<I, O> {
  initialState: string;
  states: Record<string, WorkflowStateHandler<I, O>>;
  transitions?: WorkflowTransitionDescriptor[];
}

export type WorkflowFactory<I, O> = (ctx: WorkflowContext<I, O>) => WorkflowDefinition<I, O>;

export interface WorkflowEventEnvelope {
  runId: string;
  parentRunId?: string;
  workflowType: string;
}

export type WorkflowFailure = Pick<
  NonNullable<WorkflowEvent['error']>,
  'name' | 'message' | 'stack'
>;
