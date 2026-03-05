export const STREAM_RECONNECT_BASE_DELAY_MS = 500;
export const STREAM_RECONNECT_FACTOR = 2;
export const STREAM_RECONNECT_CAP_DELAY_MS = 30_000;
export const STREAM_STALE_THRESHOLD_MS = 45_000;

export type StreamHealthState = 'connected' | 'reconnecting' | 'stale';

const clampAttempt = (attempt: number): number => {
  if (!Number.isFinite(attempt) || attempt < 0) {
    return 0;
  }

  return Math.trunc(attempt);
};

export const computeReconnectDelayMs = (
  attempt: number,
  random: () => number = Math.random,
): number => {
  const normalizedAttempt = clampAttempt(attempt);
  const maxDelay = Math.min(
    STREAM_RECONNECT_CAP_DELAY_MS,
    STREAM_RECONNECT_BASE_DELAY_MS * STREAM_RECONNECT_FACTOR ** normalizedAttempt,
  );

  return Math.floor(Math.max(0, random()) * maxDelay);
};

export const isStreamStale = (lastActivityAt: number, now: number): boolean =>
  now - lastActivityAt >= STREAM_STALE_THRESHOLD_MS;
