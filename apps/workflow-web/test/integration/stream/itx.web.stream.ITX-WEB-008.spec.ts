/**
 * ITX-WEB-008: Unsupported stream variants fail visibly in dev/test.
 *
 * Validates that:
 * - openRunStream rejects unsupported eventType filters with explicit error.
 * - applyStreamFrame rejects non-workflow-event frames in dev/test mode.
 * - Unknown message events trigger failUnsupportedVariant.
 */

import { describe, expect, it, vi } from 'vitest';

import { applyStreamFrame, createStreamDashboardState } from '../../../src/stream/applyStreamFrame';
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

  emitMessage(): void {
    this.onmessage?.({ data: '{}' });
  }

  close(): void {
    this.closed = true;
  }
}

describe('integration.stream.ITX-WEB-008', () => {
  it('unsupported eventType filter reports request error and does not connect', () => {
    let requestError: string | null = null;
    const seenUrls: string[] = [];

    const stream = openRunStream({
      runId: 'wr_008',
      eventType: 'totally.invalid.event',
      eventSourceFactory: (url) => {
        seenUrls.push(url);
        return { close: () => {} } as unknown as EventSource;
      },
      onFrame: () => true,
      onRequestError: (msg) => {
        requestError = msg;
      },
    });

    expect(requestError).toContain('Unsupported stream eventType filter');
    expect(requestError).toContain('totally.invalid.event');
    expect(seenUrls).toHaveLength(0);
    expect(stream.getHealthState()).toBe('reconnecting');
    stream.close();
  });

  it('applyStreamFrame throws on non-workflow-event in dev/test build', () => {
    const state = createStreamDashboardState({
      summary: null,
      events: { items: [], nextCursor: undefined },
      logs: { items: [] },
    });

    const bogusFrame = {
      event: 'some-other-event' as const,
      id: 'cur_bogus',
      data: {
        eventId: 'evt_1',
        runId: 'wr_008',
        workflowType: 'test.v1',
        parentRunId: null,
        sequence: 1,
        eventType: 'transition.completed',
        state: null,
        transition: { from: 'a', to: 'b', name: 'go' },
        child: null,
        command: null,
        timestamp: '2026-03-05T00:00:00.000Z',
        payload: null,
        error: null,
      },
    };

    expect(() => applyStreamFrame(state, bogusFrame as never)).toThrow(
      'Unsupported stream variant',
    );
  });

  it('onmessage (default SSE event) triggers unsupported variant', () => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];

    const errors: unknown[] = [];

    const stream = openRunStream({
      runId: 'wr_008_msg',
      random: () => 0,
      eventSourceFactory: (url) => new FakeEventSource(url) as unknown as EventSource,
      onFrame: () => true,
      onError: (err) => {
        errors.push(err);
      },
    });

    const source = FakeEventSource.instances[0]!;
    source.emitOpen();

    // In dev/test build, onmessage throws — let's verify the throw path
    expect(() => source.emitMessage()).toThrow('Unsupported stream variant');

    stream.close();
    vi.useRealTimers();
  });

  it('SUPPORTED_EVENT_TYPE_FILTERS includes all known event types', () => {
    const supported = [
      'log',
      'workflow.started',
      'workflow.pausing',
      'workflow.paused',
      'workflow.resuming',
      'workflow.recovering',
      'workflow.cancelling',
      'workflow.completed',
      'workflow.failed',
      'workflow.cancelled',
      'transition.requested',
      'transition.completed',
      'transition.failed',
      'command.started',
      'command.completed',
      'command.failed',
      'child.started',
      'child.completed',
      'child.failed',
      'human-feedback.requested',
      'human-feedback.received',
    ];

    for (const eventType of supported) {
      // No request error for valid event types
      let requestError: string | null = null;
      FakeEventSource.instances = [];
      const stream = openRunStream({
        runId: 'wr_008_valid',
        eventType,
        eventSourceFactory: (url) => new FakeEventSource(url) as unknown as EventSource,
        onFrame: () => true,
        onRequestError: (msg) => {
          requestError = msg;
        },
      });
      expect(requestError).toBeNull();
      stream.close();
    }
  });
});
