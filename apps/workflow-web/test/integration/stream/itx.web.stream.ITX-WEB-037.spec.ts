/**
 * ITX-WEB-037: Duplicate/out-of-order non-regression behavior is enforced.
 *
 * Validates that:
 * - applyStreamFrame deduplicates by watermark (sequence <= watermark → rejected).
 * - Out-of-order frames are sorted into correct sequence in events list.
 * - Watermarks are per-runId (multi-run safe).
 * - Duplicate frames do not corrupt state.
 */

import { describe, expect, it } from 'vitest';

import {
  applyStreamFrame,
  createStreamDashboardState,
  type StreamDashboardState,
} from '../../../src/stream/applyStreamFrame';
import {
  buildEventDto,
  buildRunEventsResponse,
  buildRunLogsResponse,
} from '../fixtures/workflowFixtures';
import type { WorkflowStreamFrame } from '@composable-workflow/workflow-api-types';

const frame = (sequence: number, runId = 'wr_037', cursorId?: string): WorkflowStreamFrame => ({
  event: 'workflow-event',
  id: cursorId ?? `cur_${sequence}`,
  data: buildEventDto(sequence, { runId }),
});

describe('integration.stream.ITX-WEB-037', () => {
  it('rejects duplicate frames with sequence <= watermark', () => {
    let state: StreamDashboardState = createStreamDashboardState({
      summary: null,
      events: { items: [], nextCursor: undefined },
      logs: { items: [] },
    });

    // Accept sequence 1
    const r1 = applyStreamFrame(state, frame(1));
    expect(r1.accepted).toBe(true);
    state = r1.state;

    // Accept sequence 2
    const r2 = applyStreamFrame(state, frame(2));
    expect(r2.accepted).toBe(true);
    state = r2.state;

    // Reject duplicate of sequence 1
    const r3 = applyStreamFrame(state, frame(1, 'wr_037', 'cur_1_dup'));
    expect(r3.accepted).toBe(false);

    // Reject duplicate of sequence 2
    const r4 = applyStreamFrame(state, frame(2, 'wr_037', 'cur_2_dup'));
    expect(r4.accepted).toBe(false);

    expect(state.events?.items).toHaveLength(2);
  });

  it('out-of-order frames: lower sequence rejected after higher is accepted', () => {
    let state: StreamDashboardState = createStreamDashboardState({
      summary: null,
      events: { items: [], nextCursor: undefined },
      logs: { items: [] },
    });

    // Apply frame with seq 3 first — watermark moves to 3
    const r3 = applyStreamFrame(state, frame(3));
    expect(r3.accepted).toBe(true);
    state = r3.state;

    // Seq 1 arrives late — rejected (1 <= watermark 3)
    const r1 = applyStreamFrame(state, frame(1));
    expect(r1.accepted).toBe(false);

    // Seq 2 arrives late — rejected (2 <= watermark 3)
    const r2 = applyStreamFrame(state, frame(2));
    expect(r2.accepted).toBe(false);

    // Only seq 3 in events
    expect(state.events!.items).toHaveLength(1);
    expect(state.events!.items[0]!.sequence).toBe(3);
  });

  it('watermarks are scoped per runId', () => {
    let state: StreamDashboardState = createStreamDashboardState({
      summary: null,
      events: { items: [], nextCursor: undefined },
      logs: { items: [] },
    });

    // Accept seq 5 for run A
    const rA = applyStreamFrame(state, frame(5, 'wr_runA'));
    expect(rA.accepted).toBe(true);
    state = rA.state;

    // Accept seq 3 for run B (different runId, independent watermark)
    const rB = applyStreamFrame(state, frame(3, 'wr_runB'));
    expect(rB.accepted).toBe(true);
    state = rB.state;

    // Reject seq 4 for run A (< watermark 5)
    const rA2 = applyStreamFrame(state, frame(4, 'wr_runA'));
    expect(rA2.accepted).toBe(false);

    // Accept seq 4 for run B (> watermark 3)
    const rB2 = applyStreamFrame(state, frame(4, 'wr_runB'));
    expect(rB2.accepted).toBe(true);
  });

  it('initial watermarks from existing events are respected', () => {
    const RUN_ID = 'wr_fixture_1';
    const existingEvents = buildRunEventsResponse(5);
    const state = createStreamDashboardState({
      summary: null,
      events: existingEvents,
      logs: buildRunLogsResponse(0),
    });

    // Sequence 5 should be in watermarks for wr_fixture_1 (max from existing events)
    const r5 = applyStreamFrame(state, frame(5, RUN_ID));
    expect(r5.accepted).toBe(false);

    // Sequence 6 should be accepted
    const r6 = applyStreamFrame(state, frame(6, RUN_ID));
    expect(r6.accepted).toBe(true);
  });

  it('duplicate frames do not corrupt events list', () => {
    let state: StreamDashboardState = createStreamDashboardState({
      summary: null,
      events: { items: [], nextCursor: undefined },
      logs: { items: [] },
    });

    // Apply same frame 5 times
    for (let i = 0; i < 5; i++) {
      const result = applyStreamFrame(state, frame(1, 'wr_037', `cur_1_attempt_${i}`));
      if (result.accepted) state = result.state;
    }

    // Only one event should be in the list
    expect(state.events!.items).toHaveLength(1);
    expect(state.events!.items[0]!.sequence).toBe(1);
  });
});
