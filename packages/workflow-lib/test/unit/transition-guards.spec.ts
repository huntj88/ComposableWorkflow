import { describe, expect, it } from 'vitest';

import {
  createEventFactory,
  type Clock,
  type SequenceAllocator,
} from '../../src/runtime/event-factory.js';
import { canLaunchChild } from '../../src/runtime/lifecycle-guards.js';
import {
  assertTransitionAllowed,
  handleUncaughtStateHandlerError,
  shouldRetryStateHandlerFailure,
  validateTransition,
} from '../../src/runtime/transition-guards.js';

describe('transition guards', () => {
  it('validates transitions against allowed descriptors', () => {
    expect(
      validateTransition('idle', 'processing', [
        { from: 'idle', to: 'processing' },
        { from: 'processing', to: 'completed' },
      ]),
    ).toEqual({ valid: true });

    expect(
      validateTransition('idle', 'completed', [
        { from: 'idle', to: 'processing' },
        { from: 'processing', to: 'completed' },
      ]),
    ).toEqual({ valid: false, reason: 'Invalid transition from "idle" to "completed"' });
  });

  it('throws for invalid transition assertions', () => {
    expect(() =>
      assertTransitionAllowed('a', 'c', [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ]),
    ).toThrow('Invalid transition from "a" to "c"');
  });

  it('emits transition.failed and workflow.failed for uncaught handler errors', async () => {
    const clock: Clock = { now: () => new Date('2026-02-20T12:00:00.000Z') };
    const sequenceAllocator: SequenceAllocator = {
      next: (() => {
        let value = 0;
        return () => ++value;
      })(),
    };
    const eventFactory = createEventFactory({ clock, sequenceAllocator });

    const result = await handleUncaughtStateHandlerError({
      envelope: {
        runId: 'run-err',
        workflowType: 'wf.failure',
      },
      fromState: 'processing',
      toState: 'completed',
      error: new Error('boom'),
      eventFactory,
    });

    expect(result.lifecycle).toBe('failed');
    expect(result.events[0].eventType).toBe('transition.failed');
    expect(result.events[1].eventType).toBe('workflow.failed');
    expect(result.events[0].sequence).toBe(1);
    expect(result.events[1].sequence).toBe(2);
    expect(result.events[0].error?.message).toBe('boom');
    expect(result.events[1].error?.message).toBe('boom');
  });

  it('does not permit implicit runtime retries and blocks child launch in controlled states', () => {
    expect(shouldRetryStateHandlerFailure()).toBe(false);
    expect(canLaunchChild('running')).toBe(true);
    expect(canLaunchChild('pausing')).toBe(false);
    expect(canLaunchChild('paused')).toBe(false);
    expect(canLaunchChild('resuming')).toBe(false);
    expect(canLaunchChild('cancelling')).toBe(false);
    expect(canLaunchChild('recovering')).toBe(false);
  });
});
