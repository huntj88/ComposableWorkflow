import type { WorkflowRegistration } from '../../registry/workflow-registry.js';
import type {
  RuntimeWorkflowContext,
  RuntimeWorkflowDefinition,
} from '../../registry/runtime-types.js';
import {
  INTERNAL_SERVER_WORKFLOW_PACKAGE_NAME,
  INTERNAL_SERVER_WORKFLOW_PACKAGE_VERSION,
  parseHumanFeedbackRequestInput,
  SERVER_HUMAN_FEEDBACK_WORKFLOW_TYPE,
  SERVER_HUMAN_FEEDBACK_WORKFLOW_VERSION,
} from './contracts.js';

const createServerHumanFeedbackDefinition = (): RuntimeWorkflowDefinition => ({
  initialState: 'awaiting_response',
  states: {
    awaiting_response: () => {
      return;
    },
  },
});

export const createServerHumanFeedbackWorkflowRegistration = (): WorkflowRegistration => ({
  workflowType: SERVER_HUMAN_FEEDBACK_WORKFLOW_TYPE,
  workflowVersion: SERVER_HUMAN_FEEDBACK_WORKFLOW_VERSION,
  factory: (context: RuntimeWorkflowContext) => {
    // Validate input shape even though the handler is a no-op; fail fast on bad input.
    // Skip validation during definition inspection (input is undefined).
    if (context.input !== undefined) {
      parseHumanFeedbackRequestInput(context.input);
    }
    return createServerHumanFeedbackDefinition();
  },
  metadata: {
    displayName: 'Server Human Feedback',
    tags: ['internal', 'human-feedback'],
    description: 'Server-owned human feedback runtime contract',
  },
  packageName: INTERNAL_SERVER_WORKFLOW_PACKAGE_NAME,
  packageVersion: INTERNAL_SERVER_WORKFLOW_PACKAGE_VERSION,
  source: 'bundle',
  sourceValue: 'internal',
});
