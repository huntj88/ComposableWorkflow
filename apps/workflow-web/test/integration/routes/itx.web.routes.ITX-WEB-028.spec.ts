/**
 * ITX-WEB-028: Causal navigation chain and cross-panel correlation are validated.
 *
 * B-WEB-028: Event click sets correlation context, logs panel auto-fills via link mode.
 *
 * Validates that:
 * - setCorrelationContext updates both correlationId and eventId in the store.
 * - Link mode propagates correlation context to logs filters.
 * - Event click → setCorrelationContext → log filter auto-fill chain works.
 * - Filter reset clears correlation context atomically.
 * - Cross-panel temporal sync works correctly with link mode.
 */

import { describe, expect, it } from 'vitest';

import { useRunDetailFilterStore } from '../../../src/routes/run-detail/state/filterStore';

const resetStore = (): void => {
  const store = useRunDetailFilterStore.getState();
  store.setLinkModeEnabled(false);
  store.resetEventsFilters();
  store.resetLogsFilters();
  store.setCorrelationContext({ eventId: '', correlationId: '' });
};

describe('integration.routes.ITX-WEB-028', () => {
  it('setCorrelationContext updates both correlationId and eventId in the store', () => {
    resetStore();

    useRunDetailFilterStore.getState().setCorrelationContext({
      correlationId: 'corr_028_1',
      eventId: 'evt_028_1',
    });

    const snapshot = useRunDetailFilterStore.getState();
    expect(snapshot.correlationContext.correlationId).toBe('corr_028_1');
    expect(snapshot.correlationContext.eventId).toBe('evt_028_1');
  });

  it('link mode propagates correlation context to logs filters', () => {
    resetStore();

    // Set correlation context first
    useRunDetailFilterStore.getState().setCorrelationContext({
      correlationId: 'corr_028_2',
      eventId: 'evt_028_2',
    });

    // Enable link mode — should propagate correlation to log filters
    useRunDetailFilterStore.getState().setLinkModeEnabled(true);
    const snapshot = useRunDetailFilterStore.getState();

    expect(snapshot.logs.correlationId).toBe('corr_028_2');
    expect(snapshot.logs.eventId).toBe('evt_028_2');
  });

  it('event click → setCorrelationContext → log filter auto-fill chain', () => {
    resetStore();

    // Enable link mode first
    useRunDetailFilterStore.getState().setLinkModeEnabled(true);

    // Simulate event click setting correlation context
    useRunDetailFilterStore.getState().setCorrelationContext({
      correlationId: 'corr_028_3',
      eventId: 'evt_028_3',
    });

    const snapshot = useRunDetailFilterStore.getState();

    // Correlation context is set
    expect(snapshot.correlationContext.correlationId).toBe('corr_028_3');
    expect(snapshot.correlationContext.eventId).toBe('evt_028_3');

    // In link mode, logs filters auto-fill from correlation context
    expect(snapshot.logs.eventId).toBe('evt_028_3');
    expect(snapshot.logs.correlationId).toBe('corr_028_3');
  });

  it('filter reset clears correlation context atomically', () => {
    resetStore();

    // Set up some state
    useRunDetailFilterStore.getState().setCorrelationContext({
      correlationId: 'corr_028_4',
      eventId: 'evt_028_4',
    });
    useRunDetailFilterStore.getState().setLogsFilters({
      severity: 'error',
      correlationId: 'corr_028_4',
      eventId: 'evt_028_4',
    });

    // Reset logs — should also clear correlation context
    useRunDetailFilterStore.getState().resetLogsFilters();

    const snapshot = useRunDetailFilterStore.getState();
    expect(snapshot.correlationContext.correlationId).toBe('');
    expect(snapshot.correlationContext.eventId).toBe('');
    expect(snapshot.logs.correlationId).toBe('');
    expect(snapshot.logs.eventId).toBe('');
    expect(snapshot.logs.severity).toBe('');
  });

  it('cross-panel temporal sync works correctly with link mode enabled', () => {
    resetStore();

    // Enable link mode
    useRunDetailFilterStore.getState().setLinkModeEnabled(true);

    // Set events temporal filters
    useRunDetailFilterStore.getState().setEventsFilters({
      since: '2026-03-05T10:00:00.000Z',
      until: '2026-03-05T11:00:00.000Z',
    });

    let snapshot = useRunDetailFilterStore.getState();

    // Temporal fields should sync to logs
    expect(snapshot.logs.since).toBe('2026-03-05T10:00:00.000Z');
    expect(snapshot.logs.until).toBe('2026-03-05T11:00:00.000Z');

    // Update logs temporal — should sync back to events
    useRunDetailFilterStore.getState().setLogsFilters({
      since: '2026-03-05T10:30:00.000Z',
      until: '2026-03-05T10:45:00.000Z',
    });

    snapshot = useRunDetailFilterStore.getState();
    expect(snapshot.events.since).toBe('2026-03-05T10:30:00.000Z');
    expect(snapshot.events.until).toBe('2026-03-05T10:45:00.000Z');
  });

  it('setCorrelationContext partial update preserves existing fields', () => {
    resetStore();

    useRunDetailFilterStore.getState().setCorrelationContext({
      correlationId: 'corr_028_5',
      eventId: 'evt_028_5',
    });

    // Partial update — only correlationId
    useRunDetailFilterStore.getState().setCorrelationContext({
      correlationId: 'corr_028_5_updated',
    });

    const snapshot = useRunDetailFilterStore.getState();
    expect(snapshot.correlationContext.correlationId).toBe('corr_028_5_updated');
    expect(snapshot.correlationContext.eventId).toBe('evt_028_5');
  });

  it('disabling link mode decouples temporal sync between panels', () => {
    resetStore();

    // Start with link mode, set temporal
    useRunDetailFilterStore.getState().setLinkModeEnabled(true);
    useRunDetailFilterStore.getState().setEventsFilters({
      since: '2026-03-05T12:00:00.000Z',
      until: '2026-03-05T13:00:00.000Z',
    });

    // Disable link mode
    useRunDetailFilterStore.getState().setLinkModeEnabled(false);

    // Update events temporal — should NOT sync to logs
    useRunDetailFilterStore.getState().setEventsFilters({
      since: '2026-03-05T14:00:00.000Z',
    });

    const snapshot = useRunDetailFilterStore.getState();
    expect(snapshot.events.since).toBe('2026-03-05T14:00:00.000Z');
    // Logs should still have the old value from when link mode was enabled
    expect(snapshot.logs.since).toBe('2026-03-05T12:00:00.000Z');
  });
});
