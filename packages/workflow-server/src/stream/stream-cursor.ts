import {
  decodeEventCursor,
  encodeEventCursor,
  resolveSequenceBoundary,
  type EventCursorPayload,
} from '../read-models/event-pagination.js';

export type StreamCursorPayload = EventCursorPayload;

export const encodeStreamCursor = (payload: StreamCursorPayload): string =>
  encodeEventCursor(payload);

export const decodeStreamCursor = (cursor: string): StreamCursorPayload =>
  decodeEventCursor(cursor);

export const resolveStreamBoundary = (runId: string, cursor?: string): number =>
  resolveSequenceBoundary(runId, cursor);
