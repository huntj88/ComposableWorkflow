import type {
  WorkflowDefinition,
  WorkflowRegistration,
  WorkflowTransitionDescriptor,
} from '@composable-workflow/workflow-lib/contracts';

export const SUCCESS_WORKFLOW_TYPE = 'reference.success.v1';

export interface ReferenceSuccessInput {
  requestId: string;
  customerId: string;
  amountCents: number;
  currency: string;
}

export interface ReferenceSuccessOutput {
  status: 'completed';
  confirmationId: string;
  echoedRequestId: string;
}

export const successTransitions: WorkflowTransitionDescriptor[] = [
  { from: 'validate', to: 'process', name: 'validated' },
  { from: 'process', to: 'complete', name: 'processed' },
];

export const toSuccessConfirmationId = (input: ReferenceSuccessInput): string =>
  `${input.requestId}:${input.customerId}:${input.amountCents}:${input.currency}`;

export const createSuccessDefinition = (): WorkflowDefinition<
  ReferenceSuccessInput,
  ReferenceSuccessOutput
> => ({
  initialState: 'validate',
  transitions: successTransitions,
  states: {
    validate: (ctx) => {
      if (!ctx.input.requestId || !ctx.input.customerId) {
        ctx.fail(new Error('Invalid success input'));
        return;
      }

      ctx.transition('process');
    },
    process: (ctx) => {
      ctx.transition('complete', {
        confirmationId: toSuccessConfirmationId(ctx.input),
      });
    },
    complete: (ctx, data) => {
      const confirmationId =
        (data as { confirmationId?: string } | undefined)?.confirmationId ??
        toSuccessConfirmationId(ctx.input);

      ctx.complete({
        status: 'completed',
        confirmationId,
        echoedRequestId: ctx.input.requestId,
      });
    },
  },
});

export const successWorkflowRegistration: WorkflowRegistration<
  ReferenceSuccessInput,
  ReferenceSuccessOutput
> = {
  workflowType: SUCCESS_WORKFLOW_TYPE,
  workflowVersion: '1.0.0',
  metadata: {
    displayName: 'Reference Success Workflow',
    description: 'Deterministic happy-path reference workflow fixture.',
    tags: ['reference', 'success', 'deterministic'],
  },
  factory: () => createSuccessDefinition(),
};
