import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadWorkflowPackages } from '../../../src/loader/load-packages.js';

describe('loader invalid manifest', () => {
  it('rejects malformed manifest and registers nothing', async () => {
    const fixtureDir = await mkdtemp(path.join(tmpdir(), 'wf-loader-invalid-'));
    const fixturePath = path.join(fixtureDir, 'manifest.mjs');

    await writeFile(
      fixturePath,
      `
      export default {
        packageName: 'pkg.invalid',
        workflows: [{ workflowType: 'wf.integration.invalid', workflowVersion: '1.0.0', factory: 'not-a-function' }]
      };
      `,
      'utf-8',
    );

    const result = await loadWorkflowPackages({
      sources: [{ source: 'path', value: fixturePath }],
      logger: { info: () => undefined, warn: () => undefined },
    });

    expect(result.loaded).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].error).toContain('Invalid workflow manifest');
    expect(result.registry.list()).toHaveLength(0);
  });
});
