import { describe, expect, it } from 'vitest';

import { decideRealtimeAppendBehavior } from '../../../src/routes/run-detail/components/EventsTimelinePanel';

describe('integration.stream.ITX-WEB-033', () => {
  it('preserves scroll and accumulates new-updates indicator when user is away from latest and auto-follow is off', () => {
    const decision = decideRealtimeAppendBehavior({
      previousVisibleCount: 8,
      nextVisibleCount: 11,
      autoFollow: false,
      hasLatestInView: false,
      pendingUpdates: 2,
    });

    expect(decision.appendedCount).toBe(3);
    expect(decision.shouldScrollToLatest).toBe(false);
    expect(decision.nextPendingUpdates).toBe(5);
    expect(decision.nextHasLatestInView).toBe(false);
  });

  it('auto-follows latest and clears pending update count when follow mode is enabled', () => {
    const decision = decideRealtimeAppendBehavior({
      previousVisibleCount: 8,
      nextVisibleCount: 10,
      autoFollow: true,
      hasLatestInView: false,
      pendingUpdates: 4,
    });

    expect(decision.appendedCount).toBe(2);
    expect(decision.shouldScrollToLatest).toBe(true);
    expect(decision.nextPendingUpdates).toBe(0);
    expect(decision.nextHasLatestInView).toBe(true);
  });

  it('keeps pending state unchanged when no chronological append occurs', () => {
    const decision = decideRealtimeAppendBehavior({
      previousVisibleCount: 10,
      nextVisibleCount: 10,
      autoFollow: false,
      hasLatestInView: false,
      pendingUpdates: 3,
    });

    expect(decision.appendedCount).toBe(0);
    expect(decision.shouldScrollToLatest).toBe(false);
    expect(decision.nextPendingUpdates).toBe(3);
    expect(decision.nextHasLatestInView).toBe(false);
  });
});
