import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadWorkflowPackages } from '../../../src/loader/load-packages.js';

describe('loader collisions', () => {
  it('rejects duplicate workflowType by default', async () => {
    const fixtureDir = await mkdtemp(path.join(tmpdir(), 'wf-loader-collision-'));
    const firstManifestPath = path.join(fixtureDir, 'first.mjs');
    const secondManifestPath = path.join(fixtureDir, 'second.mjs');

    await writeFile(
      firstManifestPath,
      `
      export default {
        packageName: 'pkg.first',
        packageVersion: '1.0.0',
        workflows: [{ workflowType: 'wf.integration.collision', workflowVersion: '1.0.0', factory: () => ({ initialState: 'start', states: {} }) }]
      };
      `,
      'utf-8',
    );

    await writeFile(
      secondManifestPath,
      `
      export default {
        packageName: 'pkg.second',
        packageVersion: '2.0.0',
        workflows: [{ workflowType: 'wf.integration.collision', workflowVersion: '2.0.0', factory: () => ({ initialState: 'start', states: {} }) }]
      };
      `,
      'utf-8',
    );

    const rejectResult = await loadWorkflowPackages({
      collisionPolicy: 'reject',
      sources: [
        { source: 'path', value: firstManifestPath },
        { source: 'path', value: secondManifestPath },
      ],
      logger: { info: () => undefined, warn: () => undefined },
    });

    expect(rejectResult.loaded).toHaveLength(1);
    expect(rejectResult.rejected).toHaveLength(1);
    expect(rejectResult.rejected[0].error).toContain('WORKFLOW_TYPE_COLLISION');
    expect(rejectResult.registry.getByType('wf.integration.collision')?.packageName).toBe(
      'pkg.first',
    );
  });

  it('overrides duplicate workflowType when override policy is configured', async () => {
    const fixtureDir = await mkdtemp(path.join(tmpdir(), 'wf-loader-override-'));
    const firstManifestPath = path.join(fixtureDir, 'first.mjs');
    const secondManifestPath = path.join(fixtureDir, 'second.mjs');

    await writeFile(
      firstManifestPath,
      `
      export default {
        packageName: 'pkg.first',
        packageVersion: '1.0.0',
        workflows: [{ workflowType: 'wf.integration.override', workflowVersion: '1.0.0', factory: () => ({ initialState: 'start', states: {} }) }]
      };
      `,
      'utf-8',
    );

    await writeFile(
      secondManifestPath,
      `
      export default {
        packageName: 'pkg.second',
        packageVersion: '2.0.0',
        workflows: [{ workflowType: 'wf.integration.override', workflowVersion: '2.0.0', factory: () => ({ initialState: 'start', states: {} }) }]
      };
      `,
      'utf-8',
    );

    const overrideResult = await loadWorkflowPackages({
      collisionPolicy: 'override',
      sources: [
        { source: 'path', value: firstManifestPath },
        { source: 'path', value: secondManifestPath },
      ],
      logger: { info: () => undefined, warn: () => undefined },
    });

    expect(overrideResult.loaded).toHaveLength(2);
    expect(overrideResult.rejected).toHaveLength(0);
    expect(overrideResult.registry.getByType('wf.integration.override')?.packageName).toBe(
      'pkg.second',
    );
  });
});
