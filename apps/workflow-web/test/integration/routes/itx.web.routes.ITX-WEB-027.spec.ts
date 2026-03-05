/**
 * ITX-WEB-027: Exponential reconnect backoff behavior is deterministic.
 *
 * Validates that:
 * - computeReconnectDelayMs produces jittered exponential backoff.
 * - Delay is capped at STREAM_RECONNECT_CAP_DELAY_MS.
 * - Zero random → delay is 0.
 * - Max random → delays follow base * factor^attempt up to cap.
 * - Negative/NaN/Infinity attempts are normalized.
 * - isStreamStale correctly identifies stale streams.
 */

import { describe, expect, it } from 'vitest';

import {
  computeReconnectDelayMs,
  isStreamStale,
  STREAM_RECONNECT_BASE_DELAY_MS,
  STREAM_RECONNECT_FACTOR,
  STREAM_RECONNECT_CAP_DELAY_MS,
  STREAM_STALE_THRESHOLD_MS,
} from '../../../src/stream/reconnectPolicy';

describe('integration.routes.ITX-WEB-027', () => {
  describe('exponential backoff', () => {
    it('attempt 0 max delay = base delay (500ms)', () => {
      const delay = computeReconnectDelayMs(0, () => 1);
      expect(delay).toBe(STREAM_RECONNECT_BASE_DELAY_MS);
    });

    it('attempt 1 max delay = base * factor (1000ms)', () => {
      const delay = computeReconnectDelayMs(1, () => 1);
      expect(delay).toBe(STREAM_RECONNECT_BASE_DELAY_MS * STREAM_RECONNECT_FACTOR);
    });

    it('attempt 2 max delay = base * factor^2 (2000ms)', () => {
      const delay = computeReconnectDelayMs(2, () => 1);
      expect(delay).toBe(STREAM_RECONNECT_BASE_DELAY_MS * STREAM_RECONNECT_FACTOR ** 2);
    });

    it('delay is capped at STREAM_RECONNECT_CAP_DELAY_MS', () => {
      // Very high attempt should cap
      const delay = computeReconnectDelayMs(100, () => 1);
      expect(delay).toBe(STREAM_RECONNECT_CAP_DELAY_MS);
    });

    it('zero random produces zero delay', () => {
      const delay = computeReconnectDelayMs(5, () => 0);
      expect(delay).toBe(0);
    });

    it('jitter produces delay in [0, maxDelay)', () => {
      const delays = Array.from({ length: 100 }, () => computeReconnectDelayMs(3, Math.random));
      const maxExpected = Math.min(
        STREAM_RECONNECT_CAP_DELAY_MS,
        STREAM_RECONNECT_BASE_DELAY_MS * STREAM_RECONNECT_FACTOR ** 3,
      );
      for (const d of delays) {
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(maxExpected);
      }
    });
  });

  describe('attempt normalization', () => {
    it('negative attempt is treated as 0', () => {
      const delay = computeReconnectDelayMs(-5, () => 1);
      expect(delay).toBe(STREAM_RECONNECT_BASE_DELAY_MS);
    });

    it('NaN attempt is treated as 0', () => {
      const delay = computeReconnectDelayMs(NaN, () => 1);
      expect(delay).toBe(STREAM_RECONNECT_BASE_DELAY_MS);
    });

    it('Infinity attempt is treated as 0', () => {
      const delay = computeReconnectDelayMs(Infinity, () => 1);
      expect(delay).toBe(STREAM_RECONNECT_BASE_DELAY_MS);
    });

    it('fractional attempt is truncated', () => {
      const delay = computeReconnectDelayMs(1.9, () => 1);
      // truncates to 1 → base * factor^1
      expect(delay).toBe(STREAM_RECONNECT_BASE_DELAY_MS * STREAM_RECONNECT_FACTOR);
    });
  });

  describe('stale detection', () => {
    it('stream is stale after threshold elapsed', () => {
      const now = 100_000;
      const lastActivity = now - STREAM_STALE_THRESHOLD_MS;
      expect(isStreamStale(lastActivity, now)).toBe(true);
    });

    it('stream is not stale before threshold', () => {
      const now = 100_000;
      const lastActivity = now - STREAM_STALE_THRESHOLD_MS + 1;
      expect(isStreamStale(lastActivity, now)).toBe(false);
    });

    it('exact threshold boundary is stale', () => {
      expect(isStreamStale(0, STREAM_STALE_THRESHOLD_MS)).toBe(true);
    });
  });

  describe('constant values', () => {
    it('base delay = 500ms', () => expect(STREAM_RECONNECT_BASE_DELAY_MS).toBe(500));
    it('factor = 2', () => expect(STREAM_RECONNECT_FACTOR).toBe(2));
    it('cap = 30000ms', () => expect(STREAM_RECONNECT_CAP_DELAY_MS).toBe(30_000));
    it('stale threshold = 45000ms', () => expect(STREAM_STALE_THRESHOLD_MS).toBe(45_000));
  });
});
