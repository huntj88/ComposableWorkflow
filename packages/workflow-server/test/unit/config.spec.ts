import { describe, expect, it } from 'vitest';

import {
  loadServerConfigFromEnv,
  parseWorkflowPackageSources,
  resolveCommandPolicy,
  resolveCollisionPolicy,
} from '../../src/config.js';

describe('server config', () => {
  it('defaults collision policy to reject', () => {
    expect(resolveCollisionPolicy(undefined)).toBe('reject');
    expect(resolveCollisionPolicy('unknown')).toBe('reject');
  });

  it('supports explicit override collision policy', () => {
    expect(resolveCollisionPolicy('override')).toBe('override');
  });

  it('parses workflow package source list', () => {
    const parsed = parseWorkflowPackageSources(
      JSON.stringify([
        { source: 'path', value: './packages/workflow-a' },
        { source: 'pnpm', value: '@composable/workflow-b' },
      ]),
    );

    expect(parsed).toHaveLength(2);
    expect(parsed[0].source).toBe('path');
  });

  it('loads all config values from env', () => {
    const config = loadServerConfigFromEnv({
      DATABASE_URL: 'postgres://example/db',
      WORKFLOW_TYPE_COLLISION_POLICY: 'override',
      WORKFLOW_PACKAGE_SOURCES: JSON.stringify([{ source: 'bundle', value: 'bundle://test' }]),
      WORKFLOW_COMMAND_POLICY: JSON.stringify({
        allowCommands: ['node'],
        allowedCwdPrefixes: ['/tmp/workflow'],
      }),
    });

    expect(config.databaseUrl).toBe('postgres://example/db');
    expect(config.collisionPolicy).toBe('override');
    expect(config.workflowPackages[0].source).toBe('bundle');
    expect(config.commandPolicy.allowCommands).toEqual(['node']);
    expect(config.commandPolicy.allowedCwdPrefixes).toEqual(['/tmp/workflow']);
  });

  it('resolves default command policy when no override is provided', () => {
    const policy = resolveCommandPolicy(undefined);
    expect(policy.allowCommands.length).toBeGreaterThan(0);
    expect(policy.allowCommands).toContain('copilot');
    expect(policy.timeoutMsMax).toBeGreaterThan(0);
  });
});
