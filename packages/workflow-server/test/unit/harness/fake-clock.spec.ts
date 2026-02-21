import { describe, expect, it } from 'vitest';

import { createFakeClock } from '../../harness/fake-clock.js';

describe('harness fake clock', () => {
  it('sets and reads deterministic time', () => {
    const clock = createFakeClock('2026-02-21T00:00:00.000Z');

    expect(clock.now().toISOString()).toBe('2026-02-21T00:00:00.000Z');

    clock.setNow('2026-02-21T01:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-02-21T01:00:00.000Z');
  });

  it('advances relative time without wall clock', () => {
    const clock = createFakeClock('2026-02-21T00:00:00.000Z');

    clock.advanceByMs(2_500);

    expect(clock.now().toISOString()).toBe('2026-02-21T00:00:02.500Z');
  });
});
