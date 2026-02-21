import { describe, expect, it } from 'vitest';

import {
  decodeEventCursor,
  encodeEventCursor,
  resolveSequenceBoundary,
} from '../../../src/read-models/event-pagination.js';

describe('event pagination cursor helpers', () => {
  it('round-trips cursor payload via base64url', () => {
    const encoded = encodeEventCursor({
      runId: 'run-123',
      sequence: 42,
    });

    expect(decodeEventCursor(encoded)).toEqual({
      runId: 'run-123',
      sequence: 42,
    });
  });

  it('returns zero boundary without cursor', () => {
    expect(resolveSequenceBoundary('run-123')).toBe(0);
  });

  it('rejects cursor from a different run', () => {
    const cursor = encodeEventCursor({
      runId: 'run-a',
      sequence: 2,
    });

    expect(() => resolveSequenceBoundary('run-b', cursor)).toThrow(
      'Cursor runId does not match requested runId',
    );
  });
});
