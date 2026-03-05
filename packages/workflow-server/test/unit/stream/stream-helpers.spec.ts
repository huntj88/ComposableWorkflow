import { describe, expect, it } from 'vitest';

import { serializeSseFrame, serializeWorkflowEventFrame } from '../../../src/stream/sse-route.js';
import {
  decodeStreamCursor,
  encodeStreamCursor,
  resolveStreamBoundary,
} from '../../../src/stream/stream-cursor.js';

describe('stream helpers', () => {
  it('encodes and decodes stream cursors with the events cursor format', () => {
    const encoded = encodeStreamCursor({
      runId: 'run-stream-1',
      sequence: 42,
    });

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeStreamCursor(encoded)).toEqual({
      runId: 'run-stream-1',
      sequence: 42,
    });
    expect(resolveStreamBoundary('run-stream-1', encoded)).toBe(42);
  });

  it('rejects cursor boundaries that target another run', () => {
    const encoded = encodeStreamCursor({
      runId: 'run-A',
      sequence: 7,
    });

    expect(() => resolveStreamBoundary('run-B', encoded)).toThrow(
      'Cursor runId does not match requested runId',
    );
  });

  it('serializes SSE frame payloads deterministically', () => {
    expect(
      serializeSseFrame({
        event: 'workflow-event',
        id: 'cursor-123',
        data: { runId: 'run-1', sequence: 3 },
      }),
    ).toBe('event: workflow-event\nid: cursor-123\ndata: {"runId":"run-1","sequence":3}\n\n');
  });

  it('serializes workflow event frame using encoded cursor id', () => {
    const frame = serializeWorkflowEventFrame({
      cursorPayload: {
        runId: 'run-evt',
        sequence: 9,
      },
      event: {
        eventId: 'evt-9',
        runId: 'run-evt',
        workflowType: 'reference.success.v1',
        parentRunId: null,
        sequence: 9,
        eventType: 'transition.completed',
        state: null,
        transition: {
          from: 'start',
          to: 'done',
        },
        child: null,
        command: null,
        timestamp: '2026-01-01T00:00:00.000Z',
        payload: { to: 'done' },
        error: null,
      },
    });

    const lines = frame.trim().split('\n');
    expect(lines[0]).toBe('event: workflow-event');
    expect(lines[1]).toMatch(/^id: [A-Za-z0-9_-]+$/);
    expect(lines[2]).toBe(
      'data: {"eventId":"evt-9","runId":"run-evt","workflowType":"reference.success.v1","parentRunId":null,"sequence":9,"eventType":"transition.completed","state":null,"transition":{"from":"start","to":"done"},"child":null,"command":null,"timestamp":"2026-01-01T00:00:00.000Z","payload":{"to":"done"},"error":null}',
    );
  });
});
