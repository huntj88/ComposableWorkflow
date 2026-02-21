import type {
  ChildWorkflowRequest,
  WorkflowCommandRequest,
  WorkflowCommandResult,
  WorkflowContext,
  WorkflowDefinition,
  WorkflowFactory,
} from '@composable-workflow/workflow-lib/contracts';
import { describe, expect, it } from 'vitest';

import manifest from '../../src/manifest.js';
import {
  commandTransitions,
  toCommandRequest,
  type ReferenceCommandInput,
  type ReferenceCommandOutput,
} from '../../src/workflows/command.js';
import {
  failureTransitions,
  toDeterministicFailureMessage,
  type ReferenceFailureInput,
} from '../../src/workflows/failure.js';
import {
  buildCheckpointTokens,
  longRunningTransitions,
  type ReferenceLongRunningInput,
  type ReferenceLongRunningOutput,
} from '../../src/workflows/long-running.js';
import {
  parentChildTransitions,
  toChildLaunchRequest,
  type ReferenceParentChildInput,
  type ReferenceParentChildOutput,
} from '../../src/workflows/parent-child.js';
import {
  successTransitions,
  toSuccessConfirmationId,
  type ReferenceSuccessInput,
  type ReferenceSuccessOutput,
} from '../../src/workflows/success.js';

interface SimulationResult<O> {
  visitedStates: string[];
  completedOutput?: O;
  failureError?: Error;
  commandRequests: WorkflowCommandRequest[];
  childRequests: ChildWorkflowRequest<unknown>[];
}

const buildCommandResult = (stdout: string): WorkflowCommandResult => ({
  exitCode: 0,
  stdin: '',
  stdout,
  stderr: '',
  startedAt: '2026-01-01T00:00:00.000Z',
  completedAt: '2026-01-01T00:00:01.000Z',
  durationMs: 1000,
});

const runWorkflowToSettlement = async <I, O>(params: {
  factory: WorkflowFactory<I, O>;
  workflowType: string;
  input: I;
  commandResult?: WorkflowCommandResult;
  childResult?: unknown;
}): Promise<SimulationResult<O>> => {
  const commandRequests: WorkflowCommandRequest[] = [];
  const childRequests: ChildWorkflowRequest<unknown>[] = [];

  let transitionIntent: { to: string; data?: unknown } | undefined;
  let completedOutput: O | undefined;
  let failureError: Error | undefined;

  const ctx: WorkflowContext<I, O> = {
    runId: 'reference-test-run',
    workflowType: params.workflowType,
    input: params.input,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    log: () => undefined,
    transition: (to, data) => {
      transitionIntent = { to, data };
    },
    launchChild: async <CI, CO>(req: ChildWorkflowRequest<CI>): Promise<CO> => {
      childRequests.push(req as ChildWorkflowRequest<unknown>);
      return params.childResult as CO;
    },
    runCommand: async (req) => {
      commandRequests.push(req);
      return params.commandResult ?? buildCommandResult('reference-command-ok');
    },
    complete: (output) => {
      completedOutput = output;
    },
    fail: (error) => {
      failureError = error;
    },
  };

  const definition = params.factory(ctx) as WorkflowDefinition<I, O>;
  const visitedStates = [definition.initialState];

  let currentState = definition.initialState;
  let data: unknown;

  for (let step = 0; step < 30; step += 1) {
    if (completedOutput || failureError) {
      break;
    }

    const handler = definition.states[currentState];
    expect(handler).toBeTypeOf('function');

    transitionIntent = undefined;
    await handler(ctx, data);

    if (!transitionIntent) {
      break;
    }

    currentState = transitionIntent.to;
    data = transitionIntent.data;
    visitedStates.push(currentState);
  }

  return {
    visitedStates,
    completedOutput,
    failureError,
    commandRequests,
    childRequests,
  };
};

describe('reference workflows transition maps', () => {
  it('exposes deterministic transitions for graph assertions', () => {
    const transitionsByType = new Map(
      manifest.workflows.map((workflow) => {
        const inspected = workflow.factory({
          runId: 'inspection-run',
          workflowType: workflow.workflowType,
          input: undefined,
          now: () => new Date('2026-01-01T00:00:00.000Z'),
          log: () => undefined,
          transition: () => undefined,
          launchChild: async () => {
            throw new Error('launchChild should not be called in this inspection');
          },
          runCommand: async () => {
            throw new Error('runCommand should not be called in this inspection');
          },
          complete: () => undefined,
          fail: () => undefined,
        });
        return [workflow.workflowType, inspected.transitions ?? []] as const;
      }),
    );

    expect(transitionsByType.get('reference.success.v1')).toEqual(successTransitions);
    expect(transitionsByType.get('reference.failure.v1')).toEqual(failureTransitions);
    expect(transitionsByType.get('reference.parent-child.v1')).toEqual(parentChildTransitions);
    expect(transitionsByType.get('reference.command.v1')).toEqual(commandTransitions);
    expect(transitionsByType.get('reference.long-running.v1')).toEqual(longRunningTransitions);
  });
});

describe('reference workflows deterministic progression', () => {
  it('progresses success workflow deterministically', async () => {
    const input: ReferenceSuccessInput = {
      requestId: 'ref-success-001',
      customerId: 'customer-123',
      amountCents: 4250,
      currency: 'USD',
    };

    const workflow = manifest.workflows.find(
      (item) => item.workflowType === 'reference.success.v1',
    );
    expect(workflow).toBeDefined();

    const result = await runWorkflowToSettlement({
      factory: workflow!.factory as WorkflowFactory<ReferenceSuccessInput, ReferenceSuccessOutput>,
      workflowType: workflow!.workflowType,
      input,
    });

    expect(result.failureError).toBeUndefined();
    expect(result.visitedStates).toEqual(['validate', 'process', 'complete']);
    expect(result.completedOutput).toEqual({
      status: 'completed',
      confirmationId: toSuccessConfirmationId(input),
      echoedRequestId: input.requestId,
    });
  });

  it('fails deterministically for failure workflow', async () => {
    const input: ReferenceFailureInput = {
      requestId: 'ref-failure-001',
      failureCode: 'DECLINED',
    };

    const workflow = manifest.workflows.find(
      (item) => item.workflowType === 'reference.failure.v1',
    );
    expect(workflow).toBeDefined();

    const result = await runWorkflowToSettlement({
      factory: workflow!.factory as WorkflowFactory<ReferenceFailureInput, never>,
      workflowType: workflow!.workflowType,
      input,
    });

    expect(result.completedOutput).toBeUndefined();
    expect(result.visitedStates).toEqual(['start', 'fail']);
    expect(result.failureError).toBeDefined();
    expect(result.failureError?.message).toBe(toDeterministicFailureMessage(input));
  });

  it('launches a child workflow with deterministic payload', async () => {
    const input: ReferenceParentChildInput = {
      requestId: 'ref-parent-001',
      childInput: {
        requestId: 'ref-child-001',
        customerId: 'child-customer',
        amountCents: 100,
        currency: 'USD',
      },
    };

    const workflow = manifest.workflows.find(
      (item) => item.workflowType === 'reference.parent-child.v1',
    );
    expect(workflow).toBeDefined();

    const result = await runWorkflowToSettlement({
      factory: workflow!.factory as WorkflowFactory<
        ReferenceParentChildInput,
        ReferenceParentChildOutput
      >,
      workflowType: workflow!.workflowType,
      input,
      childResult: {
        status: 'completed',
        confirmationId: 'child-confirmation',
        echoedRequestId: input.childInput.requestId,
      } satisfies ReferenceSuccessOutput,
    });

    expect(result.failureError).toBeUndefined();
    expect(result.visitedStates).toEqual(['launch-child', 'complete']);
    expect(result.childRequests).toEqual([toChildLaunchRequest(input)]);
    expect(result.completedOutput).toEqual({
      status: 'completed',
      childConfirmationId: 'child-confirmation',
      parentRequestId: input.requestId,
    });
  });

  it('invokes runCommand deterministically', async () => {
    const input: ReferenceCommandInput = {
      requestId: 'ref-command-001',
      message: 'reference-command-ok',
    };

    const workflow = manifest.workflows.find(
      (item) => item.workflowType === 'reference.command.v1',
    );
    expect(workflow).toBeDefined();

    const result = await runWorkflowToSettlement({
      factory: workflow!.factory as WorkflowFactory<ReferenceCommandInput, ReferenceCommandOutput>,
      workflowType: workflow!.workflowType,
      input,
      commandResult: buildCommandResult('reference-command-ok'),
    });

    expect(result.failureError).toBeUndefined();
    expect(result.visitedStates).toEqual(['start', 'finalize']);
    expect(result.commandRequests).toEqual([toCommandRequest(input)]);
    expect(result.completedOutput).toEqual({
      status: 'completed',
      exitCode: 0,
      stdout: 'reference-command-ok',
      requestId: input.requestId,
    });
  });

  it('exposes deterministic safe-point checkpoints for long-running lifecycle tests', async () => {
    const input: ReferenceLongRunningInput = {
      requestId: 'ref-long-001',
      checkpointCount: 3,
    };

    const workflow = manifest.workflows.find(
      (item) => item.workflowType === 'reference.long-running.v1',
    );
    expect(workflow).toBeDefined();

    const result = await runWorkflowToSettlement({
      factory: workflow!.factory as WorkflowFactory<
        ReferenceLongRunningInput,
        ReferenceLongRunningOutput
      >,
      workflowType: workflow!.workflowType,
      input,
    });

    expect(result.failureError).toBeUndefined();
    expect(result.completedOutput).toEqual({
      status: 'completed',
      checkpoints: buildCheckpointTokens(input),
      finalToken: `${input.requestId}:safe-point:3`,
    });
    expect(result.visitedStates).toEqual([
      'bootstrap',
      'checkpoint',
      'checkpoint',
      'checkpoint',
      'checkpoint',
      'complete',
    ]);
  });
});
