export interface LockProvider {
  acquire: (runId: string, ownerId: string, ttlMs: number) => Promise<boolean>;
  renew: (runId: string, ownerId: string, ttlMs: number) => Promise<void>;
  release: (runId: string, ownerId: string) => Promise<void>;
}

interface LeaseRecord {
  ownerId: string;
  expiresAtMs: number;
}

export class InMemoryLockProvider implements LockProvider {
  private readonly leases = new Map<string, LeaseRecord>();

  async acquire(runId: string, ownerId: string, ttlMs: number): Promise<boolean> {
    this.evictExpired();

    const current = this.leases.get(runId);
    if (!current) {
      this.leases.set(runId, {
        ownerId,
        expiresAtMs: Date.now() + ttlMs,
      });
      return true;
    }

    if (current.ownerId !== ownerId) {
      return false;
    }

    current.expiresAtMs = Date.now() + ttlMs;
    this.leases.set(runId, current);
    return true;
  }

  async renew(runId: string, ownerId: string, ttlMs: number): Promise<void> {
    this.evictExpired();

    const current = this.leases.get(runId);
    if (!current || current.ownerId !== ownerId) {
      throw new Error(`Cannot renew lock for run ${runId} with owner ${ownerId}`);
    }

    current.expiresAtMs = Date.now() + ttlMs;
    this.leases.set(runId, current);
  }

  async release(runId: string, ownerId: string): Promise<void> {
    const current = this.leases.get(runId);
    if (!current) {
      return;
    }

    if (current.ownerId !== ownerId) {
      throw new Error(`Cannot release lock for run ${runId} with owner ${ownerId}`);
    }

    this.leases.delete(runId);
  }

  private evictExpired(): void {
    const now = Date.now();

    for (const [runId, lease] of this.leases.entries()) {
      if (lease.expiresAtMs <= now) {
        this.leases.delete(runId);
      }
    }
  }
}
