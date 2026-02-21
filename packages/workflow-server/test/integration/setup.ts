import { createIntegrationHarness, type IntegrationHarness } from '../harness/create-harness.js';

export const ITX_FAULT_CHECKPOINTS = {
  beforeEventAppend: 'before_event_append',
  afterEventAppendBeforeAck: 'after_event_append_before_ack',
  beforeLockAcquire: 'before_lock_acquire',
  afterLockAcquire: 'after_lock_acquire',
} as const;

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

export const createDeferred = <T = void>(): Deferred<T> => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject,
  };
};

export const createItxHarness = async (options?: Parameters<typeof createIntegrationHarness>[0]) =>
  createIntegrationHarness(options);

export const listEventTypesForRun = async (
  harness: IntegrationHarness,
  runId: string,
): Promise<string[]> => {
  const result = await harness.db.pool.query<{ event_type: string }>(
    'SELECT event_type FROM workflow_events WHERE run_id = $1 ORDER BY sequence ASC',
    [runId],
  );

  return result.rows.map((row) => row.event_type);
};

export const countEventsForRun = async (
  harness: IntegrationHarness,
  params: {
    runId: string;
    eventType: string;
  },
): Promise<number> => {
  const result = await harness.db.pool.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM workflow_events WHERE run_id = $1 AND event_type = $2',
    [params.runId, params.eventType],
  );

  return result.rows[0]?.count ?? 0;
};

export const findEventSequence = (eventTypes: string[], sequence: readonly string[]): number[] => {
  const indexes: number[] = [];
  let cursor = 0;

  for (const eventType of sequence) {
    const index = eventTypes.indexOf(eventType, cursor);
    if (index < 0) {
      return [];
    }

    indexes.push(index);
    cursor = index + 1;
  }

  return indexes;
};

export const hasEventSequence = (eventTypes: string[], sequence: readonly string[]): boolean =>
  findEventSequence(eventTypes, sequence).length === sequence.length;
