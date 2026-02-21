import { describe, expect, it } from 'vitest';

import {
  CommandPolicyError,
  evaluateCommandPolicy,
  normalizeCommandPolicy,
} from '../../../src/command/command-policy.js';

describe('command policy', () => {
  const policy = normalizeCommandPolicy({
    allowCommands: ['node', 'pnpm'],
    denyCommands: ['pnpm'],
    allowedCwdPrefixes: ['/tmp/workflow'],
    blockedEnvKeys: ['SECRET'],
    timeoutMsMax: 1_000,
    outputMaxBytes: 512,
    redactFields: ['stdin', 'stdout'],
  });

  it('caps timeout to timeoutMsMax and normalizes defaults', () => {
    const normalized = evaluateCommandPolicy({
      policy,
      request: {
        command: 'node',
        timeoutMs: 9_999,
        cwd: '/tmp/workflow/subdir',
      },
    });

    expect(normalized.timeoutMs).toBe(1_000);
    expect(normalized.args).toEqual([]);
    expect(normalized.stdin).toBe('');
    expect(normalized.allowNonZeroExit).toBe(false);
  });

  it('rejects denied commands', () => {
    expect(() =>
      evaluateCommandPolicy({
        policy,
        request: {
          command: 'pnpm',
          cwd: '/tmp/workflow',
        },
      }),
    ).toThrowError(CommandPolicyError);
  });

  it('rejects blocked env keys', () => {
    expect(() =>
      evaluateCommandPolicy({
        policy,
        request: {
          command: 'node',
          cwd: '/tmp/workflow',
          env: { API_SECRET: 'value' },
        },
      }),
    ).toThrow(/blocked/);
  });
});
