import { describe, expect, it } from 'vitest';

import {
  InvalidLifecycleTransitionError,
  assertLifecycleTransition,
  canCancelLifecycle,
  canPauseLifecycle,
  canResumeLifecycle,
  canTransitionLifecycle,
  shouldBlockChildLaunch,
} from '../../../src/lifecycle/lifecycle-machine.js';

describe('lifecycle machine', () => {
  it('enforces lifecycle transition matrix edges', () => {
    expect(canTransitionLifecycle('pending', 'running')).toBe(true);
    expect(canTransitionLifecycle('running', 'pausing')).toBe(true);
    expect(canTransitionLifecycle('pausing', 'paused')).toBe(true);
    expect(canTransitionLifecycle('paused', 'resuming')).toBe(true);
    expect(canTransitionLifecycle('resuming', 'running')).toBe(true);
    expect(canTransitionLifecycle('running', 'completed')).toBe(true);
    expect(canTransitionLifecycle('running', 'recovering')).toBe(true);
    expect(canTransitionLifecycle('recovering', 'paused')).toBe(true);
    expect(canTransitionLifecycle('cancelling', 'cancelled')).toBe(true);

    expect(canTransitionLifecycle('paused', 'running')).toBe(false);
    expect(canTransitionLifecycle('completed', 'running')).toBe(false);
    expect(() => assertLifecycleTransition('paused', 'running')).toThrow(
      InvalidLifecycleTransitionError,
    );
  });

  it('evaluates pause/resume/cancel and child-launch guards', () => {
    expect(canPauseLifecycle('running')).toBe(true);
    expect(canPauseLifecycle('paused')).toBe(false);

    expect(canResumeLifecycle('paused')).toBe(true);
    expect(canResumeLifecycle('running')).toBe(false);

    expect(canCancelLifecycle('running')).toBe(true);
    expect(canCancelLifecycle('recovering')).toBe(true);
    expect(canCancelLifecycle('completed')).toBe(false);

    expect(shouldBlockChildLaunch('running')).toBe(false);
    expect(shouldBlockChildLaunch('pausing')).toBe(true);
    expect(shouldBlockChildLaunch('paused')).toBe(true);
    expect(shouldBlockChildLaunch('resuming')).toBe(true);
    expect(shouldBlockChildLaunch('recovering')).toBe(true);
    expect(shouldBlockChildLaunch('cancelling')).toBe(true);
  });
});
