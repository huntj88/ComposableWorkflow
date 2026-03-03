import type {
  ChildWorkflowRequest,
  WorkflowDefinition,
  WorkflowRegistration,
  WorkflowTransitionDescriptor,
} from '@composable-workflow/workflow-lib/contracts';

export const HUMAN_FEEDBACK_ROUNDTRIP_WORKFLOW_TYPE = 'reference.human-feedback-roundtrip.v1';

export interface ReferenceHumanFeedbackRoundtripInput {
  requestId: string;
  prompt?: string;
  options?: Array<{ id: number; label: string; description?: string }>;
  completionConfirmation?: boolean;
}

interface HumanFeedbackResponsePayload {
  questionId: string;
  selectedOptionIds?: number[];
  text?: string;
}

interface HumanFeedbackChildOutput {
  status: 'responded' | 'cancelled';
  response?: HumanFeedbackResponsePayload;
  respondedAt?: string;
  cancelledAt?: string;
}

export interface ReferenceHumanFeedbackRoundtripOutput {
  status: 'completed';
  feedbackStatus: 'responded' | 'cancelled';
  feedbackQuestionId: string;
  selectedOptionIds: number[];
}

export const humanFeedbackRoundtripTransitions: WorkflowTransitionDescriptor[] = [
  { from: 'await-feedback', to: 'complete', name: 'feedback-finished' },
];

const defaultOptions = [
  { id: 1, label: 'Approve' },
  { id: 2, label: 'Reject' },
];

const toQuestionId = (requestId: string): string => `q_feedback_${requestId}`;

export const toFeedbackRequest = (
  input: ReferenceHumanFeedbackRoundtripInput,
): ChildWorkflowRequest<unknown> => ({
  workflowType: 'server.human-feedback.v1',
  input: {
    prompt: input.prompt ?? 'Completion-confirmation: choose one option to continue',
    questionId: toQuestionId(input.requestId),
    options: input.options ?? defaultOptions,
    constraints:
      input.completionConfirmation === false ? undefined : ['kind:completion-confirmation'],
    requestedByRunId: `reference-parent:${input.requestId}`,
    requestedByWorkflowType: HUMAN_FEEDBACK_ROUNDTRIP_WORKFLOW_TYPE,
    requestedByState: 'await-feedback',
  },
  correlationId: `feedback-correlation:${input.requestId}`,
  idempotencyKey: `feedback-idempotency:${input.requestId}`,
});

export const createHumanFeedbackRoundtripDefinition = (): WorkflowDefinition<
  ReferenceHumanFeedbackRoundtripInput,
  ReferenceHumanFeedbackRoundtripOutput
> => ({
  initialState: 'await-feedback',
  transitions: humanFeedbackRoundtripTransitions,
  states: {
    'await-feedback': async (ctx) => {
      const childOutput = await ctx.launchChild<unknown, HumanFeedbackChildOutput>(
        toFeedbackRequest(ctx.input),
      );

      const selectedOptionIds = childOutput.response?.selectedOptionIds ?? [];
      ctx.transition('complete', {
        feedbackStatus: childOutput.status,
        selectedOptionIds,
      });
    },
    complete: (ctx, data) => {
      const payload = data as {
        feedbackStatus?: 'responded' | 'cancelled';
        selectedOptionIds?: number[];
      };

      ctx.complete({
        status: 'completed',
        feedbackStatus: payload.feedbackStatus ?? 'cancelled',
        feedbackQuestionId: toQuestionId(ctx.input.requestId),
        selectedOptionIds: payload.selectedOptionIds ?? [],
      });
    },
  },
});

export const humanFeedbackRoundtripWorkflowRegistration: WorkflowRegistration<
  ReferenceHumanFeedbackRoundtripInput,
  ReferenceHumanFeedbackRoundtripOutput
> = {
  workflowType: HUMAN_FEEDBACK_ROUNDTRIP_WORKFLOW_TYPE,
  workflowVersion: '1.0.0',
  metadata: {
    displayName: 'Reference Human Feedback Roundtrip Workflow',
    description:
      'Launches server human feedback workflow and completes after response/cancellation.',
    tags: ['reference', 'human-feedback', 'roundtrip'],
  },
  factory: () => createHumanFeedbackRoundtripDefinition(),
};
