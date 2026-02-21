import { describe, expect, it } from 'vitest';

import { decideStartAction } from '../../../src/orchestrator/start-run.js';

describe('start run decision logic', () => {
  it('creates when reservation succeeds', () => {
    const decision = decideStartAction({
      reservedRecordRunId: 'wr_reserved',
      existingRecordRunId: null,
      candidateRunId: 'wr_candidate',
    });

    expect(decision).toEqual({
      decision: 'create',
      runId: 'wr_reserved',
    });
  });

  it('returns existing run for duplicate idempotency key', () => {
    const decision = decideStartAction({
      reservedRecordRunId: null,
      existingRecordRunId: 'wr_existing',
      candidateRunId: 'wr_candidate',
    });

    expect(decision).toEqual({
      decision: 'existing',
      runId: 'wr_existing',
    });
  });

  it('falls back to candidate when no idempotency records are present', () => {
    const decision = decideStartAction({
      reservedRecordRunId: null,
      existingRecordRunId: null,
      candidateRunId: 'wr_candidate',
    });

    expect(decision).toEqual({
      decision: 'create',
      runId: 'wr_candidate',
    });
  });
});
