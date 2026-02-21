import type { DbClient } from './db.js';

export interface WorkflowDefinitionRecord {
  workflowType: string;
  workflowVersion: string;
  metadata: Record<string, unknown>;
  registeredAt: string;
}

interface WorkflowDefinitionRow {
  workflow_type: string;
  workflow_version: string;
  metadata_jsonb: Record<string, unknown>;
  registered_at: Date;
}

export const UPSERT_DEFINITION_SQL = `
INSERT INTO workflow_definitions (
  workflow_type,
  workflow_version,
  metadata_jsonb,
  registered_at
)
VALUES ($1, $2, $3, $4)
ON CONFLICT (workflow_type)
DO UPDATE SET
  workflow_version = EXCLUDED.workflow_version,
  metadata_jsonb = EXCLUDED.metadata_jsonb,
  registered_at = EXCLUDED.registered_at
RETURNING
  workflow_type,
  workflow_version,
  metadata_jsonb,
  registered_at
`;

export const mapWorkflowDefinitionRow = (row: WorkflowDefinitionRow): WorkflowDefinitionRecord => ({
  workflowType: row.workflow_type,
  workflowVersion: row.workflow_version,
  metadata: row.metadata_jsonb,
  registeredAt: row.registered_at.toISOString(),
});

export interface DefinitionRepository {
  upsertDefinition: (
    client: DbClient,
    definition: WorkflowDefinitionRecord,
  ) => Promise<WorkflowDefinitionRecord>;
}

export const createDefinitionRepository = (): DefinitionRepository => ({
  upsertDefinition: async (client, definition) => {
    const result = await client.query<WorkflowDefinitionRow>(UPSERT_DEFINITION_SQL, [
      definition.workflowType,
      definition.workflowVersion,
      definition.metadata,
      definition.registeredAt,
    ]);

    if (result.rowCount !== 1) {
      throw new Error(`Expected one definition row but received ${result.rowCount}`);
    }

    return mapWorkflowDefinitionRow(result.rows[0]);
  },
});
