import type { WorkflowLifecycle } from './workflow-contracts.js';

export type WorkflowEventType =
  | 'workflow.started'
  | 'workflow.pausing'
  | 'workflow.paused'
  | 'workflow.resuming'
  | 'workflow.resumed'
  | 'workflow.recovering'
  | 'workflow.recovered'
  | 'workflow.cancelling'
  | 'state.entered'
  | 'transition.requested'
  | 'transition.completed'
  | 'transition.failed'
  | 'command.started'
  | 'command.completed'
  | 'command.failed'
  | 'child.started'
  | 'child.completed'
  | 'child.failed'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'workflow.cancelled'
  | 'log';

export interface WorkflowEvent {
  eventId: string;
  runId: string;
  parentRunId?: string;
  workflowType: string;
  eventType: WorkflowEventType;
  state?: string;
  transition?: {
    from?: string;
    to?: string;
    name?: string;
  };
  child?: {
    childRunId: string;
    childWorkflowType: string;
    lifecycle: WorkflowLifecycle;
  };
  command?: {
    command: string;
    args?: string[];
    stdin?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  };
  timestamp: string;
  sequence: number;
  payload?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}
