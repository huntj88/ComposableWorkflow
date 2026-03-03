/**
 * Shared test helpers for `ITX-SD-*` integration tests.
 *
 * Provides fixture factories, a mock `WorkflowContext`, and an FSM runner
 * that chains state handlers through transitions using harness test doubles.
 *
 * @module test/integration/spec-doc/helpers
 */

import type {
  WorkflowContext,
  WorkflowLogEvent,
  ChildWorkflowRequest,
} from '@composable-workflow/workflow-lib/contracts';

import type {
  SpecDocGenerationInput,
  SpecDocGenerationOutput,
  SpecIntegrationOutput,
  ConsistencyCheckOutput,
  NumberedQuestionItem,
  QuestionQueueItem,
  CustomPromptClassificationOutput,
  ClarificationFollowUpOutput,
  ReadinessChecklist,
  BlockingIssue,
} from '../../../src/workflows/spec-doc/contracts.js';
import type { SpecDocStateData } from '../../../src/workflows/spec-doc/state-data.js';
import { createInitialStateData } from '../../../src/workflows/spec-doc/state-data.js';
import { createSpecDocWorkflowDefinition } from '../../../src/workflows/spec-doc/workflow.js';
import type { CopilotDouble } from '../harness/spec-doc/copilot-double.js';
import type { FeedbackController } from '../harness/spec-doc/feedback-controller.js';
import type { ObservabilitySink } from '../harness/spec-doc/observability-sink.js';

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

/** Create a default `SpecDocGenerationInput` for tests. */
export function makeDefaultInput(
  overrides?: Partial<SpecDocGenerationInput>,
): SpecDocGenerationInput {
  return {
    request: 'Create a test specification document for the widget subsystem',
    targetPath: 'docs/widget-spec.md',
    constraints: ['Must be testable', 'No external dependencies'],
    maxClarificationLoops: 5,
    ...overrides,
  };
}

/** Create a numbered question item with valid Pros/Cons descriptions. */
export function makeQuestionItem(
  questionId: string,
  overrides?: Partial<NumberedQuestionItem>,
): NumberedQuestionItem {
  return {
    questionId,
    kind: 'issue-resolution',
    prompt: `Resolve issue for ${questionId}`,
    options: [
      {
        id: 1,
        label: 'Option A',
        description: 'Approach A. Pros: Fast setup. Cons: Higher complexity.',
      },
      {
        id: 2,
        label: 'Option B',
        description: 'Approach B. Pros: Simple design. Cons: Slower execution.',
      },
    ],
    ...overrides,
  };
}

/** Create a queue item (extends question item with `answered` flag). */
export function makeQueueItem(
  questionId: string,
  overrides?: Partial<QuestionQueueItem>,
): QuestionQueueItem {
  return {
    ...makeQuestionItem(questionId),
    answered: false,
    ...overrides,
  };
}

/** Create a valid `SpecIntegrationOutput`. */
export function makeIntegrationOutput(
  overrides?: Partial<SpecIntegrationOutput>,
): SpecIntegrationOutput {
  return {
    specPath: 'docs/generated-spec.md',
    changeSummary: ['Added scope section', 'Added constraints section'],
    resolvedQuestionIds: [],
    remainingQuestionIds: [],
    ...overrides,
  };
}

/** Create a valid `ReadinessChecklist` (all passing). */
export function makeReadinessChecklist(
  overrides?: Partial<ReadinessChecklist>,
): ReadinessChecklist {
  return {
    hasScopeAndObjective: true,
    hasNonGoals: true,
    hasConstraintsAndAssumptions: true,
    hasInterfacesOrContracts: true,
    hasTestableAcceptanceCriteria: true,
    ...overrides,
  };
}

/** Create a valid `ConsistencyCheckOutput`. */
export function makeConsistencyOutput(
  overrides?: Partial<ConsistencyCheckOutput>,
): ConsistencyCheckOutput {
  return {
    blockingIssues: [],
    followUpQuestions: [],
    readinessChecklist: makeReadinessChecklist(),
    ...overrides,
  };
}

/** Create a valid blocking issue. */
export function makeBlockingIssue(id: string, overrides?: Partial<BlockingIssue>): BlockingIssue {
  return {
    id,
    description: `Blocking issue ${id}`,
    severity: 'medium',
    ...overrides,
  };
}

/** Create a `CustomPromptClassificationOutput`. */
export function makeClassificationOutput(
  intent: 'custom-answer' | 'clarifying-question',
  overrides?: Partial<CustomPromptClassificationOutput>,
): CustomPromptClassificationOutput {
  if (intent === 'custom-answer') {
    return {
      intent,
      customAnswerText: 'The user prefers option A with modifications',
      ...overrides,
    };
  }
  return {
    intent,
    clarifyingQuestionText: 'What specific aspect needs clarification?',
    ...overrides,
  };
}

/** Create a valid `ClarificationFollowUpOutput`. */
export function makeClarificationFollowUpOutput(questionId: string): ClarificationFollowUpOutput {
  return {
    followUpQuestion: {
      questionId,
      prompt: `Clarification follow-up for ${questionId}`,
      options: [
        {
          id: 1,
          label: 'Clarify A',
          description: 'Clarification A. Pros: Clear path. Cons: Limited scope.',
        },
        {
          id: 2,
          label: 'Clarify B',
          description: 'Clarification B. Pros: Thorough coverage. Cons: Verbose.',
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// State data builders
// ---------------------------------------------------------------------------

/** Create state data positioned after a successful IntegrateIntoSpec pass. */
export function makeStateDataAfterIntegration(
  overrides?: Partial<SpecDocStateData>,
): SpecDocStateData {
  return {
    ...createInitialStateData(),
    counters: {
      clarificationLoopsUsed: 0,
      integrationPasses: 1,
      consistencyCheckPasses: 0,
    },
    artifacts: {
      specPath: 'docs/generated-spec.md',
      lastIntegrationOutput: makeIntegrationOutput(),
    },
    ...overrides,
  };
}

/** Create state data positioned for ClassifyCustomPrompt entry. */
export function makeStateDataForClassification(
  sourceQuestion: QuestionQueueItem,
  customText: string,
): SpecDocStateData {
  return {
    ...createInitialStateData(),
    queue: [{ ...sourceQuestion, answered: true }],
    queueIndex: 1,
    normalizedAnswers: [
      {
        questionId: sourceQuestion.questionId,
        selectedOptionIds: [1],
        text: customText,
        answeredAt: '2026-01-15T10:00:00.000Z',
      },
    ],
    counters: {
      clarificationLoopsUsed: 1,
      integrationPasses: 1,
      consistencyCheckPasses: 1,
    },
    artifacts: {
      specPath: 'docs/generated-spec.md',
    },
  };
}

/** Create state data positioned for ExpandQuestionWithClarification entry. */
export function makeStateDataForExpandClarification(
  sourceQuestion: QuestionQueueItem,
  clarifyingText: string,
): SpecDocStateData {
  return {
    ...makeStateDataForClassification(sourceQuestion, 'User clarification request'),
    pendingClarification: {
      sourceQuestionId: sourceQuestion.questionId,
      clarifyingQuestionText: clarifyingText,
    },
  };
}

// ---------------------------------------------------------------------------
// Mock WorkflowContext
// ---------------------------------------------------------------------------

/** A recorded transition (to state + state data). */
export interface TransitionRecord {
  to: string;
  data: unknown;
}

/** Captured outputs from a mock context invocation. */
export interface MockWorkflowResult {
  transitions: TransitionRecord[];
  completedOutput?: SpecDocGenerationOutput;
  failedError?: Error;
}

/**
 * Create a mock `WorkflowContext` wired to harness test doubles.
 *
 * `launchChild` routes to the copilot double or feedback controller based on
 * `workflowType`. Observability events are captured by the sink.
 */
export function createMockContext(
  input: SpecDocGenerationInput,
  copilotDouble: CopilotDouble,
  feedbackController: FeedbackController,
  obsSink: ObservabilitySink,
): {
  ctx: WorkflowContext<SpecDocGenerationInput, SpecDocGenerationOutput>;
  result: MockWorkflowResult;
} {
  const result: MockWorkflowResult = {
    transitions: [],
  };

  const ctx: WorkflowContext<SpecDocGenerationInput, SpecDocGenerationOutput> = {
    runId: 'test-run-001',
    workflowType: 'app-builder.spec-doc.v1',
    input,
    now: () => new Date('2026-01-15T10:00:00.000Z'),
    log: (event: WorkflowLogEvent) => {
      obsSink.capture(event);
    },
    transition: (to: string, data?: unknown) => {
      result.transitions.push({ to, data });
    },
    launchChild: async <CI, CO>(req: ChildWorkflowRequest<CI>): Promise<CO> => {
      if (req.workflowType === 'app-builder.copilot.prompt.v1') {
        return copilotDouble.resolve({
          workflowType: req.workflowType,
          input: req.input as { prompt: string; outputSchema?: string },
          correlationId: req.correlationId,
        }) as unknown as CO;
      }
      if (req.workflowType === 'server.human-feedback.v1') {
        return feedbackController.resolve({
          workflowType: req.workflowType,
          input: req.input as never,
          correlationId: req.correlationId,
        }) as unknown as CO;
      }
      throw new Error(`Unknown child workflow type: ${req.workflowType}`);
    },
    runCommand: async () => {
      throw new Error('runCommand not supported in integration tests');
    },
    complete: (output: SpecDocGenerationOutput) => {
      result.completedOutput = output;
    },
    fail: (error: Error) => {
      result.failedError = error;
    },
  };

  return { ctx, result };
}

// ---------------------------------------------------------------------------
// FSM Runner
// ---------------------------------------------------------------------------

/** Result from running the FSM through multiple state transitions. */
export interface FSMRunResult {
  stateHistory: Array<{ state: string; data: unknown }>;
  completedOutput?: SpecDocGenerationOutput;
  failedError?: Error;
}

/**
 * Run the spec-doc workflow FSM from a starting state through multiple
 * transitions until it completes, fails, or exceeds `maxSteps`.
 *
 * Each step creates a fresh mock context, invokes the state handler, and
 * chains to the next state based on the transition target.
 */
export async function runFSM(
  input: SpecDocGenerationInput,
  copilotDouble: CopilotDouble,
  feedbackController: FeedbackController,
  obsSink: ObservabilitySink,
  options?: {
    maxSteps?: number;
    startState?: string;
    startData?: unknown;
  },
): Promise<FSMRunResult> {
  const definition = createSpecDocWorkflowDefinition();
  const maxSteps = options?.maxSteps ?? 50;
  const stateHistory: Array<{ state: string; data: unknown }> = [];

  let currentState = options?.startState ?? 'start';
  let currentData: unknown = options?.startData;

  for (let step = 0; step < maxSteps; step++) {
    const handler = definition.states[currentState];
    if (!handler) {
      throw new Error(`No handler for state "${currentState}"`);
    }

    let transitionTarget: { to: string; data: unknown } | undefined;
    let completedOutput: SpecDocGenerationOutput | undefined;
    let failedError: Error | undefined;

    const ctx: WorkflowContext<SpecDocGenerationInput, SpecDocGenerationOutput> = {
      runId: 'test-run-001',
      workflowType: 'app-builder.spec-doc.v1',
      input,
      now: () => new Date('2026-01-15T10:00:00.000Z'),
      log: (event: WorkflowLogEvent) => {
        obsSink.capture(event);
      },
      transition: (to: string, data?: unknown) => {
        transitionTarget = { to, data };
      },
      launchChild: async <CI, CO>(req: ChildWorkflowRequest<CI>): Promise<CO> => {
        if (req.workflowType === 'app-builder.copilot.prompt.v1') {
          return copilotDouble.resolve({
            workflowType: req.workflowType,
            input: req.input as { prompt: string; outputSchema?: string },
            correlationId: req.correlationId,
          }) as unknown as CO;
        }
        if (req.workflowType === 'server.human-feedback.v1') {
          return feedbackController.resolve({
            workflowType: req.workflowType,
            input: req.input as never,
            correlationId: req.correlationId,
          }) as unknown as CO;
        }
        throw new Error(`Unknown child workflow type: ${req.workflowType}`);
      },
      runCommand: async () => {
        throw new Error('runCommand not supported');
      },
      complete: (output: SpecDocGenerationOutput) => {
        completedOutput = output;
      },
      fail: (error: Error) => {
        failedError = error;
      },
    };

    stateHistory.push({ state: currentState, data: currentData });
    await handler(ctx, currentData);

    if (completedOutput !== undefined) {
      return { completedOutput, stateHistory };
    }
    if (failedError !== undefined) {
      return { failedError, stateHistory };
    }
    if (transitionTarget) {
      currentState = transitionTarget.to;
      currentData = transitionTarget.data;
    } else {
      throw new Error(`State "${currentState}" did not transition, complete, or fail`);
    }
  }

  throw new Error(`Exceeded maxSteps (${maxSteps})`);
}
