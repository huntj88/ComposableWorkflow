import type { WorkflowRegistration } from '../../registry/workflow-registry.js';
import {
  INTERNAL_SERVER_WORKFLOW_PACKAGE_NAME,
  INTERNAL_SERVER_WORKFLOW_PACKAGE_VERSION,
  parseHumanFeedbackRequestInput,
  SERVER_HUMAN_FEEDBACK_WORKFLOW_TYPE,
  SERVER_HUMAN_FEEDBACK_WORKFLOW_VERSION,
  type HumanFeedbackRequestInput,
  type HumanFeedbackRequestOutput,
} from './contracts.js';

interface RuntimeWorkflowContext<I = unknown, O = unknown> {
  runId: string;
  workflowType: string;
  input: I;
  now(): Date;
  log(event: unknown): void;
  transition<TState extends string>(to: TState, data?: unknown): void;
  launchChild<CO>(req: unknown): Promise<CO>;
  runCommand(req: unknown): Promise<unknown>;
  complete(output: O): void;
  fail(error: Error): void;
}

interface RuntimeWorkflowDefinition<I = unknown, O = unknown> {
  initialState: string;
  states: Record<
    string,
    (ctx: RuntimeWorkflowContext<I, O>, data?: unknown) => void | Promise<void>
  >;
}

const createServerHumanFeedbackDefinition = (
  _validatedInput: HumanFeedbackRequestInput,
): RuntimeWorkflowDefinition<HumanFeedbackRequestInput, HumanFeedbackRequestOutput> => ({
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
  factory: (context: RuntimeWorkflowContext<unknown, unknown>) => {
    const validatedInput = parseHumanFeedbackRequestInput(context.input);
    return createServerHumanFeedbackDefinition(validatedInput);
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
