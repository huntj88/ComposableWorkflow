import type { DbClient } from './db.js';

export interface RunSummary {
  runId: string;
  workflowType: string;
  workflowVersion: string;
  lifecycle: string;
  currentState: string;
  parentRunId: string | null;
  startedAt: string;
  endedAt: string | null;
}

interface WorkflowRunRow {
  run_id: string;
  workflow_type: string;
  workflow_version: string;
  lifecycle: string;
  current_state: string;
  parent_run_id: string | null;
  started_at: Date;
  ended_at: Date | null;
}

export const UPSERT_RUN_SUMMARY_SQL = `
INSERT INTO workflow_runs (
  run_id,
  workflow_type,
  workflow_version,
  lifecycle,
  current_state,
  parent_run_id,
  started_at,
  ended_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (run_id)
DO UPDATE SET
  workflow_type = EXCLUDED.workflow_type,
  workflow_version = EXCLUDED.workflow_version,
  lifecycle = EXCLUDED.lifecycle,
  current_state = EXCLUDED.current_state,
  parent_run_id = EXCLUDED.parent_run_id,
  started_at = EXCLUDED.started_at,
  ended_at = EXCLUDED.ended_at
RETURNING
  run_id,
  workflow_type,
  workflow_version,
  lifecycle,
  current_state,
  parent_run_id,
  started_at,
  ended_at
`;

export const SELECT_RUN_SUMMARY_SQL = `
SELECT
  run_id,
  workflow_type,
  workflow_version,
  lifecycle,
  current_state,
  parent_run_id,
  started_at,
  ended_at
FROM workflow_runs
WHERE run_id = $1
`;

export const toWorkflowRunRowValues = (summary: RunSummary): unknown[] => [
  summary.runId,
  summary.workflowType,
  summary.workflowVersion,
  summary.lifecycle,
  summary.currentState,
  summary.parentRunId,
  summary.startedAt,
  summary.endedAt,
];

export const mapWorkflowRunRow = (row: WorkflowRunRow): RunSummary => ({
  runId: row.run_id,
  workflowType: row.workflow_type,
  workflowVersion: row.workflow_version,
  lifecycle: row.lifecycle,
  currentState: row.current_state,
  parentRunId: row.parent_run_id,
  startedAt: row.started_at.toISOString(),
  endedAt: row.ended_at?.toISOString() ?? null,
});

export interface RunRepository {
  upsertRunSummary: (client: DbClient, summary: RunSummary) => Promise<RunSummary>;
  getRunSummary: (client: DbClient, runId: string) => Promise<RunSummary | null>;
}

export const createRunRepository = (): RunRepository => ({
  upsertRunSummary: async (client, summary) => {
    const result = await client.query<WorkflowRunRow>(
      UPSERT_RUN_SUMMARY_SQL,
      toWorkflowRunRowValues(summary),
    );

    if (result.rowCount !== 1) {
      throw new Error(`Expected one run summary row but received ${result.rowCount}`);
    }

    return mapWorkflowRunRow(result.rows[0]);
  },
  getRunSummary: async (client, runId) => {
    const result = await client.query<WorkflowRunRow>(SELECT_RUN_SUMMARY_SQL, [runId]);

    if (result.rowCount === 0) {
      return null;
    }

    return mapWorkflowRunRow(result.rows[0]);
  },
});
