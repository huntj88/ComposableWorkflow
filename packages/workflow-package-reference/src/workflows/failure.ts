import type {
  WorkflowDefinition,
  WorkflowRegistration,
  WorkflowTransitionDescriptor,
} from '@composable-workflow/workflow-lib/contracts';

export const FAILURE_WORKFLOW_TYPE = 'reference.failure.v1';

export interface ReferenceFailureInput {
  requestId: string;
  failureCode: string;
}

export interface ReferenceFailureOutput {
  status: 'failed';
}

export const failureTransitions: WorkflowTransitionDescriptor[] = [
  { from: 'start', to: 'fail', name: 'trigger-failure' },
];

export const toDeterministicFailureMessage = (input: ReferenceFailureInput): string =>
  `Reference failure ${input.failureCode} for ${input.requestId}`;

export const createFailureDefinition = (): WorkflowDefinition<
  ReferenceFailureInput,
  ReferenceFailureOutput
> => ({
  initialState: 'start',
  transitions: failureTransitions,
  states: {
    start: (ctx) => {
      ctx.transition('fail');
    },
    fail: (ctx) => {
      ctx.fail(new Error(toDeterministicFailureMessage(ctx.input)));
    },
  },
});

export const failureWorkflowRegistration: WorkflowRegistration<
  ReferenceFailureInput,
  ReferenceFailureOutput
> = {
  workflowType: FAILURE_WORKFLOW_TYPE,
  workflowVersion: '1.0.0',
  metadata: {
    displayName: 'Reference Failure Workflow',
    description: 'Deterministic failing reference workflow fixture.',
    tags: ['reference', 'failure', 'deterministic'],
  },
  factory: () => createFailureDefinition(),
};
