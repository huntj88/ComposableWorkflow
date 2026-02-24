import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createSharedPostgresTestContainer,
  type PostgresTestContainerHandle,
} from '../../harness/postgres-container.js';

import { loadWorkflowPackages } from '../../../src/loader/load-packages.js';
import { createPool } from '../../../src/persistence/db.js';

describe('loader valid package', () => {
  let postgres: PostgresTestContainerHandle | undefined;
  let databaseUrl: string;

  beforeAll(async () => {
    postgres = await createSharedPostgresTestContainer();
    databaseUrl = postgres.connectionString;
  }, 120_000);

  afterAll(async () => {
    await postgres?.stop();
  });

  it('loads valid path package and persists definition snapshot', async () => {
    const fixtureDir = await mkdtemp(path.join(tmpdir(), 'wf-loader-valid-'));
    const fixturePath = path.join(fixtureDir, 'manifest.mjs');

    await writeFile(
      fixturePath,
      `
      export default {
        packageName: 'pkg.valid',
        packageVersion: '1.0.0',
        workflows: [
          {
            workflowType: 'wf.integration.valid',
            workflowVersion: '2026.1',
            metadata: { displayName: 'Valid Flow' },
            factory: () => ({ initialState: 'start', states: { start: () => undefined } })
          }
        ]
      };
      `,
      'utf-8',
    );

    const pool = createPool({ connectionString: databaseUrl });

    const result = await loadWorkflowPackages({
      sources: [{ source: 'path', value: fixturePath }],
      pool,
      logger: { info: () => undefined, warn: () => undefined },
    });

    expect(result.rejected).toHaveLength(0);
    expect(result.loaded).toHaveLength(1);
    expect(result.registry.getByType('wf.integration.valid')).toBeDefined();

    const definitionRow = await pool.query(
      'SELECT workflow_type, workflow_version, metadata_jsonb FROM workflow_definitions WHERE workflow_type = $1',
      ['wf.integration.valid'],
    );

    expect(definitionRow.rowCount).toBe(1);
    expect(definitionRow.rows[0].workflow_version).toBe('2026.1');
    expect(definitionRow.rows[0].metadata_jsonb.packageName).toBe('pkg.valid');

    await pool.end();
  });
});
