/**
 * ITX-WEB-049: Transition history derivation is deterministic.
 *
 * B-WEB-064: Ordering, transition-event coverage, and iteration counters.
 */

import { describe, expect, it } from 'vitest';

import { buildTransitionHistory } from '../../../src/routes/run-detail/history/buildTransitionHistory';
import {
  buildEventDto,
  buildRunEventsResponse,
  fixtureTimestamp,
} from '../fixtures/workflowFixtures';

describe('integration.history.ITX-WEB-049', () => {
  it('keeps only transition-relevant event types and sorts by sequence ascending', () => {
    const response = buildRunEventsResponse(0);
    response.items = [
      buildEventDto(7, {
        eventType: 'log',
        timestamp: fixtureTimestamp(7000),
      }),
      buildEventDto(4, {
        eventType: 'child.started',
        state: 'spawn-child',
        child: {
          childRunId: 'wr_child_49',
          childWorkflowType: 'child.workflow.v1',
          lifecycle: 'running',
        },
        timestamp: fixtureTimestamp(4000),
      }),
      buildEventDto(2, {
        eventType: 'state.entered',
        state: 'review',
        transition: null,
        timestamp: fixtureTimestamp(2000),
      }),
      buildEventDto(6, {
        eventType: 'workflow.completed',
        timestamp: fixtureTimestamp(6000),
      }),
      buildEventDto(3, {
        eventType: 'transition.completed',
        transition: { from: 'draft', to: 'review', name: 'submit' },
        state: null,
        timestamp: fixtureTimestamp(3000),
      }),
      buildEventDto(1, {
        eventType: 'state.entered',
        state: 'draft',
        transition: null,
        timestamp: fixtureTimestamp(1000),
      }),
      buildEventDto(5, {
        eventType: 'child.completed',
        state: 'spawn-child',
        child: {
          childRunId: 'wr_child_49',
          childWorkflowType: 'child.workflow.v1',
          lifecycle: 'completed',
        },
        timestamp: fixtureTimestamp(5000),
      }),
    ];

    const entries = buildTransitionHistory(response);

    expect(entries.map((entry) => entry.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(entries.map((entry) => entry.eventType)).toEqual([
      'state.entered',
      'state.entered',
      'transition.completed',
      'child.started',
      'child.completed',
    ]);
    expect(entries[3]?.child).toMatchObject({
      childRunId: 'wr_child_49',
      childWorkflowType: 'child.workflow.v1',
      lifecycle: 'running',
      parentState: 'spawn-child',
    });
  });

  it('assigns repeat visit counters deterministically for repeated states and transitions', () => {
    const response = buildRunEventsResponse(0);
    response.items = [
      buildEventDto(1, {
        eventType: 'state.entered',
        state: 'loop',
        transition: null,
      }),
      buildEventDto(2, {
        eventType: 'transition.completed',
        transition: { from: 'loop', to: 'loop', name: 'retry' },
        state: null,
      }),
      buildEventDto(3, {
        eventType: 'state.entered',
        state: 'loop',
        transition: null,
      }),
      buildEventDto(4, {
        eventType: 'transition.completed',
        transition: { from: 'loop', to: 'loop', name: 'retry' },
        state: null,
      }),
    ];

    const entries = buildTransitionHistory(response);

    expect(entries[0]?.iterationLabel).toBe('visit 1');
    expect(entries[2]?.iterationLabel).toBe('visit 2');
    expect(entries[2]?.looped).toBe(true);
    expect(entries[1]?.iterationLabel).toBe('iteration 1');
    expect(entries[3]?.iterationLabel).toBe('iteration 2');
  });

  it('applies since/until filtering only when link mode is enabled', () => {
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
      buildEventDto(3, {
        eventType: 'state.entered',
        state: 'review',
        timestamp: '2026-03-05T10:20:00.000Z',
        transition: null,
      }),
    ];

    expect(
      buildTransitionHistory(response, {
        linkModeEnabled: false,
        since: '2026-03-05T10:05:00.000Z',
        until: '2026-03-05T10:15:00.000Z',
      }).map((entry) => entry.sequence),
    ).toEqual([1, 2, 3]);

    expect(
      buildTransitionHistory(response, {
        linkModeEnabled: true,
        since: '2026-03-05T10:05:00.000Z',
        until: '2026-03-05T10:15:00.000Z',
      }).map((entry) => entry.sequence),
    ).toEqual([2]);
  });
});
