import { describe, expect, it } from 'vitest';

import {
  InMemorySequenceAllocator,
  createAppendOnlyEventBuilder,
  createEventFactory,
  type Clock,
} from '../../src/runtime/event-factory.js';

describe('event factory', () => {
  it('builds required event shape with deterministic envelope fields', async () => {
    const clock: Clock = {
      now: () => new Date('2026-02-20T12:00:00.000Z'),
    };
    const sequenceAllocator = new InMemorySequenceAllocator();
    const eventFactory = createEventFactory({ clock, sequenceAllocator });

    const event = await eventFactory.create({
      runId: 'run-1',
      workflowType: 'billing.invoice.v1',
      eventType: 'workflow.started',
      payload: { startedBy: 'test' },
    });

    expect(event.eventId).toBe('run-1:1:workflow.started');
    expect(event.timestamp).toBe('2026-02-20T12:00:00.000Z');
    expect(event.sequence).toBe(1);
    expect(event.runId).toBe('run-1');
    expect(event.workflowType).toBe('billing.invoice.v1');
    expect(event.eventType).toBe('workflow.started');
  });

  it('allocates strictly monotonic sequence per run', async () => {
    const clock: Clock = {
      now: () => new Date('2026-02-20T12:00:00.000Z'),
    };
    const sequenceAllocator = new InMemorySequenceAllocator();
    const eventFactory = createEventFactory({ clock, sequenceAllocator });

    const first = await eventFactory.create({
      runId: 'run-1',
      workflowType: 'wf.test',
      eventType: 'transition.requested',
    });
    const second = await eventFactory.create({
      runId: 'run-1',
      workflowType: 'wf.test',
      eventType: 'transition.completed',
    });
    const thirdOtherRun = await eventFactory.create({
      runId: 'run-2',
      workflowType: 'wf.test',
      eventType: 'workflow.started',
    });

    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
    expect(thirdOtherRun.sequence).toBe(1);
  });

  it('provides append-only helpers for event input construction', () => {
    const builder = createAppendOnlyEventBuilder({
      runId: 'run-append',
      workflowType: 'wf.append',
    });

    const requested = builder.transitionRequested({ from: 'a', to: 'b' }, { cause: 'unit' });

    expect(requested.runId).toBe('run-append');
    expect(requested.workflowType).toBe('wf.append');
    expect(requested.eventType).toBe('transition.requested');
    expect(requested.transition).toEqual({ from: 'a', to: 'b' });
    expect(requested.payload).toEqual({ cause: 'unit' });
  });
});
