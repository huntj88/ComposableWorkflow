import type {
  WorkflowInstrumentation,
  WorkflowMetric,
  WorkflowTrace,
} from '../contracts/instrumentation.js';
import type { WorkflowEvent } from '../contracts/workflow-events.js';

export const invokeOnEvent = async (
  instrumentation: WorkflowInstrumentation | undefined,
  event: WorkflowEvent,
): Promise<void> => {
  if (!instrumentation) {
    return;
  }

  await instrumentation.onEvent(event);
};

export const invokeOnMetric = async (
  instrumentation: WorkflowInstrumentation | undefined,
  metric: WorkflowMetric,
): Promise<void> => {
  if (!instrumentation) {
    return;
  }

  await instrumentation.onMetric(metric);
};

export const invokeOnTrace = async (
  instrumentation: WorkflowInstrumentation | undefined,
  trace: WorkflowTrace,
): Promise<void> => {
  if (!instrumentation) {
    return;
  }

  await instrumentation.onTrace(trace);
};
