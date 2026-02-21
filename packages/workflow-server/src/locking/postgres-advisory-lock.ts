import { createHash } from 'node:crypto';

import type { Pool, PoolClient } from 'pg';

import type { LockProvider } from './lock-provider.js';

const TRY_LOCK_SQL = 'SELECT pg_try_advisory_lock($1, $2) AS acquired';
const UNLOCK_SQL = 'SELECT pg_advisory_unlock($1, $2) AS released';

interface LockKey {
  first: number;
  second: number;
}

interface LockLease {
  ownerId: string;
  client: PoolClient;
}

interface TryLockRow {
  acquired: boolean;
}

interface UnlockRow {
  released: boolean;
}

const toSignedInt32 = (value: number): number => {
  const unsigned = value >>> 0;
  return unsigned > 0x7fffffff ? unsigned - 0x1_0000_0000 : unsigned;
};

export const advisoryKeyForRun = (runId: string): LockKey => {
  const digest = createHash('sha256').update(runId).digest();
  return {
    first: toSignedInt32(digest.readUInt32BE(0)),
    second: toSignedInt32(digest.readUInt32BE(4)),
  };
};

const lockLeaseKey = (runId: string): string => runId;

export class PostgresAdvisoryLockProvider implements LockProvider {
  private readonly leases = new Map<string, LockLease>();

  constructor(private readonly pool: Pool) {}

  async acquire(runId: string, ownerId: string, _ttlMs: number): Promise<boolean> {
    const leaseKey = lockLeaseKey(runId);
    const existing = this.leases.get(leaseKey);

    if (existing) {
      return existing.ownerId === ownerId;
    }

    const client = await this.pool.connect();
    const key = advisoryKeyForRun(runId);

    try {
      const result = await client.query<TryLockRow>(TRY_LOCK_SQL, [key.first, key.second]);
      const acquired = result.rows[0]?.acquired === true;

      if (!acquired) {
        client.release();
        return false;
      }

      this.leases.set(leaseKey, {
        ownerId,
        client,
      });

      return true;
    } catch (error) {
      client.release();
      throw error;
    }
  }

  async renew(runId: string, ownerId: string, _ttlMs: number): Promise<void> {
    const lease = this.leases.get(lockLeaseKey(runId));
    if (!lease || lease.ownerId !== ownerId) {
      throw new Error(`Cannot renew lock for run ${runId} with owner ${ownerId}`);
    }
  }

  async release(runId: string, ownerId: string): Promise<void> {
    const leaseKey = lockLeaseKey(runId);
    const lease = this.leases.get(leaseKey);

    if (!lease) {
      return;
    }

    if (lease.ownerId !== ownerId) {
      throw new Error(`Cannot release lock for run ${runId} with owner ${ownerId}`);
    }

    const key = advisoryKeyForRun(runId);

    try {
      await lease.client.query<UnlockRow>(UNLOCK_SQL, [key.first, key.second]);
    } finally {
      lease.client.release();
      this.leases.delete(leaseKey);
    }
  }
}

export const createPostgresAdvisoryLockProvider = (pool: Pool): LockProvider =>
  new PostgresAdvisoryLockProvider(pool);
