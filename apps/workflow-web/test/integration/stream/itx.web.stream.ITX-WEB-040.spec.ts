import { describe, expect, it } from 'vitest';

import {
  STREAM_RECONNECT_BASE_DELAY_MS,
  STREAM_RECONNECT_CAP_DELAY_MS,
  STREAM_RECONNECT_FACTOR,
  STREAM_STALE_THRESHOLD_MS,
  computeReconnectDelayMs,
  isStreamStale,
} from '../../../src/stream/reconnectPolicy';

describe('integration.stream.ITX-WEB-040', () => {
  it('locks reconnect and stale policy constants with deterministic jitter and cap behavior', () => {
    expect(STREAM_RECONNECT_BASE_DELAY_MS).toBe(500);
    expect(STREAM_RECONNECT_FACTOR).toBe(2);
    expect(STREAM_RECONNECT_CAP_DELAY_MS).toBe(30_000);
    expect(STREAM_STALE_THRESHOLD_MS).toBe(45_000);

    expect(computeReconnectDelayMs(0, () => 0.5)).toBe(250);
    expect(computeReconnectDelayMs(1, () => 0.5)).toBe(500);
    expect(computeReconnectDelayMs(100, () => 1)).toBe(STREAM_RECONNECT_CAP_DELAY_MS);
  });

  it('marks stream stale only after threshold', () => {
    expect(isStreamStale(0, STREAM_STALE_THRESHOLD_MS - 1)).toBe(false);
    expect(isStreamStale(0, STREAM_STALE_THRESHOLD_MS)).toBe(true);
  });
});
