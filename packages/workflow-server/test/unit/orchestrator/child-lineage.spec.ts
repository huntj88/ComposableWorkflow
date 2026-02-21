import { describe, expect, it } from 'vitest';

import {
  ChildLaunchForbiddenLifecycleError,
  assertChildLaunchAllowed,
  toChildLaunchRequest,
} from '../../../src/orchestrator/child/child-lineage.js';

describe('child lineage helpers', () => {
  it('rejects child launch in restricted lifecycles', () => {
    expect(() => assertChildLaunchAllowed('running')).not.toThrow();

    expect(() => assertChildLaunchAllowed('pausing')).toThrow(ChildLaunchForbiddenLifecycleError);
    expect(() => assertChildLaunchAllowed('paused')).toThrow(ChildLaunchForbiddenLifecycleError);
    expect(() => assertChildLaunchAllowed('resuming')).toThrow(ChildLaunchForbiddenLifecycleError);
    expect(() => assertChildLaunchAllowed('cancelling')).toThrow(
      ChildLaunchForbiddenLifecycleError,
    );
    expect(() => assertChildLaunchAllowed('recovering')).toThrow(
      ChildLaunchForbiddenLifecycleError,
    );
  });

  it('validates and parses child launch request payload', () => {
    const parsed = toChildLaunchRequest({
      workflowType: 'wf.child.test',
      input: { value: 1 },
      correlationId: 'corr-1',
      idempotencyKey: 'idem-1',
    });

    expect(parsed).toEqual({
      workflowType: 'wf.child.test',
      input: { value: 1 },
      correlationId: 'corr-1',
      idempotencyKey: 'idem-1',
    });

    expect(() => toChildLaunchRequest(null)).toThrow();
    expect(() => toChildLaunchRequest({ workflowType: '', input: {} })).toThrow();
    expect(() => toChildLaunchRequest({ workflowType: 'wf.child.test' })).toThrow();
  });
});
