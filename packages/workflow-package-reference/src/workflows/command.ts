import type {
  WorkflowCommandRequest,
  WorkflowCommandResult,
  WorkflowDefinition,
  WorkflowRegistration,
  WorkflowTransitionDescriptor,
} from '@composable-workflow/workflow-lib/contracts';

export const COMMAND_WORKFLOW_TYPE = 'reference.command.v1';

export interface ReferenceCommandInput {
  requestId: string;
  message: string;
}

export interface ReferenceCommandOutput {
  status: 'completed';
  exitCode: number;
  stdout: string;
  requestId: string;
}

export const commandTransitions: WorkflowTransitionDescriptor[] = [
  { from: 'start', to: 'finalize', name: 'command-finished' },
];

export const toCommandRequest = (input: ReferenceCommandInput): WorkflowCommandRequest => ({
  command: 'node',
  args: ['-e', `process.stdout.write(${JSON.stringify(input.message)})`],
  allowNonZeroExit: false,
  timeoutMs: 5_000,
});

export const createCommandDefinition = (): WorkflowDefinition<
  ReferenceCommandInput,
  ReferenceCommandOutput
> => ({
  initialState: 'start',
  transitions: commandTransitions,
  states: {
    start: async (ctx) => {
      const result = await ctx.runCommand(toCommandRequest(ctx.input));
      ctx.transition('finalize', { result });
    },
    finalize: (ctx, data) => {
      const result = (data as { result?: WorkflowCommandResult } | undefined)?.result;

      ctx.complete({
        status: 'completed',
        exitCode: result?.exitCode ?? -1,
        stdout: result?.stdout ?? '',
        requestId: ctx.input.requestId,
      });
    },
  },
});

export const commandWorkflowRegistration: WorkflowRegistration<
  ReferenceCommandInput,
  ReferenceCommandOutput
> = {
  workflowType: COMMAND_WORKFLOW_TYPE,
  workflowVersion: '1.0.0',
  metadata: {
    displayName: 'Reference Command Workflow',
    description: 'Deterministic workflow fixture that executes ctx.runCommand(...).',
    tags: ['reference', 'command', 'deterministic'],
  },
  factory: () => createCommandDefinition(),
};
