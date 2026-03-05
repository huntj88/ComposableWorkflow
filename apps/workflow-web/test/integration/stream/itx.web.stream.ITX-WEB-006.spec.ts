import { describe, expect, it, vi } from 'vitest';

import { openRunStream } from '../../../src/stream/openRunStream';
import { STREAM_STALE_THRESHOLD_MS } from '../../../src/stream/reconnectPolicy';

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

describe('integration.stream.ITX-WEB-006', () => {
  it('emits reconnecting then stale health state non-blockingly during disconnects', () => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];

    let now = 0;
    const healthStates: string[] = [];

    const stream = openRunStream({
      runId: 'wr_stream_health',
      now: () => now,
      random: () => 0,
      eventSourceFactory: (url) => new FakeEventSource(url) as unknown as EventSource,
      onFrame: () => true,
      onHealthChange: (state) => {
        healthStates.push(state);
      },
    });

    const first = FakeEventSource.instances[0];
    first.emitOpen();
    expect(healthStates.at(-1)).toBe('connected');

    first.emitError();
    expect(healthStates.at(-1)).toBe('reconnecting');

    vi.runOnlyPendingTimers();
    expect(FakeEventSource.instances).toHaveLength(2);

    now = STREAM_STALE_THRESHOLD_MS + 1;
    vi.advanceTimersByTime(1_000);
    expect(healthStates.at(-1)).toBe('stale');

    stream.close();
    vi.useRealTimers();
  });
});
