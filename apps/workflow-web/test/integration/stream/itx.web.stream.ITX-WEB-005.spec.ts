import { describe, expect, it, vi } from 'vitest';

import {
  applyStreamFrame,
  createStreamDashboardState,
  type StreamDashboardState,
} from '../../../src/stream/applyStreamFrame';
import { openRunStream } from '../../../src/stream/openRunStream';

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  onopen: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: unknown) => void) | null = null;
  closed = false;

  constructor(public readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  emitOpen(): void {
    this.onopen?.({});
  }

  emitError(): void {
    this.onerror?.({});
  }

  emitWorkflowFrame(params: { id: string; data: unknown }): void {
    const callbacks = this.listeners.get('workflow-event') ?? [];
    const payload = {
      lastEventId: params.id,
      data: JSON.stringify(params.data),
    };

    for (const callback of callbacks) {
      callback(payload);
    }
  }

  close(): void {
    this.closed = true;
  }
}

const workflowEvent = (sequence: number) => ({
  eventId: `evt_${sequence}`,
  runId: 'wr_stream_1',
  workflowType: 'reference.success.v1',
  parentRunId: null,
  sequence,
  eventType: sequence % 2 === 0 ? 'log' : 'transition.completed',
  state: sequence % 2 === 0 ? 'running' : null,
  transition:
    sequence % 2 === 0
      ? null
      : {
          from: 'a',
          to: 'b',
          name: 'next',
        },
  child: null,
  command: null,
  timestamp: '2026-03-05T00:00:00.000Z',
  payload: sequence % 2 === 0 ? { level: 'info', message: `log-${sequence}` } : null,
  error: null,
});

describe('integration.stream.ITX-WEB-005', () => {
  it('applies stream frames incrementally with strict dedup and reconnect cursor resume', () => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];

    let state: StreamDashboardState = createStreamDashboardState({
      summary: null,
      events: { items: [], nextCursor: undefined },
      logs: { items: [] },
    });

    const acceptedSequences: number[] = [];

    const stream = openRunStream({
      runId: 'wr_stream_1',
      random: () => 0,
      eventSourceFactory: (url) => new FakeEventSource(url) as unknown as EventSource,
      onFrame: (frame) => {
        const applied = applyStreamFrame(state, frame);
        state = applied.state;

        if (applied.accepted) {
          acceptedSequences.push(frame.data.sequence);
        }

        return applied.accepted;
      },
    });

    const firstConnection = FakeEventSource.instances[0];
    expect(firstConnection.url).toBe('/api/v1/workflows/runs/wr_stream_1/stream');
    firstConnection.emitOpen();

    firstConnection.emitWorkflowFrame({ id: 'cur_1', data: workflowEvent(1) });
    firstConnection.emitWorkflowFrame({ id: 'cur_1_dup', data: workflowEvent(1) });

    firstConnection.emitError();
    vi.runOnlyPendingTimers();

    const secondConnection = FakeEventSource.instances[1];
    expect(secondConnection.url).toBe('/api/v1/workflows/runs/wr_stream_1/stream?cursor=cur_1');

    secondConnection.emitOpen();
    secondConnection.emitWorkflowFrame({ id: 'cur_2', data: workflowEvent(2) });

    expect(acceptedSequences).toEqual([1, 2]);
    expect(state.events?.items.map((item) => item.sequence)).toEqual([1, 2]);
    expect(state.logs?.items.map((item) => item.sequence)).toEqual([2]);
    expect(stream.getLastSeenCursor()).toBe('cur_2');

    stream.close();
    vi.useRealTimers();
  });
});
