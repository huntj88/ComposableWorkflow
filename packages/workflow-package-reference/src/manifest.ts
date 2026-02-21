import type {
  WorkflowPackageManifest,
  WorkflowRegistration,
} from '@composable-workflow/workflow-lib/contracts';

import { commandWorkflowRegistration, COMMAND_WORKFLOW_TYPE } from './workflows/command.js';
import { failureWorkflowRegistration, FAILURE_WORKFLOW_TYPE } from './workflows/failure.js';
import {
  longRunningWorkflowRegistration,
  LONG_RUNNING_WORKFLOW_TYPE,
} from './workflows/long-running.js';
import {
  parentChildWorkflowRegistration,
  PARENT_CHILD_WORKFLOW_TYPE,
} from './workflows/parent-child.js';
import { successWorkflowRegistration, SUCCESS_WORKFLOW_TYPE } from './workflows/success.js';

export const REFERENCE_WORKFLOW_TYPES = [
  SUCCESS_WORKFLOW_TYPE,
  FAILURE_WORKFLOW_TYPE,
  PARENT_CHILD_WORKFLOW_TYPE,
  COMMAND_WORKFLOW_TYPE,
  LONG_RUNNING_WORKFLOW_TYPE,
] as const;

export const workflowPackageManifest: WorkflowPackageManifest = {
  packageName: '@composable-workflow/workflow-package-reference',
  packageVersion: '1.0.0',
  workflows: [
    successWorkflowRegistration as WorkflowRegistration,
    failureWorkflowRegistration as WorkflowRegistration,
    parentChildWorkflowRegistration as WorkflowRegistration,
    commandWorkflowRegistration as WorkflowRegistration,
    longRunningWorkflowRegistration as WorkflowRegistration,
  ],
};

export const manifest = workflowPackageManifest;

export default workflowPackageManifest;
