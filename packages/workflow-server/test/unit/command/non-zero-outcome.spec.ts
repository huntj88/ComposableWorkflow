import { describe, expect, it } from 'vitest';

import { mapCommandOutcome } from '../../../src/command/command-runner.js';

describe('command non-zero outcome mapping', () => {
  it('maps non-zero to failed when allowNonZeroExit is false', () => {
    const outcome = mapCommandOutcome({
      exitCode: 2,
      timedOut: false,
      allowNonZeroExit: false,
    });

    expect(outcome).toBe('command.failed');
  });

  it('maps non-zero to completed when allowNonZeroExit is true', () => {
    const outcome = mapCommandOutcome({
      exitCode: 2,
      timedOut: false,
      allowNonZeroExit: true,
    });

    expect(outcome).toBe('command.completed');
  });

  it('maps timeout to failed regardless of allowNonZeroExit', () => {
    const outcome = mapCommandOutcome({
      exitCode: 0,
      timedOut: true,
      allowNonZeroExit: true,
    });

    expect(outcome).toBe('command.failed');
  });
});
