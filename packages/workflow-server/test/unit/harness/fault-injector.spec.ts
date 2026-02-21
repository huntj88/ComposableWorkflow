import { describe, expect, it } from 'vitest';

import { createBarrier } from '../../harness/barrier.js';
import { createFaultInjector } from '../../harness/fault-injector.js';

describe('harness fault injector', () => {
  it('supports one-shot fault checkpoints', async () => {
    const fault = createFaultInjector();
    fault.inject('x', 'once');

    await expect(fault.checkpoint('x')).rejects.toThrow('Injected fault at checkpoint x');
    await expect(fault.checkpoint('x')).resolves.toBeUndefined();
  });

  it('supports persistent fault checkpoints', async () => {
    const fault = createFaultInjector();
    fault.inject('x', 'always');

    await expect(fault.checkpoint('x')).rejects.toThrow();
    await expect(fault.checkpoint('x')).rejects.toThrow();
  });

  it('can block on a named barrier checkpoint', async () => {
    const barrier = createBarrier();
    const fault = createFaultInjector(barrier);
    fault.inject('wait-here', {
      mode: 'always',
      action: 'barrier',
      barrierName: 'gate',
    });

    let reached = false;
    const pending = fault.checkpoint('wait-here').then(() => {
      reached = true;
    });

    await Promise.resolve();
    expect(reached).toBe(false);

    await barrier.release('gate');
    await pending;

    expect(reached).toBe(true);
  });
});
