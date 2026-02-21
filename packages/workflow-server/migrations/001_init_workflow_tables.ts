import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export const up = (pgm: MigrationBuilder): void => {
  pgm.createTable('workflow_definitions', {
    workflow_type: { type: 'text', primaryKey: true, notNull: true },
    workflow_version: { type: 'text', notNull: true },
    metadata_jsonb: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    registered_at: { type: 'timestamptz', notNull: true },
  });

  pgm.createTable('workflow_runs', {
    run_id: { type: 'text', primaryKey: true, notNull: true },
    workflow_type: { type: 'text', notNull: true },
    workflow_version: { type: 'text', notNull: true },
    lifecycle: { type: 'text', notNull: true },
    current_state: { type: 'text', notNull: true },
    parent_run_id: { type: 'text' },
    started_at: { type: 'timestamptz', notNull: true },
    ended_at: { type: 'timestamptz' },
  });

  pgm.addConstraint('workflow_runs', 'fk_workflow_runs_parent_run', {
    foreignKeys: {
      columns: 'parent_run_id',
      references: 'workflow_runs(run_id)',
      onDelete: 'SET NULL',
    },
  });

  pgm.createTable('workflow_events', {
    event_id: { type: 'text', primaryKey: true, notNull: true },
    run_id: { type: 'text', notNull: true },
    sequence: { type: 'integer', notNull: true },
    event_type: { type: 'text', notNull: true },
    timestamp: { type: 'timestamptz', notNull: true },
    payload_jsonb: { type: 'jsonb' },
    error_jsonb: { type: 'jsonb' },
  });

  pgm.addConstraint('workflow_events', 'fk_workflow_events_run', {
    foreignKeys: {
      columns: 'run_id',
      references: 'workflow_runs(run_id)',
      onDelete: 'CASCADE',
    },
  });

  pgm.addConstraint('workflow_events', 'uq_workflow_events_run_sequence', {
    unique: ['run_id', 'sequence'],
  });

  pgm.createTable('workflow_run_children', {
    parent_run_id: { type: 'text', notNull: true },
    child_run_id: { type: 'text', notNull: true },
    parent_workflow_type: { type: 'text', notNull: true },
    child_workflow_type: { type: 'text', notNull: true },
    parent_state: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true },
    linked_by_event_id: { type: 'text', notNull: true },
  });

  pgm.addConstraint('workflow_run_children', 'pk_workflow_run_children', {
    primaryKey: ['parent_run_id', 'child_run_id'],
  });

  pgm.addConstraint('workflow_run_children', 'fk_wrc_parent_run', {
    foreignKeys: {
      columns: 'parent_run_id',
      references: 'workflow_runs(run_id)',
      onDelete: 'CASCADE',
    },
  });

  pgm.addConstraint('workflow_run_children', 'fk_wrc_child_run', {
    foreignKeys: {
      columns: 'child_run_id',
      references: 'workflow_runs(run_id)',
      onDelete: 'CASCADE',
    },
  });

  pgm.addConstraint('workflow_run_children', 'uq_wrc_child_run', {
    unique: ['child_run_id'],
  });

  pgm.createIndex('workflow_run_children', ['parent_run_id'], {
    name: 'idx_wrc_parent_run_id',
  });
  pgm.createIndex('workflow_run_children', ['created_at'], {
    name: 'idx_wrc_created_at',
  });

  pgm.createTable('workflow_snapshots', {
    run_id: { type: 'text', primaryKey: true, notNull: true },
    sequence: { type: 'integer', notNull: true },
    lifecycle: { type: 'text', notNull: true },
    current_state: { type: 'text', notNull: true },
    snapshot_jsonb: { type: 'jsonb', notNull: true, default: pgm.func(`'{}'::jsonb`) },
    updated_at: { type: 'timestamptz', notNull: true },
  });

  pgm.addConstraint('workflow_snapshots', 'fk_workflow_snapshots_run', {
    foreignKeys: {
      columns: 'run_id',
      references: 'workflow_runs(run_id)',
      onDelete: 'CASCADE',
    },
  });

  pgm.createTable('workflow_idempotency', {
    workflow_type: { type: 'text', notNull: true },
    idempotency_key: { type: 'text', notNull: true },
    run_id: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true },
  });

  pgm.addConstraint('workflow_idempotency', 'pk_workflow_idempotency', {
    primaryKey: ['workflow_type', 'idempotency_key'],
  });

  pgm.addConstraint('workflow_idempotency', 'fk_workflow_idempotency_run', {
    foreignKeys: {
      columns: 'run_id',
      references: 'workflow_runs(run_id)',
      onDelete: 'CASCADE',
    },
  });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropTable('workflow_idempotency');
  pgm.dropTable('workflow_snapshots');
  pgm.dropTable('workflow_run_children');
  pgm.dropTable('workflow_events');
  pgm.dropTable('workflow_runs');
  pgm.dropTable('workflow_definitions');
};
