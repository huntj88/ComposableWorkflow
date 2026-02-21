import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export const up = (pgm: MigrationBuilder): void => {
  pgm.dropConstraint('workflow_idempotency', 'fk_workflow_idempotency_run');
  pgm.sql(`
    ALTER TABLE workflow_idempotency
    ADD CONSTRAINT fk_workflow_idempotency_run
    FOREIGN KEY (run_id)
    REFERENCES workflow_runs(run_id)
    ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED
  `);
};

export const down = (pgm: MigrationBuilder): void => {
  pgm.dropConstraint('workflow_idempotency', 'fk_workflow_idempotency_run');
  pgm.addConstraint('workflow_idempotency', 'fk_workflow_idempotency_run', {
    foreignKeys: {
      columns: 'run_id',
      references: 'workflow_runs(run_id)',
      onDelete: 'CASCADE',
    },
  });
};
