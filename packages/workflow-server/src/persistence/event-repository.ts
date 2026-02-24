import type { DbClient } from './db.js';

export interface EventInsert {
  eventId: string;
  runId: string;
  eventType: string;
  timestamp: string;
  payload?: Record<string, unknown>;
  error?: Record<string, unknown>;
}

interface SequenceRow {
  next_sequence: number;
}

interface WorkflowEventRow {
  event_id: string;
  run_id: string;
  sequence: number;
  event_type: string;
  timestamp: Date;
  payload_jsonb: Record<string, unknown> | null;
  error_jsonb: Record<string, unknown> | null;
}

export interface PersistedEvent {
  eventId: string;
  runId: string;
  sequence: number;
  eventType: string;
  timestamp: string;
  payload: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
}

export const LOCK_RUN_FOR_SEQUENCE_SQL =
  'SELECT run_id FROM workflow_runs WHERE run_id = $1 FOR UPDATE';

export const ALLOCATE_SEQUENCE_SQL =
  'SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM workflow_events WHERE run_id = $1';

export const INSERT_EVENT_SQL = `
INSERT INTO workflow_events (
  event_id,
  run_id,
  sequence,
  event_type,
  timestamp,
  payload_jsonb,
  error_jsonb
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING
  event_id,
  run_id,
  sequence,
  event_type,
  timestamp,
  payload_jsonb,
  error_jsonb
`;

export const SELECT_LATEST_TRANSITION_DATA_SQL = `
SELECT
  payload_jsonb
FROM workflow_events
WHERE run_id = $1
  AND event_type = 'transition.completed'
  AND payload_jsonb->>'to' = $2
ORDER BY sequence DESC
LIMIT 1
`;

export const SELECT_WORKFLOW_STARTED_INPUT_SQL = `
SELECT
  payload_jsonb
FROM workflow_events
WHERE run_id = $1
  AND event_type = 'workflow.started'
ORDER BY sequence ASC
LIMIT 1
`;

export interface StoredRunInput {
  present: boolean;
  value: unknown;
}

export const mapWorkflowEventRow = (row: WorkflowEventRow): PersistedEvent => ({
  eventId: row.event_id,
  runId: row.run_id,
  sequence: row.sequence,
  eventType: row.event_type,
  timestamp: row.timestamp.toISOString(),
  payload: row.payload_jsonb,
  error: row.error_jsonb,
});

export interface EventRepository {
  appendEvent: (client: DbClient, input: EventInsert) => Promise<PersistedEvent>;
  getLatestTransitionData?: (
    client: DbClient,
    runId: string,
    toState: string,
  ) => Promise<unknown | undefined>;
  getStartedInput?: (client: DbClient, runId: string) => Promise<StoredRunInput>;
}

export const createEventRepository = (): EventRepository => ({
  appendEvent: async (client, input) => {
    const lockResult = await client.query(LOCK_RUN_FOR_SEQUENCE_SQL, [input.runId]);
    if (lockResult.rowCount !== 1) {
      throw new Error(`Run ${input.runId} not found while appending event`);
    }

    const sequenceResult = await client.query<SequenceRow>(ALLOCATE_SEQUENCE_SQL, [input.runId]);
    const sequence = sequenceResult.rows[0]?.next_sequence;

    if (typeof sequence !== 'number') {
      throw new Error(`Unable to allocate sequence for run ${input.runId}`);
    }

    const eventResult = await client.query<WorkflowEventRow>(INSERT_EVENT_SQL, [
      input.eventId,
      input.runId,
      sequence,
      input.eventType,
      input.timestamp,
      input.payload ?? null,
      input.error ?? null,
    ]);

    if (eventResult.rowCount !== 1) {
      throw new Error(`Expected one event row but received ${eventResult.rowCount}`);
    }

    return mapWorkflowEventRow(eventResult.rows[0]);
  },
  getLatestTransitionData: async (client, runId, toState) => {
    const result = await client.query<Pick<WorkflowEventRow, 'payload_jsonb'>>(
      SELECT_LATEST_TRANSITION_DATA_SQL,
      [runId, toState],
    );

    if (result.rowCount === 0) {
      return undefined;
    }

    const payload = result.rows[0]?.payload_jsonb;
    if (!payload || !Object.hasOwn(payload, 'data')) {
      return undefined;
    }

    return payload.data;
  },
  getStartedInput: async (client, runId) => {
    const result = await client.query<Pick<WorkflowEventRow, 'payload_jsonb'>>(
      SELECT_WORKFLOW_STARTED_INPUT_SQL,
      [runId],
    );

    if (result.rowCount === 0) {
      return {
        present: false,
        value: undefined,
      };
    }

    const payload = result.rows[0]?.payload_jsonb;
    if (!payload || !Object.hasOwn(payload, 'input')) {
      return {
        present: false,
        value: undefined,
      };
    }

    return {
      present: true,
      value: payload.input,
    };
  },
});
