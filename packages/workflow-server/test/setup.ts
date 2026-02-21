import type { IntegrationHarness } from './harness/create-harness.js';

export interface HarnessFailureDiagnostics {
  lifecycleTimeline: ReturnType<IntegrationHarness['diagnostics']['snapshot']>['lifecycleTimeline'];
  eventStream: ReturnType<IntegrationHarness['diagnostics']['snapshot']>['eventStream'];
  faults: ReturnType<IntegrationHarness['diagnostics']['snapshot']>['faults'];
}

export const captureHarnessFailureDiagnostics = (
  harness: IntegrationHarness,
  runId?: string,
): HarnessFailureDiagnostics => {
  const snapshot = harness.diagnostics.snapshot(runId);

  return {
    lifecycleTimeline: snapshot.lifecycleTimeline,
    eventStream: snapshot.eventStream,
    faults: snapshot.faults,
  };
};
