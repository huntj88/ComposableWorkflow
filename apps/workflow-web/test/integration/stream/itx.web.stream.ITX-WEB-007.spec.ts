/**
 * ITX-WEB-007: Stream health transitions preserve in-progress draft input.
 *
 * B-WEB-007: Stream reconnect/stale transitions do not clear filter or draft state.
 *
 * Validates that:
 * - Zustand filterStore state is independent of stream health variables.
 * - setCorrelationContext persists across simulated health transitions.
 * - Event/log filter state survives stream health state changes.
 * - Link mode state is preserved across stream reconnect cycles.
 * - Stream health transitions and filterStore use separate state paths.
 */

import { describe, expect, it, vi } from 'vitest';

import { useRunDetailFilterStore } from '../../../src/routes/run-detail/state/filterStore';
import { openRunStream } from '../../../src/stream/openRunStream';
import type { StreamHealthState } from '../../../src/stream/reconnectPolicy';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: unknown) => void) | null = null;

  constructor(public readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(): void {}
  emitOpen(): void {
    this.onopen?.({});
  }
  emitError(): void {
    this.onerror?.({});
  }
  close(): void {}
}

const resetStore = (): void => {
  const store = useRunDetailFilterStore.getState();
  store.setLinkModeEnabled(false);
  store.resetEventsFilters();
  store.resetLogsFilters();
  store.setCorrelationContext({ eventId: '', correlationId: '' });
};

describe('integration.stream.ITX-WEB-007', () => {
  it('filterStore state is independent of stream health transitions', () => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    resetStore();

    // Set up filter state before stream connects
    useRunDetailFilterStore.getState().setEventsFilters({
      eventType: 'transition.completed',
      since: '2026-03-05T00:00:00.000Z',
      text: 'approval',
    });
    useRunDetailFilterStore.getState().setCorrelationContext({
      correlationId: 'corr_007',
      eventId: 'evt_007',
    });

    const healthStates: StreamHealthState[] = [];

    const stream = openRunStream({
      runId: 'wr_007_1',
      random: () => 0,
      eventSourceFactory: (url) => new FakeEventSource(url) as unknown as EventSource,
      onFrame: () => true,
      onHealthChange: (state) => {
        healthStates.push(state);
      },
    });

    // Stream connects
    const first = FakeEventSource.instances[0]!;
    first.emitOpen();
    expect(healthStates.at(-1)).toBe('connected');

    // Verify filter state unchanged after connect
    let snapshot = useRunDetailFilterStore.getState();
    expect(snapshot.events.eventType).toBe('transition.completed');
    expect(snapshot.events.text).toBe('approval');
    expect(snapshot.correlationContext.correlationId).toBe('corr_007');

    // Stream errors → reconnecting
    first.emitError();
    expect(healthStates.at(-1)).toBe('reconnecting');

    // Filter state still unchanged
    snapshot = useRunDetailFilterStore.getState();
    expect(snapshot.events.eventType).toBe('transition.completed');
    expect(snapshot.events.since).toBe('2026-03-05T00:00:00.000Z');
    expect(snapshot.correlationContext.eventId).toBe('evt_007');

    stream.close();
    vi.useRealTimers();
  });

  it('setCorrelationContext persists across multiple reconnect cycles', () => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    resetStore();

    useRunDetailFilterStore.getState().setCorrelationContext({
      correlationId: 'corr_007_persist',
      eventId: 'evt_007_persist',
    });

    const stream = openRunStream({
      runId: 'wr_007_2',
      random: () => 0,
      eventSourceFactory: (url) => new FakeEventSource(url) as unknown as EventSource,
      onFrame: () => true,
    });

    // Cycle through connect → error → reconnect multiple times
    for (let cycle = 0; cycle < 3; cycle++) {
      const source = FakeEventSource.instances[FakeEventSource.instances.length - 1]!;
      source.emitOpen();
      source.emitError();
      vi.runOnlyPendingTimers();
    }

    // Correlation context preserved through all cycles
    const snapshot = useRunDetailFilterStore.getState();
    expect(snapshot.correlationContext.correlationId).toBe('corr_007_persist');
    expect(snapshot.correlationContext.eventId).toBe('evt_007_persist');

    stream.close();
    vi.useRealTimers();
  });

  it('link mode state is preserved across stream health changes', () => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    resetStore();

    // Enable link mode and set filters
    useRunDetailFilterStore.getState().setLinkModeEnabled(true);
    useRunDetailFilterStore.getState().setEventsFilters({
      since: '2026-03-05T10:00:00.000Z',
      until: '2026-03-05T11:00:00.000Z',
    });

    const stream = openRunStream({
      runId: 'wr_007_3',
      random: () => 0,
      eventSourceFactory: (url) => new FakeEventSource(url) as unknown as EventSource,
      onFrame: () => true,
    });

    const source = FakeEventSource.instances[0]!;
    source.emitOpen();
    source.emitError();
    vi.runOnlyPendingTimers();

    // Link mode and synced filters preserved
    const snapshot = useRunDetailFilterStore.getState();
    expect(snapshot.linkModeEnabled).toBe(true);
    expect(snapshot.events.since).toBe('2026-03-05T10:00:00.000Z');
    expect(snapshot.logs.since).toBe('2026-03-05T10:00:00.000Z');

    stream.close();
    vi.useRealTimers();
  });

  it('log filter fields are preserved across stream reconnect', () => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    resetStore();

    useRunDetailFilterStore.getState().setLogsFilters({
      severity: 'error',
      correlationId: 'corr_007_logs',
      eventId: 'evt_007_logs',
    });

    const stream = openRunStream({
      runId: 'wr_007_4',
      random: () => 0,
      eventSourceFactory: (url) => new FakeEventSource(url) as unknown as EventSource,
      onFrame: () => true,
    });

    const source = FakeEventSource.instances[0]!;
    source.emitOpen();
    source.emitError();
    vi.runOnlyPendingTimers();

    const snapshot = useRunDetailFilterStore.getState();
    expect(snapshot.logs.severity).toBe('error');
    expect(snapshot.logs.correlationId).toBe('corr_007_logs');
    expect(snapshot.logs.eventId).toBe('evt_007_logs');

    stream.close();
    vi.useRealTimers();
  });
});
