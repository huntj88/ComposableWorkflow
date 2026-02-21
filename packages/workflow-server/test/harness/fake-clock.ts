export interface FakeClock {
  now: () => Date;
  setNow: (value: Date | string | number) => Date;
  advanceByMs: (value: number) => Date;
}

const toDate = (value: Date | string | number): Date => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date provided to fake clock');
  }

  return date;
};

export const createFakeClock = (
  seed: Date | string | number = '2026-01-01T00:00:00.000Z',
): FakeClock => {
  let current = toDate(seed);

  return {
    now: () => new Date(current.getTime()),
    setNow: (value) => {
      current = toDate(value);
      return new Date(current.getTime());
    },
    advanceByMs: (value) => {
      if (!Number.isFinite(value)) {
        throw new Error('advanceByMs requires a finite numeric value');
      }

      current = new Date(current.getTime() + value);
      return new Date(current.getTime());
    },
  };
};
