import type { DbClient } from './db.js';

export interface IdempotencyRecord {
  workflowType: string;
  idempotencyKey: string;
  runId: string;
  createdAt: string;
}

interface IdempotencyRow {
  workflow_type: string;
  idempotency_key: string;
  run_id: string;
  created_at: Date;
}

export const INSERT_IDEMPOTENCY_SQL = `
INSERT INTO workflow_idempotency (
  workflow_type,
  idempotency_key,
  run_id,
  created_at
)
VALUES ($1, $2, $3, $4)
ON CONFLICT (workflow_type, idempotency_key) DO NOTHING
RETURNING
  workflow_type,
  idempotency_key,
  run_id,
  created_at
`;

export const SELECT_IDEMPOTENCY_SQL = `
SELECT
  workflow_type,
  idempotency_key,
  run_id,
  created_at
FROM workflow_idempotency
WHERE workflow_type = $1
  AND idempotency_key = $2
`;

export const mapIdempotencyRow = (row: IdempotencyRow): IdempotencyRecord => ({
  workflowType: row.workflow_type,
  idempotencyKey: row.idempotency_key,
  runId: row.run_id,
  createdAt: row.created_at.toISOString(),
});

export interface IdempotencyRepository {
  reserveStartKey: (
    client: DbClient,
    record: IdempotencyRecord,
  ) => Promise<IdempotencyRecord | null>;
  getByKey: (
    client: DbClient,
    workflowType: string,
    idempotencyKey: string,
  ) => Promise<IdempotencyRecord | null>;
}

export const createIdempotencyRepository = (): IdempotencyRepository => ({
  reserveStartKey: async (client, record) => {
    const result = await client.query<IdempotencyRow>(INSERT_IDEMPOTENCY_SQL, [
      record.workflowType,
      record.idempotencyKey,
      record.runId,
      record.createdAt,
    ]);

    if (result.rowCount === 0) {
      return null;
    }

    return mapIdempotencyRow(result.rows[0]);
  },
  getByKey: async (client, workflowType, idempotencyKey) => {
    const result = await client.query<IdempotencyRow>(SELECT_IDEMPOTENCY_SQL, [
      workflowType,
      idempotencyKey,
    ]);

    if (result.rowCount === 0) {
      return null;
    }

    return mapIdempotencyRow(result.rows[0]);
  },
});
