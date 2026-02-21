import { Mutex } from 'async-mutex';

export interface Latch {
  wait: () => Promise<void>;
  release: () => Promise<void>;
  reset: () => Promise<void>;
  isReleased: () => Promise<boolean>;
}

export interface BarrierControl {
  wait: (name: string) => Promise<void>;
  release: (name: string) => Promise<void>;
  reset: (name: string) => Promise<void>;
  resetAll: () => Promise<void>;
  releaseAll: () => Promise<void>;
}

export const createLatch = (): Latch => {
  let released = false;
  let waiters: Array<() => void> = [];
  const mutex = new Mutex();

  return {
    wait: async () => {
      let pending: Promise<void> | null = null;

      await mutex.runExclusive(() => {
        if (released) {
          return;
        }

        pending = new Promise<void>((resolve) => {
          waiters.push(resolve);
        });
      });

      if (!pending) {
        return;
      }

      await pending;
    },
    release: async () => {
      await mutex.runExclusive(() => {
        released = true;
        for (const waiter of waiters) {
          waiter();
        }
        waiters = [];
      });
    },
    reset: async () => {
      await mutex.runExclusive(() => {
        released = false;
      });
    },
    isReleased: async () => mutex.runExclusive(() => released),
  };
};

export const createBarrier = (): BarrierControl => {
  const named = new Map<string, Latch>();
  const mutex = new Mutex();

  const getOrCreate = async (name: string): Promise<Latch> =>
    mutex.runExclusive(() => {
      const existing = named.get(name);
      if (existing) {
        return existing;
      }

      const created = createLatch();
      named.set(name, created);
      return created;
    });

  return {
    wait: async (name) => {
      const latch = await getOrCreate(name);
      await latch.wait();
    },
    release: async (name) => {
      const latch = await getOrCreate(name);
      await latch.release();
    },
    reset: async (name) => {
      const latch = await getOrCreate(name);
      await latch.reset();
    },
    resetAll: async () => {
      const latches = await mutex.runExclusive(() => Array.from(named.values()));
      await Promise.all(latches.map((latch) => latch.reset()));
    },
    releaseAll: async () => {
      const latches = await mutex.runExclusive(() => Array.from(named.values()));
      await Promise.all(latches.map((latch) => latch.release()));
    },
  };
};
