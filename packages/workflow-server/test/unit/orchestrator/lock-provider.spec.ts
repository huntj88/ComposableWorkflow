import { describe, expect, it } from 'vitest';

import { InMemoryLockProvider } from '../../../src/locking/lock-provider.js';

describe('in-memory lock provider', () => {
  it('allows one owner at a time and supports release/reacquire', async () => {
    const provider = new InMemoryLockProvider();

    const firstAcquire = await provider.acquire('run-lock-1', 'owner-a', 1_000);
    const secondAcquire = await provider.acquire('run-lock-1', 'owner-b', 1_000);

    expect(firstAcquire).toBe(true);
    expect(secondAcquire).toBe(false);

    await provider.release('run-lock-1', 'owner-a');

    const reacquired = await provider.acquire('run-lock-1', 'owner-b', 1_000);
    expect(reacquired).toBe(true);
  });

  it('rejects release and renew for non-owner', async () => {
    const provider = new InMemoryLockProvider();
    await provider.acquire('run-lock-2', 'owner-a', 1_000);

    await expect(provider.renew('run-lock-2', 'owner-b', 1_000)).rejects.toThrow(
      'Cannot renew lock',
    );
    await expect(provider.release('run-lock-2', 'owner-b')).rejects.toThrow('Cannot release lock');
  });
});
