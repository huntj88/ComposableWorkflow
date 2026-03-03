import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export const up = (pgm: MigrationBuilder): void => {
  // Read-model projection table for efficient human-feedback request queries.
  // Canonical source-of-truth remains workflow_events.
  pgm.createTable('human_feedback_requests', {
    feedback_run_id: { type: 'text', primaryKey: true, notNull: true },
    parent_run_id: { type: 'text', notNull: true },
    parent_workflow_type: { type: 'text', notNull: true },
    parent_state: { type: 'text', notNull: true },
    question_id: { type: 'text', notNull: true },
    request_event_id: { type: 'text', notNull: true, unique: true },
    prompt: { type: 'text', notNull: true },
    options_json: { type: 'jsonb' },
    constraints_json: { type: 'jsonb' },
    correlation_id: { type: 'text' },
    status: { type: 'text', notNull: true },
    requested_at: { type: 'timestamptz', notNull: true },
    responded_at: { type: 'timestamptz' },
    cancelled_at: { type: 'timestamptz' },
    response_json: { type: 'jsonb' },
    responded_by: { type: 'text' },
  });

  pgm.addConstraint('human_feedback_requests', 'fk_hfr_feedback_run', {
    foreignKeys: {
      columns: 'feedback_run_id',
      references: 'workflow_runs(run_id)',
      onDelete: 'CASCADE',
    },
  });

  pgm.addConstraint('human_feedback_requests', 'fk_hfr_parent_run', {
    foreignKeys: {
      columns: 'parent_run_id',
      references: 'workflow_runs(run_id)',
      onDelete: 'CASCADE',
    },
  });

  pgm.addConstraint('human_feedback_requests', 'chk_hfr_status', {
    check: "status IN ('awaiting_response', 'responded', 'cancelled')",
  });

  pgm.createIndex('human_feedback_requests', ['status'], {
    name: 'idx_hfr_status',
  });

  pgm.createIndex('human_feedback_requests', ['parent_run_id'], {
    name: 'idx_hfr_parent_run_id',
  });

  pgm.createIndex('human_feedback_requests', ['question_id'], {
    name: 'idx_hfr_question_id',
  });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable('human_feedback_requests');
};
