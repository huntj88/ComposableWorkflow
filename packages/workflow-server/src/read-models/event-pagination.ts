import { z } from 'zod';

export const eventCursorPayloadSchema = z.object({
  runId: z.string().min(1),
  sequence: z.number().int().positive(),
});

export type EventCursorPayload = z.infer<typeof eventCursorPayloadSchema>;

export const encodeEventCursor = (payload: EventCursorPayload): string =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

export const decodeEventCursor = (cursor: string): EventCursorPayload => {
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const parsed = JSON.parse(raw) as unknown;

  return eventCursorPayloadSchema.parse(parsed);
};

export const resolveSequenceBoundary = (runId: string, cursor?: string): number => {
  if (!cursor) {
    return 0;
  }

  const decoded = decodeEventCursor(cursor);
  if (decoded.runId !== runId) {
    throw new Error('Cursor runId does not match requested runId');
  }

  return decoded.sequence;
};
