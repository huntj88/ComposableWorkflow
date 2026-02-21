import { describe, expect, it } from 'vitest';

import { createBarrier, createLatch } from '../../harness/barrier.js';

describe('harness barrier', () => {
  it('releases waiting callers for a named barrier', async () => {
    const barrier = createBarrier();
    let unblocked = false;

    const waiting = barrier.wait('checkpoint').then(() => {
      unblocked = true;
    });

    await Promise.resolve();
    expect(unblocked).toBe(false);

    await barrier.release('checkpoint');
    await waiting;

    expect(unblocked).toBe(true);
  });
});

describe('harness latch', () => {
  it('can be reset after release', async () => {
    const latch = createLatch();

    await latch.release();
    expect(await latch.isReleased()).toBe(true);

    await latch.reset();
    expect(await latch.isReleased()).toBe(false);
  });
});
