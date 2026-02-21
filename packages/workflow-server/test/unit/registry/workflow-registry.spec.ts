import { describe, expect, it } from 'vitest';

import { WorkflowTypeCollisionError } from '../../../src/registry/errors.js';
import { createWorkflowRegistry } from '../../../src/registry/workflow-registry.js';

describe('workflow registry', () => {
  it('rejects duplicate workflow types by default', () => {
    const registry = createWorkflowRegistry('reject');

    registry.register({
      workflowType: 'wf.dup',
      workflowVersion: '1.0.0',
      factory: () => ({}),
      packageName: 'pkg.one',
      packageVersion: '1.0.0',
      source: 'path',
      sourceValue: '/tmp/pkg.one',
    });

    expect(() =>
      registry.register({
        workflowType: 'wf.dup',
        workflowVersion: '2.0.0',
        factory: () => ({}),
        packageName: 'pkg.two',
        packageVersion: '2.0.0',
        source: 'path',
        sourceValue: '/tmp/pkg.two',
      }),
    ).toThrow(WorkflowTypeCollisionError);
  });

  it('overrides duplicate workflow types when override policy is enabled', () => {
    const registry = createWorkflowRegistry('override');

    registry.register({
      workflowType: 'wf.dup',
      workflowVersion: '1.0.0',
      factory: () => ({}),
      packageName: 'pkg.one',
      packageVersion: '1.0.0',
      source: 'path',
      sourceValue: '/tmp/pkg.one',
    });
    registry.register({
      workflowType: 'wf.dup',
      workflowVersion: '2.0.0',
      factory: () => ({}),
      packageName: 'pkg.two',
      packageVersion: '2.0.0',
      source: 'pnpm',
      sourceValue: 'pkg.two',
    });

    const resolved = registry.getByType('wf.dup');
    expect(resolved?.packageName).toBe('pkg.two');
    expect(resolved?.workflowVersion).toBe('2.0.0');
  });
});
