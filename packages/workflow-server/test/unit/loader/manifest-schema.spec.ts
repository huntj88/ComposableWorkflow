import { describe, expect, it } from 'vitest';

import {
  ManifestValidationError,
  validateWorkflowPackageManifest,
} from '../../../src/loader/manifest-schema.js';

describe('loader manifest schema', () => {
  it('accepts valid manifests', () => {
    const manifest = validateWorkflowPackageManifest(
      {
        packageName: 'pkg.valid',
        packageVersion: '1.0.0',
        workflows: [
          {
            workflowType: 'wf.valid',
            workflowVersion: '2026.1',
            factory: () => ({ initialState: 'start', states: {} }),
          },
        ],
      },
      'path:/tmp/pkg.valid',
    );

    expect(manifest.packageName).toBe('pkg.valid');
    expect(manifest.workflows[0].workflowType).toBe('wf.valid');
  });

  it('rejects malformed manifests with explicit error envelope', () => {
    expect(() =>
      validateWorkflowPackageManifest(
        {
          packageName: 'pkg.invalid',
          packageVersion: '',
          workflows: [{ workflowType: 'wf.invalid', workflowVersion: '1.0.0', factory: 'nope' }],
        },
        'path:/tmp/pkg.invalid',
      ),
    ).toThrow(ManifestValidationError);
  });
});
