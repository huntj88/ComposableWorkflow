/**
 * ITX-WEB-036: SSE wire-frame contract handling is enforced.
 *
 * Validates that:
 * - workflowStreamFrameSchema requires event='workflow-event', non-empty id, valid data.
 * - parseWorkflowFrame correctly transforms MessageEvent to WorkflowStreamFrame.
 * - Invalid wire payloads are rejected by schema parse.
 * - Frame id is propagated as cursor.
 */

import { describe, expect, it } from 'vitest';

import {
  workflowStreamFrameSchema,
  workflowStreamEventSchema,
  workflowEventDtoSchema,
} from '@composable-workflow/workflow-api-types';

import { openRunStream } from '../../../src/stream/openRunStream';

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  onopen: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: unknown) => void) | null = null;

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

  emitWorkflowFrame(params: { id: string; data: unknown }): void {
    const callbacks = this.listeners.get('workflow-event') ?? [];
    const payload = { lastEventId: params.id, data: JSON.stringify(params.data) };
    for (const cb of callbacks) cb(payload);
  }

  close(): void {}
}

const validEventData = {
  eventId: 'evt_1',
  runId: 'wr_036',
  workflowType: 'reference.success.v1',
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
};

describe('integration.stream.ITX-WEB-036', () => {
  it('workflowStreamEventSchema only accepts workflow-event literal', () => {
    expect(workflowStreamEventSchema.parse('workflow-event')).toBe('workflow-event');
    expect(() => workflowStreamEventSchema.parse('other-event')).toThrow();
    expect(() => workflowStreamEventSchema.parse('')).toThrow();
  });

  it('workflowStreamFrameSchema validates complete wire frame', () => {
    const frame = workflowStreamFrameSchema.parse({
      event: 'workflow-event',
      id: 'cur_1',
      data: validEventData,
    });

    expect(frame.event).toBe('workflow-event');
    expect(frame.id).toBe('cur_1');
    expect(frame.data.eventId).toBe('evt_1');
    expect(frame.data.sequence).toBe(1);
  });

  it('rejects frame with empty id', () => {
    expect(() =>
      workflowStreamFrameSchema.parse({
        event: 'workflow-event',
        id: '',
        data: validEventData,
      }),
    ).toThrow();
  });

  it('rejects frame with wrong event type', () => {
    expect(() =>
      workflowStreamFrameSchema.parse({
        event: 'wrong-event',
        id: 'cur_1',
        data: validEventData,
      }),
    ).toThrow();
  });

  it('rejects frame with missing data fields', () => {
    expect(() =>
      workflowStreamFrameSchema.parse({
        event: 'workflow-event',
        id: 'cur_1',
        data: { eventId: 'evt_1' },
      }),
    ).toThrow();
  });

  it('workflowEventDtoSchema validates all required fields', () => {
    const result = workflowEventDtoSchema.parse(validEventData);
    expect(result.eventId).toBe('evt_1');
    expect(result.runId).toBe('wr_036');
    expect(result.sequence).toBe(1);
    expect(result.eventType).toBe('transition.completed');
    expect(result.timestamp).toBe('2026-03-05T00:00:00.000Z');
  });

  it('frame id is used as cursor after acceptance', () => {
    FakeEventSource.instances = [];
    let lastCursor: string | undefined;

    const stream = openRunStream({
      runId: 'wr_036_cursor',
      random: () => 0,
      eventSourceFactory: (url) => new FakeEventSource(url) as unknown as EventSource,
      onFrame: () => true,
    });

    const source = FakeEventSource.instances[0]!;
    source.emitOpen();
    source.emitWorkflowFrame({ id: 'cursor_abc', data: validEventData });

    lastCursor = stream.getLastSeenCursor();
    expect(lastCursor).toBe('cursor_abc');

    stream.close();
  });
});
