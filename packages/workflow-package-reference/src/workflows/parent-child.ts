import type {
  ChildWorkflowRequest,
  WorkflowDefinition,
  WorkflowRegistration,
  WorkflowTransitionDescriptor,
} from '@composable-workflow/workflow-lib/contracts';

import {
  SUCCESS_WORKFLOW_TYPE,
  type ReferenceSuccessInput,
  type ReferenceSuccessOutput,
} from './success.js';

export const PARENT_CHILD_WORKFLOW_TYPE = 'reference.parent-child.v1';

export interface ReferenceParentChildInput {
  requestId: string;
  childInput: ReferenceSuccessInput;
}

export interface ReferenceParentChildOutput {
  status: 'completed';
  childConfirmationId: string;
  parentRequestId: string;
}

export const parentChildTransitions: WorkflowTransitionDescriptor[] = [
  { from: 'launch-child', to: 'complete', name: 'child-completed' },
];

export const toChildLaunchRequest = (
  input: ReferenceParentChildInput,
): ChildWorkflowRequest<ReferenceSuccessInput> => ({
  workflowType: SUCCESS_WORKFLOW_TYPE,
  input: input.childInput,
  correlationId: `child-correlation:${input.requestId}`,
  idempotencyKey: `child-idempotency:${input.requestId}`,
});

export const createParentChildDefinition = (): WorkflowDefinition<
  ReferenceParentChildInput,
  ReferenceParentChildOutput
> => ({
  initialState: 'launch-child',
  transitions: parentChildTransitions,
  states: {
    'launch-child': async (ctx) => {
      const childOutput = await ctx.launchChild<ReferenceSuccessInput, ReferenceSuccessOutput>(
        toChildLaunchRequest(ctx.input),
      );

      ctx.transition('complete', {
        childConfirmationId: childOutput.confirmationId,
      });
    },
    complete: (ctx, data) => {
      const childConfirmationId =
        (data as { childConfirmationId?: string } | undefined)?.childConfirmationId ??
        'missing-child-confirmation';

      ctx.complete({
        status: 'completed',
        childConfirmationId,
        parentRequestId: ctx.input.requestId,
      });
    },
  },
});

export const parentChildWorkflowRegistration: WorkflowRegistration<
  ReferenceParentChildInput,
  ReferenceParentChildOutput
> = {
  workflowType: PARENT_CHILD_WORKFLOW_TYPE,
  workflowVersion: '1.0.0',
  metadata: {
    displayName: 'Reference Parent Child Workflow',
    description: 'Deterministic parent workflow that launches and awaits a child.',
    tags: ['reference', 'parent-child', 'deterministic'],
  },
  factory: () => createParentChildDefinition(),
};
