import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadWorkflowPackages } from '../../../src/loader/load-packages.js';
import type { IntegrationHarness } from '../../harness/create-harness.js';
import {
  SUCCESS_WORKFLOW_TYPE,
  advanceRunToTerminal,
  createE2eHarness,
  createReferencePackageSource,
  expectFourDimensions,
  startWorkflow,
} from '../setup.js';

describe('e2e.behaviors.load', () => {
  let harness: IntegrationHarness | undefined;

  beforeAll(async () => {
    harness = await createE2eHarness();
  }, 120_000);

  afterAll(async () => {
    await harness?.shutdown();
  });

  it('B-LOAD-001/B-LOAD-004 loads package by path and exposes informational version on run state', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const definition = await harness.server.inject({
      method: 'GET',
      url: `/api/v1/workflows/definitions/${SUCCESS_WORKFLOW_TYPE}`,
    });
    expect(definition.statusCode).toBe(200);
    expect(definition.json().workflowVersion).toBe('1.0.0');

    const started = await startWorkflow({
      harness,
      workflowType: SUCCESS_WORKFLOW_TYPE,
      input: {
        requestId: 'load-001',
        customerId: 'cust-load',
        amountCents: 1250,
        currency: 'USD',
      },
    });

    await advanceRunToTerminal(harness, started.runId);

    const fromDb = await harness.db.pool.query<{
      workflow_type: string;
      workflow_version: string;
    }>('SELECT workflow_type, workflow_version FROM workflow_runs WHERE run_id = $1', [
      started.runId,
    ]);
    expect(fromDb.rows[0]?.workflow_type).toBe(SUCCESS_WORKFLOW_TYPE);
    expect(fromDb.rows[0]?.workflow_version).toBe('1.0.0');

    const dimensions = await expectFourDimensions({
      harness,
      runId: started.runId,
    });
    expect(['completed', 'failed']).toContain(dimensions.summary.lifecycle);
  });

  it('B-LOAD-002/B-LOAD-003 rejects malformed manifest and workflow type collision under reject policy', async () => {
    if (!harness) {
      throw new Error('Harness not initialized');
    }

    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'cwf-load-'));
    const invalidPackagePath = path.join(tempDir, 'invalid-package');
    await mkdir(invalidPackagePath, { recursive: true });
    await writeFile(
      path.join(invalidPackagePath, 'package.json'),
      JSON.stringify({
        name: 'invalid-e2e-package',
        version: '1.0.0',
        main: 'index.js',
      }),
      'utf8',
    );
    await writeFile(
      path.join(invalidPackagePath, 'index.js'),
      'export default { packageName: 123, packageVersion: null, workflows: "nope" };\n',
      'utf8',
    );

    const result = await loadWorkflowPackages({
      sources: [
        createReferencePackageSource(),
        createReferencePackageSource(),
        { source: 'path', value: invalidPackagePath },
      ],
      collisionPolicy: 'reject',
      pool: harness.db.pool,
    });

    expect(result.loaded.length).toBe(1);
    expect(result.rejected.length).toBe(2);
    expect(result.rejected.some((entry) => entry.error.toLowerCase().includes('collision'))).toBe(
      true,
    );
    expect(result.rejected.some((entry) => entry.sourceValue === invalidPackagePath)).toBe(true);
  });
});
