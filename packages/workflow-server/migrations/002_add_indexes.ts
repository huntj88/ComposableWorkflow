import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export const up = (pgm: MigrationBuilder): void => {
  pgm.createIndex('workflow_events', ['run_id', 'sequence', 'event_type', 'timestamp'], {
    name: 'idx_workflow_events_query_path',
  });

  pgm.createIndex('workflow_runs', ['lifecycle', 'started_at'], {
    name: 'idx_workflow_runs_lifecycle_started_at',
  });
  pgm.createIndex('workflow_runs', ['workflow_type', 'started_at'], {
    name: 'idx_workflow_runs_type_started_at',
  });
  pgm.createIndex('workflow_runs', ['ended_at'], {
    name: 'idx_workflow_runs_ended_at',
  });
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropIndex('workflow_runs', ['ended_at'], {
    name: 'idx_workflow_runs_ended_at',
  });
  pgm.dropIndex('workflow_runs', ['workflow_type', 'started_at'], {
    name: 'idx_workflow_runs_type_started_at',
  });
  pgm.dropIndex('workflow_runs', ['lifecycle', 'started_at'], {
    name: 'idx_workflow_runs_lifecycle_started_at',
  });

  pgm.dropIndex('workflow_events', ['run_id', 'sequence', 'event_type', 'timestamp'], {
    name: 'idx_workflow_events_query_path',
  });
};
