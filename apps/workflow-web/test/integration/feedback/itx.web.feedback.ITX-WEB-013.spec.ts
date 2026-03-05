import { describe, expect, it } from 'vitest';

import type { WorkflowEventDto } from '@composable-workflow/workflow-api-types';

import {
  matchesEventFreeText,
  useRunDetailFilterStore,
} from '../../../src/routes/run-detail/state/filterStore';

const baseEvent: WorkflowEventDto = {
  eventId: 'evt_013',
  runId: 'wr_013',
  workflowType: 'reference.success.v1',
  parentRunId: null,
  sequence: 1,
  eventType: 'transition.completed',
  state: 'AwaitingApproval',
  transition: {
    from: 'AwaitingApproval',
    to: 'Approved',
    name: 'ApprovePayment',
  },
  child: null,
  command: null,
  timestamp: '2026-03-05T00:00:00.000Z',
  payload: {
    nested: {
      reason: 'Manual override',
    },
  },
  error: {
    message: 'Risk threshold exceeded',
  },
};

const resetStore = (): void => {
  const store = useRunDetailFilterStore.getState();
  store.setLinkModeEnabled(false);
  store.resetEventsFilters();
  store.resetLogsFilters();
  store.setCorrelationContext({ eventId: '', correlationId: '' });
};

describe('integration.feedback.ITX-WEB-013', () => {
  it('keeps event/log filters independent when link mode is disabled and syncs only allowed fields when enabled', () => {
    resetStore();

    const store = useRunDetailFilterStore.getState();
    store.setEventsFilters({
      eventType: 'transition.completed',
      since: '2026-03-05T00:00:00.000Z',
      until: '2026-03-05T01:00:00.000Z',
      text: 'approve',
    });

    let snapshot = useRunDetailFilterStore.getState();
    expect(snapshot.logs.since).toBe('');
    expect(snapshot.logs.until).toBe('');
    expect(snapshot.logs.severity).toBe('');
    expect(snapshot.events.eventType).toBe('transition.completed');
    expect(snapshot.events.text).toBe('approve');

    store.setLinkModeEnabled(true);
    snapshot = useRunDetailFilterStore.getState();

    expect(snapshot.linkModeEnabled).toBe(true);
    expect(snapshot.logs.since).toBe('2026-03-05T00:00:00.000Z');
    expect(snapshot.logs.until).toBe('2026-03-05T01:00:00.000Z');
    expect(snapshot.logs.severity).toBe('');

    store.setLogsFilters({
      severity: 'error',
      since: '2026-03-05T00:10:00.000Z',
      until: '2026-03-05T00:20:00.000Z',
      correlationId: 'corr_013',
      eventId: 'evt_013',
    });

    snapshot = useRunDetailFilterStore.getState();
    expect(snapshot.events.since).toBe('2026-03-05T00:10:00.000Z');
    expect(snapshot.events.until).toBe('2026-03-05T00:20:00.000Z');
    expect(snapshot.events.eventType).toBe('transition.completed');
    expect(snapshot.events.text).toBe('approve');
    expect(snapshot.logs.correlationId).toBe('corr_013');
    expect(snapshot.logs.eventId).toBe('evt_013');

    store.setLinkModeEnabled(false);
    store.setEventsFilters({ since: '2026-03-05T02:00:00.000Z' });
    snapshot = useRunDetailFilterStore.getState();
    expect(snapshot.logs.since).toBe('2026-03-05T00:10:00.000Z');
  });

  it('applies event free-text matching with case-insensitive substring semantics and whitespace no-op', () => {
    expect(matchesEventFreeText(baseEvent, 'transition.completed')).toBe(true);
    expect(matchesEventFreeText(baseEvent, 'awaitingapproval')).toBe(true);
    expect(matchesEventFreeText(baseEvent, 'approvepayment')).toBe(true);
    expect(matchesEventFreeText(baseEvent, 'manual override')).toBe(true);
    expect(matchesEventFreeText(baseEvent, 'threshold exceeded')).toBe(true);
    expect(matchesEventFreeText(baseEvent, '   ')).toBe(true);
    expect(matchesEventFreeText(baseEvent, 'does-not-match')).toBe(false);
  });
});
