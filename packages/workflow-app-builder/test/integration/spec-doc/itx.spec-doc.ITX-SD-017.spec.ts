/**
 * ITX-SD-017: Delegated child explicit-state self-loop progression.
 *
 * Behaviors: B-SD-CHILD-001, B-SD-CHILD-001A, B-SD-CHILD-001B, B-SD-OBS-003.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type {
  WorkflowContext,
  WorkflowLogEvent,
} from '@composable-workflow/workflow-lib/contracts';

import type {
  ConsistencyCheckOutput,
  ConsistencyFollowUpChildInput,
} from '../../../src/workflows/spec-doc/contracts.js';
import {
  CONSISTENCY_FOLLOW_UP_CHILD_DONE_STATE,
  CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
  CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STAGE_ID,
  CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE,
  CONSISTENCY_FOLLOW_UP_CHILD_START_STATE,
  CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS,
  createConsistencyFollowUpChildDefinition,
  type ConsistencyFollowUpPromptLayer,
} from '../../../src/workflows/spec-doc/consistency-follow-up-child.js';
import { createCopilotDouble, type CopilotDouble } from '../harness/spec-doc/copilot-double.js';
import {
  createObservabilitySink,
  type ObservabilitySink,
} from '../harness/spec-doc/observability-sink.js';
import {
  makeActionableItem,
  makeConsistencyOutput,
  makeDefaultInput,
  makeQuestionItem,
} from './helpers.js';

let copilotDouble: CopilotDouble;
let obsSink: ObservabilitySink;

const narrowStageOutput = (
  layer: ConsistencyFollowUpPromptLayer,
  overrides?: ReturnType<typeof makeConsistencyOutput>,
) => {
  const output = overrides ?? makeConsistencyOutput();
  return {
    ...output,
    readinessChecklist: Object.fromEntries(
      layer.checklistKeys.map((key) => [key, output.readinessChecklist[key]]),
    ),
  };
};

const makeResolutionResponse = (overrides?: ReturnType<typeof makeConsistencyOutput>) => ({
  structuredOutput: overrides ?? makeConsistencyOutput(),
});

function makeChildInput(
  overrides?: Partial<ConsistencyFollowUpChildInput>,
): ConsistencyFollowUpChildInput {
  const input = makeDefaultInput();
  return {
    request: input.request,
    specPath: 'docs/generated-spec.md',
    constraints: input.constraints ?? [],
    loopCount: 1,
    remainingQuestionIds: [],
    ...overrides,
  };
}

async function runChildWorkflow(params: {
  input?: ConsistencyFollowUpChildInput;
  layers: readonly ConsistencyFollowUpPromptLayer[];
}): Promise<{
  stateHistory: string[];
  transitionDataHistory: unknown[];
  output: ConsistencyCheckOutput;
}> {
  const definition = createConsistencyFollowUpChildDefinition(params.layers);
  const stateHistory: string[] = [];
  const transitionDataHistory: unknown[] = [];
  let currentState = definition.initialState;
  let currentData: unknown;
  let completedOutput: ConsistencyCheckOutput | undefined;
  let failedError: Error | undefined;

  for (let step = 0; step < params.layers.length + 3; step += 1) {
    const handler = definition.states[currentState];
    if (!handler) {
      throw new Error(`Missing child handler for state ${currentState}`);
    }

    stateHistory.push(currentState);

    let transitionTarget: { to: string; data: unknown } | undefined;
    const ctx: WorkflowContext<ConsistencyFollowUpChildInput, ConsistencyCheckOutput> = {
      runId: 'itx-sd-017-child-run',
      workflowType: 'app-builder.spec-doc.consistency-follow-up.v1',
      input: params.input ?? makeChildInput(),
      now: () => new Date('2026-03-07T10:00:00Z'),
      log: (event: WorkflowLogEvent) => {
        obsSink.capture(event);
      },
      transition: (to, data) => {
        transitionTarget = { to, data };
      },
      launchChild: async <CI, CO>(req: {
        workflowType: string;
        input: CI;
        correlationId?: string;
      }) => {
        if (req.workflowType !== 'app-builder.copilot.prompt.v1') {
          throw new Error(`Unexpected child workflow type: ${req.workflowType}`);
        }
        return (await copilotDouble.resolve({
          workflowType: req.workflowType,
          input: req.input as { prompt: string; outputSchema?: string },
          correlationId: req.correlationId,
        })) as unknown as CO;
      },
      runCommand: async () => {
        throw new Error('runCommand not supported in ITX-SD-017');
      },
      complete: (output) => {
        completedOutput = output;
      },
      fail: (error) => {
        failedError = error;
      },
    };

    await handler(ctx, currentData);

    if (completedOutput) {
      return { stateHistory, transitionDataHistory, output: completedOutput };
    }
    if (failedError) {
      throw failedError;
    }
    if (!transitionTarget) {
      throw new Error(`Child state ${currentState} did not transition or complete`);
    }

    transitionDataHistory.push(transitionTarget.data);
    currentState = transitionTarget.to;
    currentData = transitionTarget.data;
  }

  throw new Error('Child workflow exceeded expected ITX-SD-017 steps');
}

beforeEach(() => {
  copilotDouble = createCopilotDouble();
  obsSink = createObservabilitySink();
});

describe('ITX-SD-017: Delegated child explicit-state self-loop progression', () => {
  it('transitions start -> ExecutePromptLayer self-loops -> PlanResolution -> Done when the final stage completes without actionable items', async () => {
    const layers = CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.slice(0, 3);
    copilotDouble.reset({
      [CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE]: [
        {
          structuredOutput: narrowStageOutput(
            layers[0],
            makeConsistencyOutput({
              blockingIssues: [],
              followUpQuestions: [],
            }),
          ),
        },
        {
          structuredOutput: narrowStageOutput(
            layers[1],
            makeConsistencyOutput({
              followUpQuestions: [makeQuestionItem('q-child-loop-001')],
            }),
          ),
        },
        {
          structuredOutput: narrowStageOutput(
            layers[2],
            makeConsistencyOutput({
              followUpQuestions: [makeQuestionItem('q-child-loop-002')],
            }),
          ),
        },
      ],
      [CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE]: [
        makeResolutionResponse(
          makeConsistencyOutput({
            followUpQuestions: [
              makeQuestionItem('q-child-loop-001'),
              makeQuestionItem('q-child-loop-002'),
            ],
          }),
        ),
      ],
    });

    const result = await runChildWorkflow({ layers });

    expect(result.stateHistory).toEqual([
      CONSISTENCY_FOLLOW_UP_CHILD_START_STATE,
      CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
      CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
      CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
      CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE,
      CONSISTENCY_FOLLOW_UP_CHILD_DONE_STATE,
    ]);
    expect(result.output.followUpQuestions.map((question) => question.questionId)).toEqual([
      'q-child-loop-001',
      'q-child-loop-002',
    ]);
    expect(copilotDouble.callsByState(CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE)).toHaveLength(3);
    expect(
      copilotDouble
        .callsByState(CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE)
        .map((call) => call.outputSchemaId),
    ).toEqual(layers.map((layer) => layer.outputSchema));
    expect(obsSink.delegationEvents().map((event) => event.payload.stageId)).toEqual([
      ...layers.map((layer) => layer.stageId),
      CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STAGE_ID,
    ]);
    expect(
      copilotDouble.callsByState(CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE),
    ).toHaveLength(1);
    expect(
      obsSink
        .delegationEvents()
        .filter((event) => event.state === CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE),
    ).toHaveLength(1);
    expect(obsSink.consistencyOutcomeEvents().at(-1)?.state).toBe(
      CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE,
    );
  });

  it('keeps self-looping after an actionable stage until every configured layer has executed and PlanResolution runs once', async () => {
    const layers = CONSISTENCY_FOLLOW_UP_PROMPT_LAYERS.slice(0, 3);
    copilotDouble.reset({
      [CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE]: [
        {
          structuredOutput: narrowStageOutput(
            layers[0],
            makeConsistencyOutput({
              blockingIssues: [],
              followUpQuestions: [],
            }),
          ),
        },
        {
          structuredOutput: narrowStageOutput(
            layers[1],
            makeConsistencyOutput({
              actionableItems: [makeActionableItem('act-child-done-001')],
            }),
          ),
        },
        {
          structuredOutput: narrowStageOutput(
            layers[2],
            makeConsistencyOutput({
              followUpQuestions: [makeQuestionItem('q-child-post-actionable-001')],
            }),
          ),
        },
      ],
      [CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE]: [
        makeResolutionResponse(
          makeConsistencyOutput({
            actionableItems: [makeActionableItem('act-child-done-001')],
            followUpQuestions: [makeQuestionItem('q-child-post-actionable-001')],
          }),
        ),
      ],
    });

    const result = await runChildWorkflow({ layers });

    expect(result.stateHistory).toEqual([
      CONSISTENCY_FOLLOW_UP_CHILD_START_STATE,
      CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
      CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
      CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE,
      CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE,
      CONSISTENCY_FOLLOW_UP_CHILD_DONE_STATE,
    ]);
    expect(result.output.actionableItems).toEqual([makeActionableItem('act-child-done-001')]);
    expect(result.output.followUpQuestions).toEqual([
      makeQuestionItem('q-child-post-actionable-001'),
    ]);
    expect(copilotDouble.callsByState(CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE)).toHaveLength(3);
    expect(
      copilotDouble.callsByState(CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE),
    ).toHaveLength(1);
    expect(obsSink.delegationEvents().map((event) => event.payload.stageId)).toEqual([
      ...layers.map((layer) => layer.stageId),
      CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STAGE_ID,
    ]);
    expect(obsSink.consistencyOutcomeEvents().at(-1)?.payload.actionableItemsCount).toBe(1);
    expect(obsSink.consistencyOutcomeEvents().at(-1)?.payload.stageSequence).toEqual(
      layers.map((layer) => layer.stageId),
    );

    const executeTransitions = result.transitionDataHistory.slice(1);
    expect(
      executeTransitions.map(
        (data) =>
          (
            data as {
              executedStages: Array<{ stageId: string }>;
            }
          ).executedStages.length,
      ),
    ).toEqual([1, 2, 3, 3]);

    const planDelegations = obsSink
      .delegationEvents()
      .filter((event) => event.state === CONSISTENCY_FOLLOW_UP_CHILD_PLAN_RESOLUTION_STATE);
    expect(planDelegations).toHaveLength(1);
    expect(planDelegations[0].sequence).toBeGreaterThan(
      obsSink
        .delegationEvents()
        .filter((event) => event.state === CONSISTENCY_FOLLOW_UP_CHILD_EXECUTE_STATE)
        .at(-1)?.sequence ?? 0,
    );
  });
});
