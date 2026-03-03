import type {
  WorkflowPackageManifest,
  WorkflowRegistration,
} from '@composable-workflow/workflow-lib/contracts';

import {
  COPILOT_APP_BUILDER_WORKFLOW_TYPE,
  copilotAppBuilderWorkflowRegistration,
} from './workflows/copilot-prompt.js';
import {
  SPEC_DOC_WORKFLOW_TYPE,
  specDocWorkflowRegistration,
} from './workflows/spec-doc/workflow.js';

export const APP_BUILDER_WORKFLOW_TYPES = [
  COPILOT_APP_BUILDER_WORKFLOW_TYPE,
  SPEC_DOC_WORKFLOW_TYPE,
] as const;

export const workflowPackageManifest: WorkflowPackageManifest = {
  packageName: '@composable-workflow/workflow-app-builder',
  packageVersion: '1.0.0',
  workflows: [
    copilotAppBuilderWorkflowRegistration as WorkflowRegistration,
    specDocWorkflowRegistration as WorkflowRegistration,
  ],
};

export const manifest = workflowPackageManifest;

export default workflowPackageManifest;
