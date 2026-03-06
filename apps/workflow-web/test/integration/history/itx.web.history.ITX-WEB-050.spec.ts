/**
 * ITX-WEB-050: Transition history UI state remains deterministic.
 *
 * B-WEB-065/B-WEB-066: Child expansion persistence, cached child histories,
 * and explicit link-filter behavior.
 *
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TransitionHistoryPanel } from '../../../src/routes/run-detail/components/TransitionHistoryPanel';
import { createTransitionHistoryStore } from '../../../src/routes/run-detail/state/transitionHistoryStore';
import { useRunDetailFilterStore } from '../../../src/routes/run-detail/state/filterStore';
import { buildEventDto, buildRunEventsResponse } from '../fixtures/workflowFixtures';

const resetFilterStore = (): void => {
  const store = useRunDetailFilterStore.getState();
  store.setLinkModeEnabled(false);
  store.resetEventsFilters();
  store.resetLogsFilters();
  store.setCorrelationContext({ eventId: '', correlationId: '' });
};

afterEach(() => {
  resetFilterStore();
});

describe('integration.history.ITX-WEB-050', () => {
  it('preserves expanded child sections while selection and child loads update', async () => {
    const getRunEvents = vi.fn(async () =>
      buildRunEventsResponse(1, {
        runId: 'wr_child_50',
        eventType: 'state.entered',
        state: 'child-state',
        transition: null,
      }),
    );
    const store = createTransitionHistoryStore({ getRunEvents });

    store.getState().setSectionExpanded('wr_parent:evt_4:wr_child_50', true);
    store.getState().selectEntry({
      source: 'history',
      runId: 'wr_parent',
      eventId: 'evt_4',
      sequence: 4,
      timestamp: '2026-03-05T10:04:00.000Z',
      target: { kind: 'state', stateId: 'spawn-child' },
    });

    await store.getState().ensureChildHistoryLoaded('wr_child_50');
    await store.getState().ensureChildHistoryLoaded('wr_child_50');

    const snapshot = store.getState();
    expect(snapshot.expandedSections['wr_parent:evt_4:wr_child_50']).toBe(true);
    expect(snapshot.selection?.eventId).toBe('evt_4');
    expect(snapshot.childHistories['wr_child_50']?.status).toBe('loaded');
    expect(getRunEvents).toHaveBeenCalledTimes(1);
  });

  it('increments selection request ids for repeated selections', () => {
    const store = createTransitionHistoryStore({
      getRunEvents: async () => buildRunEventsResponse(0),
    });

    store.getState().selectEntry({
      source: 'history',
      runId: 'wr_repeat',
      eventId: 'evt_repeat',
      sequence: 9,
      timestamp: '2026-03-05T10:09:00.000Z',
      target: { kind: 'transition', from: 'a', to: 'b' },
    });
    const firstRequestId = store.getState().selection?.requestId;

    store.getState().selectEntry({
      source: 'history',
      runId: 'wr_repeat',
      eventId: 'evt_repeat',
      sequence: 9,
      timestamp: '2026-03-05T10:09:00.000Z',
      target: { kind: 'transition', from: 'a', to: 'b' },
    });

    expect(store.getState().selection?.requestId).toBe((firstRequestId ?? 0) + 1);
  });

  it('shows time-window filtering only when explicit link mode is enabled', () => {
    const response = buildRunEventsResponse(0);
    response.items = [
      buildEventDto(1, {
        eventType: 'state.entered',
        state: 'draft',
        timestamp: '2026-03-05T10:00:00.000Z',
        transition: null,
      }),
      buildEventDto(2, {
        eventType: 'transition.completed',
        transition: { from: 'draft', to: 'review', name: 'submit' },
        timestamp: '2026-03-05T10:10:00.000Z',
      }),
    ];

    useRunDetailFilterStore.getState().setEventsFilters({
      since: '2026-03-05T10:05:00.000Z',
      until: '2026-03-05T10:15:00.000Z',
    });

    const { rerender } = render(
      createElement(TransitionHistoryPanel, {
        events: response,
        isLoading: false,
        errorMessage: null,
        onRetry: async () => {},
      }),
    );

    expect(screen.getByText('draft')).toBeTruthy();
    expect(screen.getByText('draft → review')).toBeTruthy();

    useRunDetailFilterStore.getState().setLinkModeEnabled(true);

    rerender(
      createElement(TransitionHistoryPanel, {
        events: response,
        isLoading: false,
        errorMessage: null,
        onRetry: async () => {},
      }),
    );

    expect(screen.queryByText('draft')).toBeNull();
    expect(screen.getByText('draft → review')).toBeTruthy();
  });
});
