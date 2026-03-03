import type { WorkflowRegistry } from '../registry/workflow-registry.js';
import {
  INTERNAL_SERVER_WORKFLOW_PACKAGE_NAME,
  SERVER_HUMAN_FEEDBACK_WORKFLOW_TYPE,
} from '../internal-workflows/human-feedback/contracts.js';
import { createServerHumanFeedbackWorkflowRegistration } from '../internal-workflows/human-feedback/workflow.js';

export const registerInternalWorkflows = (registry: WorkflowRegistry): void => {
  registry.reserveWorkflowType(
    SERVER_HUMAN_FEEDBACK_WORKFLOW_TYPE,
    INTERNAL_SERVER_WORKFLOW_PACKAGE_NAME,
  );

  const existing = registry.getByType(SERVER_HUMAN_FEEDBACK_WORKFLOW_TYPE);
  if (existing?.packageName === INTERNAL_SERVER_WORKFLOW_PACKAGE_NAME) {
    return;
  }

  registry.register(createServerHumanFeedbackWorkflowRegistration());
};
