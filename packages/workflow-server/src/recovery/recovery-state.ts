import type { DbClient } from '../persistence/db.js';

interface SequenceRow {
  sequence: number;
}

interface ExistsRow {
  event_id: string;
}

const SELECT_LATEST_RECOVERY_BOUNDARY_SQL = `
SELECT sequence
FROM workflow_events
WHERE run_id = $1
  AND event_type = 'workflow.recovered'
ORDER BY sequence DESC
LIMIT 1
`;

const SELECT_PROGRESS_SINCE_BOUNDARY_SQL = `
SELECT event_id
FROM workflow_events
WHERE run_id = $1
  AND sequence > $2
  AND event_type = 'transition.completed'
LIMIT 1
`;

export const getLatestRecoveryBoundarySequence = async (
  client: DbClient,
  runId: string,
): Promise<number | null> => {
  const result = await client.query<SequenceRow>(SELECT_LATEST_RECOVERY_BOUNDARY_SQL, [runId]);
  const sequence = result.rows[0]?.sequence;
  return typeof sequence === 'number' ? sequence : null;
};

export const hasProgressSinceRecoveryBoundary = async (
  client: DbClient,
  params: {
    runId: string;
    boundarySequence: number;
  },
): Promise<boolean> => {
  const result = await client.query<ExistsRow>(SELECT_PROGRESS_SINCE_BOUNDARY_SQL, [
    params.runId,
    params.boundarySequence,
  ]);

  return (result.rowCount ?? 0) > 0;
};

export const hasProgressSinceLatestRecoveryBoundary = async (
  client: DbClient,
  runId: string,
): Promise<boolean> => {
  const boundarySequence = await getLatestRecoveryBoundarySequence(client, runId);
  if (boundarySequence === null) {
    return true;
  }

  return hasProgressSinceRecoveryBoundary(client, {
    runId,
    boundarySequence,
  });
};
