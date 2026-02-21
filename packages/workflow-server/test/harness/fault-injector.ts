import type { BarrierControl } from './barrier.js';

export type FaultMode = 'once' | 'always';

export interface FaultPolicy {
  mode: FaultMode;
  action?: 'throw' | 'barrier';
  barrierName?: string;
  error?: Error;
}

export interface FaultCheckpointHit {
  name: string;
  mode: FaultMode;
  action: 'throw' | 'barrier';
  timestamp: string;
}

export interface FaultInjector {
  inject: (name: string, mode: FaultMode | FaultPolicy) => void;
  clear: (name?: string) => void;
  checkpoint: (name: string) => Promise<void>;
  listInjected: () => ReadonlyArray<{ name: string; mode: FaultMode; action: 'throw' | 'barrier' }>;
  listTriggered: () => ReadonlyArray<FaultCheckpointHit>;
}

const normalizePolicy = (value: FaultMode | FaultPolicy): FaultPolicy => {
  if (value === 'once' || value === 'always') {
    return {
      mode: value,
      action: 'throw',
    };
  }

  return {
    mode: value.mode,
    action: value.action ?? 'throw',
    barrierName: value.barrierName,
    error: value.error,
  };
};

export const createFaultInjector = (barrier?: BarrierControl): FaultInjector => {
  const policies = new Map<string, FaultPolicy>();
  const triggered: FaultCheckpointHit[] = [];

  return {
    inject: (name, mode) => {
      policies.set(name, normalizePolicy(mode));
    },
    clear: (name) => {
      if (!name) {
        policies.clear();
        triggered.length = 0;
        return;
      }

      policies.delete(name);
    },
    checkpoint: async (name) => {
      const policy = policies.get(name);
      if (!policy) {
        return;
      }

      const action = policy.action ?? 'throw';
      triggered.push({
        name,
        mode: policy.mode,
        action,
        timestamp: new Date().toISOString(),
      });

      if (policy.mode === 'once') {
        policies.delete(name);
      }

      if (action === 'barrier') {
        const barrierName = policy.barrierName ?? name;
        if (!barrier) {
          throw new Error(
            `Fault checkpoint ${name} requested barrier action but no barrier is configured`,
          );
        }

        await barrier.wait(barrierName);
        return;
      }

      throw policy.error ?? new Error(`Injected fault at checkpoint ${name}`);
    },
    listInjected: () =>
      Array.from(policies.entries()).map(([name, policy]) => ({
        name,
        mode: policy.mode,
        action: policy.action ?? 'throw',
      })),
    listTriggered: () => [...triggered],
  };
};
