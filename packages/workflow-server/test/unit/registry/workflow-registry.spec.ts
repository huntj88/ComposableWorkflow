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

  it('rejects competing registrations for reserved workflow types', () => {
    const registry = createWorkflowRegistry('override');

    registry.reserveWorkflowType(
      'server.human-feedback.v1',
      '@composable-workflow/workflow-server-internal',
    );
    registry.register({
      workflowType: 'server.human-feedback.v1',
      workflowVersion: '1.0.0',
      factory: () => ({}),
      packageName: '@composable-workflow/workflow-server-internal',
      packageVersion: '1.0.0',
      source: 'bundle',
      sourceValue: 'internal',
    });

    expect(() =>
      registry.register({
        workflowType: 'server.human-feedback.v1',
        workflowVersion: '9.9.9',
        factory: () => ({}),
        packageName: 'pkg.external',
        packageVersion: '9.9.9',
        source: 'path',
        sourceValue: '/tmp/pkg.external',
      }),
    ).toThrow(WorkflowTypeCollisionError);
  });
});
