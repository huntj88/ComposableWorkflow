import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

import { loadWorkflowPackages } from '../../../src/loader/load-packages.js';
import { createPool } from '../../../src/persistence/db.js';
import { runMigrations } from '../../../src/persistence/migrate.js';

describe('loader valid package', () => {
  let container: StartedTestContainer | undefined;
  let databaseUrl: string;
  let runtimeAvailable = true;

  beforeAll(async () => {
    try {
      container = await new GenericContainer('postgres:16-alpine')
        .withEnvironment({
          POSTGRES_DB: 'workflow',
          POSTGRES_USER: 'workflow',
          POSTGRES_PASSWORD: 'workflow',
        })
        .withExposedPorts(5432)
        .start();

      databaseUrl = `postgresql://workflow:workflow@${container.getHost()}:${container.getMappedPort(5432)}/workflow`;
      await runMigrations({ databaseUrl, direction: 'up' });
    } catch {
      runtimeAvailable = false;
    }
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
  });

  it('loads valid path package and persists definition snapshot', async (context) => {
    if (!runtimeAvailable) {
      context.skip();
    }

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
