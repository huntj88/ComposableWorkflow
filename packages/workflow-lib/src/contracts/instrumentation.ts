import type { WorkflowEvent } from './workflow-events.js';

export interface WorkflowMetric {
  name: string;
  value: number;
  unit?: string;
  tags?: Record<string, string>;
  timestamp?: string;
}

export interface WorkflowTrace {
  name: string;
  runId?: string;
  workflowType?: string;
  startTime?: string;
  endTime?: string;
  attributes?: Record<string, string | number | boolean>;
}

export interface WorkflowInstrumentation {
  onEvent(event: WorkflowEvent): void | Promise<void>;
  onMetric(metric: WorkflowMetric): void | Promise<void>;
  onTrace(trace: WorkflowTrace): void | Promise<void>;
}
