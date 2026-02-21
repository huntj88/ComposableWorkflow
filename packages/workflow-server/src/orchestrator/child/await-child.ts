import type { DbClient } from '../../persistence/db.js';
import type { RunSummary } from '../../persistence/run-repository.js';

interface ChildCompletedRow {
  payload_jsonb: Record<string, unknown> | null;
}

interface ChildFailedRow {
  error_jsonb: Record<string, unknown> | null;
}

const isTerminalLifecycle = (lifecycle: string): boolean =>
  lifecycle === 'completed' || lifecycle === 'failed' || lifecycle === 'cancelled';

const toChildFailureError = (
  childRun: RunSummary,
  errorPayload: Record<string, unknown> | null,
): Error => {
  const message =
    typeof errorPayload?.message === 'string'
      ? errorPayload.message
      : `Child run ${childRun.runId} failed`;
  const name =
    typeof errorPayload?.name === 'string' ? errorPayload.name : 'ChildWorkflowFailedError';
  const error = new Error(message);
  error.name = name;
  return error;
};

const readChildCompletionOutput = async (
  client: DbClient,
  childRunId: string,
): Promise<unknown> => {
  const result = await client.query<ChildCompletedRow>(
    `
SELECT payload_jsonb
FROM workflow_events
WHERE run_id = $1
  AND event_type = 'workflow.completed'
ORDER BY sequence DESC
LIMIT 1
`,
    [childRunId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0]?.payload_jsonb?.output ?? null;
};

const readChildFailure = async (
  client: DbClient,
  childRun: RunSummary,
): Promise<Record<string, unknown> | null> => {
  const result = await client.query<ChildFailedRow>(
    `
SELECT error_jsonb
FROM workflow_events
WHERE run_id = $1
  AND event_type = 'workflow.failed'
ORDER BY sequence DESC
LIMIT 1
`,
    [childRun.runId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0]?.error_jsonb ?? null;
};

export interface AwaitChildDependencies {
  getRunSummary: (client: DbClient, runId: string) => Promise<RunSummary | null>;
  runStep: (run: RunSummary) => Promise<{
    run: RunSummary;
    progressed: boolean;
    terminal: boolean;
  }>;
  maxIterations?: number;
}

export interface AwaitChildResult {
  childRun: RunSummary;
  output: unknown;
}

export const awaitChild = async (params: {
  client: DbClient;
  deps: AwaitChildDependencies;
  childRunId: string;
}): Promise<AwaitChildResult> => {
  const maxIterations = params.deps.maxIterations ?? 256;

  let childRun = await params.deps.getRunSummary(params.client, params.childRunId);

  if (!childRun) {
    throw new Error(`Child run ${params.childRunId} not found`);
  }

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    if (isTerminalLifecycle(childRun.lifecycle)) {
      if (childRun.lifecycle === 'completed') {
        const output = await readChildCompletionOutput(params.client, childRun.runId);
        return {
          childRun,
          output,
        };
      }

      const failurePayload = await readChildFailure(params.client, childRun);
      throw toChildFailureError(childRun, failurePayload);
    }

    const stepResult = await params.deps.runStep(childRun);

    childRun = stepResult.run;

    if (!stepResult.progressed && !stepResult.terminal) {
      throw new Error(
        `Child run ${childRun.runId} is still active but made no progress during synchronous await`,
      );
    }
  }

  throw new Error(`Child await exceeded ${maxIterations} iterations for run ${params.childRunId}`);
};
