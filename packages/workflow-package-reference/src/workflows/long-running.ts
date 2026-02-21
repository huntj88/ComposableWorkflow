import type {
  WorkflowDefinition,
  WorkflowRegistration,
  WorkflowTransitionDescriptor,
} from '@composable-workflow/workflow-lib/contracts';

export const LONG_RUNNING_WORKFLOW_TYPE = 'reference.long-running.v1';

export interface ReferenceLongRunningInput {
  requestId: string;
  checkpointCount: number;
}

export interface ReferenceLongRunningOutput {
  status: 'completed';
  checkpoints: string[];
  finalToken: string;
}

interface LongRunningProgressData {
  checkpointTokens: string[];
  index: number;
  completed: string[];
}

const DEFAULT_CHECKPOINT_COUNT = 3;

export const longRunningTransitions: WorkflowTransitionDescriptor[] = [
  { from: 'bootstrap', to: 'checkpoint', name: 'initialize-checkpoints' },
  { from: 'checkpoint', to: 'checkpoint', name: 'safe-point' },
  { from: 'checkpoint', to: 'complete', name: 'all-safe-points-complete' },
];

export const buildCheckpointTokens = (input: ReferenceLongRunningInput): string[] => {
  const checkpointCount = Math.max(
    1,
    Math.floor(input.checkpointCount || DEFAULT_CHECKPOINT_COUNT),
  );
  return Array.from(
    { length: checkpointCount },
    (_, index) => `${input.requestId}:safe-point:${index + 1}`,
  );
};

export const createLongRunningDefinition = (): WorkflowDefinition<
  ReferenceLongRunningInput,
  ReferenceLongRunningOutput
> => ({
  initialState: 'bootstrap',
  transitions: longRunningTransitions,
  states: {
    bootstrap: (ctx) => {
      ctx.transition('checkpoint', {
        checkpointTokens: buildCheckpointTokens(ctx.input),
        index: 0,
        completed: [],
      } satisfies LongRunningProgressData);
    },
    checkpoint: (ctx, rawData) => {
      const data = rawData as LongRunningProgressData | undefined;
      const checkpointTokens = data?.checkpointTokens ?? buildCheckpointTokens(ctx.input);
      const index = data?.index ?? 0;
      const completed = data?.completed ?? [];

      if (index >= checkpointTokens.length) {
        ctx.transition('complete', {
          checkpoints: completed,
        });
        return;
      }

      const nextCompleted = [...completed, checkpointTokens[index]];
      ctx.transition('checkpoint', {
        checkpointTokens,
        index: index + 1,
        completed: nextCompleted,
      } satisfies LongRunningProgressData);
    },
    complete: (ctx, data) => {
      const checkpoints =
        (data as { checkpoints?: string[] } | undefined)?.checkpoints ??
        buildCheckpointTokens(ctx.input);

      ctx.complete({
        status: 'completed',
        checkpoints,
        finalToken: checkpoints[checkpoints.length - 1] ?? `${ctx.input.requestId}:safe-point:0`,
      });
    },
  },
});

export const longRunningWorkflowRegistration: WorkflowRegistration<
  ReferenceLongRunningInput,
  ReferenceLongRunningOutput
> = {
  workflowType: LONG_RUNNING_WORKFLOW_TYPE,
  workflowVersion: '1.0.0',
  metadata: {
    displayName: 'Reference Long Running Workflow',
    description:
      'Deterministic safe-point workflow fixture for pause/resume/recovery integration tests.',
    tags: ['reference', 'long-running', 'safe-point', 'deterministic'],
  },
  factory: () => createLongRunningDefinition(),
};
